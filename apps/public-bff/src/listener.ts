import type { Env, Hono } from 'hono';
import { EventType } from '@pastebingcp/events';
import { deleteDoc, getFirestore, upsertDoc } from '@pastebingcp/firestore';
import { errorResponse } from '@pastebingcp/http';

const leanCollection = { database: 'public-db', collection: 'lean_view' } as const;

type BusResult =
  | { ack: true; upserted: string }
  | { ack: true; deleted: string }
  | { ack: true; ignored: string };

export async function handleBusEvent(body: any): Promise<BusResult> {
  const ceType = body?.type ?? '';
  const envelope = body?.data?.message ?? body?.message;
  let eventType = '';
  let eventData: Record<string, unknown> = {};
  let eventId = 'unknown';

  if (envelope && envelope.data != null) {
    const attrs = envelope.attributes ?? {};
    let payload: any;
    try {
      const raw = envelope.data;
      payload = typeof raw === 'string'
        ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
        : raw;
    } catch {
      return { ack: true, ignored: 'decode-failed' };
    }
    eventType = attrs.type ?? payload?.type ?? '';
    eventData = payload?.data ?? payload ?? {};
    eventId = attrs.eventId ?? payload?.id ?? eventId;
  } else if (body?.data && typeof body.data === 'object' && body.type) {
    if (String(body.type).includes('pubsub') && body.data.message) {
      return handleBusEvent({ message: body.data.message });
    }
    eventType = String(body.type);
    eventData = body.data;
    eventId = String(body.id ?? eventId);
  } else {
    return { ack: true, ignored: ceType || 'unknown-shape' };
  }

  getFirestore({ databaseId: 'public-db' });

  if (eventType === EventType.PASTE_CREATED) {
    const pasteId = eventData.pasteId as string | undefined;
    const ownerUid = eventData.ownerUid as string | undefined;
    const contentType = eventData.contentType as string | undefined;
    const sizeBytes = eventData.sizeBytes as number | undefined;
    const createdAt = eventData.createdAt as string | undefined;
    if (!pasteId || !ownerUid || !contentType || sizeBytes == null || !createdAt) {
      return { ack: true, ignored: 'missing-fields' };
    }

    await upsertDoc(leanCollection, pasteId, {
      pasteId,
      contentType,
      sizeBytes,
      ownerSub: ownerUid,
      createdAt,
      expiresAt: (eventData.expiresAt as string | null | undefined) ?? null,
      sourceEventId: eventId,
      materializedAt: new Date().toISOString(),
    });
    return { ack: true, upserted: pasteId };
  }

  if (eventType === EventType.PASTE_DELETED) {
    const pasteId = eventData.pasteId as string | undefined;
    if (!pasteId) {
      return { ack: true, ignored: 'missing-fields' };
    }
    await deleteDoc(leanCollection, pasteId);
    return { ack: true, deleted: pasteId };
  }

  return { ack: true, ignored: eventType || ceType };
}

export function registerListenerRoutes<E extends Env>(app: Hono<E>): void {
  app.post('/__eventarc/publish', async (c) => {
    let body: any;
    try {
      body = await c.req.json();
    } catch (err) {
      return errorResponse(400, 'invalid_json', String(err));
    }
    const result = await handleBusEvent(body);
    console.log('[public-bff] bus', JSON.stringify(result));
    return c.json(result, 200);
  });

  app.post('/', async (c) => {
    const bodyText = await c.req.text();
    const looksLikePush = bodyText.includes('"message"') || bodyText.includes('"attributes"');
    if (!looksLikePush && !c.req.query('__GCP_CloudEventsMode')) {
      return c.json({ ack: true, ignored: 'not-eventarc' }, 200);
    }

    let body: any;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch (err) {
      console.error('[public-bff] eventarc-invalid-json', String(err));
      return c.json({ ack: true, ignored: 'invalid-json' }, 200);
    }

    const result = await handleBusEvent(body);
    console.log('[public-bff] eventarc', JSON.stringify(result));
    return c.json(result, 200);
  });
}
