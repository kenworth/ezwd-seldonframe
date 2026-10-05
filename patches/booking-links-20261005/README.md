# Booking links after quote submission

The quote form's success action generated a booking URL independently of the
published landing-page CTA fields. Updating the visible page buttons did not
change the post-submit **Book instantly** link or the follow-up SMS URL.
Both were still generated as `https://<workspace>.<base-domain>/book`, which
depends on working workspace-subdomain DNS.

This source fix updates both `buildWorkspaceUrls` and
`buildStructuredWorkspaceUrls` to use `buildPublicBookingUrl`. When
`NEXT_PUBLIC_APP_URL` is configured, the helper produces:

```
<app-origin>/book/<encoded-workspace-slug>/default
```

The quote action already uses the shared builder for its response and SMS body,
so both now point to the existing public booking route on the configured app
host. Generated landing-page CTAs and structured API booking URLs use the same
helper. The legacy subdomain URL remains the fallback for unconfigured installs.
Home/intake links, authentication, contact handling, and appointment availability
are unchanged. This does not provision DNS for old subdomain links.

## Build and deploy

The customized base image must exist locally:

```sh
docker build -t seldonframe-ezwd:booking-links-v1-20261005 .
```

The source patch checks both expected replacement sites and fails on upstream
drift. The Dockerfile runs booking-link, quote-action, confirmation, workspace
quota, database-pooling, and voice regressions before the full production build.
The customized base preserves the preceding quota, pooling, and voice fixes.

Pin only the app image in Coolify's saved and generated Compose definitions to
`seldonframe-ezwd:booking-links-v1-20261005`. Preserve the configured app origin,
environment, external database volume, networks, and origin/photo runtime patch.
Recreate only the app service and wait for its health check.

Rollback: change only that image pin back to
`seldonframe-ezwd:workspace-limits-v1-20261005` and recreate the app. Do not restore
a whole earlier Compose file or modify database volumes. Rollback restores the
previous broken quote-confirmation URL behavior.

## Tests

The regression tests exercise both real URL builders and the quote-action core
with injected storage and message senders. They check the response URL, captured
SMS body, suppressed-message branch, duplicate submissions, workspace path
encoding, and exclusion of admin tokens from public booking links. Tests send no
real messages and create no production contacts or bookings.

As in the existing deployment, the Next production build skips full application
typechecking; a successful build is not a claim of a clean full typecheck.

## Validation and deployment status

All 97 regression tests passed on the deployment server (0 failures). The full
production build started, but the Coolify browser connection failed during
compilation. Its final result and deployment have not been verified. The repository
Compose pin remains on the preceding workspace-limits image until deployment
can be completed. No live quote form was submitted for this test.
