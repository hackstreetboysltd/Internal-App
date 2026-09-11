# Operations runbook

## Local stack

```bash
docker compose up -d
npm install
npm run migrate
npm run dev
```

Health: `GET /Internal-App/api/health/` — Postgres + Redis ping, plus `providers` (`local` / `neon` / `upstash`).

## Production: Vercel + Neon + Upstash

**Vercel** runs Next.js. **Neon** runs Postgres. **Upstash** runs Redis. GitHub Pages is not used.

### Neon (PostgreSQL)

1. Sign up at [neon.tech](https://neon.tech) → **Create project**.
2. Open **Connection details** → copy the **Pooled connection** string (hostname contains `-pooler`).
3. Ensure the URI ends with `?sslmode=require`.
4. Example:

   ```
   postgresql://user:pass@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

5. Set as `DATABASE_URL` in Vercel (Production + Preview).

Neon free tier sleeps when idle; the first request after idle may be slower.

### Upstash (Redis)

1. Sign up at [upstash.com](https://upstash.com) → **Create database** → pick a region near your Vercel deployment.
2. Copy the **TLS** URL from the console (`rediss://…`, not `redis://`).
3. Example:

   ```
   rediss://default:AbCdEf...@us1-example.upstash.io:6379
   ```

4. Set as `REDIS_URL` in Vercel.

Free tier: ~10k commands/day — fine for a small internal team. Admin SSE reconnects add Redis traffic.

### Vercel

1. Import this GitHub repo. Framework: **Next.js**. Root directory: repo root.
2. Set env vars (Production + Preview):

| Name | Example |
|------|---------|
| `APP_URL` | `https://your-app.vercel.app/Internal-App` |
| `NEXT_PUBLIC_BASE_PATH` | `/Internal-App` |
| `SESSION_SECRET` | long random string (`openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client |
| `GOOGLE_REDIRECT_URI` | `https://your-app.vercel.app/Internal-App/api/auth/callback` |
| `DATABASE_URL` | Neon **pooled** URI (`?sslmode=require`) |
| `REDIS_URL` | Upstash `rediss://…` |
| `CRON_SECRET` | random; Vercel Cron sends `Authorization: Bearer CRON_SECRET` |
| `NODE_ENV` | `production` |

3. Google Cloud Console → authorized redirect URI = `GOOGLE_REDIRECT_URI` above.
4. Deploy, then run migrations once from your machine (Vercel does not run them):

```bash
DATABASE_URL='postgresql://…-pooler….neon.tech/neondb?sslmode=require' npm run migrate
```

5. Retention cron: `vercel.json` hits `GET /Internal-App/api/admin/jobs/retention/` daily at 04:00 UTC. Hobby allows one cron/day.

### Verify production

```bash
curl -s https://your-app.vercel.app/Internal-App/api/health/ | jq
```

Expect `"ok": true`, `"providers": { "postgres": "neon", "redis": "upstash" }`, and no `warnings`.

### Caveats

- Live admin SSE is capped at **60s** per connection (`maxDuration`). The browser EventSource reconnects; Hobby is 10s unless you upgrade.
- Serverless Postgres: pool size is **1** on Vercel. Always use Neon’s **pooled** connection string (`-pooler` hostname).
- URLs stay under `/Internal-App/` until you drop `basePath`.
- If health returns `warnings` about pooler or TLS, fix `DATABASE_URL` / `REDIS_URL` before go-live.

## Environment

Required in production:

- `APP_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `DATABASE_URL`, `REDIS_URL`
- `NODE_ENV=production` (enables `Secure` on the `sid` cookie)
- `CRON_SECRET` (Vercel Cron → retention job)

Optional: `GOOGLE_HD`, rate-limit overrides, `API_LOG_RETENTION_DAYS` (default 30), `ACTIVITY_LOG_RETENTION_DAYS` (default 90), `SESSION_ROTATE_AFTER_SEC` (default 86400; `0` disables).

EmailJS (`EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, plus `NEXT_PUBLIC_PORTAL_URL` / `APP_URL` for the CTA) is optional locally. When those are set, new group-channel members get “You have been added to this secure channel. Check it out”, and recipients of a new channel or DM message get “You have received a secure message. Check it out”. The mail never includes ciphertext or the message body. Starting a DM does not send the channel-added notice. If EmailJS is unset, in-app notices still land and the email is skipped.

## Sessions

- HttpOnly, SameSite=Lax, Secure in production, path `/Internal-App`, 7-day sliding TTL.
- New `sid` on every login. Sessions older than `SESSION_ROTATE_AFTER_SEC` are rotated on `GET /api/auth/me`.
- Admin force-logout: `DELETE /api/admin/sessions/:sid/`
- List a user’s Redis sessions: `GET /api/admin/sessions/?email=`

## Retention cron

On Vercel, `vercel.json` calls `GET /Internal-App/api/admin/jobs/retention/` daily (Bearer `CRON_SECRET`).

Locally or as a backup:

```bash
npm run jobs:retention
```

Admins can also trigger `POST /api/admin/jobs/retention/` from a live server. The job:

1. Upserts `log_hourly_stats` for the last ~24 hours
2. Deletes `api_request_logs` older than `API_LOG_RETENTION_DAYS`
3. Deletes `activity_logs` older than `ACTIVITY_LOG_RETENTION_DAYS`

## Firestore cutover

1. Export `modules/*` docs to JSON (collection name → array)
2. `npm run migrate:firestore -- --from-export=./firestore-export.json`
3. Keep Firebase read-only for 14 days; GitHub Auth remains for `/github-connect/`

## GitHub Pages

Static Pages deploy is retired. The old workflow is manual-only and does not publish. CI on `main` is `.github/workflows/next-build.yml`.

## Rollback

Point users back at the previous static GitHub Pages app if needed. Redis sessions on Vercel are discarded; users sign in again.

## Security checklist

- OAuth `state` is HMAC-signed and expiry-checked (`SESSION_SECRET`)
- Redirects use `safeReturnPath` (relative paths only)
- SQL uses parameterized queries; collection names are allowlisted
- Admin APIs require `roles` to include `admin`
- Rate limits on `/api/*` via Redis sliding windows
- Message ciphertext uses client-side hybrid sealed envelopes (`messages/crypto.js`, ENC v5)
- Account message identity is owner-only (`/api/messages/identity`); `profile.msgIdentityEnc` is stripped from collection reads and cannot be rotated via a profile save
- Successful message edits persist `editedAt` and render an Edited badge; unchanged rows in a collection re-save are not marked edited

## Messages: decryption key mismatch

`[Decryption Key Mismatch]` or a stuck “Waiting for your account key” banner means this browser does not have the account identity those envelopes were sealed to. `localhost` and production are different origins, so `localStorage` is not shared even on the same laptop.

```mermaid
sequenceDiagram
  participant Local as Local Messages
  participant API as Identity API
  participant DB as Shared Postgres
  participant Prod as Production Messages
  Local->>API: GET /api/messages/identity
  API->>DB: unwrap with DB wrap key
  alt blob still SESSION_SECRET-wrapped
    API->>DB: unwrap with local SESSION_SECRET then rewrap
  end
  API-->>Local: account identity
  Local->>API: PUT if this browser already unlocks mail
  Prod->>API: GET /api/messages/identity
  API->>DB: unwrap with DB wrap key
  API-->>Prod: same account identity
```

1. Deploy this build to Vercel (production must use the database wrap key).
2. Open Messages once on the origin that can already read the thread (usually local). That read rewraps any `SESSION_SECRET` blob and uploads if needed.
3. Reload (or wait a few seconds) on the failing origin — it installs the account key after sign-in.
4. Break-glass: key menu → Export / Import. Do not paste the key into chat, tickets, or logs.

The host can unwrap `msgIdentityEnc` (it is wrapped with a key stored in `message_identity_wrap_keys`, not E2EE against the server). Teammates still cannot read another user’s private identity. `SESSION_SECRET` rotation no longer locks production out of a key written from `start.sh`.

## Load check

```bash
npm run test:load
```
