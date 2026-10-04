# Upgrade safety — what we changed and why it survives upgrades

Changes live in the persistent database, Coolify configuration, host files, or the
custom application image. Recreating the same image preserves its source changes;
replacing it with an upstream image does not. Source overlays must be carried
forward and tested when rebuilding for an upgrade.

The database pooling fix is now compiled from source. See
[its build and validation instructions](../patches/database-pooling-20261004/README.md).
Keep `app/docker-compose.yml` on the custom image with `pull_policy: never` while
using a local image. Preserve the explicit external PostgreSQL volume name and
verify the generated Coolify Compose resolves to that same existing volume before
deployment. The temporary pooling runtime transformer is no longer used.

## Persistence map

| What | Lives in | App redeploy | SeldonFrame upgrade | Coolify upgrade | Lost only if |
|---|---|---|---|---|---|
| `users.plan_id` / `subscription_status` (agency_scale / active) | Postgres volume | ✅ | ✅ | ✅ | volume deleted |
| onboarding stamp (`soul_completed_at`, `welcomeShown`) | Postgres volume | ✅ | ✅ | ✅ | volume deleted |
| `SF_SUPERADMIN_EMAILS` | Coolify env + `environment:` block in the compose | ✅ | ✅ | ✅ | Coolify DB reset (keep values in your password manager) |
| White-label file patch | inline wrapper in `app.command` (re-patches at every boot) | ✅ | ✅ (re-runs on boot) | ✅ | compose replaced with an older copy |
| 13 unwanted resources | deleted from Coolify (permanent) | ✅ | ✅ | ✅ | — |
| `/api/auth/debug` edge block | host file `/data/coolify/proxy/dynamic/ezwd-blocks.yaml` | ✅ | ✅ | ✅ | proxy config wiped → re-run the script |
| ops scripts | `/root/ezwd-ops/` + repo copy `seldonframe-coolify/ops/` | ✅ | ✅ | ✅ | VPS rebuilt |
| Volume backups (98 MB) | `/root/ezwd-purge-backups/` | ✅ | ✅ | ✅ | VPS rebuilt |

## After ANY upgrade, run this

```bash
/root/ezwd-ops/verify-invariants.sh      # exit 0 = everything intact
```

It checks: containers running, app healthy, all 6 kept stacks present, none of the 13
deleted resources resurrected, `/api/auth/debug` still blocked, public endpoints 200,
`plan_id`/`subscription_status` set, `SF_SUPERADMIN_EMAILS` injected, DB reachable.

If a specific check fails:

| Failed check | Fix |
|---|---|
| `/api/auth/debug` public again | `/root/ezwd-ops/restore-edge-block.sh` |
| `SF_SUPERADMIN_EMAILS` missing | re-add it to the Coolify service env **and** as `SF_SUPERADMIN_EMAILS: '${SF_SUPERADMIN_EMAILS}'` in the `app.environment` block |
| owner `plan_id` empty | `/root/ezwd-ops/mark-paid.sh set <email> agency_scale` |
| white-label branding gone | re-apply the inline wrapper command from `seldonframe-compose-final.yml` |
| a kept stack disappeared | redeploy it from Coolify — data is in its volume, undeleted |

## Do NOT

- Redeploy with **`delete_volumes=true`** — that destroys the database (all customers, plans, invoices).
- Replace the service's compose with an older copy — you would lose the inline wrapper and the
  `environment:` references that make Coolify's env vars visible inside the container.
- Paste secrets into chat or commit them. Values live in Coolify + your password manager only.

## Secrets worth rotating

1. **Google OAuth client secret** — one `clientSecret` value was written into the container log at
   03:36 during the broken-OAuth window (root-only access; container was recreated since, but a
   redeploy clears the log entirely).
2. **`AUTH_SECRET` / `NEXTAUTH_SECRET`** — `/api/auth/debug` published their **last five characters**
   to the internet until it was blocked at 04:44. Rotating them signs out all sessions (only you).
   Update both in Coolify; the app reads them fresh at boot.

## Related

- `HOST-LATENCY-DIAGNOSIS.md` — host contention findings and the PgBouncer dead end.
- `ops/mark-paid.sh` — grant/revoke paid plans (the whole billing step when collecting by e-Transfer).
- `ops/verify-invariants.sh`, `ops/restore-edge-block.sh` — the two scripts above.
