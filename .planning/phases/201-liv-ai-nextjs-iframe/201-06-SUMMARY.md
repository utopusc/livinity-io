---
phase: 201
plan: 06
subsystem: infra
tags: [caddy, systemd, infra, wave-2, 201-06]
status: code-complete
deploy: pending-mini-pc
requires:
  - "Phase 201-05 docs flip (cd9eb7ad)"
  - "scripts/install/systemd-units-install.sh (Phase 196-02)"
  - "/etc/caddy/Caddyfile generator (livos/packages/livinityd/.../domain/caddy.ts)"
provides:
  - "Caddy `handle /liv-ai-app/*` routes :3010 ABOVE the :8080 catch-all"
  - "systemd unit livos-app-liv-ai.service (User=bruce, Port=3010)"
  - "update.sh build + restart path for the Next.js subapp"
affects:
  - "Per-user vhost (bruce.livinity.io/liv-ai-app/*)"
  - "Bootstrap Caddyfiles in mode-tunnel / mode-cloud / deploy-livinityd"
tech-stack:
  added: []
  patterns:
    - "Caddy handle-first-match-wins ordering (prefix matcher above default catch-all)"
    - "Next.js basePath + output:standalone for sub-path mount"
    - "systemd unit + update.sh self-install pattern for forward-compat on pre-201 boxes"
key-files:
  created:
    - scripts/install/systemd/livos-app-liv-ai.service
  modified:
    - livos/packages/liv-ai-app/next.config.ts
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - scripts/install/deploy-livinityd.sh
    - scripts/install/mode-cloud.sh
    - scripts/install/mode-tunnel.sh
    - scripts/install/systemd-units-install.sh
    - update.sh
decisions:
  - "Caddy block lives in BOTH the runtime generator (caddy.ts — source of truth for bruce.livinity.io) AND the bootstrap Caddyfiles (deploy-livinityd.sh + mode-cloud.sh + mode-tunnel.sh). Bootstrap copies are defensive — livinityd overwrites /etc/caddy/Caddyfile on first domain.activate, but keeping both consistent means /liv-ai-app/* works even in the bootstrap window before livinityd starts."
  - "Used `handle /liv-ai-app/* {}` + `handle {}` two-block shape instead of `handle_path` (which would strip the prefix). Next.js owns the basePath so the prefix MUST survive to the backend."
  - "Used Next.js `basePath: '/liv-ai-app'` so Next emits prefix-aware asset URLs + Link hrefs. Alternative (Caddy `handle_path` + bare Next) was rejected because it breaks Next 16's static asset emission."
  - "update.sh self-installs livos-app-liv-ai.service if missing (Step 7.7) rather than relying on operators to re-run install.sh. Idempotent via cmp -s byte check."
metrics:
  duration: ~25min
  completed: 2026-05-23T10:43Z
  tasks: 4
  files_changed: 8
  build_exit: 0
  caddy_tests: 31/31
  sacred_sha_files_verified: 20
---

# Phase 201 Plan 06: Caddy + systemd + update.sh — Liv AI subapp infra Summary

Per-user vhost (`https://bruce.livinity.io/liv-ai-app/*`) now reaches the Next.js Liv AI subapp on 127.0.0.1:3010 via a `handle /liv-ai-app/*` Caddy block placed ABOVE the existing livinityd catch-all on :8080. The subapp itself is configured with Next.js `basePath: '/liv-ai-app'` so the prefix survives end-to-end. A new systemd unit (`livos-app-liv-ai.service`, User=bruce, Port=3010) runs `pnpm --filter liv-ai-app start`, and `update.sh` builds + restarts it on every deploy.

## What shipped

### 1. Caddy routing (`handle /liv-ai-app/*` → :3010)

