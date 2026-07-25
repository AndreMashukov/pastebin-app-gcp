import { randomBytes } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const PASTE_ID_LENGTH = 8;
const PASTE_ID_PATTERN = /^[A-Za-z0-9]{8}$/;

export function randomBase62(bytes: number): string {
  const buf = randomBytes(bytes);
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += BASE62[buf[i]! % BASE62.length];
  }
  return out;
}

export function checksum2(s: string): string {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum = (sum * 31 + s.charCodeAt(i)) & 0x7fffffff;
  }
  const mod = sum % (BASE62.length * BASE62.length);
  const hi = Math.floor(mod / BASE62.length);
  const lo = mod % BASE62.length;
  return BASE62[hi]! + BASE62[lo]!;
}

export function generatePasteId(): string {
  const random = randomBase62(6);
  return random + checksum2(random);
}

export function isValidPasteId(id: string): boolean {
  if (!PASTE_ID_PATTERN.test(id)) return false;
  const body = id.slice(0, 6);
  const checksum = id.slice(6, 8);
  return checksum2(body) === checksum;
}

export function splitPasteId(id: string): { body: string; checksum: string } {
  return { body: id.slice(0, 6), checksum: id.slice(6, 8) };
}
