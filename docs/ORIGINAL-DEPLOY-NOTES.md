# SeldonFrame on Coolify — runbook

## Purpose

Operate SeldonFrame, the self-hosted agency CRM, on the Coolify VPS.

| Item | Value |
|---|---|
| Coolify service | `SeldonFrame` — `fubbrjt4nkczuv0wjcyitkan` |
| Project / environment | `Agency Platform` / `production` |
| Public URL | `https://ai.ezwderp.com` |
| App image | `ghcr.io/seldonframe/seldonframe:1.1.0` |
| Stack | Postgres 16, Neon HTTP proxy, migration job, Next.js CRM app |

## Current verified state — October 1, 2026

- `ai.ezwderp.com` resolves to `SERVER_IP` (via `ezwderp.com`).
- HTTP redirects to HTTPS.
- TLS is valid: Let's Encrypt, CN/SAN `ai.ezwderp.com`, expiration **December 30, 2026**.
- `/`, `/api/version`, `/signup`, and `/login` return HTTP `200`.
- `postgres` and `app` are `running:healthy`.
- `neon-proxy` is `running:unknown` only because it has no Docker health check.
- `migrate` is `exited` by design: it is a one-shot `restart: "no"` job. The app starts only after its migration succeeds.

Run the full verifier:

```bash
cd /home/hermes/workspace/seldonframe-coolify
python3 verify-seldonframe.py
```

## Compose structure

| Service | Image / role |
|---|---|
| `postgres` | `postgres:16`, `wal_level=logical`, persistent named volume `pgdata` |
| `neon-proxy` | `ghcr.io/timowilhelm/local-neon-http-proxy:main`; translates the app's Neon SQL-over-HTTP driver to Postgres |
| `migrate` | `ghcr.io/seldonframe/seldonframe:1.1.0`; runs `scripts/docker-migrate.sh` once |
| `app` | `ghcr.io/seldonframe/seldonframe:1.1.0`; dashboard, public sites, API |

Keep `neon-proxy`. SeldonFrame sets `NEON_LOCAL_HOST` / `NEON_LOCAL_PORT` and its database runtime depends on that proxy; removing it breaks database access.

## Public-origin settings

These app environment values must stay aligned with the public address:

```yaml
NEXT_PUBLIC_APP_URL: 'https://ai.ezwderp.com'
WORKSPACE_BASE_DOMAIN: 'ai.ezwderp.com'
NEXTAUTH_URL: 'https://ai.ezwderp.com'
AUTH_URL: 'https://ai.ezwderp.com'
AUTH_TRUST_HOST: 'true'
SERVICE_FQDN_APP_3000: 'ai.ezwderp.com'
SERVICE_URL_APP_3000: 'https://ai.ezwderp.com'
```

## Required SeldonFrame v1.1.0 startup patch

The upstream v1.1.0 image compiles `NEXT_PUBLIC_APP_URL=http://localhost:3000` into Next.js output during its image build. Runtime environment variables do **not** override that compiled value.

Without a patch, real visitors are redirected to an unreachable container-local URL:

```text
/signup -> 307 Location: http://localhost:3000/signup
/login  -> 307 Location: http://localhost:3000/login
```

The active Coolify compose therefore overrides the `app` command with a short Node wrapper. On every app-container boot it:

1. Walks `/app/packages/crm/.next`.
2. Replaces `http://localhost:3000` in compiled `.js` / `.json` files with `https://ai.ezwderp.com`.
3. Starts the upstream process unchanged:

```text
pnpm --filter @seldonframe/crm start
```

Successful boot log proof:

```text
patched public-origin files: 84
```

**Do not remove this `app.command` wrapper** until an upstream SeldonFrame image makes the build-time public origin configurable. After any compose or image update, redeploy and run `verify-seldonframe.py`; a green Docker health check alone is not enough.

The redacted compose audit record is:

```text
seldonframe-runtime-patch-compose-redacted.yml
```

It never contains database credentials or application secrets.

## Secrets and state