**Runtime generator** (`livos/packages/livinityd/source/modules/domain/caddy.ts`):
- Added `LIV_AI_APP_HANDLE` constant emitting a WS-friendly `handle /liv-ai-app/* { reverse_proxy 127.0.0.1:3010 { ... } }` block.
- Apex block: now emits the liv-ai-app handle BEFORE the default catch-all `handle { reverse_proxy 127.0.0.1:8080 }`.
- multiUser subdomain block (the per-user `bruce.livinity.io` vhost): same shape.
- No-domain `:80` fallback: same shape.
- Single-user (legacy) per-subdomain blocks: untouched — they route to per-app ports, not the gateway.
- `nativeApps` JWT-gated blocks: untouched — those serve specific apps, not the gateway.

**Bootstrap Caddyfiles** (templates used by install scripts before livinityd regenerates `/etc/caddy/Caddyfile`):
- `scripts/install/deploy-livinityd.sh` — all three branches (`hybrid|tunnel`, `local-lan`, `cloud`) now emit the same `handle /liv-ai-app/*` → `handle {}` shape.
- `scripts/install/mode-cloud.sh` — both HTTPS and HTTP variants.
- `scripts/install/mode-tunnel.sh` — `:80` plain HTTP variant.

### 2. Next.js basePath (`livos/packages/liv-ai-app/next.config.ts`)

```ts
const nextConfig: NextConfig = {
  basePath: '/liv-ai-app',
  output: 'standalone',
};
```

Build EXIT 0 with Next.js 16.2.6 + turbopack. Route tree unchanged (`/` + `/_not-found` both static).

### 3. systemd unit (`scripts/install/systemd/livos-app-liv-ai.service`)

