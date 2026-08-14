# Internal Portal — Implementation Plan

**Document version:** 1.4  
**Date:** 2026-08-14  
**Status:** In progress — **Phases 0–8 complete** (local). Remaining: host, Firestore cutover, E2E OAuth.

This document describes how to migrate the HackstreetBoys Internal Portal from the current client-only architecture (static export, Firebase client SDK, GIS login, 60-minute `sessionStorage` sessions) to a server-backed architecture with Google OAuth, 7-day sessions, PostgreSQL, Redis, local-first delta sync, and an admin observability module.

---

## Implementation progress log

| Phase | Status | Completed | Notes |
|-------|--------|-----------|-------|
| **0 — Foundation** | ✅ Complete (local) | 2026-08-14 | Staging host still TBD |
| **1 — Auth & sessions** | ✅ Implemented | 2026-08-14 | Code complete; E2E OAuth needs `GOOGLE_*` env |
| **2 — Observability** | ✅ Complete (local) | 2026-08-14 | Logging, rate limits, admin SSE |
| **3 — Data layer** | ✅ Complete (local) | 2026-08-14 | Postgres API; portal modules off Firebase data |
| **4 — Cache & sync** | ✅ Complete (local) | 2026-08-14 | `localStorage` + `/api/sync` |
| **5 — Activity** | ✅ Complete (local) | 2026-08-14 | `POST /api/activity` + client tracker |
| **6 — Admin UI** | ✅ Complete (local) | 2026-08-14 | `/admin/observability/` live + history |
| **7 — Firebase migration** | ✅ Script ready | 2026-08-14 | Live Firestore cutover not run |
| **8 — Hardening** | ✅ Complete (local) | 2026-08-14 | Session kill, rotation, retention, load test |

### Phase 0 — delivered

- Removed `output: "export"` from `next.config.js` (server build confirmed)
- Added `docker-compose.yml` (Postgres 16 + Redis 7)
- Expanded `.env.example` with server, OAuth, Postgres, Redis, rate-limit, and observability vars
- Added dependencies: `pg`, `ioredis`, `node-pg-migrate`
- Migration tooling: `.pgmigrate.json`, `npm run migrate`, first migration `1734120000000_foundation.js` (`users`, `role_access`)
- Server libs: `lib/server/db.js`, `lib/server/redis.js`, `lib/server/constants.js`
- Health probe: `GET /Internal-App/api/health/` (Postgres + Redis ping)
- CI: `.github/workflows/next-build.yml` updated for server build (no `out/` artifact)

**Verified locally:** `docker compose up`, `npm run migrate`, `npm run build`, health check `ok: true`, lint pass.

**Not done:** Production/staging host provisioned (Neon + Upstash + Vercel); `deploy.yml` is retired (manual notice only).

### Phase 1 — delivered

**Server auth routes**

| Route | File | Status |
|-------|------|--------|
| `GET /api/auth/google` | `app/api/auth/google/route.js` | ✅ |
| `GET /api/auth/callback` | `app/api/auth/callback/route.js` | ✅ |
| `POST /api/auth/logout` | `app/api/auth/logout/route.js` | ✅ |
| `GET /api/auth/me` | `app/api/auth/me/route.js` | ✅ |

**Server libraries**

| File | Purpose |
|------|---------|
| `lib/server/session.js` | Redis session CRUD + sliding TTL |
| `lib/server/verifyGoogle.js` | Code exchange + id_token validation |
| `lib/server/signState.js` | HMAC OAuth state sign/verify |
| `lib/server/cookies.js` | HttpOnly `sid` cookie set/clear |
| `lib/server/users.js` | Postgres user upsert + role lookup |
| `lib/server/whitelist.js` | Server-side `role_access` check |
| `lib/server/appUrl.js` | basePath-aware URL helpers |

**Client changes**

| File | Change |
|------|--------|
| `lib/session.js` | `SessionProvider` → `GET /api/auth/me`; auth no longer in `sessionStorage` |
| `app/login/LoginClient.js` | Google button → redirect to `/api/auth/google` (GIS removed) |
| `app/login/page.js` | Suspense wrapper for `useSearchParams` |
| `lib/apiPath.js` | basePath prefix for client `fetch()` calls |
| `lib/syncProfile.js` | Post-login Firebase profile sync (transition helper until Phase 3) |
| `components/Header.js` | Logout → `POST /api/auth/logout` |
| `components/PortalShell.js` | Removed `SessionWarning` |
| `components/SessionWarning.js` | **Deleted** |
| `middleware.js` | Cookie gate; public login/auth/health routes |

**Verified locally:** Build + lint pass; `/api/auth/me` returns 401 without cookie; middleware redirects unauthenticated portal routes to `/login/`; health still OK.

**Requires manual setup to test E2E login:** Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `SESSION_SECRET` in `.env.local`. Register redirect URI in Google Cloud Console.

### Phase 2 — delivered

**Infrastructure**

| Item | File / detail | Status |
|------|---------------|--------|
| Rate limiter (Redis sliding window) | `lib/server/rateLimit.js` | ✅ |
| Request logger + async PG persist | `lib/server/requestLogger.js` | ✅ |
| Redis pub/sub + stream buffer | `lib/server/publishEvent.js` | ✅ |
| API route wrapper (auth + limits + logs) | `lib/server/withApi.js` | ✅ |
| SSE helper | `lib/server/sseStream.js` | ✅ |
| Request metadata helpers | `lib/server/requestMeta.js` | ✅ |
| Observability migration | `1734123600000_observability.js` | ✅ (`api_request_logs`, `activity_logs`) |

