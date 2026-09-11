# HackstreetBoys Internal Portal

Next.js server-backed internal portal with Google OAuth, PostgreSQL, Redis, and admin observability.

## Guardrails

- **Auth:** Google OAuth account picker; server session cookie (`sid`); 7-day sliding TTL in Redis.
- **Session UI keys:** `activeModule`, `isAdminView`, `messages.vault.*`, `portalTabSessionId` in sessionStorage only — not auth state.
- **Data:** PostgreSQL via `/api/data/*` and `/api/sync/*`; portal modules use `lib/portalApi.js` → HTTP + `lib/cacheManager.js`.
- **Visual:** Reuse existing module CSS. No Tailwind or component-library redesign.
- **Messages:** Client-side hybrid sealed envelopes in `messages/crypto.js` (ENC v5: ECDH P-256 + ML-KEM-768). After Google sign-in, the owner’s private identity syncs through `GET/PUT /api/messages/identity` (AES-GCM wrapped with `SESSION_SECRET` on the profile row; never returned on `profile` collection reads). `localStorage` is a cache. A new origin that cannot unlock existing mail waits instead of minting a new key; the browser that can already read uploads once, then every signed-in device installs that account key. Export/import remains a break-glass backup. Successful edits persist `editedAt` and show an Edited badge on the bubble (original send time stays). Do not weaken wrap types or lower `ENC_VERSION` without a migration plan. New group-channel members and new message recipients get a generic EmailJS notice (no ciphertext, no sender name). Opening a DM does not send the channel-added mail.
- **Admin UX:** Header admin toggle; messages dock becomes Role Access in admin view; observability at `/admin/observability/`.
- **Host:** Vercel (Next.js) + Neon (Postgres) + Upstash (Redis). See [docs/RUNBOOK.md](docs/RUNBOOK.md).
- **Firebase:** Retained **only** for GitHub OAuth in `/github-connect/` (Apps changelogs). All module data is in Postgres.

## Stack

- Next.js App Router (JavaScript)
- PostgreSQL + Redis locally via Docker; production on **Neon + Upstash**
- Google OAuth code flow
- Admin SSE observability
- Deploy: **Vercel**

## Local dev

```bash
cp .env.example .env.local   # fill GOOGLE_*, DATABASE_URL, REDIS_URL, SESSION_SECRET
docker compose up -d
npm install
npm run migrate
npm run dev
```

Open [http://localhost:3000/Internal-App/](http://localhost:3000/Internal-App/) or `./start.sh`.

## Data migration (Firestore → Postgres)

Export from Firestore (or use a JSON file keyed by collection name), then:

```bash
# From JSON export
npm run migrate:firestore -- --from-export=./firestore-export.json

# Live read (requires firebase-admin + service account)
npm run migrate:firestore -- --live

# Dry run
npm run migrate:firestore -- --from-export=./export.json --dry-run
```

Verify counts only:

```bash
npm run migrate:firestore -- --from-export=./export.json --verify-only
```

## Smoke tests

```bash
npm run test:phase2   # observability infra
npm run test:phase3   # data API
npm run test:phase4   # delta sync
npm run test:phase5   # activity tracking
npm run test:phase6   # admin observability APIs
npm run test:phase7   # Firestore migration script
npm run test:phase8   # session kill, rotation, retention
npm run test:secure-notices  # channel-add + new-message email intents
npm run test:load     # concurrent health / 401 burst
npm run jobs:retention  # log retention + hourly rollup
```

## Routes

| Route | Module |
|-------|--------|
| `/` | Dashboard |
| `/login/` | Google sign-in |
| `/profile/` | Profiles |
| `/skills/` | Skills |
| `/procedures/` | Procedures |
| `/apps/`, `/apps/detail/?id=` | Apps registry + detail |
| `/calendar/` | Calendar + meetings |
| `/goals/`, `/goals/all/` | Goals workspace |
| `/messages/` | Encrypted messages |
| `/channels/` | Communication channels (admin) |
| `/role-access/` | Admin role access (dock swap) |
| `/admin/observability/` | Admin live API + activity monitor |
| `/github-connect/` | GitHub OAuth popup (Firebase Auth) |

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for retention cron, session kill, and production env.