```ini
[Unit]
Description=LivOS Liv AI Next.js subapp
After=network.target
Requires=livos.service

[Service]
Type=simple
User=bruce
Group=bruce
WorkingDirectory=/opt/livos/packages/liv-ai-app
Environment="NODE_ENV=production"
Environment="PORT=3010"
ExecStart=/usr/bin/pnpm --filter liv-ai-app start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 4. Install path (`scripts/install/systemd-units-install.sh`)

- Added `livos-app-liv-ai.service` to the `_units=()` array.
- Added `${SCRIPT_DIR}/systemd/` as a second source-of-truth location (between the top-level `systemd/` and `seeds/` dirs).
- The existing enable-loop now picks up the new unit automatically.

### 5. update.sh extensions

| Step  | Purpose                                                                                   |
| ----- | ----------------------------------------------------------------------------------------- |
| 7.2   | `pnpm --filter liv-ai-app install --frozen-lockfile` + `pnpm --filter liv-ai-app build`   |
| 7.7   | Install `livos-app-liv-ai.service` into `/etc/systemd/system/` if missing or stale (cmp)  |
| 8     | Guarded `systemctl restart livos-app-liv-ai.service` (alongside livos/liv-core/etc)       |

Step 7.7 is the forward-compat path: on a pre-201 Mini PC, the first run of `bash /opt/livos/update.sh` after pulling this commit will self-install the unit without requiring a fresh `install.sh` run.

## Verification

| Check                                                                                          | Result        |
| ---------------------------------------------------------------------------------------------- | ------------- |
| `grep -rE 'handle.*?/liv-ai-app/' scripts/install/`                                            | 9 hits ✓      |
| `grep -E "basePath.*'/liv-ai-app'" livos/packages/liv-ai-app/next.config.*`                    | 1 hit ✓       |
| `ls scripts/install/systemd/livos-app-liv-ai.service`                                          | PRESENT ✓     |
| `grep -c 'livos-app-liv-ai' update.sh`                                                         | 17 (≥2) ✓     |
| `grep -c 'pnpm --filter liv-ai-app build' update.sh`                                           | 1 (≥1) ✓      |
| `pnpm --filter liv-ai-app build`                                                               | EXIT 0 ✓      |
| `npx vitest run source/modules/domain/caddy.test.ts`                                           | 31/31 PASS ✓  |
| `git hash-object liv/packages/core/src/sdk-agent-runner.ts`                                    | `f3538e1d…` ✓ |
| Sacred-SHA pre-commit hook on feat commit                                                      | PASS ✓        |

## Commits

- `fc255096` — `feat(201-06): Caddy proxy + systemd unit + update.sh integration for liv-ai-app`
- _docs commit (this SUMMARY + STATE) — pending below_

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Plan-vs-codebase mismatch] No `scripts/install/caddy/` or top-level `Caddyfile.j2` exists in this repo**
- **Found during:** Task 1 (locate active Caddy config)
- **Issue:** Plan + prompt referenced `scripts/install/Caddyfile.j2` and `scripts/install/caddy/Caddyfile` as common locations, but the actual repo emits Caddyfiles inline via heredocs in (a) `scripts/install/deploy-livinityd.sh:1571-1613`, (b) `scripts/install/mode-tunnel.sh:251-310`, (c) `scripts/install/mode-cloud.sh:40-91`. The TRUE per-user vhost is generated at livinityd runtime by `livos/packages/livinityd/source/modules/domain/caddy.ts:generateFullCaddyfile()`, which overwrites `/etc/caddy/Caddyfile` on first `domain.activate`.
- **Fix:** Updated BOTH layers — the runtime generator (source of truth for `bruce.livinity.io`) AND all three bootstrap heredocs (defensive — Caddy works before livinityd starts). Plan DoD grep against `scripts/install/` still passes (9 hits).
- **Files modified:** 4 (caddy.ts + 3 install scripts).

**2. [Rule 2 — Missing critical functionality] update.sh self-install of new systemd unit**
- **Found during:** Task 3 (update.sh extensions)
- **Issue:** Plan Task 3 step 3 said "In the install-time helper (or deploy-livinityd.sh first-run path), copy the unit file" — but on a pre-201 Mini PC, an operator-run `update.sh` would never re-trigger `install.sh`, so the unit would never land. Step 8's guarded `systemctl restart` would silently no-op forever.
- **Fix:** Added Step 7.7 to update.sh — idempotent `install -m 0644` of the unit if missing or byte-different. Falls back to `$TEMP_DIR` if the on-disk copy isn't found.
- **Files modified:** `update.sh` (Step 7.7).

**3. [Rule 1 — Bug] Caddy `handle /*` would shadow the bare `reverse_proxy 127.0.0.1:8080`**
- **Found during:** Task 1 (planning Caddy block placement)
- **Issue:** The plan example showed `handle /liv-ai-app/* { ... }` placed ABOVE a bare `reverse_proxy 127.0.0.1:livinityd:8080`. In Caddy, mixing `handle` with bare directives in the same site block is order-dependent and ambiguous — the bare `reverse_proxy` runs unconditionally for every request, racing the `handle` matcher.
- **Fix:** Used two `handle` blocks instead — `handle /liv-ai-app/* { reverse_proxy 127.0.0.1:3010 }` then `handle { reverse_proxy 127.0.0.1:8080 ... }`. The default `handle {}` is Caddy's first-match-wins fallback. All 31 existing `caddy.test.ts` assertions still PASS (verified `toContain('reverse_proxy 127.0.0.1:8080')` still holds because the catch-all is now inside the default handle).

## Threat Flags

None — this plan only adds an HTTP routing prefix on existing per-user vhosts (already auth-gated by the livinityd app gateway for protected paths) and a new systemd unit running as `bruce` (no privilege escalation, no new network listener beyond the documented 127.0.0.1:3010).

## What does NOT ship here

- **No Mini PC deploy** — Plan 201-08 handles the actual `bash /opt/livos/update.sh` walk. This plan only edits the repo-side artifacts.
- **No Server4 reference** — D-NO-SERVER4 respected.
- **No `liv/` source edits** — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on `liv/packages/core/src/sdk-agent-runner.ts`.

## Self-Check: PASSED

- File `scripts/install/systemd/livos-app-liv-ai.service` — FOUND
- File `livos/packages/liv-ai-app/next.config.ts` (basePath edit) — FOUND
- File `livos/packages/livinityd/source/modules/domain/caddy.ts` (LIV_AI_APP_HANDLE) — FOUND
- Commit `fc255096` — FOUND in `git log`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on `liv/packages/core/src/sdk-agent-runner.ts` — VERIFIED
