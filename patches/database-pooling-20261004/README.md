# EZwebdeals source-based database pooling

The self-hosted database adapter now uses drizzle-orm/neon-serverless and a shared
10-connection pool when NEON_LOCAL_HOST is set. Hosted Neon retains neon-http.
The pool is keyed by connection URL and endpoint, preserving role separation.
No new dependencies or database migrations are required.

Changed source:
- packages/crm/src/db/index.ts
- packages/crm/src/db/local-pool.ts
- packages/crm/tests/unit/db/local-pool.spec.ts
- packages/crm/scripts/local-pooling-smoke.ts

Build (from this patch directory; the customized base image must exist locally):

```bash
cd patches/database-pooling-20261004
docker build -f Dockerfile.pooling -t seldonframe-ezwd:pooling-source-v1-20261004 .
```

Dockerfile.pooling uses the existing customized image as its base, preserving the
voice fixes and other source changes. It runs pooling and voice regression tests,
then the full root production build. The final image contains a freshly generated
.next directory. Keep the base image or replace it deliberately with a compatible
custom source image when upgrading.

Deployment:
Use the new tag for the app service in Coolify with `pull_policy: never` (local
image). Keep the existing environment, network, startup command, and domain
settings; preserve the explicit external volume mapping documented below. Remove only Patch 4 (the
temporary pooling transformer) from the mounted ezwd-origin-patch.js. The older
origin and photo customizations remain separate from this database change.

Saved server source:
 /data/coolify/services/fubbrjt4nkczuv0wjcyitkan/source-pooling-20261004

Rollback:
Restore the previous image tag photos-v8-voice-playback-20261004 and restore
ezwd-origin-patch.pooled-candidate.js over the mounted ezwd-origin-patch.js
without replacing its inode. Restart/recreate only the app service.

This is a source change in the custom deployment, not a change published to the
upstream SeldonFrame repository. Retain these source files when merging future
upstream updates. Normal build/regression tests replace reliance on minified-code
pattern matching for database pooling.

## Verified deployment storage

Coolify was treating a previously prefixed volume reference as a new source name.
The saved source Compose now uses this logical volume alias and marks it external:

services:
  postgres:
    volumes:
      - fubbrjt4nkczuv0wjcyitkan-pgdata:/var/lib/postgresql/data
volumes:
  fubbrjt4nkczuv0wjcyitkan-pgdata:
    name: fubbrjt4nkczuv0wjcyitkan_fubbrjt4nkczuv0wjcyitkan-pgdata
    external: true

Before another deployment, the generated Compose volume reference must resolve to
fubbrjt4nkczuv0wjcyitkan_fubbrjt4nkczuv0wjcyitkan-pgdata (the original volume).
Retain this correction during rollback; do not restore the earlier prefixed
Compose volume definition. No Docker database volumes were deleted.

## Validation completed before this GitHub commit

- 68 pooling and voice tests passed; 14 photo regression tests passed.
- All four root production build tasks passed.
- Focused database TypeScript check passed (the existing Next build skips type validation).
- Private candidate confirmed typed integer/array/JSON results and transaction rollback,
  with no runtime pooling transformer active. Repeated queries took 7–34 ms.
- Deployed app healthy; signed-in dashboard response headers arrived in about 270 ms.
  Warm public page first byte was about 0.55–0.60 seconds. These are spot checks.
- Original database volume attached and existing records verified after the naming correction.

Run the unit tests and build through the Dockerfile above. For a database smoke
check in an isolated candidate with its normal database environment, copy
`packages/crm/scripts/local-pooling-smoke.ts` to that same path under `/app`, then run
`pnpm --filter @seldonframe/crm exec tsx scripts/local-pooling-smoke.ts`.
The smoke check creates only a temporary table and rolls its transaction back.

This repository stores an overlay, not the full app or a published container image.
The base image contains the remaining source and dependencies. For an upstream
upgrade, port these source changes to the new source tree and rebuild/test it.
