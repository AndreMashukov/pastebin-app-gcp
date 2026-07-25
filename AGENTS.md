# Agent guide — pastebin-app-gcp

## Architecture rules

1. **Database-first sole producer** — `author-bff` HTTP handlers write Firestore/GCS only. Firestore Eventarc triggers publish `paste.created` and `paste.deleted`. Never publish creation events from `POST /pastes`.
2. **Per-BFF Firestore bulkhead** — `author-db`, `public-db`; no cross-database reads in handlers.
3. **Lean view** — `public-bff` materializes `lean_view` from bus events; paste bodies stay in GCS.
4. **Reaper chain** — reaper deletes GCS object then author Firestore doc; CDC emits `paste.deleted`; public listener removes lean row.
5. **Eventarc bodies** — read `arrayBuffer()` once; Firestore CDC arrives as protobuf `DocumentEventData`.

## Commands

```bash
npm install
npm run build
npm run typecheck
npm run deploy:bffs
```

## Deploy order

1. `terraform apply` in `terraform/envs/dev`
2. `npm run deploy:bffs`
3. `./scripts/smoke-bff.sh`

## Package scope

Shared libraries live under `@pastebingcp/*`.
