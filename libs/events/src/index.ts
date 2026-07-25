import { z } from 'zod';

export const PasteCreatedData = z.object({
  pasteId: z.string().min(1).max(64),
  ownerUid: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export type PasteCreatedData = z.infer<typeof PasteCreatedData>;

export const PasteDeletedData = z.object({
  pasteId: z.string().min(1).max(64),
  ownerUid: z.string().min(1),
  deletedAt: z.string().datetime(),
});
export type PasteDeletedData = z.infer<typeof PasteDeletedData>;

export const CloudEvent = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  time: z.string().datetime().optional(),
  specversion: z.string().optional(),
  datacontenttype: z.string().optional(),
  data: z.unknown(),
});
export type CloudEvent = z.infer<typeof CloudEvent>;

export const EventType = {
  PASTE_CREATED: 'paste.created',
  PASTE_DELETED: 'paste.deleted',
} as const;
export type EventTypeName = typeof EventType[keyof typeof EventType];

export function parseEventData(type: string, data: unknown) {
  switch (type) {
    case EventType.PASTE_CREATED:
      return PasteCreatedData.parse(data);
    case EventType.PASTE_DELETED:
      return PasteDeletedData.parse(data);
    default:
      throw new Error(`Unknown event type: ${type}`);
  }
}
