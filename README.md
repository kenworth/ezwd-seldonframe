# ezwd-seldonframe

Deployment configuration **and runtime patch layer** for the EZwebdeals SeldonFrame instance
(`ai.ezwderp.com`). This repo does **not** contain the SeldonFrame application source — it contains
everything we changed *around* and *inside* the vendor's published image.

## Upstream

| | |
|---|---|
| Project | SeldonFrame (`@seldonframe/crm`) |
| Upstream repo | https://github.com/seldonframe/seldonframe |
| Upstream HEAD at snapshot | `3f386a221849` (2026-08-24T09:53:17Z) |
| Latest upstream release | v1.1.0 |
| Image we run | `ghcr.io/seldonframe/seldonframe:1.1.0` + our patch layer |
| License | **AGPL-3.0** (dual-licensed; see upstream `LICENSING.md`) |

### AGPL note — read before making this repo private-and-closed

SeldonFrame is AGPL-3.0. That license has a *network use* trigger: if you run a **modified** version
as a network service, users of that service are entitled to the modified source. Our runtime patch
layer modifies platform behaviour, so this deployment is a modified version.

Practical consequences:

- Running it for your own agency is fine under AGPL.
- If clients use it and you keep the modifications closed, you are in the territory where the
  vendor's `LICENSING.md` says you need **either** to publish your modifications **or** to buy a
  commercial license ("White-label SaaS: if you fork SF and resell it as your own SaaS, your fork's
  source must be public").
- Publishing this patch layer (public repo, or shipping the patch files with the service) satisfies
  the share-alike requirement for our modifications. Upstream's own source is already public.

## Layout

```
app/docker-compose.yml     production compose (secrets referenced via .env)
app/.env.example           required variables, values placeholder-only
app/ops/ezwd-origin-patch.js   runtime patch layer (NODE_OPTIONS --require, mounted read-only)
app/ezwebdeals-start*.js   container entrypoint wrappers
proxy/Caddyfile            TLS reverse proxy, HTTP->HTTPS redirect, compression
patches/                   dated patches with CHANGELOG, tests, before/after sources
scripts/                   deploy / status / verify helpers
docs/                      latency diagnosis, upgrade-safety notes, original deploy notes
```

## Secrets policy

`.env` is **never** committed. Copy `app/.env.example` to `.env` on the host and fill it in.
The compose file, patch code and docs in this repo contain no live credentials, no client PII and
no production IPs.

## Runtime patch layer

`app/ops/ezwd-origin-patch.js` is preloaded into the app process via
`NODE_OPTIONS=--require /app/ezwd-origin-patch.js` and mounted read-only from `./ops/…`. It fixes
three things without editing upstream source:

1. **Redirect origin** — upstream builds absolute URLs from the listen address, emitting
   `http://localhost:3000/...` redirects behind a proxy. Patch rewrites loopback origins to the
   canonical public origin.
2. **Service-card photos** — when `UNSPLASH_ACCESS_KEY` is unset the resolver returns `null` and
   every service card renders a striped placeholder. Patch falls back to the app's own curated
   `service_grid_image_urls` bundles (inert when a key is configured).
   *Injecting helpers via `Fn.toString()` is a trap: names from the outer scope do not exist inside
   the compiled chunk and the caller's bare `catch {}` hides the resulting throw. The helpers are
   written as literal source and log every branch under `EZWD_PATCH_DEBUG=1`.*
3. **Image harvesting on keyless fetch** — the direct-fetch fallback returned markdown only, so
   scraped `og:image` / site photos were dropped. Patch returns html + ogImage as well.

## Deploy / rollback

```bash
# deploy (from /root/seldonframe on the host)
docker compose up -d --no-deps --wait app

# verify
curl -kI https://ai.ezwderp.com/login          # expect 200
docker inspect --format '{{.Config.Image}}' app-fubbrjt4nkczuv0wjcyitkan
docker exec app-fubbrjt4nkczuv0wjcyitkan printenv NODE_OPTIONS   # must show the --require preload

# rollback: pin the previous image tag in docker-compose.yml, then
docker compose up -d --no-deps --wait app
```

Do **not** restore a whole `docker-compose.yml.before-*` backup blindly — later work would be lost.
Change only the image tag.

## Patch inventory

See `patches/README.md`.
