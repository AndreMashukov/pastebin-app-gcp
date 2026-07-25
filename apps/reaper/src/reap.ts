import { deleteDoc, getFirestore } from '@pastebingcp/firestore';
import { deletePasteObject } from '@pastebingcp/storage';

const contentBucket = process.env.CONTENT_BUCKET ?? '';
const serviceName = process.env.SERVICE_NAME ?? 'reaper';
const pastesCollection = { database: 'author-db', collection: 'pastes' } as const;

type PasteDoc = {
  pasteId: string;
  ownerUid: string;
  expireIndex: string | null;
};

type CycleStats = {
  scanned: number;
  gcsDeleted: number;
  gcsFailed: number;
  firestoreDeleted: number;
  firestoreFailed: number;
};

function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level, service: serviceName, msg, ...fields }));
}

export async function reap(): Promise<CycleStats> {
  if (!contentBucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const nowPrefix = `${nowIso}#`;

  log('info', 'reaper:cycle:start', { now: nowIso });

  const stats: CycleStats = {
    scanned: 0,
    gcsDeleted: 0,
    gcsFailed: 0,
    firestoreDeleted: 0,
    firestoreFailed: 0,
  };

  const db = getFirestore({ databaseId: 'author-db' });
  let query = db.collection('pastes')
    .where('expireIndex', '<', nowPrefix)
    .orderBy('expireIndex', 'asc')
    .limit(100);

  while (true) {
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      stats.scanned += 1;
      const row = doc.data() as PasteDoc;
      const pasteId = row.pasteId || doc.id;
      await reapOne(pasteId, stats);
    }

    if (snap.size < 100) break;
    const last = snap.docs[snap.docs.length - 1];
    query = db.collection('pastes')
      .where('expireIndex', '<', nowPrefix)
      .orderBy('expireIndex', 'asc')
      .startAfter(last)
      .limit(100);
  }

  log('info', 'reaper:cycle:end', { ...stats, elapsedMs: Date.now() - startedAt });
  return stats;
}

async function reapOne(pasteId: string, stats: CycleStats): Promise<void> {
  try {
    await deletePasteObject({ bucketName: contentBucket, pasteId });
    stats.gcsDeleted += 1;
  } catch (err) {
    stats.gcsFailed += 1;
    log('warn', 'reaper:gcs:delete-failed', {
      pasteId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await deleteDoc(pastesCollection, pasteId);
    stats.firestoreDeleted += 1;
  } catch (err) {
    stats.firestoreFailed += 1;
    log('error', 'reaper:firestore:delete-failed', {
      pasteId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