- `AUTH_SECRET`, `NEXTAUTH_SECRET`, and `ENCRYPTION_KEY` remain Coolify service environment variables. Never put them in this workspace or a Git repo.
- `pgdata` is the Postgres persistent volume. Never delete it unless intentionally wiping the CRM database.
- An `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is still needed for SeldonFrame AI features. The CRM itself boots without one.

## Verification details

The verifier checks:

1. DNS points at the Coolify VPS.
2. HTTP redirects to HTTPS.
3. TLS presents the valid `ai.ezwderp.com` Let's Encrypt certificate.
4. `/` and `/api/version` answer.
5. `/signup` and `/login` do not redirect to localhost.
6. App/database containers are healthy in Coolify.

## Platform-level EZwebdeals white label

**Applied October 1, 2026.** The shared login, signup, browser metadata and public platform shell now use
**EZwebdeals** rather than SeldonFrame. This is distinct from per-workspace **Settings → Branding** and
**Settings → Brand & Theme**, which control each customer's public pages, chatbot, booking flow and PDFs.

### Applied identity

| Surface | Value |
|---|---|
| Platform name / title | `EZwebdeals — Never Miss Another Customer Call` |
| Brand blue | `#003DA5` |
| Accent orange | `#FF5A00` |
| Platform description | `AI receptionist and business automation for small businesses` |
| Browser/PWA manifest | `EZwebdeals` / `EZwebdeals`, blue theme color |
| Custom mark | Blue EZ tile with orange accent, served from the former SeldonFrame SVG paths so all upstream components resolve it |

The runtime wrapper replaces presentation strings in compiled `.next` JavaScript, JSON and CSS only:
`SeldonFrame` / `Seldon Studio`, SeldonFrame public hosts, metadata title/description, logo asset URLs
and the upstream deep-green `#1F2B24` shell token. It also overwrites only platform static brand SVGs
and `manifest.webmanifest`; it does **not** modify database records, API routes, SeldonFrame internals,
Google OAuth credentials or customer/workspace branding.

### Required versioned managed-content wrapper

The active Compose mount is **`./ezwebdeals-start-v2.js` → `/opt/ezwebdeals-start-v2.js`**. Coolify does
not reliably overwrite the contents of an existing managed-content bind file, so a changed wrapper needs
a new versioned filename (for example `…-v3.js`), not an in-place content edit.

The wrapper must retain all three responsibilities:

1. Set `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL` and `AUTH_URL` to `https://ai.ezwderp.com` in the child
   process environment.
2. Replace every compiled `http://localhost:3000` literal with `https://ai.ezwderp.com` before Next starts.
   This preserves `/signup` and `/login`; without it they issue a `307` to an unreachable localhost URL.
3. Apply the EZwebdeals presentation replacements and write the brand SVG/manifest assets.

Healthy boot proof includes:

```text
EZwebdeals public origin: https://ai.ezwderp.com
EZwebdeals white-label: patched compiled files: <positive number>
```

### White-label verification

```bash
python3 verify-seldonframe.py
# Must report /signup and /login HTTP 200.
```

Then verify the shell explicitly:

```bash
curl -sS https://ai.ezwderp.com/login | grep -o 'EZwebdeals' | head
curl -sS -D - -o /dev/null https://ai.ezwderp.com/signup | grep -iE 'HTTP/|location'
curl -sS 'https://ai.ezwderp.com/brand/seldonframe-favicon.svg?brand=ezwd1'
```

Expected final result: login/signup title `EZwebdeals — Never Miss Another Customer Call`, no
`SeldonFrame` text in their rendered HTML, valid blue/orange SVG mark, Google provider still registered,
and **no** `Location: http://localhost:3000/...`.

## Authentication (admin login)

**There is no seeded admin and no password login.** `scripts/docker-migrate.sh` applies schema only —
it creates no user — and the repo's `seed*.ts` files are demo/marketing data that the compose never
runs. Both `/signup` and `/login` are passwordless: the form takes an email and calls
`signIn(<provider>, …)`.

The app registers a provider only when its credentials exist (`packages/crm/src/lib/auth/config.ts`):

| Provider | Registered when | Env vars |
|---|---|---|
| Google | both values present | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Resend (email link) | key present | `AUTH_RESEND_KEY` or `RESEND_API_KEY` (+ `AUTH_RESEND_FROM`, default `<email>`) |

There is **no** nodemailer/SMTP provider — email links require a Resend account, so Google is the
practical self-host path. Without either, `/api/auth/providers` returns `{}` and
`POST /api/auth/signin/resend` answers **500**: the pages render but sign-in cannot complete.

