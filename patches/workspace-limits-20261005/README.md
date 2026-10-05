# Workspace quotas from the current plan catalog

The workspace gate and dashboard still used the old builder/workspace/agency
ladder even though the catalog and tier normalizer already supported
`agency_scale`. The creation gate therefore assigned it zero workspaces, while
the dashboard added an obsolete free allowance and displayed a limit of one.
An earlier compiled-code cap patch was lost during a later source rebuild.

This source patch makes both checks use `plans.ts` through `getWorkspaceQuota`.
The dashboard resolves inherited entitlements through the same resolver as the
creation gate. Unlimited stays `-1` in API responses and becomes an unlimited
display only at the UI boundary; there is no artificial 999-workspace ceiling.
Agency plans can also reach the legacy organization-management page.

Current Builder and agency plans receive their catalog's unlimited own-workspace
allowance. Managed and grandfathered Workspace keep a one-workspace cap; unknown
plans remain blocked. The separate 10/30/unlimited client sub-account limits are
unchanged. No blanket admin bypass, billing-price change, or schema migration is
introduced.

## Build

The customized base image must already be available on the build host:

```sh
docker build -t seldonframe-ezwd:workspace-limits-v1-20261005 .
```

`apply-source-patch.cjs` validates every source match before writing any file.
It deliberately fails against incompatible upstream versions rather than silently
applying a partial fix. The Dockerfile runs quota, sub-account, pooling, and voice
regressions, then the full root production build. It copies the rebuilt app and
changed sources into the final image, preserving the customized base.

## Deploy and rollback

Pin the app service to `seldonframe-ezwd:workspace-limits-v1-20261005` in both
Coolify's saved Compose definition and its generated Compose file. Keep the
existing `pull_policy: never`, environment, mounted origin/photo patch, networks,
and external database volume. Recreate only the app service.

For rollback, change only that image pin back to
`seldonframe-ezwd:pooling-source-v1-20261004` and recreate only the app. Do not
restore an entire old Compose file or alter any database volume.

The previous account-specific workaround changed an Agency Scale subscription's
quota tier to legacy `scale`. Once the patched app is healthy, restore that
subscription tier to its canonical `agency_scale` value, preserving every other
subscription field. No account identifiers or database contents are included in
this repository. If rolling back to the older image, that temporary tier
workaround is required again until the source fix is reapplied.

## Regression coverage

- Every current unlimited plan and supported legacy aliases at 0–10,000 workspaces.
- Managed/Workspace caps at their boundary, without an extra free allowance.
- Missing and unknown plans fail closed.
- Starter/Growth client sub-account caps remain enforced.
- The workspace-list JSON response preserves unlimited as `-1`.
- Existing billing, database-pooling, and voice regressions.

Build validation: 102 tests passed, zero failures; all four root production build
tasks succeeded. The existing Next.js configuration skips full application type
checking during production builds; this is not a claim of a clean full typecheck.

Live validation: the image deployed healthy, both saved and generated Coolify
Compose definitions were pinned to it, and the canonical `agency_scale` tier was
restored. The signed-in client list shows Unlimited workspaces and the creation
form opens. A read-only backend check using the real stored entitlement returned
`allowed: true`, `maxOrgs: -1`, and `canCreate: true` with a simulated count of
10,000 workspaces. No test workspace was created.

This is an overlay for the customized deployment, not an upstream release or a
published container image. Keep the source patch and base image when rebuilding.