**Admin SSE routes**

| Route | File | Status |
|-------|------|--------|
| `GET /api/admin/stream/requests` | `app/api/admin/stream/requests/route.js` | ✅ |
| `GET /api/admin/stream/activity` | `app/api/admin/stream/activity/route.js` | ✅ |

**All existing `/api/*` routes** wrapped with `withApi()` — health, auth/google, auth/callback, auth/logout, auth/me.

**Middleware change:** `/api/*` auth + rate limits handled in route handlers (Edge middleware cannot use Redis); portal pages still cookie-gated.

**Verified locally (`npm run test:phase2`):**

- Health call persisted to `api_request_logs` and `stream:api:requests`
- Unauthenticated `/api/auth/me` → 401 (logged)
- Non-admin SSE → 403
- Admin SSE → 200 with replayed `data:` events

### Known gaps / transition notes

- **`role_access` in Postgres is empty** — server whitelist treats empty `allowed` list as “allow all”. Seed from Firebase before relying on server enforcement.
- **Production Firestore data** not migrated yet — run `npm run migrate:firestore`.
- **Production deploy** — GitHub Pages workflow retired; Node host still TBD. `next-build.yml` is the CI gate.
- **E2E Google OAuth** needs `GOOGLE_*` env + Console redirect URI.
- **Retention cron** — `npm run jobs:retention` exists; not scheduled in production.

### Phase 3 — delivered

**Schema**

| Item | Detail |
|------|--------|
| Migration | `1734127200000_collections.js` — `collection_items` table (JSONB per row) |
| `role_access` | Still uses dedicated `role_access` table (not `collection_items`) |

**Server**

| File | Purpose |
|------|---------|
| `lib/server/collectionsDb.js` | Read/write collections, seeds & interceptors (ported from Firebase) |
| `lib/server/authorize.js` | Server-side save authorization (mirrors `portalApi.save` rules) |
| `lib/server/collectionNames.js` | Collection name validation |
| `lib/normalize.js` | Shared email/name helpers (extracted from Firebase) |

**API routes**

| Route | Status |
|-------|--------|
| `GET/PUT/POST /api/data/:collection` | ✅ bulk read + replace (matches Firestore array model) |
| `GET/PATCH/DELETE /api/data/:collection/:id` | ✅ single-item CRUD + soft delete |

**Client**

| File | Change |
|------|--------|
| `lib/dataApi.js` | `fetchCollection` / `putCollection` via HTTP |
| `lib/portalApi.js` | Uses `dataApi` instead of Firebase; business logic unchanged |
| `lib/firebase.js` | **Only** used by `github-connect` (Firebase Auth for GitHub PAT flow) |

**Verified locally (`npm run test:phase3`):**

- PUT/GET `settings` round-trip → Postgres `collection_items`
- Goals seed/interceptor returns 5 default records on empty DB
- Unauthenticated GET → 401
- Phase 2 tests still pass

**Not done (Phase 7):** Firestore → Postgres data migration script; delete `lib/firebase.js` Firestore code after cutover.

---

## Table of contents