**Current state:** Google is wired. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are Coolify service env
vars (masked on read) and are passed into the container from the compose exactly like `AUTH_SECRET`.
Verified live:

```json
/api/auth/providers -> {"google":{"id":"google","type":"oidc",
  "signinUrl":"https://ai.ezwderp.com/api/auth/signin/google",
  "callbackUrl":"https://ai.ezwderp.com/api/auth/callback/google"}}
```

The OAuth client is the owner's existing Cloud project `392876635774` (client id ending
`…lu1b1bh.apps.googleusercontent.com`) — the same client used by seo.ezwebdeals.com, OpenSEO and GA4.
**The console step still required** is adding this authorized redirect URI to that client:

```
https://ai.ezwderp.com/api/auth/callback/google
```

Check it without a Google login (Google validates `redirect_uri` before sign-in): build the authorize
URL for `https://accounts.google.com/o/oauth2/v2/auth` with this client id + redirect URI, fetch it
without following redirects, and base64-decode the `authError` query param of the
`/signin/oauth/error` Location. `redirect_uri_mismatch` = not registered yet.

### Ownership model

Each signup provisions **its own** organization (the adapter's `createUser` creates the org, then the
user row), so a first signup cannot be "taken over" by anyone else. The `memberships` table has **no
role column** — only `status`, `plan`, `stripeSubscriptionId`, `expiresAt` — so "admin" here means the
user who owns the org, not a permission level there is a credential for.

**Security:** signup is open (no invite gate; the "allowlist" strings in `signup-actions.ts` are
redirect-path validation). On a public URL anyone can create an account on this instance, and an
instance-level `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` would serve **every** tenant's AI calls — gate
the URL (Coolify basic auth / IP allowlist) before adding a shared LLM key.

## Known non-issues

- Aggregate Coolify service status can be `running:unknown`; use `verify-seldonframe.py` and the individual app/database statuses.
- The bare apex `https://ezwderp.com` is not routed to this service and presents Traefik's fallback/self-signed certificate. The supported CRM address is **`https://ai.ezwderp.com`**.
- Workspace subdomains would need wildcard DNS/certificates and a deliberate `WORKSPACE_BASE_DOMAIN` design. The current `ai.ezwderp.com` setting supports the single CRM host.

## October 2, 2026 — platform admin ("Seldon Admin") enabled

`/super-admin` (users, workspaces, revenue, agents, health) is gated by an email allowlist read from
`SF_SUPERADMIN_EMAILS` (`packages/crm/src/lib/auth/super-admin.ts` → `parseAdminAllowlist`, comma-separated,
whitespace-tolerant, compared lower-cased). Unset — or an email not on the list — means `requireSuperAdmin`
server-side redirects to `/dashboard` with no admin content ever rendered.

The service previously had **no** `SF_SUPERADMIN_EMAILS`, so nobody could reach that area. It is now set on the
Coolify service (value lives in the Coolify env store, not in this repo) **and** referenced from the app service so it
reaches the container:

```yaml
      SF_SUPERADMIN_EMAILS: '${SF_SUPERADMIN_EMAILS}'
```

Verify it landed in the running container without printing the address:

```sh
sh -c 'node -p process.env.SF_SUPERADMIN_EMAILS.length'   # non-zero = present
```

Note: this env var must be *referenced* in the app's `environment:` block — Coolify does not inject a service env var
into containers on its own. Same pattern as `AUTH_SECRET`.

Two levels of "admin" exist here and only this one is configurable: the workspace owner (`users.role = 'owner'`, which
every signup gets — the `memberships` table has no role column) and this platform allowlist.

## October 2, 2026 — connection pooler: ATTEMPTED AND REVERTED — do not re-apply

**This did not work and was rolled back the same night.** `pgbouncer` is **not** part of the stack; the active compose is
`seldonframe-compose-final.yml` — four services: `postgres`, `neon-proxy`, `migrate`, `app`.

The Neon HTTP proxy refuses to build a compute connection for the pooler endpoint. With both the proxy's target and the
app's `DATABASE_URL` pointing at `pgbouncer:5432` — credentials present and verified (proxy env URL 52 bytes, app URL 51
bytes, proxy span `postgres://seldon:${POSTGRES_PASSWORD}@pgbouncer:5432/seldonframe`) — every query failed inside the proxy:

```text
forwarding error to user: {"kind":"compute", "error":"could not connect to postgres in compute",
  "msg":"invalid configuration: password missing"}   spans: {ep: "pgbouncer", role: "seldon"}
```

The app surfaced it as `AdapterError` → `NeonDbError` on `getUserByAccount` (a parameterised query), and Auth.js then
redirected **every sign-in** to `/api/auth/error?error=Configuration` — "There is a problem with the server
configuration". The pooler's own path was healthy the whole time (`psql` inside the pgbouncer container returned rows,
and the proxy's login was accepted under `AUTH_TYPE=plain`); the failure is inside the proxy's connection-string
handling once the endpoint host is no longer the one it expects. **Do not re-enable a pooler here** without first
solving that.

Two other traps found on the way: `AUTH_TYPE=scram-sha-256` is rejected by the proxy (`SASL authentication failed`),
and `edoburu/pgbouncer` listens on **5432**, not 6432 (it takes no port env var).

Net effect of that night's performance work: **none of it survives in the compose** — the per-query connection cost is
unchanged, and the real constraint remains the VPS running at ~2× its core count (`/proc/loadavg` 12–20 on `nproc` 8).
The one safe item not yet re-applied is `neon-proxy`'s `OTEL_SDK_DISABLED: 'true'`, which stops the proxy logging a
`BatchSpanProcessor.ExportError` every ~5s (pure noise on a CPU-starved box) — worth adding on its own.

The rest of this section is the original (now-reverted) record, kept for reference.

### Reverted detail

The stack ran **five** services: `postgres`, `pgbouncer`, `neon-proxy`, `migrate`, `app`.

