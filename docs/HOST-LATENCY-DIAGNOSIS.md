# SeldonFrame / ai.ezwderp.com — host latency diagnosis (2026-10-02)

## TL;DR
The app-level code and database are fine. The host (`ssdnodes-seehken`, SERVER_IP, 8 vCPU,
31 GB RAM) has pathological **process + connection setup latency**, which every DB query inherits.

## Measured facts (not theories)
| Measurement | Result | Healthy expectation |
|---|---|---|
| `select 1` inside ONE psql session | 5-24 ms | <1 ms |
| New Postgres connection (pg_isready / psql) | **200-1000 ms** | 2-5 ms |
| `psql --version` (no connection at all) | **600 ms** | <5 ms |
| 20 execs of /bin/true vs 20 shell no-ops | 780 ms vs 79 ms | ~equal |
| Host load average / cores | 16-22 on 8 cores | <8 |
| Zombie processes | **~360** | 0 |
| Fork rate | 70-98/sec | low |
| CPU inside containers (cgroup delta) | 464% of 800% | - |
| Postgres connections | 6 | <100 |

Conclusion: it is NOT CPU saturation (46-85% idle, 0% steal, 0% iowait), NOT memory (19 GB free),
NOT disk (11% used), NOT Postgres config (log_hostname/log_connections=off), NOT DNS.
It is scheduler/process-creation latency on an oversubscribed host with a fork storm.

## Root cause of the "slow app"
`drizzle-orm/neon-http` issues one HTTP request per query; the local neon-http proxy opens a FRESH
Postgres connection per request. At ~200-500 ms per connection setup, a page doing 5-10 queries
costs seconds. Queries themselves are fine once a connection exists.

## Dead end: PgBouncer is INCOMPATIBLE with this app (do not retry)
Tried both `POOL_MODE: transaction` and `POOL_MODE: session`, `AUTH_TYPE: plain`, correct password.
- `psql` through pgbouncer works (2.1 ms transactions per pgbouncer's own stats).
- The neon-http proxy CANNOT use it: NeonDbError `invalid configuration: password missing`
  -> `[auth][jwt] callback FAILED` -> **logins break**. Rolled back both times.
- Even when working, client-side connection cost stayed 150-450 ms, so the upside was marginal.
Deployed alternatives live in `seldonframe-compose-session-pool.yml` (do not deploy) and the
known-good `seldonframe-compose-final.yml`.

## Gotcha: deploying via the Coolify API requires a Traefik refresh
`PATCH /services/{uuid}` with `docker_compose_raw` (base64) + `instant_deploy: true` recreates
containers, but the coolify-proxy keeps a **stale view** of them -> Traefik returns
`503 no available server` even though `docker exec coolify-proxy wget -qO- http://app:3000/api/version`
succeeds and the container has correct traefik.* labels. Fix: `docker restart coolify-proxy`
(~2-5 s blip for all sites). Also note Traefik reports itself `unhealthy` afterwards because
`docker exec` into it fails with an OCI/runc fork error while it still routes traffic fine.

## Open items (need decisions, not more diagnosis)
1. ~360 zombies come from stale containers running 2-3 months whose PID 1 does not reap children
   (node/npm/yarn/pnpm parents spawning wget/curl). Restarting clears them temporarily; removing
   or updating the containers is the real fix.
2. 42 containers on 8 vCPU is the structural problem: chatwoot 47%, coolify 42%, paperless 32%,
   mautic_cron 31%, activepieces 20% of one core each, before the CRM.
3. `SF_SUPERADMIN_EMAILS` allowlist = <email>; workspace `EZwebdeals`
   (org 50afa3c6, owner 01234316) under partner agency `EZwebdeals` (c73c047e, owner same) — correct.

## Final state after the cleanup (2026-10-02 ~04:10 UTC)

Kept, all verified serving: **SeldonFrame** (Agency Platform), **n8n** (Agency Platform),
**activepieces**, **chatwoot**, **mautic** (EZWD Automation), **OpenSEO** (SEO-AEO).

Deleted (7 applications + 6 compose services, via `DELETE /applications|/services/{uuid}?delete_volumes=true...`):
Dot Number Lookup, vin-decoder, youtube-meta, youtube-metadata, receipt-wrangler2, ezwd-seo,
ezwd-app-staging, paperless-ngx, papra, receipt-wrangler, Webcheck, searxng, Listmonk.

Volume backups before purge: `/root/ezwd-purge-backups/` (98 MB, all tar-verified): listmonk-postgres,
paperless-data, paperless-media, ezwd-staging-postgres, papra-data, plus two tiny redis volumes.

| Metric | Before cleanup | After cleanup |
|---|---|---|
| Running containers | 42 | 25 |
| Volumes | 48 | 40 |
| Zombie processes | 356 | 0-2 |
| Load average (8 cores) | 20-26 | ~9-16 |
| CPU pressure some avg300 | 52.6% | 32.5% |
| /login TTFB | 1.60 s | 0.36 s |
| Postgres new connection | 274-663 ms | 166-491 ms (residual) |

### Known cosmetic issue: coolify-proxy reports unhealthy
`docker exec coolify-proxy <anything>` fails with
`OCI runtime exec failed: error starting setns process: fork/exec /proc/self/fd/6: no such file or directory`,
so the image healthcheck (`wget -qO- http://localhost:80/ping`, every 4 s) can never pass
(failing streak ~459). The proxy still routes every site correctly (Traefik reads Docker labels,
which needs no exec). This also makes Coolify report SeldonFrame as `degraded` although the app
container is genuinely healthy (`health=healthy, streak=0`). Fix = recreate the container, which
costs ~1-2 min downtime for every site on the VPS, so it was deliberately deferred.
