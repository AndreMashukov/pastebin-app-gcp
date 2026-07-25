import type { Env, Hono } from 'hono';
import { EventType } from '@pastebingcp/events';
import { errorResponse } from '@pastebingcp/http';
import { decodeDocumentEventDataBytes } from '@pastebingcp/proto-decode';
import { publishEvent } from '@pastebingcp/pubsub';

const topicName = process.env.EVENTHUB_TOPIC ?? 'pastebin-events';

type TriggerResult =
  | { ack: true; published: string; pasteId: string; eventId: string }
  | { ack: true; ignored: string; fields?: string[] };

function pasteIdFromSubject(subject: string): string | null {
  const markers = ['/pastes/', 'pastes/'];
  for (const marker of markers) {
    const idx = subject.lastIndexOf(marker);
    if (idx >= 0) {
      const pasteId = subject.slice(idx + marker.length).split('/').filter(Boolean)[0];
      if (pasteId) return pasteId;
    }
  }
  return null;
}

function fieldString(fields: Record<string, { stringValue?: string; timestampValue?: string }>, key: string): string {
  return fields[key]?.stringValue ?? fields[key]?.timestampValue ?? '';
}

async function publishPasteCreated(opts: {
  eventId: string;
  pasteId: string;
  ownerUid: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string | null;
}): Promise<TriggerResult> {
  await publishEvent({
    topicName,
    eventId: opts.eventId,
    type: EventType.PASTE_CREATED,
    data: {
      pasteId: opts.pasteId,
      ownerUid: opts.ownerUid,
      contentType: opts.contentType,
      sizeBytes: opts.sizeBytes,
      createdAt: opts.createdAt,
      expiresAt: opts.expiresAt,
    },
  });
  return { ack: true, published: EventType.PASTE_CREATED, pasteId: opts.pasteId, eventId: opts.eventId };
}

async function publishPasteDeleted(opts: {
  eventId: string;
  pasteId: string;
  ownerUid: string;
  deletedAt: string;
}): Promise<TriggerResult> {
  await publishEvent({
    topicName,
    eventId: opts.eventId,
    type: EventType.PASTE_DELETED,
    data: {
      pasteId: opts.pasteId,
      ownerUid: opts.ownerUid,
      deletedAt: opts.deletedAt,
    },
  });
  return { ack: true, published: EventType.PASTE_DELETED, pasteId: opts.pasteId, eventId: opts.eventId };
}

export async function handleFirestoreCreatedFromProtobuf(opts: {
  eventId?: string;
  ceType?: string;
  subject?: string;
  body: Uint8Array;
}): Promise<TriggerResult> {
  const ceType = opts.ceType ?? '';
  if (ceType && ceType !== 'google.cloud.firestore.document.v1.created') {
    return { ack: true, ignored: ceType };
  }

  let decoded;
  try {
    decoded = decodeDocumentEventDataBytes(opts.body);
  } catch (err) {
    console.error('[author-bff] protobuf-decode-failed', String(err));
    return { ack: true, ignored: 'protobuf-decode-failed' };
  }

  const subject = opts.subject || decoded.document.name;
  const pasteId = pasteIdFromSubject(subject) ?? pasteIdFromSubject(decoded.path) ?? '';
  if (!pasteId) {
    return { ack: true, ignored: subject ? `no-paste:${subject}` : 'no-pasteId' };
  }

  const fields = decoded.document.fields;
  const ownerUid = fieldString(fields, 'ownerUid');
  const contentType = fieldString(fields, 'contentType');
  const createdAt = fieldString(fields, 'createdAt') || decoded.document.createTime || new Date().toISOString();
  const expiresAtRaw = fieldString(fields, 'expiresAt');
  const expiresAt = expiresAtRaw || null;
  const sizeBytesRaw = fieldString(fields, 'sizeBytes');
  const sizeBytes = sizeBytesRaw ? Number(sizeBytesRaw) : 0;

  if (!ownerUid || !contentType) {
    return { ack: true, ignored: 'missing-fields', fields: Object.keys(fields) };
  }

  const eventId = opts.eventId ?? `evt-created-${pasteId}-${createdAt}`;
  return publishPasteCreated({
    eventId,
    pasteId,
    ownerUid,
    contentType,
    sizeBytes,
    createdAt,
    expiresAt,
  });
}