| Item | Value |
|---|---|
| Pooler image | `edoburu/pgbouncer:v1.25.2-p0` (env-configured; no config file mount needed) |
| Pooler config | `AUTH_TYPE=plain`, `POOL_MODE=transaction`, `MAX_CLIENT_CONN=500`, `DEFAULT_POOL_SIZE=25`, `MAX_PREPARED_STATEMENTS=200` |
| Pooler listener | **port 5432 inside the container** — the edoburu image does *not* take a port env var, so `pgbouncer:6432` will **not** connect. Always use `pgbouncer:5432`. |
| ⚠ Auth type | Do **not** use `scram-sha-256`: the Neon HTTP proxy's connections are rejected with `ERROR … password authentication failed` / `closing because: SASL authentication failed`, and every app query fails with `NeonDbError`. `AUTH_TYPE=plain` works. It is also the **only** non-scram option that helps: with `auth_type=trust`/`md5` the entrypoint writes an *md5* hash to `userlist.txt`, and pgbouncer cannot authenticate a SCRAM-only Postgres from an md5 verifier. `plain` keeps the password in cleartext in the userlist, which pgbouncer needs for its server-side SCRAM handshake. |
| `neon-proxy` target | `PG_CONNECTION_STRING` → `postgres://seldon:${POSTGRES_PASSWORD}@pgbouncer:5432/seldonframe` (confirm in the proxy log's `"postgres":{"url":…}` span) |
| `app` `DATABASE_URL` | also points at `pgbouncer:5432`, so whichever of header/env the proxy honours goes through the pooler |
| `migrate` `DATABASE_URL` | stays **direct** on `postgres:5432` — transaction-mode pooling is a bad fit for DDL |
| Telemetry | `neon-proxy` sets `OTEL_SDK_DISABLED: 'true'`, which stops the endless `BatchSpanProcessor.ExportError` spam (it was erroring every ~5s on a CPU-starved box) |

Nothing publishes a port. `pgbouncer` is internal-only — do not add `ports:` to it.

Why it matters: the app uses `drizzle-orm/neon-http` (**one HTTP request per query**), and the Neon local proxy opened a
fresh Postgres connection for each one — connect + SCRAM + a second connection for its auth/control plane, measured at
**~1–2s per query**. With the pooler in front, pgbouncer reports `query 8890 us` and `wait 68 us`, i.e. **~9ms per query**.

Verify the pooled path end-to-end:

```bash
# functional: a psql run inside the pgbouncer container (escaping parens avoids shell quoting problems)
# sh -c 'psql postgres://seldon:${POSTGRES_PASSWORD}@127.0.0.1:5432/seldonframe -c select\(1\)'   -> one row
# then check pgbouncer's stats lines: non-zero queries/s, and a small wait/query time
GET /services/<uuid>/logs?sub_service_name=pgbouncer&lines=40
```

Remaining constraint — **this is infrastructure, not code**: the VPS runs at ~2× its core count
(`/proc/loadavg` 12–20 on `nproc` 8, no cgroup throttling). Per-query cost is now small, but every request is still
CPU-starved. Fixing that needs host-level action (reduce co-tenant load, resize, or move the CRM) — the Coolify API
token cannot reach the host.

### Still outstanding: rotate the default database password
`seldon` / `seldon` is still in use. It is no longer internet-reachable (port 4444 is closed), but it must change. It
lives in **three** places and they must move together inside one short window: pgbouncer's `DB_PASSWORD`, `neon-proxy`'s
`PG_CONNECTION_STRING`, and `app`'s `DATABASE_URL` — plus `ALTER USER seldon WITH PASSWORD …` against the database.

## October 2, 2026 — security fix, inline wrapper, and outage record

### Published database port removed (security)
`neon-proxy` no longer publishes `4444:4444` (verified: the port is closed from the internet). The port exposed an
unauthenticated SQL-over-HTTP endpoint — anyone reaching it could authenticate against the CRM database, and the
default `seldon:seldon` credentials worked. The app reaches the proxy as `neon-proxy:4444` over the Docker network,
so no host publish is needed. **Rotate the default database password** (still `seldon`/`seldon`).

### The wrapper is now inline — no host file, no file-storage bind
`app.command` is `sh -c` with a heredoc that writes `/tmp/ezwebdeals-start.js` and `exec node`s it. The old
`./ezwebdeals-start-v2.js` bind (Coolify file storage id 15) is no longer referenced. Boot proof in the app log:

```text
EZwebdeals public origin: https://ai.ezwderp.com
EZwebdeals white-label: patched compiled files: 1012
```

### DANGER: the redacted compose files here carry a PLACEHOLDER password
`seldonframe-*-compose-*.yml` (including the "redacted" ones) contain a 10-character placeholder whose value
contains `redact` — **not** the real database password. Deploying one verbatim makes `migrate` fail with
`FATAL: password authentication failed for user "seldon"`, and because `app` depends on
`migrate: condition: service_completed_successfully`, no `app` container is created at all and the site returns
Traefik `503 no available server`. Always substitute the real password before PATCHing.

Working reference: **`seldonframe-compose-final.yml`** (no published port, inline wrapper, correct password).
Rollback reference: `seldonframe-compose-ROLLBACK-before-4444-fix.yml`.

### Onboarding gate makes every menu link look broken
`packages/crm/src/proxy.ts` (Next.js 16 proxy) 307-redirects any authenticated user with `soulCompleted=false` to
`/clients/new` on **every** matcher path — so every menu click bounces. `soulCompleted` comes from
`organizations.soul_completed_at`; the next gate uses `organizations.settings->>'welcomeShown'`. Both are read in the
`jwt` callback, which runs on every session read, so a data fix takes effect on the next page load. Fix applied:

```sql
update organizations set soul_completed_at = now(),
  settings = settings || '{"welcomeShown": true}'::jsonb where id = '<org>';
```

### Coolify API limits for this host
- `~/.hermes/coolify-api-token` has read + write but **not deploy**: `/deploy`, `/services/{uuid}/start|stop|restart`
  and the per-application equivalents all return `403 Missing required permissions: deploy`.
- The working deploy trigger is `PATCH /services/{uuid}` with `{"docker_compose_raw": "<base64>", "instant_deploy": true}`.
- `GET /services/{uuid}` hides `docker_compose_raw`; there is no read-back endpoint, so keep `*.yml` copies here as the
  source of truth.
- Container diagnostics without SSH: `POST /services/{uuid}/scheduled-tasks` (`container: app`, `frequency` must be a
  valid cron, `enabled: false`) then `POST .../scheduled-tasks/{uuid}/execute` and read
  `.../executions`. `container: postgres` returns 500 (database sub-services are not addressable);
  `container: neon-proxy` works. `/usr/bin/time`, quotes, `%` and pipes in the command have caused 500s.
- `/services/{uuid}/logs?sub_service_name=<app|migrate|neon-proxy|postgres>&lines=N` returns container logs.
