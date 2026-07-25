import { Storage } from '@google-cloud/storage';

let _client: Storage | null = null;

export function getStorage(): Storage {
  if (_client) return _client;
  _client = new Storage();
  return _client;
}

export function pasteObjectKey(pasteId: string): string {
  return `pastes/${pasteId}`;
}

export async function putPasteObject(opts: {
  bucketName: string;
  pasteId: string;
  body: string;
  contentType: string;
}): Promise<void> {
  const storage = getStorage();
  await storage.bucket(opts.bucketName).file(pasteObjectKey(opts.pasteId)).save(opts.body, {
    contentType: opts.contentType,
  });
}

export async function getPasteObject(opts: {
  bucketName: string;
  pasteId: string;
}): Promise<{ body: string; contentType?: string }> {
  const storage = getStorage();
  const file = storage.bucket(opts.bucketName).file(pasteObjectKey(opts.pasteId));
  const [contents] = await file.download();
  const [metadata] = await file.getMetadata();
  return {
    body: contents.toString('utf8'),
    contentType: metadata.contentType,
  };
}

export async function deletePasteObject(opts: {
  bucketName: string;
  pasteId: string;
}): Promise<void> {
  const storage = getStorage();
  await storage.bucket(opts.bucketName).file(pasteObjectKey(opts.pasteId)).delete({ ignoreNotFound: true });
}
