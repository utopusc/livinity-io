# store-import — CapRover + Coolify → Livinity Store catalog importer

Converts upstream open-source Docker app templates into Livinity Store catalog
entries. Wave 1 (2026-07-02) imported **131 apps** (103 from
[coollabsio/coolify](https://github.com/coollabsio/coolify) `@e7dff30`, 28 from
[caprover/one-click-apps](https://github.com/caprover/one-click-apps) `@bd357c9`
— both Apache-2.0), taking the catalog from 559 → **690** apps.

## Pipeline

1. `generate.mjs` — the converter. Reads both sources, enforces the store's
   one-click rule (no required env prompts; secrets → deterministic
   `sha256(slug:var)` literals), strips forbidden features
   (privileged/host-net/docker.sock/cap_add/devices/host binds), rewrites
   CapRover `srv-captain--X` hostnames to compose service names, allocates
   unique host ports from the reserved **42000+ band** (existing catalog:
   41000-41534) onto the MAIN service only, converts relative binds to named
   volumes and auto-declares them, and emits:
   - `livinity-apps/apps/<slug>/manifest.json` (the git source of truth —
     pushed to [utopusc/livinity-apps](https://github.com/utopusc/livinity-apps))
   - `out/compose/<slug>.yml` for validation
   - `out/report.json` (skip reasons: duplicate / needs-url / required-input /
     dockerfile-build / forbidden / content-mount / …)
2. Validation: every compose through `docker compose config` (wave 1: 132/132),
   sample through `store_validate_app`, all icon URLs HEAD-checked.
3. Publish: server-side — Supabase `http` extension fetches each
   `manifest.json` from the livinity-apps repo and INSERTs with
   `ON CONFLICT (slug) DO NOTHING` (existing rows are NEVER touched). The
   extension + log table are dropped afterwards.
4. `smoke.mjs <slugs...>` — local Docker smoke test (`up -d` → state/health
   poll → HTTP probe on the published port → `down -v`). Wave 1: 10/10 running
   with HTTP answers; only those are `verified=true`.

## Rollback (wave 1)

```sql
DELETE FROM apps
WHERE manifest->>'importSource' IN ('coolify@e7dff30', 'caprover@bd357c9')
  AND verified = false;  -- drop the guard to also remove smoke-verified ones
```

Plus `git revert` in utopusc/livinity-apps. No restore needed — the import
never updates pre-existing rows.

## Next waves

- `needs-url` bucket (70 apps): requires install-time public-URL injection on
  the box (SERVICE_FQDN semantics) — box-side feature first.
- `required-input` (84) / `dockerfile-build` (36): out of one-click scope.
- Re-run against newer upstream pins; never auto-overwrite verified entries.
