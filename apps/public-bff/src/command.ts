import type { Env, Hono } from 'hono';
import { getDoc, getFirestore } from '@pastebingcp/firestore';
import { errorResponse } from '@pastebingcp/http';
import { isValidPasteId, splitPasteId } from '@pastebingcp/paste-id';
import { getPasteObject } from '@pastebingcp/storage';

const contentBucket = process.env.CONTENT_BUCKET ?? '';
const leanCollection = { database: 'public-db', collection: 'lean_view' } as const;

type LeanViewDoc = {
  pasteId: string;
  contentType: string;
  sizeBytes: number;
  ownerSub: string;
  createdAt: string;
  expiresAt: string | null;
  sourceEventId: string;
  materializedAt: string;
};

function isExpired(row: LeanViewDoc, now: Date = new Date()): boolean {
  if (!row.expiresAt) return false;
  const t = Date.parse(row.expiresAt);
  return Number.isFinite(t) && t <= now.getTime();
}

function parsePasteIdParam(raw: string | undefined): { ok: true; pasteId: string } | { ok: false; response: Response } {
  const id = (raw ?? '').trim();
  if (!id) {
    return { ok: false, response: errorResponse(400, 'bad_request', 'pasteId is required') };
  }
  if (!isValidPasteId(id)) {
    return {
      ok: false,
      response: errorResponse(
        400,
        'bad_request',
        'pasteId must be 8 characters of [A-Za-z0-9] with a valid checksum',
      ),
    };
  }
  return { ok: true, pasteId: id };
}

export function registerCommandRoutes<E extends Env>(app: Hono<E>): void {
  app.get('/p/:pasteId', async (c) => {
    if (!contentBucket) {
      return errorResponse(500, 'internal_error', 'CONTENT_BUCKET is not configured');
    }

    const param = parsePasteIdParam(c.req.param('pasteId'));
    if (!param.ok) return param.response;
    const { pasteId } = param;

    getFirestore({ databaseId: 'public-db' });
    const row = await getDoc<LeanViewDoc>(leanCollection, pasteId);
    if (!row) {
      return errorResponse(404, 'not_found', `no paste with id '${pasteId}'`);
    }
    if (isExpired(row)) {
      return errorResponse(410, 'gone', 'paste has expired');
    }

    try {
      const object = await getPasteObject({ bucketName: contentBucket, pasteId });
      return new Response(object.body, {
        status: 200,
        headers: {
          'content-type': row.contentType,
          'x-paste-id': pasteId,
          'x-paste-created-at': row.createdAt,
          'x-paste-expires-at': row.expiresAt ?? '',
          'x-paste-size-bytes': String(row.sizeBytes),
          'cache-control': 'public, max-age=60',
        },
      });
    } catch (err) {
      console.error('[public-bff] getPaste failed', { pasteId, err: String(err) });
      return errorResponse(500, 'internal_error', 'failed to fetch paste body');
    }
  });

  app.get('/p/:pasteId/meta', async (c) => {
    const param = parsePasteIdParam(c.req.param('pasteId'));
    if (!param.ok) return param.response;
    const { pasteId } = param;

    getFirestore({ databaseId: 'public-db' });
    const row = await getDoc<LeanViewDoc>(leanCollection, pasteId);
    if (!row) {
      return errorResponse(404, 'not_found', `no paste with id '${pasteId}'`);
    }
    if (isExpired(row)) {
      return errorResponse(410, 'gone', 'paste has expired');
    }

    void splitPasteId(pasteId);

    return c.json({
      pasteId,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      ownerSub: row.ownerSub,
      sourceEventId: row.sourceEventId,
      materializedAt: row.materializedAt,
    });
  });
}