0. [Implementation progress log](#implementation-progress-log)
1. [Executive summary](#1-executive-summary)
2. [Current vs target state](#2-current-vs-target-state)
3. [Prerequisites & infrastructure](#3-prerequisites--infrastructure)
4. [Architecture reference](#4-architecture-reference)
5. [Implementation phases](#5-implementation-phases)
6. [Database schema](#6-database-schema)
7. [API specification](#7-api-specification)
8. [Client modules](#8-client-modules)
9. [Admin observability module](#9-admin-observability-module)
10. [Migration from Firebase](#10-migration-from-firebase)
11. [Deployment changes](#11-deployment-changes)
12. [Testing plan](#12-testing-plan)
13. [Risks & mitigations](#13-risks--mitigations)
14. [Task checklist](#14-task-checklist)
15. [Open decisions](#15-open-decisions)

---

## 1. Executive summary

### Goals

| Goal | Solution |
|------|----------|
| Secure authentication | Google OAuth account picker (authorization code flow), server-verified |
| Stay logged in 7 days | Redis session + HttpOnly cookie, sliding 7-day TTL |
| No Firebase | PostgreSQL as data store; all access via Next.js API routes |
| Fast module loads | `localStorage` cache per user + collection; delta sync API |
| Abuse protection | Distributed Redis rate limiting on all API routes |
| User activity audit | Semantic event tracking (module visits, changelog, navigation) |
| Real-time API visibility | `RequestLogger` + Redis pub/sub + admin SSE stream |

### Non-goals (preserve from current app)

- Existing CSS and visual design (reuse module styles as-is)
- Message encryption behavior (do not change crypto in `messages/crypto.js`)
- Admin toggle UX in header (not a separate admin URL tree for module access)
- Pending approval queues for new users

### Major constraint change

The current app uses `output: "export"` and deploys to **GitHub Pages**. The target architecture **requires a Node.js server** (API routes, OAuth callback, Redis, PostgreSQL). Deployment must move to a server-capable host (Vercel, Railway, Fly.io, VPS, etc.).

---

## 2. Current vs target state

| Area | Current (after Ph 0–3) | Target |
|------|------------------------|--------|
| Hosting | Next.js server locally; **GitHub Pages static on `main`** | Server-rendered Next.js with API routes |
| Auth | **Google OAuth code flow** (GIS removed) | Google OAuth code flow → `/api/auth/callback` ✅ |
| Session | **HttpOnly `sid` cookie, Redis, 7-day sliding TTL** | Same ✅ |
| Session handoff | Removed (`/?session=` no longer used) | Not used ✅ |
| Data | **PostgreSQL via `/api/data/*`** (portal modules) | PostgreSQL via `/api/*` ✅ |
| Cache | None (full fetch every load) | `localStorage` + `/api/sync` delta |
| Rate limiting | **Redis sliding window on `/api/*` via `withApi`** | Redis sliding window per IP/user/route ✅ |
| Activity logging | **`activity_logs` table; SSE channel ready** | PostgreSQL + live SSE |
| API observability | **Request log on every `/api/*` + admin SSE streams** | Same ✅ (UI in Phase 6) |

### Files heavily affected

| File / area | Action | Status |
|-------------|--------|--------|
| `next.config.js` | Remove `output: "export"` | ✅ |
| `app/login/page.js` | Replace GIS with redirect to `/api/auth/google` | ✅ |
| `lib/session.js` | Rewrite around `/api/auth/me` + cookie session | ✅ |
| `lib/portalApi.js` | Route through HTTP API + cache layer | ✅ HTTP (cache in Phase 4) |
| `lib/firebase.js` | Remove after data migration | ⬜ GitHub Auth only; Firestore unused by modules |
| `components/SessionWarning.js` | Remove or replace with optional idle notice | ✅ deleted |
| `.github/workflows/deploy.yml` | Update for server deployment | ⬜ |
| New | `middleware.js`, `lib/server/*`, `app/api/**`, `lib/cacheManager.js`, `lib/activityTracker.js` | **Partial** — auth, health, data, admin SSE done |

---

## 3. Prerequisites & infrastructure

### 3.1 Services

| Service | Purpose | Suggested options |
|---------|---------|-------------------|
| **PostgreSQL** | App data, users, activity logs, API logs | Supabase, Neon, RDS, self-hosted |
| **Redis** | Sessions, rate limits, pub/sub, SSE buffer | Upstash, ElastiCache, self-hosted |
| **Google Cloud Console** | OAuth 2.0 Web client | Existing or new project |
| **Hosting** | Next.js server | Vercel + Neon + Upstash, Railway, Fly.io |

### 3.2 Environment variables

```bash
# App
NODE_ENV=production
APP_URL=https://portal.example.com
SESSION_TTL_SEC=604800                    # 7 days

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://portal.example.com/api/auth/callback
GOOGLE_HD=                                # optional hosted domain, e.g. kcau.ac.ke

# Session
SESSION_COOKIE_NAME=sid
SESSION_SECRET=                           # for signing state param

# PostgreSQL
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Rate limits (defaults, override per env)
RATE_LIMIT_IP_PER_MIN=300
RATE_LIMIT_USER_PER_MIN=120
RATE_LIMIT_SYNC_PER_MIN=30
RATE_LIMIT_ACTIVITY_PER_MIN=60
RATE_LIMIT_WRITE_PER_MIN=20

# Observability
API_LOG_RETENTION_DAYS=30
ACTIVITY_LOG_RETENTION_DAYS=90
SSE_BUFFER_SIZE=500
```

### 3.3 Google OAuth setup

1. Create **OAuth 2.0 Client ID** (Web application).
2. Authorized redirect URIs:
   - Production: `https://<domain>/api/auth/callback`
   - Local: `http://localhost:3000/api/auth/callback`
3. Scopes: `openid`, `profile`, `email`
4. Optional: set `hd` query param to restrict to org domain.
5. Login URL pattern (account picker):

   ```
   https://accounts.google.com/o/oauth2/v2/auth
     ?client_id=...
     &redirect_uri=...
     &response_type=code
     &scope=openid+profile+email
     &prompt=select_account
     &access_type=offline
     &hd=<org-domain>
     &state=<signed-payload>
   ```

### 3.4 Local development stack

```bash
# docker-compose.yml (recommended)
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: portal
      POSTGRES_USER: portal
      POSTGRES_PASSWORD: portal
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

---

## 4. Architecture reference

```
Browser
  ├── SessionProvider      → GET /api/auth/me (cookie)
  ├── CacheManager         → localStorage + GET /api/sync/*
  ├── ActivityTracker      → POST /api/activity (batched)
  └── Portal UI modules    → GET/POST /api/data/*

Next.js
  ├── middleware.js        → cookie gate, IP rate limit (rate limit: Phase 2)
  ├── /api/auth/*          → Google OAuth, session CRUD
  ├── /api/sync/*          → delta sync
  ├── /api/data/*          → CRUD
  ├── /api/activity        → semantic events
  ├── /api/admin/*         → activity query, request query, SSE streams
  └── RequestLogger        → wraps every /api/* handler

Redis
  ├── session:{sid}        → 7-day sliding TTL
  ├── ratelimit:*          → sliding windows
  ├── channel:api:requests → pub/sub for admin SSE
  └── stream:api:requests  → reconnect buffer

PostgreSQL
  ├── users, role_access
  ├── collection tables (apps, goals, messages, …)
  ├── activity_logs
  └── api_request_logs
```

---

## 5. Implementation phases

Estimated total: **8–12 weeks** (one engineer, part-time on migration). Phases are sequential unless noted.

---

### Phase 0 — Foundation & hosting pivot (Week 1) ✅ *Complete (local)*

**Objective:** Enable server-side Next.js and local infra.

| Task | Owner | Done when | Status |
|------|-------|-----------|--------|
| Remove `output: "export"` from `next.config.js` | Dev | `next build` produces server output | ✅ |
| Add `docker-compose.yml` for Postgres + Redis | Dev | `docker compose up` works | ✅ |
| Add env template `.env.example` with all new vars | Dev | Documented | ✅ |
| Choose and provision production host | DevOps | Staging URL live | ⬜ TBD |
| Add `pg`, `ioredis` (or `@upstash/redis`) dependencies | Dev | `npm install` clean | ✅ |
| Set up DB migration tool (Drizzle or `node-pg-migrate`) | Dev | First migration runs | ✅ (`node-pg-migrate`) |

**Exit criteria:** Staging deploy runs Next.js server; Postgres and Redis reachable.

- [x] Local: `next build` produces server output (`/api/health` dynamic)
- [x] Local: Postgres and Redis reachable via Docker
- [ ] Staging deploy live

---

### Phase 1 — Auth & 7-day sessions (Weeks 2–3) ✅ *Implemented*

**Objective:** Replace GIS + sessionStorage with Google OAuth and Redis sessions.

#### 1.1 Server auth routes

| File | Description |
|------|-------------|
| `app/api/auth/google/route.js` | Build Google auth URL, set signed `state`, redirect |
| `app/api/auth/callback/route.js` | Exchange code, verify id_token, upsert user, create session |
| `app/api/auth/logout/route.js` | Delete Redis session, clear cookie |
| `app/api/auth/me/route.js` | Return current user from session |

#### 1.2 Session library

| File | Description |
|------|-------------|
| `lib/server/session.js` | `createSession`, `getSession`, `touchSession`, `destroySession` |
| `lib/server/verifyGoogle.js` | Token exchange + id_token validation |
| `lib/server/signState.js` | HMAC sign/verify OAuth state |

Session payload in Redis:

```javascript
{
  sid: "uuid",
  uid: "user-uuid",
  email: "user@org.com",
  name: "Alvin",
  avatar: "https://...",
  roles: ["user"],           // or ["user", "admin"]
  sessionId: "tab-session",  // client-generated, for activity correlation
  createdAt: "ISO",
  lastSeenAt: "ISO"
}
```

Session rules:

- TTL: **604800 seconds (7 days)**
- **Sliding:** `EXPIRE session:{sid} 604800` on every authenticated request
- Cookie: HttpOnly, Secure (prod), SameSite=Lax, `maxAge: 604800`

#### 1.3 Client session rewrite

| File | Change |
|------|--------|
| `lib/session.js` | `SessionProvider` fetches `/api/auth/me`; remove `persistSession` for auth | ✅ |
| `app/login/page.js` | Button → redirect to `/api/auth/google` | ✅ (`LoginClient.js`) |
| `components/SessionWarning.js` | **Delete** (no 60-min expiry) | ✅ deleted |
| `middleware.js` | Protect portal routes; allow `/login`, `/api/auth/google`, `/api/auth/callback` | ✅ (JS, not TS) |

#### 1.4 Whitelist check (server)

On callback and optionally on `/api/auth/me`:

- Query `role_access` table for allowed emails
- If not allowed: save pending profile, show not-allowed flow, do **not** create session

**Exit criteria:**

- [x] Login redirects to Google account picker (via `/api/auth/google`)
- [x] Successful login sets cookie; user stays logged in across refresh *(code complete; needs Google OAuth env for manual E2E)*
- [x] Session persists 7 days with activity (sliding TTL on `/api/auth/me`)
- [x] Logout clears cookie and Redis key
- [x] Unauthenticated access to `/apps/` redirects to `/login/` (middleware)
- [x] No `sessionUser` in sessionStorage for auth

---

### Phase 2 — Request logging, rate limiting & admin SSE (Weeks 3–4) ✅ *Complete (local)*

**Objective:** Instrument all API traffic; admin can watch endpoints in real time.

#### 2.1 Rate limiter

| File | Description |
|------|-------------|
| `lib/server/rateLimit.js` | Sliding window via Redis |

Scopes:

| Key | Default limit |
|-----|---------------|
| `ratelimit:ip:{ip}` | 300/min |
| `ratelimit:user:{uid}` | 120/min |
| `ratelimit:sync:{uid}:{collection}` | 30/min |
| `ratelimit:activity:{uid}` | 60/min |
| `ratelimit:write:{uid}:{collection}` | 20/min |

Return `429` with `Retry-After` header.

#### 2.2 Request logger

| File | Description |
|------|-------------|
| `lib/server/requestLogger.js` | Wrap handlers; emit on response finish |
| `lib/server/publishEvent.js` | Redis PUBLISH + XADD to stream |

Logged fields: `requestId`, `method`, `path`, `query`, `status`, `durationMs`, `uid`, `email`, `sessionId`, `ip`, `userAgent`, `rateLimited`, `error`, `timestamp`.

Log **all** `/api/*` including 401 and 429 from middleware.

#### 2.3 Admin SSE streams

| File | Description |
|------|-------------|
| `app/api/admin/stream/requests/route.js` | SSE subscribe to `channel:api:requests` |
| `app/api/admin/stream/activity/route.js` | SSE for semantic activity events |

On connect: replay last N events from Redis Stream.

**Exit criteria:**

- [x] Every API call appears in Redis pub/sub + stream (verified via `test:phase2`)
- [x] Admin SSE endpoint streams events to browser (replay on connect)
- [x] Rate-limited requests return 429 with `Retry-After` (via `withApi` + `checkRateLimit`)
- [x] Non-admin users get 403 on admin stream routes

---

### Phase 3 — PostgreSQL schema & data API (Weeks 4–6) ✅ *Complete (local)*

**Objective:** Replace direct Firestore access with API + Postgres.

#### 3.1 Schema & migrations

See [Section 6](#6-database-schema).

#### 3.2 Generic data routes

| Route | Description |
|-------|-------------|
| `GET /api/data/:collection` | Full collection fetch (cold start) |
| `GET /api/data/:collection/:id` | Single record |
| `POST /api/data/:collection` | Create / upsert |
| `PATCH /api/data/:collection/:id` | Partial update |
| `DELETE /api/data/:collection/:id` | Soft delete (`deleted_at`) |

Authorization in handler:

- Read: user must be in whitelist
- Write: owner or admin (mirror current `portalApi.js` rules)
- Admin view: `roles` includes `admin`

#### 3.3 Refactor portalApi

| File | Change |
|------|--------|
| `lib/portalApi.js` | Replace Firestore calls with `fetch('/api/data/...')` |
| `lib/server/authorize.js` | Port ownership checks from current portalApi |

Migrate one collection at a time: `profile` → `settings` → `role_access` → `apps` → … → `messages` last (encryption sensitive).

**Exit criteria:**

- [x] All modules load data via API (`portalApi` → `/api/data/*`)
- [x] Writes enforce same ownership rules (`lib/server/authorize.js`)
- [x] `lib/firebase.js` no longer imported by portal modules (GitHub connect only)
- [x] Messages encryption unchanged; only transport layer changed

---

### Phase 4 — localStorage cache & delta sync (Weeks 6–7) ⬜ *Next*

**Objective:** Instant render from cache; background patch from server.

#### 4.1 Sync API

| Route | Description |
|-------|-------------|
| `GET /api/sync/:collection?since=<ISO>` | Returns `{ cursor, upserts, deletes }` |
| `GET /api/sync/:collection/manifest` | Returns `{ [id]: hash }` for diff |

All collection rows must have `updated_at` and optional `deleted_at`.

#### 4.2 CacheManager

| File | Description |
|------|-------------|
| `lib/cacheManager.js` | read, merge, clear, getCursor, setCursor |

Storage key: `portal:v1:{uid}:{collection}`

Flow:

1. Module mounts → read localStorage → render immediately
2. Background `GET /api/sync/:collection?since=cursor`
3. Merge upserts/deletes → update localStorage → re-render if changed
4. On 429/offline → keep serving stale cache

#### 4.3 portalApi integration

```javascript
export async function get(collection, options) {
  const cached = cacheManager.read(collection);
  if (cached) notifySubscribers(cached.items);   // optional callback
  const delta = await apiSync(collection, cached?.cursor);
  return cacheManager.merge(collection, delta);
}
```

Clear cache on logout and account switch.

**Exit criteria:**

- [ ] Second visit to module renders without waiting for full fetch
- [ ] Edits on another client appear after sync
- [ ] Deletes propagate via `deletes` array
- [ ] Corrupt cache triggers full refetch fallback

---

### Phase 5 — Activity tracking (Week 7–8)

**Objective:** Semantic user events for admin audit.

#### 5.1 ActivityTracker client

| File | Description |
|------|-------------|
| `lib/activityTracker.js` | Queue, batch, flush, pathname hooks |

Event types:

| Type | Trigger |
|------|---------|
| `auth.login` | After `/api/auth/me` succeeds post-login |
| `auth.logout` | Logout button |
| `module.visit` | `usePathname()` change |
| `module.leave` | Pathname change (previous module) |
| `apps.view_detail` | App detail open |
| `apps.back_to_all` | Back navigation |
| `investor_pulse.visit` | Route or explicit call |
| `changelog.view` | Changelog panel open |
| `changelog.add` | Changelog create |
| `nav.home` | Logo / dashboard navigation |
| `admin.toggle_view` | Admin toggle in header |

#### 5.2 Ingest API

| Route | Description |
|-------|-------------|
| `POST /api/activity` | Accept batch `{ events: [...] }`; attach uid/email from session |

Also publish to Redis for live admin activity SSE.

**Exit criteria:**

- [ ] Module navigation produces `module.visit` events
- [ ] Events visible in admin activity feed
- [ ] Events correlated with API logs via `sessionId`

---

### Phase 6 — Admin observability UI (Weeks 8–9)

**Objective:** Admin module for activity + live API monitor.

#### 6.1 Routes

| Route | Description |
|-------|-------------|
| `/admin/observability/` | Main admin dashboard (admin role required) |

Can reuse header admin toggle to gate access; no separate URL tree for regular modules.

#### 6.2 UI panels

| Panel | Source |
|-------|--------|
| **Live API feed** | SSE `/api/admin/stream/requests` |
| **Live activity feed** | SSE `/api/admin/stream/activity` |
| **Historical query** | `GET /api/admin/requests`, `GET /api/admin/activity` |
| **Combined session trace** | Join by `sessionId` client-side |
| **Stats** | `GET /api/admin/stats` — RPS, error rate, top paths |

Live API table columns: Time, User, Method, Endpoint, Status, Duration, Rate limited.

Filters: method, path prefix, status, user, errors only, rate-limited only.

**Exit criteria:**

- [ ] Admin sees API calls in real time (< 1s latency)
- [ ] Can filter and pause live feed
- [ ] Can click row → see query params + linked activity events
- [ ] Non-admin cannot access page or APIs

---

### Phase 7 — Firebase migration & cleanup (Weeks 9–10)

See [Section 10](#10-migration-from-firebase).

**Exit criteria:**

- [ ] Production data in PostgreSQL
- [ ] Firebase config removed from env
- [ ] `lib/firebase.js` deleted
- [ ] README guardrails updated

---

### Phase 8 — Production hardening (Weeks 10–12)

| Task | Description |
|------|-------------|
| Session rotation | New `sid` on login; optional daily rotation |
| Admin session kill | `DELETE /api/admin/sessions/:sid` |
| API log retention job | Cron deletes rows older than N days |
| Activity rollup job | Minute/hour aggregates for dashboards |
| Error monitoring | Sentry or similar on API routes |
| Load test | Verify rate limits under concurrent users |
| Security review | Cookie flags, CSRF on state, SQL injection, XSS |

**Exit criteria:**

- [ ] Staging load test passes
- [ ] Retention jobs running
- [ ] Runbook documented

---

## 6. Database schema

### 6.1 Core tables

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  avatar        TEXT,
  approved      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE role_access (
  id            TEXT PRIMARY KEY,          -- 'allowed' | 'admins'
  emails        JSONB NOT NULL DEFAULT '[]',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 Collection pattern

Use JSONB documents for flexibility during migration (mirrors current Firestore doc arrays):

```sql
CREATE TABLE collection_apps (
  id            TEXT PRIMARY KEY,
  data          JSONB NOT NULL,
  author_email  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_collection_apps_updated ON collection_apps (updated_at);
```

Repeat for: `skills`, `procedures`, `goals`, `calendar`, `meetings`, `messages`, `profile`, `settings`, and `pending_*` variants.

Alternatively: single `collections` table with `(name, id)` composite key — choose one approach in Phase 3 and stick to it.

### 6.3 Observability tables

```sql
CREATE TABLE activity_logs (
  id            BIGSERIAL PRIMARY KEY,
  uid           UUID REFERENCES users(id),
  email         TEXT NOT NULL,
  session_id    TEXT,
  event_type    TEXT NOT NULL,
  path          TEXT,
  meta          JSONB DEFAULT '{}',
  ip            INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_created ON activity_logs (created_at DESC);
CREATE INDEX idx_activity_uid ON activity_logs (uid, created_at DESC);
CREATE INDEX idx_activity_session ON activity_logs (session_id, created_at);

CREATE TABLE api_request_logs (
  id            BIGSERIAL PRIMARY KEY,
  request_id    UUID NOT NULL,
  method        TEXT NOT NULL,
  path          TEXT NOT NULL,
  query         JSONB,
  status        SMALLINT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  uid           UUID,
  email         TEXT,
  session_id    TEXT,
  ip            INET,
  user_agent    TEXT,
  rate_limited  BOOLEAN NOT NULL DEFAULT false,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_logs_created ON api_request_logs (created_at DESC);
CREATE INDEX idx_api_logs_path ON api_request_logs (path, created_at DESC);
CREATE INDEX idx_api_logs_uid ON api_request_logs (uid, created_at DESC);
```

---

## 7. API specification

### 7.1 Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/google` | Public | Redirect to Google account picker |
| GET | `/api/auth/callback` | Public | OAuth callback; set session cookie |
| POST | `/api/auth/logout` | Session | Destroy session |
| GET | `/api/auth/me` | Session | Current user + roles; touches TTL |

### 7.2 Data & sync

| Method | Path | Auth | Rate limit |
|--------|------|------|------------|
| GET | `/api/sync/:collection` | Session | sync |
| GET | `/api/sync/:collection/manifest` | Session | sync |
| GET | `/api/data/:collection` | Session | user |
| GET | `/api/data/:collection/:id` | Session | user |
| POST | `/api/data/:collection` | Session | write |
| PATCH | `/api/data/:collection/:id` | Session | write |
| DELETE | `/api/data/:collection/:id` | Session | write |

### 7.3 Activity & admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/activity` | Session | Batch semantic events |
| GET | `/api/admin/activity` | Admin | Historical activity query |
| GET | `/api/admin/requests` | Admin | Historical API log query |
| GET | `/api/admin/stats` | Admin | Aggregated metrics |
| GET | `/api/admin/stream/requests` | Admin | SSE live API feed |
| GET | `/api/admin/stream/activity` | Admin | SSE live activity feed |
| DELETE | `/api/admin/sessions/:sid` | Admin | Force logout user |

### 7.4 Sync response shape

```json
{
  "cursor": "2026-08-14T09:15:00.000Z",
  "upserts": [
    { "id": "1720000001", "data": { }, "updated_at": "2026-08-14T09:14:30.000Z" }
  ],
  "deletes": ["1720000002"]
}
```

---

## 8. Client modules

### New files

```
lib/
  apiPath.js              # basePath prefix for client fetch ✅
  dataApi.js              # HTTP collection read/write ✅
  normalize.js            # email/name helpers ✅
  syncProfile.js          # post-login Firebase profile sync (transition) ✅
  cacheManager.js         # localStorage read/merge/clear
  activityTracker.js      # event queue + pathname hooks
  apiClient.js            # fetch wrapper (credentials, 401 handling)
  server/                 # server-only (never imported by client components)
    session.js            ✅
    rateLimit.js            ✅
    requestLogger.js        ✅
    publishEvent.js         ✅
    withApi.js              ✅
    sseStream.js            ✅
    requestMeta.js          ✅
    verifyGoogle.js       ✅
    signState.js          ✅
    cookies.js            ✅
    users.js              ✅
    whitelist.js          ✅
    appUrl.js             ✅
    db.js                 ✅
    redis.js              ✅
    constants.js          ✅
    authorize.js            ✅
    collectionsDb.js        ✅
    collectionNames.js      ✅

middleware.js

app/api/
  auth/google/route.js       ✅
  auth/callback/route.js     ✅
  auth/logout/route.js       ✅
  auth/me/route.js           ✅
  health/route.js            ✅ (Phase 0)
  admin/stream/requests/route.js  ✅ (Phase 2)
  admin/stream/activity/route.js ✅ (Phase 2)
  data/[collection]/route.js     ✅ (Phase 3)
  data/[collection]/[id]/route.js ✅ (Phase 3)
  sync/[collection]/route.js
  data/[collection]/route.js
  data/[collection]/[id]/route.js
  activity/route.js
  admin/stream/requests/route.js
  admin/stream/activity/route.js
  admin/activity/route.js
  admin/requests/route.js
  admin/stats/route.js

app/(portal)/admin/observability/
  page.js
  ObservabilityClient.js
  observability.css
```

### Modified files

```
lib/session.js            # cookie session via /api/auth/me ✅
lib/portalApi.js            # HTTP via dataApi ✅
app/login/LoginClient.js    # redirect to /api/auth/google ✅
components/PortalShell.js   # init ActivityTracker (Phase 5)
components/Header.js        # logout → POST /api/auth/logout ✅
next.config.js              # remove static export ✅
```

### Removed files (after migration)

```
lib/firebase.js
components/SessionWarning.js   ✅ removed Phase 1
app/kernel-test/            # optional
```

---

## 9. Admin observability module

### Access control

- Requires `roles` includes `admin` in session
- Middleware enforces on `/admin/*` and `/api/admin/*`
- Same admin toggle in header; observability is a module accessible when admin view is on

### Live API monitor UX

1. Connect SSE on page load
2. Append rows to virtualized table (cap in-memory at ~1000 rows)
3. Color code: 2xx green, 4xx yellow, 5xx red, 429 orange
4. Pause button stops UI append (SSE stays connected or disconnects — configurable)
5. Click row → drawer with full query, requestId, linked activity

### Combined trace

Query both logs by `sessionId`:

```
GET /api/admin/activity?sessionId=...
GET /api/admin/requests?sessionId=...
```

Merge sort by timestamp client-side.

---

## 10. Migration from Firebase

### 10.1 Data export script

One-time script `scripts/migrate-firestore-to-pg.js`:

1. Read each Firestore collection doc (current `modules` structure)
2. Map array items to PostgreSQL rows with `updated_at = now()`
3. Preserve all field names in JSONB `data` column
4. Verify record counts match

### 10.2 Cutover strategy

| Step | Action |
|------|--------|
| 1 | Deploy new stack to staging with migrated data |
| 2 | Parallel run: verify reads match Firebase for each module |
| 3 | Maintenance window: disable writes on old app |
| 4 | Final Firestore → PG sync |
| 5 | DNS cutover to new host |
| 6 | Monitor admin SSE for errors |

### 10.3 Rollback plan

Keep Firebase read-only for 14 days post-cutover. If critical failure, revert DNS to GitHub Pages static app.

---

## 11. Deployment changes

### Remove

- `output: "export"` in `next.config.js`
- GitHub Pages static deploy of `out/` (or keep for marketing only)

### Add

- Server deployment workflow (build → deploy Node server)
- Managed Postgres + Redis
- Secrets in host env (not `NEXT_PUBLIC_*` for server secrets)

### `basePath`

Current app uses `basePath: "/Internal-App"`. Decide:

- **Option A:** Drop basePath on new host (clean URLs at `portal.example.com`)
- **Option B:** Keep basePath if subpath hosting required

Document decision in [Open decisions](#15-open-decisions).

### CI/CD outline

```yaml
# .github/workflows/deploy-server.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: npm run migrate          # DB migrations
      - run: # deploy to host
```

---

## 12. Testing plan

### Unit tests

| Area | Cases |
|------|-------|
| `signState` | Valid/invalid/tampered state |
| `rateLimit` | Under limit, at limit, window reset |
| `cacheManager` | merge upserts, apply deletes, corrupt fallback |
| `authorize` | owner write, admin write, denied write |

### Integration tests

| Flow | Assert |
|------|--------|
| OAuth callback | Sets cookie, creates Redis session |
| Session sliding | TTL resets after `/api/auth/me` |
| 7-day expiry | Session gone after TTL (use short TTL in test env) |
| Sync delta | Only changed rows returned |
| Activity batch | Events persisted with server uid |
| Admin SSE | Events received within 1s |
| Rate limit | 429 after threshold |

### Manual QA checklist

- [ ] Login with allowed email → dashboard
- [ ] Login with disallowed email → pending modal, no session
- [ ] Stay logged in after browser restart (within 7 days)
- [ ] Logout clears cookie and cache
- [ ] Module loads from cache then updates on delta
- [ ] Admin sees live API calls while browsing portal
- [ ] Messages encrypt/decrypt unchanged
- [ ] GitHub connect still works (may need separate OAuth review)

---

## 13. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hosting pivot breaks GitHub Pages users | Downtime | Staging first; DNS cutover with rollback |
| Firestore migration data loss | High | Count verification; JSONB preserves fields; rollback window |
| Messages crypto regression | High | Migrate messages last; dedicated QA |
| Redis unavailable | Sessions fail | Redis HA; fallback error page; health checks |
| SSE scalability | Admin feed lag | Redis pub/sub; limit admin connections; buffer replay |
| Stale localStorage cache | Wrong UI | Manifest diff; max cache age; force refresh button |
| OAuth misconfiguration | Login broken | Test `hd`, redirect URI on staging |
| 7-day stolen cookie | Account access | HttpOnly; admin session kill; optional IP binding |

---

## 14. Task checklist

Use this as a sprint board. Check items off per phase.

### Phase 0 — Foundation
- [x] Remove static export config
- [x] Docker Compose for local Postgres + Redis
- [x] Migration tooling setup (`node-pg-migrate`, foundation migration)
- [x] `.env.example` expanded
- [x] `GET /api/health` infrastructure probe
- [x] CI workflow updated for server build (`next-build.yml`)
- [ ] Staging host provisioned

### Phase 1 — Auth
- [x] `GET /api/auth/google`
- [x] `GET /api/auth/callback`
- [x] `POST /api/auth/logout`
- [x] `GET /api/auth/me`
- [x] Redis session store (7-day sliding)
- [x] `middleware.js` route protection
- [x] Rewrite `lib/session.js`
- [x] Rewrite login flow (`LoginClient.js` + OAuth redirect)
- [x] Remove `SessionWarning.js`
- [x] Server-side whitelist check (`lib/server/whitelist.js`)
- [x] Supporting server libs (`signState`, `verifyGoogle`, `cookies`, `users`, `appUrl`)
- [x] Client `lib/apiPath.js` for basePath-aware fetch
- [ ] E2E OAuth login verified with production Google credentials
- [ ] Seed `role_access` emails from Firebase into Postgres

### Phase 2 — Observability infra
- [x] `lib/server/rateLimit.js`
- [x] `lib/server/requestLogger.js`
- [x] `lib/server/publishEvent.js`
- [x] `lib/server/withApi.js` (wraps all API routes)
- [x] `lib/server/sseStream.js`
- [x] Redis pub/sub + stream buffer (`channel:api:requests`, `stream:api:requests`)
- [x] `GET /api/admin/stream/requests`
- [x] `GET /api/admin/stream/activity`
- [x] Persist `api_request_logs` async
- [x] Migration `1734123600000_observability.js`
- [x] Smoke test `npm run test:phase2`

### Phase 3 — Data layer
- [x] PostgreSQL `collection_items` migration
- [x] `GET/PUT /api/data/:collection` (bulk array model)
- [x] `GET/PATCH/DELETE /api/data/:collection/:id`
- [x] `lib/server/authorize.js` ownership checks
- [x] `lib/server/collectionsDb.js` + read interceptors/seeds
- [x] Refactor `lib/portalApi.js` → `lib/dataApi.js`
- [x] Smoke test `npm run test:phase3`
- [x] Firestore export script (Phase 7)
- [ ] Production data migration (Phase 7)

### Phase 4 — Cache & sync
- [x] `lib/cacheManager.js`
- [x] `GET /api/sync/:collection`
- [x] `GET /api/sync/:collection/manifest`
- [x] Integrate cache into `portalApi.get`
- [x] Cache clear on logout

### Phase 5 — Activity
- [x] `lib/activityTracker.js`
- [x] `POST /api/activity`
- [x] Pathname + action hooks in modules
- [x] Activity SSE publish

### Phase 6 — Admin UI
- [x] `/admin/observability/` page
- [x] Live API table (SSE)
- [x] Live activity feed (SSE)
- [x] Historical filters + pagination
- [x] Combined session trace view
- [x] Stats panel

### Phase 7 — Migration
- [x] Firestore → PG migration script (`npm run migrate:firestore`)
- [ ] Run Firestore → PG migration on staging
- [ ] Validate all modules
- [ ] Production cutover
- [x] Firestore client removed from portal modules (GitHub Auth only)

### Phase 8 — Hardening
- [x] Log retention cron script (`npm run jobs:retention`)
- [x] Admin session kill
- [x] Load test (`npm run test:load`)
- [x] Update README
- [ ] Schedule retention in production
- [ ] Staging host provisioned

---

## 15. Open decisions

Record answers here before Phase 1 starts. Updated 2026-08-14 as implementation proceeds.

| # | Decision | Options | Chosen |
|---|----------|---------|--------|
| 1 | Production host | Vercel, Railway, Fly.io, VPS | **Vercel + Neon + Upstash** |
| 2 | Keep `basePath: /Internal-App` | Yes / No | **Yes** (kept for now; `NEXT_PUBLIC_BASE_PATH` + `lib/apiPath.js`) |
| 3 | Google `hd` domain restriction | e.g. `@kcau.ac.ke` / none | _TBD_ (optional via `GOOGLE_HD` env) |
| 4 | Collection storage | Per-table vs single `collections` table | **single `collection_items`** (JSONB) + dedicated `role_access` |
| 5 | ORM / query layer | Drizzle, raw `pg`, Prisma | **raw `pg` + `node-pg-migrate`** |
| 6 | Admin observability URL | `/admin/observability` vs toggle-only panel | **`/admin/observability/`** (header icon in admin mode) |
| 7 | Session mode | Sliding 7d (recommended) vs absolute 7d cap | **Sliding** |
| 8 | GitHub connect | Keep Firebase Auth for GitHub only vs pure GitHub OAuth | _TBD_ |
| 9 | Middleware language | `middleware.ts` vs `middleware.js` | **`middleware.js`** (matches JS codebase) |

---

## Appendix A — Session constants

```javascript
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 604800
export const SESSION_COOKIE_NAME = "sid";
export const CACHE_KEY_PREFIX = "portal:v1";
```

## Appendix B — README guardrail updates (post-migration)

Replace current guardrails with:

- **Auth:** Google OAuth account picker; server session cookie; 7-day sliding TTL
- **Session UI keys:** `activeModule`, `isAdminView`, `messages.vault.*` in sessionStorage only
- **Data:** PostgreSQL via `/api/*`; no client Firestore
- **Host:** Server Next.js deploy (not static export)
- **API:** `lib/portalApi.js` → HTTP + `lib/cacheManager.js`

---

*End of implementation plan.*