export async function handleFirestoreDeletedFromProtobuf(opts: {
  eventId?: string;
  ceType?: string;
  subject?: string;
  body: Uint8Array;
}): Promise<TriggerResult> {
  const ceType = opts.ceType ?? '';
  if (ceType && ceType !== 'google.cloud.firestore.document.v1.deleted') {
    return { ack: true, ignored: ceType };
  }

  let decoded;
  try {
    decoded = decodeDocumentEventDataBytes(opts.body);
  } catch (err) {
    console.error('[author-bff] protobuf-decode-failed', String(err));
    return { ack: true, ignored: 'protobuf-decode-failed' };
  }

  const subject = opts.subject || decoded.document.name;
  const pasteId = pasteIdFromSubject(subject) ?? pasteIdFromSubject(decoded.path) ?? '';
  if (!pasteId) {
    return { ack: true, ignored: subject ? `no-paste:${subject}` : 'no-pasteId' };
  }

  const fields = decoded.document.fields;
  const ownerUid = fieldString(fields, 'ownerUid') || 'unknown';
  const deletedAt = new Date().toISOString();
  const eventId = opts.eventId ?? `evt-deleted-${pasteId}-${deletedAt}`;
  return publishPasteDeleted({ eventId, pasteId, ownerUid, deletedAt });
}

async function handleEventarcBody(c: { req: { header: (name: string) => string | undefined; arrayBuffer: () => Promise<ArrayBuffer> } }): Promise<TriggerResult> {
  const contentType = c.req.header('content-type') ?? '';
  const ceHeaders = {
    id: c.req.header('ce-id') ?? c.req.header('Ce-Id') ?? undefined,
    type: c.req.header('ce-type') ?? c.req.header('Ce-Type') ?? undefined,
    subject: c.req.header('ce-subject') ?? c.req.header('Ce-Subject') ?? undefined,
  };
  const body = new Uint8Array(await c.req.arrayBuffer());

  if (ceHeaders.type === 'google.cloud.firestore.document.v1.deleted') {
    return handleFirestoreDeletedFromProtobuf({
      eventId: ceHeaders.id,
      ceType: ceHeaders.type,
      subject: ceHeaders.subject,
      body,
    });
  }

  if (contentType.includes('protobuf') || contentType.includes('octet-stream') || ceHeaders.type) {
    return handleFirestoreCreatedFromProtobuf({
      eventId: ceHeaders.id,
      ceType: ceHeaders.type,
      subject: ceHeaders.subject,
      body,
    });
  }

  return { ack: true, ignored: 'not-eventarc' };
}

export function registerTriggerRoutes<E extends Env>(app: Hono<E>): void {
  app.post('/__eventarc/publish', async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (contentType.includes('protobuf') || contentType.includes('octet-stream')) {
      const result = await handleEventarcBody(c);
      console.log('[author-bff] firestore-trigger', JSON.stringify(result));
      return c.json(result, 200);
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch (err) {
      return errorResponse(400, 'invalid_json', String(err));
    }

    const ceType = body.type ?? 'google.cloud.firestore.document.v1.created';
    const subject = body.subject ?? body.data?.value?.name ?? body.value?.name ?? '';
    const pasteId = pasteIdFromSubject(subject);
    if (!pasteId) {
      return c.json({ ack: true, ignored: subject ? `no-paste:${subject}` : 'no-subject' }, 200);
    }

    const fields = body.data?.value?.fields ?? body.value?.fields ?? {};
    const ownerUid = fields.ownerUid?.stringValue ?? '';
    const contentTypeField = fields.contentType?.stringValue ?? '';
    const createdAt = fields.createdAt?.stringValue ?? fields.createdAt?.timestampValue ?? new Date().toISOString();
    const expiresAt = fields.expiresAt?.stringValue ?? fields.expiresAt?.timestampValue ?? null;
    const sizeBytes = Number(fields.sizeBytes?.stringValue ?? fields.sizeBytes?.integerValue ?? 0);
    const eventId = body.id ?? `evt-${pasteId}-${createdAt}`;

    if (ceType === 'google.cloud.firestore.document.v1.deleted') {
      const result = await publishPasteDeleted({
        eventId,
        pasteId,
        ownerUid: ownerUid || 'unknown',
        deletedAt: new Date().toISOString(),
      });
      console.log('[author-bff] firestore-trigger', JSON.stringify(result));
      return c.json(result, 200);
    }

    if (!ownerUid || !contentTypeField) {
      return c.json({ ack: true, ignored: 'missing-fields', fields: Object.keys(fields) }, 200);
    }

    const result = await publishPasteCreated({
      eventId,
      pasteId,
      ownerUid,
      contentType: contentTypeField,
      sizeBytes,
      createdAt,
      expiresAt,
    });
    console.log('[author-bff] firestore-trigger', JSON.stringify(result));
    return c.json(result, 200);
  });

  app.post('/', async (c) => {
    const result = await handleEventarcBody(c);
    console.log('[author-bff] eventarc', JSON.stringify(result));
    return c.json(result, 200);
  });
}
