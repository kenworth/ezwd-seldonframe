# Patch inventory

Dated patches applied to the vendor image. Each directory keeps the CHANGELOG, the before/after
sources or compiled chunks, tests, build logs and a compose backup for rollback.

## Application-level (runtime, no rebuild)

| Patch | Symptom | Fix | Rollback |
|---|---|---|---|
| `app/ops/ezwd-origin-patch.js` (redirect origin) | `/switch-workspace` and friends redirect to `http://localhost:3000/...` behind the proxy | rewrite loopback origins to the canonical public origin | remove the `NODE_OPTIONS` preload from compose |
| `app/ops/ezwd-origin-patch.js` (service photos) | every service card renders a striped `photo - <service>` placeholder when no Unsplash key is set | fall back to the app's curated `service_grid_image_urls` bundles | same |
| `app/ops/ezwd-origin-patch.js` (image harvest) | a client site's own photos were dropped on the keyless fetch path | return `html` + `ogImage` from the fallback so the harvester sees them | same |
| historical workspace cap (`agency_scale`) | paid `agency_*` plans were treated as 0 workspaces | superseded by the source-based catalog fix below | see source-patch rollback |

## Image-level (baked, pinned by tag)

| Image tag | Contents |
|---|---|
| `seldonframe-ezwd:agency-scale-capfix-*` | workspace-cap fix |
| `seldonframe-ezwd:sek-voice-init-extractfix-*` | URL extraction direct-fetch fallback + voice init |
| `seldonframe-ezwd:photos-originfix-v6-*` | redirect-origin + first photo patch |
| `seldonframe-ezwd:photos-v7-*` | photo resolver added to source |
| `seldonframe-ezwd:photos-v8-*` | working curated-photo fallback in the runtime patch layer |
| `seldonframe-ezwd:photos-v8-voice-delay-*` | voice startup ordering fix |
| `seldonframe-ezwd:photos-v8-voice-playback-*` | goodbye/playback: wait for `output_audio_buffer.stopped` before hanging up |

| `seldonframe-ezwd:pooling-source-v1-20261004` | shared local database WebSocket pool compiled from source; retains customized base image |

## Dated patch directories

- `voice-fix-20261002/` — voice init/persona + route fixes
- `voice-delay-20261004/` — startup ordering
- `voice-goodbye-20261004/` — goodbye audio playback (see its `CHANGELOG.txt` for the confirmed
  timeline and the 30-second missing-event fallback)

- [database-pooling-20261004/](database-pooling-20261004/README.md) — source overlay, Dockerfile,
  pooling regression test, database smoke check, validation results, and corrected external volume mapping.

- [workspace-limits-20261005/](workspace-limits-20261005/README.md) — source-level catalog quota fix, shared display/creation checks, regression tests, and rebuild recipe. Image: `seldonframe-ezwd:workspace-limits-v1-20261005`.
