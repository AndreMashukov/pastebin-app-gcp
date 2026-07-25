# pastebin-app-gcp

GCP port of the AWS `pastebin-app`, built on the same patterns as `url-shortener-app-gcp`:

- **Cloud Run v2** services: `author-bff`, `public-bff`, `reaper`
- **Firestore Native** per-service databases (`author-db`, `public-db`)
- **GCS** for paste bodies
- **Pub/Sub + Eventarc** for `paste.created` / `paste.deleted`
- **Terraform** for infrastructure, **Nx** for the TypeScript monorepo

## API parity (AWS source)

| Service | Route | Auth |
|---------|-------|------|
| author-bff | `POST /pastes` | Identity Platform JWT (or dev `X-Smoke-Test`) |
| author-bff | `GET /me/pastes` | Identity Platform JWT |
| public-bff | `GET /p/{pasteId}` | public |
| public-bff | `GET /p/{pasteId}/meta` | public |

Behavior preserved from AWS: 8-char checksum paste IDs, 256 KiB max body, 30-day default expiry, GCS-first write order, Firestore CDC as sole event producer, lean read projection, scheduled reaper, `410 Gone` for expired pastes.

## Quick start

```bash
npm install
npm run build
npm run typecheck
```

## Deploy

1. Copy `terraform/envs/dev/terraform.tfvars.example` to `terraform.tfvars` and set `project_id`, bucket names, and `smoke_test_key`.
2. Bootstrap Terraform state bucket, then from `terraform/envs/dev`:

```bash
terraform init
terraform plan -out=dev.tfplan
terraform apply dev.tfplan
```

3. Deploy app images:

```bash
PROJECT_ID=your-gcp-project-id npm run deploy:bffs
```

4. Smoke test (after setting Cloud Run URLs):

```bash
AUTHOR_BFF_URL=... PUBLIC_BFF_URL=... SMOKE_TEST_KEY=... ./scripts/smoke-bff.sh
```

## Layout

```
apps/author-bff   write API + Firestore CDC publisher
apps/public-bff   public read API + bus listener
apps/reaper       scheduled expiry worker
libs/*            shared auth, events, firestore, storage, paste-id, etc.
terraform/        event hub, content bucket, Cloud Run, Scheduler
```
