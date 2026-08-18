# File Transfer Worker

Cloudflare Worker + D1 temporary batch transfer service. File bodies move directly between the browser and an S3-compatible object store through presigned URLs.

## Setup

1. Install dependencies with `bun install` (Bun 1.3.10 or newer).
2. Create D1 and replace `database_id` in `wrangler.toml`.
3. Initialize D1 with `bunx wrangler d1 execute file-transfer --remote --file schema.sql`.
4. Copy `.dev.vars.example` to `.dev.vars` and set local secrets. For production, store secrets with `bunx wrangler secret put`.
5. Configure the S3 bucket CORS policy to allow `PUT` and `HEAD` from the application origin, including `content-type`, `content-md5`, and `x-amz-meta-md5`.
6. Register the configured `/auth/callback` URL with the OIDC provider.

OIDC discovery is authoritative for the exact issuer value. Administrator email addresses must be verified by default; set `OIDC_REQUIRE_VERIFIED_EMAIL="false"` only when the provider cannot emit a verified email claim and the configured email allowlist is trusted.

## Development

Create local configuration and initialize the local D1 database once:

```bash
cp .dev.vars.example .dev.vars
bun run db:local
```

Fill in `.dev.vars`, then start the complete Worker at `http://localhost:8788`:

```bash
bun run dev
```

This builds the frontend before starting Wrangler. For frontend-only visual work with Vite hot reload, use `bun run dev:ui`. For full-stack development with continuously rebuilt frontend assets, run `bun run dev:assets` and `bunx wrangler dev --local --port 8788` in separate terminals.

Set `APP_TITLE` to customize the public and administration title. `MAX_BATCH_FILES` controls the maximum number of files selected per batch.

Deploy with `bun run deploy`.

The public API never receives file bodies. One upload authorization creates one batch with one pickup PIN. Browser-side size + MD5 checks reuse matching physical objects, while D1 keeps independent references for every active batch. Revoking or expiring a batch invalidates its pickup credentials immediately; the daily Cron removes uploads that are still pending after 12 hours and deletes an S3 object only after no active batch references it.
