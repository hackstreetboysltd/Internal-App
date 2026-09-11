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
| `SESSION_SECRET` | long random string (`openssl rand -hex 32`); **must match `.env.local` when local and Vercel share Neon** |
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

## Messages: decryption key mismatch / production stuck on `[Locked]`

`[Decryption Key Mismatch]` or a stuck “Waiting for your account key” banner means this browser cannot open the account identity those envelopes were sealed to. `localhost` and production are different origins, so `localStorage` is not shared even on the same laptop.

**When local and production share the same Neon database, they must use the same `SESSION_SECRET`.** Account identity is AES-GCM wrapped with that secret. If Vercel’s `SESSION_SECRET` differs from `.env.local`, production cannot unwrap the blob and Messages stays on “unlocking this device…”. Keep one shared value: copy from `.env.local` into Vercel → Environment Variables → `SESSION_SECRET` (Production + Preview), redeploy, then open Messages once on the browser that can already decrypt (usually local) so the account key is rewritten. Other signed-in origins then install it automatically — no export/import.

The host can unwrap `msgIdentityEnc` (it is wrapped with `SESSION_SECRET`, not E2EE against the server). Teammates still cannot read another user’s private identity. After rotating `SESSION_SECRET`, update **every** host that shares the database to the same new value, then open Messages once on a browser that can already read so the blob can be rewritten.

## Messages: send spinner then “Failed to transmit message data to server”

A Firefox console full of unused `_next/static/...css` preloads plus `cdnjs` Font Awesome CORS is **not** what failed the save. Those were side effects (dock prefetch of every module, webfonts from a third-party CDN). The save itself 504’d: EmailJS notification fetches had no timeout, so Vercel waited out the isolate and returned an empty body; Firefox `statusText` is blank on HTTP/2, so the UI logged `DataApiError:` with no message.

Guards (do not regress):

1. Collection notification email runs in `after()` (`lib/server/afterResponse.js`) so the PUT can return as soon as Postgres commits.
2. EmailJS `fetch` uses `AbortSignal.timeout` (8s) in `lib/server/notifications/emailFetch.js`.
3. Collection PUT aborts at 15s and `httpErrorDetail` never throws a blank `DataApiError`.
4. Font Awesome is bundled from `@fortawesome/fontawesome-free` (same origin). Do not add a cdnjs `<link>` for FA.
5. Dock links use `prefetch={false}` and must not call `router.prefetch` for every module.
6. After a successful messages PUT, the send spinner must not wait on `loadMessages()` — live watch refreshes the thread.

`npm run test:prod-send-guards` locks 4–6 in source. `npm run test:http-error-detail` and `npm run test:email-fetch` lock 2–3.

## Load check

```bash
npm run test:load
```
