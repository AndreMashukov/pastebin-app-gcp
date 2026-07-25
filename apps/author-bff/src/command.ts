import type { Env, Hono } from 'hono';
import { resolveUid } from '@pastebingcp/auth';
import { createDoc, getFirestore, isAlreadyExistsError, queryCollection } from '@pastebingcp/firestore';
import { errorResponse } from '@pastebingcp/http';
import { generatePasteId } from '@pastebingcp/paste-id';
import { putPasteObject } from '@pastebingcp/storage';
import { z } from 'zod';

const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '';
const contentBucket = process.env.CONTENT_BUCKET ?? '';
const domain = process.env.DOMAIN ?? 'paste.example.com';

const MAX_SIZE_BYTES = 256 * 1024;
const DEFAULT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const DEFAULT_TTL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const ALLOWED_CONTENT_TYPES = new Set<string>([
  'text/plain',
  'text/plain; charset=utf-8',
  'text/markdown',
  'application/json',
  'application/javascript',
  'text/html',
  'text/css',
  'text/x-python',
  'text/x-shellscript',
  'application/x-yaml',
  'text/yaml',
]);

const REJECTED_FIELDS = [
  'code',
  'pasteId',
  'id',
  'slug',
  'key',
  'alias',
  'custom_alias',
  'customAlias',
] as const;

const CreatePasteBody = z.object({
  content: z.string().min(1),
  contentType: z.string().optional(),
  expiresInDays: z.number().finite().positive().optional(),
});

const pastesCollection = { database: 'author-db', collection: 'pastes' } as const;

type PasteDoc = {
  pasteId: string;
  ownerUid: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string | null;
  expireIndex: string | null;
};

async function requireCallerUid(c: { req: { header: (name: string) => string | undefined } }): Promise<string | Response> {
  const result = await resolveUid({
    smokeHeader: c.req.header('x-smoke-test'),
    authorization: c.req.header('authorization'),
    projectId,
  });
  if ('error' in result) {
    return errorResponse(
      401,
      result.error === 'missing_bearer_token' ? 'unauthorized' : 'unauthorized',
      result.message ?? 'missing sub claim',
    );
  }
  return result.uid;
}

function computeExpiresAt(input: unknown): string {
  let days: number;
  if (input === undefined || input === null) {
    days = DEFAULT_TTL_DAYS;
  } else if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
    days = input;
  } else {
    throw new ValidationError('expiresInDays must be a positive number');
  }
  return new Date(Date.now() + days * MS_PER_DAY).toISOString();
}

class ValidationError extends Error {
  override name = 'ValidationError';
}

export function registerCommandRoutes<E extends Env>(app: Hono<E>): void {
  app.post('/pastes', async (c) => {
    if (!contentBucket) {
      return errorResponse(500, 'internal_error', 'CONTENT_BUCKET is not configured');
    }

    const uidOrErr = await requireCallerUid(c);
    if (uidOrErr instanceof Response) return uidOrErr;
    const uid = uidOrErr;

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return errorResponse(400, 'bad_request', 'invalid JSON');
    }

    if (typeof rawBody !== 'object' || rawBody === null) {
      return errorResponse(400, 'bad_request', 'missing body');
    }

    for (const field of REJECTED_FIELDS) {
      if (field in rawBody) {
        return errorResponse(400, 'bad_request', `field "${field}" is not supported`);
      }
    }

    let body: z.infer<typeof CreatePasteBody>;
    try {
      body = CreatePasteBody.parse(rawBody);
    } catch (err) {
      return errorResponse(400, 'bad_request', err instanceof Error ? err.message : 'invalid body');
    }

    const sizeBytes = Buffer.byteLength(body.content, 'utf8');
    if (sizeBytes > MAX_SIZE_BYTES) {
      return errorResponse(413, 'payload_too_large', `paste exceeds ${MAX_SIZE_BYTES} bytes`);
    }

    const contentType = body.contentType ?? DEFAULT_CONTENT_TYPE;
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return errorResponse(415, 'unsupported_media_type', `contentType "${contentType}" not allowed`);
    }

    let expiresAt: string;
    try {
      expiresAt = computeExpiresAt(body.expiresInDays);
    } catch (err) {
      if (err instanceof ValidationError) {
        return errorResponse(400, 'bad_request', err.message);
      }
      throw err;
    }

    const pasteId = generatePasteId();
    const createdAt = new Date().toISOString();

    await putPasteObject({
      bucketName: contentBucket,
      pasteId,
      body: body.content,
      contentType,
    });

    getFirestore({ databaseId: 'author-db' });
    const doc: PasteDoc = {
      pasteId,
      ownerUid: uid,
      contentType,
      sizeBytes,
      createdAt,
      expiresAt,
      expireIndex: `${expiresAt}#${pasteId}`,
    };

    try {
      await createDoc(pastesCollection, pasteId, doc);
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        return errorResponse(500, 'internal_error', 'paste id collision, please retry');
      }
      throw err;
    }

    return c.json({
      pasteId,
      url: `https://${domain}/p/${pasteId}`,
      contentType,
      sizeBytes,
      createdAt,
      expiresAt,
    }, 201);
  });

  app.get('/me/pastes', async (c) => {
    const uidOrErr = await requireCallerUid(c);
    if (uidOrErr instanceof Response) return uidOrErr;
    const uid = uidOrErr;

    getFirestore({ databaseId: 'author-db' });
    const items = await queryCollection<PasteDoc>(pastesCollection, {
      field: 'ownerUid',
      op: '==',
      value: uid,
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit: 100,
    });

    return c.json({
      count: items.length,
      items: items.map((item) => ({
        pasteId: item.pasteId,
        ownerSub: item.ownerUid,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt,
        ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
      })),
    });
  });
}
