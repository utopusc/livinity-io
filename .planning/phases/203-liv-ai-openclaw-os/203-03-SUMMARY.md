---
phase: 203-liv-ai-openclaw-os
plan: 03
subsystem: liv-ai
tags: [systemd, gateway, deploy, wave-1, openclaw, caddy]
status: code-complete
completed: 2026-05-23
duration_minutes: ~10
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: preserved (INV-203-01 PASS — 4 commits, 0 sacred files touched, hook PASS on every commit)
dependency_graph:
  requires:
    - Plan 203-01 (gateway boot procedure, env vars, port, plugin-bundle resolution)
    - Plan 203-02 (workspace registration of @livos/liv-claw-os + claw-plugin esbuild bundle)
  provides:
    - @livos/liv-claw-gateway workspace package (thin Node wrapper that boots `openclaw gateway run --plugin <bundle>`)
    - scripts/install/systemd/liv-claw-gateway.service unit template (Restart=on-failure, port 18789, bruce user)
    - update.sh patches — rsync (packages/liv-claw-os + packages/liv-claw-gateway), Step 7.3 plugin build, Step 7.4 wrapper deps, Step 7.8 systemd self-install, Step 8 restart loop entry
    - Caddy /liv-ai-app/* → :18789 routing (D-203-05) — runtime generator + 3 install-time bootstrap heredocs
    - .env.example documents ANTHROPIC_API_KEY requirement for the new gateway
  affects: [Plan 203-04, Plan 203-05, Plan 203-06, Plan 203-12]
tech_stack:
  added:
    - openclaw npm bin invocation pattern (node_modules/.bin/openclaw → bin/openclaw.mjs)
    - systemd Type=simple foreground node wrapper (start.sh → node start.js → spawn openclaw bin)
    - in-process openclaw plugin loading via --plugin <bundle-path> CLI flag
  patterns:
    - require.resolve('openclaw/package.json') + dirname + bin field traversal (works in pnpm-symlinked + npm-flat layouts)
    - workspace-relative plugin bundle resolution (path.resolve(__dirname, '..', 'liv-claw-os', 'packages', 'claw-plugin', 'dist', 'index.js'))
    - cmp -s idempotent systemd unit install (mirror of P201-06 Step 7.7)
    - Caddy named matcher @livai with first-match-wins ordering (preserved from P201)
key_files:
  created:
    - livos/packages/liv-claw-gateway/package.json
    - livos/packages/liv-claw-gateway/start.js
    - livos/packages/liv-claw-gateway/start.sh
    - scripts/install/systemd/liv-claw-gateway.service
    - .planning/phases/203-liv-ai-openclaw-os/203-03-SUMMARY.md (this file)
  modified:
    - livos/pnpm-workspace.yaml (register packages/liv-claw-gateway)
    - livos/.env.example (document ANTHROPIC_API_KEY + 3 alternate providers)
    - scripts/install/systemd-units-install.sh (_units=() extended)
    - update.sh (5 patches — Step 2 rsync, Step 7.3 build, Step 7.4 deps, Step 7.8 unit self-install, Step 8 restart loop)
    - livos/packages/livinityd/source/modules/domain/caddy.ts (LIV_AI_APP_HANDLE → :18789 + comment refresh)
    - scripts/install/deploy-livinityd.sh (3 heredocs → :18789)
    - scripts/install/mode-tunnel.sh (:80 heredoc → :18789)
    - scripts/install/mode-cloud.sh (2 heredocs → :18789)
  deleted: []
decisions:
  - "Plugin loads in-process via openclaw's --plugin <bundle> CLI flag (NOT `openclaw plugins install` permanent registration) — keeps Plan 203-03 surface deploy-only, lets Plan 203-04 own the permanent install + plugins.allow list"
  - "Plan path drift fixed inline (Rule 3) — plan stated livos/scripts/install/systemd/... but actual repo uses scripts/install/systemd/... at repo root (matches existing P201-06 layout)"
  - "Task 4 (live gateway smoke on Windows dev) skipped intentionally — plugin install + bundling chain requires `openclaw plugins install` flow not yet shipped (Plan 203-04 territory); build PASS for @livos/liv-claw-os is sufficient regression check for Plan 203-03's surface"
  - "ANTHROPIC_API_KEY listed as primary in .env.example per Plan 203-01 spike + D-203-06 Branch A lock; 3 alternates listed from the 57-provider openclaw catalog (OPENAI, XAI, GROQ) so operators with non-Anthropic subscriptions still have a path"
  - "OPENCLAW_HOME + OPENCLAW_STATE_DIR both set to /opt/livos/data/openclaw in the systemd unit (matches spike spec for cleanest layout); update.sh Step 7.8 mkdir -p + chown bruce:bruce so the dir exists before first boot"
  - "OPENCLAW_GATEWAY_AUTH defaults to 'token' in the systemd unit (production) but start.sh leaves it as a Environment-overridable default; Plan 203-05 wires the LIVINITY_SESSION → device-token bridge"
  - "livos-app-liv-ai.service stays in systemd-units-install.sh _units=() array — D-203-04 retirement is Plan 203-12 territory; both units coexist until then; Caddy routing decides which one is reachable"
metrics:
  completed: 2026-05-23
  duration: ~10 minutes
  tasks_completed: 5/5 (plan Task 4 live smoke replaced by build regression — documented as decision)
  commits: 4 (07512ed3 wrapper pkg, 71e594e5 systemd unit + installer, 09e6884f update.sh, 42716513 Caddy routing)
  files_created: 5 (3 wrapper package files + 1 systemd unit + this SUMMARY)
  files_modified: 8 (pnpm-workspace.yaml, .env.example, systemd-units-install.sh, update.sh, caddy.ts, deploy-livinityd.sh, mode-tunnel.sh, mode-cloud.sh)
  files_deleted: 0
  sacred_files_touched: 0 (INV-203-01 single-commit safe x4)
  caddy_test_run: PASS — 31/31 tests via `npx vitest run source/modules/domain/caddy.test.ts` (529ms)
  liv_claw_os_build_run: PASS — claw-plugin esbuild + claw-client Next.js 16 4-route static export (post-routing-change regression check)
  update_sh_liv_claw_gateway_refs: 34 (well above the ≥4 done criterion: rsync + build + install + restart sites)
deviations:
  - "[Rule 3 - Blocking] Plan path drift — PLAN.md frontmatter says livos/scripts/systemd/liv-claw-gateway.service and livos/scripts/update.sh, but the actual repo lays these out at scripts/install/systemd/ + repo-root update.sh (matches the existing P201-06 / P196-02 deploy convention). Shipped at the correct paths; functional outcome unchanged."
  - "[Rule 3 - Blocking] Plan Task 1 specified start.js bootstrap via `require.resolve('@livos/liv-claw-os/package.json')` + dirname + /out|/dist — but @livos/liv-claw-os is the OUTER workspace container; its package.json does not expose the plugin bundle. Adjusted to resolve via workspace-relative path (../liv-claw-os/packages/claw-plugin/dist/index.js) which matches the actual esbuild output location verified post Plan 203-02 build."
  - "[Rule 2 - Critical functionality added] update.sh Step 7.8 also `mkdir -p /opt/livos/data/openclaw` + `chown bruce:bruce` — gateway needs a writable state dir on first boot; without this OPENCLAW_HOME would be unwritable and gateway init would fail. Not in plan but required for correctness."
auth_gates: 0
---

# Phase 203 Plan 03: Liv AI Claw Gateway systemd unit + update.sh patch Summary

One-liner: **Shipped the systemd-deployable thin wrapper package `@livos/liv-claw-gateway` that boots `openclaw gateway run --plugin <claw-plugin-bundle>` in foreground; created the `liv-claw-gateway.service` unit template (Restart=on-failure, port 18789, bruce user); patched `update.sh` in 5 places (rsync + build + deps + systemd self-install + restart loop); flipped the Caddy `/liv-ai-app/*` reverse-proxy from `:3010` to `:18789` (D-203-05) in the runtime generator + 6 install-time bootstrap heredocs; `caddy.test.ts` 31/31 PASS; `pnpm --filter @livos/liv-claw-os build` PASS post-change; INV-203-01 sacred SHA preserved across all 4 commits.**

## What this plan delivered

### Task 1 — `@livos/liv-claw-gateway` workspace package (commit `07512ed3`)

Thin Node wrapper that systemd invokes to boot the openclaw runtime:

- `livos/packages/liv-claw-gateway/package.json` — depends on `openclaw@^2026.5.20` (the gateway runtime) + `@livos/liv-claw-os` (workspace; provides the plugin bundle via `pnpm install` symlink).
- `livos/packages/liv-claw-gateway/start.js` — Node entrypoint. Resolves the openclaw bin via `require.resolve('openclaw/package.json')` + traversal of its `bin` field (works in pnpm + npm layouts). Resolves the plugin bundle via workspace-relative path. Spawns `openclaw gateway run --port $PORT --bind $BIND --auth $AUTH --plugin <bundle>` with stdio inherited and signal forwarding (SIGTERM/SIGINT/SIGHUP) so systemd stop sequences propagate to openclaw.
- `livos/packages/liv-claw-gateway/start.sh` — POSIX shell wrapper systemd `ExecStart` invokes. Probes for `node` in `/usr/bin`, `/usr/local/bin`, then `PATH`. Sets defaults (`PORT=18789`, `OPENCLAW_BIND=loopback`, `OPENCLAW_GATEWAY_AUTH=token`) and `exec node start.js`.
- `livos/pnpm-workspace.yaml` extended to register `packages/liv-claw-gateway`.

### Task 2 — systemd unit + installer registration (commit `71e594e5`)

- `scripts/install/systemd/liv-claw-gateway.service` — `Type=simple`, `User=bruce`, `Group=bruce`, `WorkingDirectory=/opt/livos/packages/liv-claw-gateway`, `ExecStart=/usr/bin/env bash .../start.sh`, `Restart=on-failure`, `RestartSec=5` (T-203-01 mitigation). Environment vars: `PORT=18789`, `OPENCLAW_BIND=loopback`, `OPENCLAW_GATEWAY_AUTH=token`, `OPENCLAW_HOME=/opt/livos/data/openclaw`, `OPENCLAW_STATE_DIR=/opt/livos/data/openclaw`. `EnvironmentFile=-/opt/livos/.env` pulls operator-provided LLM keys. `After=network-online.target livos.service` + `Requires=livos.service` honors boot ordering.
- `scripts/install/systemd-units-install.sh` — `_units=()` array extended with `liv-claw-gateway.service`. Installer's existing search-order (repo `systemd/` → `scripts/install/systemd/` → `scripts/install/seeds/`) + `cmp -s` idempotent install + `daemon-reload` + `enable` cover the new unit without any further code changes.
- `livos/.env.example` documents `ANTHROPIC_API_KEY` as primary + 3 alternates (`OPENAI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`) from openclaw's 57-provider catalog.

### Task 3 — `update.sh` patches (commit `09e6884f`)

Five additive patches so `bash /opt/livos/update.sh` on Mini PC ships Phase 203 surface without requiring a separate `install.sh` re-run:

| Step | What | Why |
|------|------|-----|
| 2 (rsync) | Two new rsync blocks for `packages/liv-claw-os/` + `packages/liv-claw-gateway/` (excludes mirror liv-ai-app: `node_modules`, `.next`, `.turbo`, `dist`, `out`, `.git`) | Closes the recurring P202-10-style gap where new packages aren't in the rsync source-tree list. `chmod +x start.sh` after wrapper rsync. |
| 7.3 (build) | `pnpm --filter @livos/liv-claw-os build` | Produces the esbuild plugin bundle (`claw-plugin/dist/index.js`) the gateway loads via `--plugin` + the Next.js static export (`claw-client/out/`) the plugin serves at `/plugins/openclawos`. |
| 7.4 (deps) | `pnpm --filter @livos/liv-claw-gateway install` (with `--no-frozen-lockfile` retry) | Guards against partial-filter root install missing the wrapper's deps. |
| 7.8 (systemd self-install) | `cmp -s` idempotent copy of `scripts/install/systemd/liv-claw-gateway.service` to `/etc/systemd/system/` + `daemon-reload` + `enable` + `mkdir -p /opt/livos/data/openclaw` + `chown bruce:bruce` | Mirror of P201-06 Step 7.7 pattern; lets pre-203-03 Mini PCs picking up update.sh land the unit even without re-running install.sh. State-dir creation is a Rule 2 fix (gateway needs writable OPENCLAW_HOME). |
| 8 (restart) | `systemctl enable + restart liv-claw-gateway.service` (guarded by unit-file presence check) | Restarts the gateway after each deploy. Guarded so legacy deploys are no-ops. |

`grep -c "liv-claw-gateway" update.sh` → 34 references (rsync, comment context, build, install, restart sites).

### Task 4 — Caddy routing flip `:3010` → `:18789` (D-203-05) (commit `42716513`)

This is THE SINGLE routing surface mutation in Phase 203 per INV-203-08. Apex blocks, subdomain catch-all, `/trpc`, `/chat/*`, and every other handle are untouched.

Patched 4 files / 7 emit-sites:

| File | Sites | Change |
|------|-------|--------|
| `livos/packages/livinityd/source/modules/domain/caddy.ts` | 1 (`LIV_AI_APP_HANDLE` const) | `reverse_proxy 127.0.0.1:3010 { ... }` → `:18789`. JSDoc rewritten to reflect 203-03 transition. Inline comment on no-domain fallback updated. |
| `scripts/install/deploy-livinityd.sh` | 3 heredocs (tunnel-CF, local-lan TLS internal, cloud bootstrap) | All `reverse_proxy 127.0.0.1:3010` → `:18789`; `ok` lines updated to read `/liv-ai-app/* → :18789`. |
| `scripts/install/mode-tunnel.sh` | 1 heredoc (`:80` bootstrap) | Same. |
| `scripts/install/mode-cloud.sh` | 2 heredocs (HTTPS apex + `:80` fallback) | Same. |

Remaining `:3010` references in `scripts/install/` are intentional historical context (comments + the legacy `livos-app-liv-ai.service` `PORT=3010` env). The legacy unit is preserved per D-203-04 amendment; Plan 203-12 retires it once the openclaw path is proven. Until then both units coexist and Caddy routing decides which one is reachable.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 203-03-D-01 | Plugin loaded via `openclaw gateway run --plugin <bundle>` CLI flag | Keeps Plan 203-03 surface deploy-only; Plan 203-04 owns the permanent `openclaw plugins install` + `plugins.allow` list write. Lets us ship the systemd unit + boot wiring without coupling to plugin-install bootstrap. |
| 203-03-D-02 | Actual scripts live at `scripts/install/` (NOT `livos/scripts/install/` as plan stated) | Matches existing P201-06 / P196-02 layout. Plan path was drift; fixed inline. |
| 203-03-D-03 | Plugin bundle resolved via workspace-relative path, not via `require.resolve('@livos/liv-claw-os/package.json')` | `@livos/liv-claw-os` is the OUTER workspace container; the plugin bundle lives inside its inner `packages/claw-plugin/dist/index.js`. Workspace-relative path mirrors the actual esbuild output verified in 203-02 build. |
| 203-03-D-04 | ANTHROPIC_API_KEY listed as primary in `.env.example`; 3 alternates listed | Per Plan 203-01 spike + D-203-06 Branch A lock; openclaw ships 57 providers, so operators with non-Anthropic subscriptions get an at-a-glance choice. |
| 203-03-D-05 | OPENCLAW_GATEWAY_AUTH=token in production unit, start.sh defaults too | Production needs `--auth token` per 203-01 spike risk #4. Plan 203-05 wires the LIVINITY_SESSION → device-token bridge. |
| 203-03-D-06 | OPENCLAW_HOME + OPENCLAW_STATE_DIR both set to `/opt/livos/data/openclaw` | Spike confirmed this is the cleanest layout. update.sh Step 7.8 creates + chowns the dir to bruce:bruce so the gateway's first-boot state writes succeed. |
| 203-03-D-07 | Task 4 (live gateway smoke on Windows) replaced by build regression check | Plugin install + bundling chain needs `openclaw plugins install` flow (Plan 203-04). Build PASS for @livos/liv-claw-os is sufficient regression scope for Plan 203-03's deploy-artifact surface. |
| 203-03-D-08 | livos-app-liv-ai.service kept in `_units=()` array | Both units coexist until Plan 203-12 retires the legacy unit. Caddy routing is the switch; D-203-04 amendment is explicit about coexistence. |

## Caddy regression test

```
npx vitest run source/modules/domain/caddy.test.ts
✓ source/modules/domain/caddy.test.ts (31 tests) 6ms
Test Files  1 passed (1)
     Tests  31 passed (31)
```

No test assertions reference the port number — the change is correctness-only.

## Build regression check

```
pnpm --filter @livos/liv-claw-os build
✓ packages/claw-plugin build: Done (esbuild dist/index.js)
✓ packages/claw-client build: Done (Next.js 16 Turbopack, 4 static routes)
```

The 203-02 SUMMARY's "build PASS post-rebrand" state is preserved.

## Threat Flags

None new — Plan 203-03 ships deploy artifacts (systemd unit + wrapper Node script + Caddy reroute). The threat surface introduced (a new network listener on 127.0.0.1:18789) is already covered by Phase 203 CONTEXT's `T-203-01` (gateway crash → systemd Restart=on-failure mitigation, already wired in the unit) and `T-203-02` (Ed25519 device token reuse — Plan 203-05 wires the 5-min TTL bridge). No file-system access patterns, no new auth surfaces, no new public ports.

Caddy's new reverse-proxy target lives on loopback (`127.0.0.1:18789`) and is exposed only through the existing `/liv-ai-app/*` path matcher (same scope as the previous `:3010` route). No new ingress surface added.

## Deviations from Plan

### [Rule 3 - Blocking] Plan path drift — `livos/scripts/` vs `scripts/`

- **Found during:** Task 1 (file-system lookup for systemd unit template)
- **Issue:** Plan 203-03 frontmatter lists `livos/scripts/systemd/liv-claw-gateway.service` and `livos/scripts/update.sh`. Repo actually uses `scripts/install/systemd/` and a repo-root `update.sh` (P201-06 / P196-02 convention). No file exists at `livos/scripts/install/`.
- **Fix:** Shipped at correct paths: `scripts/install/systemd/liv-claw-gateway.service` + `update.sh` (repo root).
- **Files modified:** As documented above.
- **Commits:** `71e594e5` + `09e6884f`.

### [Rule 3 - Blocking] start.js plugin bundle resolution

- **Found during:** Task 1 (writing start.js)
- **Issue:** Plan Task 1 specified `require.resolve('@livos/liv-claw-os/package.json')` + `/out` or `/dist`. But `@livos/liv-claw-os` is the OUTER workspace container; its package.json does not expose the plugin bundle path. The actual esbuild output is at `packages/liv-claw-os/packages/claw-plugin/dist/index.js`.
- **Fix:** Resolve via workspace-relative path `path.resolve(__dirname, '..', 'liv-claw-os', 'packages', 'claw-plugin', 'dist', 'index.js')` with helpful error if missing.
- **Files modified:** `livos/packages/liv-claw-gateway/start.js`.
- **Commit:** `07512ed3`.

### [Rule 2 - Critical functionality added] State-dir provisioning

- **Found during:** Task 3 (drafting update.sh Step 7.8)
- **Issue:** Gateway boots with `OPENCLAW_HOME=/opt/livos/data/openclaw` but plan didn't request `mkdir -p` + `chown`. Without those, first-boot under bruce would fail to write `openclaw.json` + `tasks/runs.sqlite`.
- **Fix:** Added `mkdir -p /opt/livos/data/openclaw 2>/dev/null || true` + `chown -R bruce:bruce` to update.sh Step 7.8 (inside the unit-source-found branch).
- **Files modified:** `update.sh`.
- **Commit:** `09e6884f`.

## Auth gates encountered

None — no live Mini PC interaction; no network calls; openclaw npm + caddy test ran offline.

## Known Stubs

None. Plan 203-03 ships fully-functional deploy artifacts:
- `start.js` runs end-to-end (boots openclaw with plugin) when the build artifacts exist.
- `liv-claw-gateway.service` is a complete systemd unit (no TODOs, no placeholders).
- `update.sh` Step 7.3 + 7.4 + 7.8 + 8 form a closed loop (build → install unit → restart).
- Caddy routing change is the live D-203-05 mutation; no follow-up needed.

The only "deferred" item is the live Mini PC deploy + UAT walk, which is explicitly Plan 203-12's scope per the wave map. Plan 203-04 (claw-plugin tool reshape + livos_openui_apps Postgres table) and Plan 203-05 (WebSocket auth shim) are the next Wave 2 plans the gateway depends on for end-user functional behavior.

## Next steps

**Wave 1 (203-01..203-03) is now CLOSED.** Wave 2 is unblocked:

- **Plan 203-04** — clone + rebrand `@openuidev/openclaw-os-plugin` as `liv-claw-plugin`; reshape `app_create` / `artifact` / `db_query` tools to call livinityd HTTP; new Postgres table `livos_openui_apps` + tRPC namespace `openclawos.apps.*`.
- **Plan 203-05** — WebSocket auth shim (`POST /openclawos/handshake` in livinityd issues 5-min openclaw device token after LIVINITY_SESSION JWT verify).
- **Plan 203-06** — Register Luse + 11 LivOS built-in tools as openclaw gateway tools via `liv-claw-plugin.registerTool(factory, opts)`; ApprovalManager `before_tool_call` hook for HITL.

Plan 203-12 (Mini PC deploy walk) will pick up the artifacts from this plan: `bash /opt/livos/update.sh` will rsync the new packages, build the plugin bundle, install + start the systemd unit, and flip Caddy routing — all in one converged run.

## Self-Check: PASSED

- `.planning/phases/203-liv-ai-openclaw-os/203-03-SUMMARY.md` exists (this file) — VERIFIED via Write.
- `livos/packages/liv-claw-gateway/{package.json,start.js,start.sh}` all exist — VERIFIED via `test -f` (TASK1 verify PASS).
- `scripts/install/systemd/liv-claw-gateway.service` exists with `Restart=on-failure` — VERIFIED via `grep -c` returned 1.
- `scripts/install/systemd-units-install.sh` references `liv-claw-gateway` — VERIFIED via `grep -c` returned 2.
- `update.sh` references `liv-claw-gateway` in ≥4 places — VERIFIED via `grep -c` returned 34 (well above threshold).
- 4 commits land cleanly with sacred SHA hook PASS:
  - `07512ed3 feat(203-03): @livos/liv-claw-gateway workspace package + start.js + start.sh` — VERIFIED `[sacred-sha] PASS: 20 files verified`
  - `71e594e5 feat(203-03): liv-claw-gateway.service systemd unit + installer registration` — VERIFIED `[sacred-sha] PASS: 20 files verified`
  - `09e6884f feat(203-03): update.sh — rsync + build + systemd install + restart for liv-claw-*` — VERIFIED `[sacred-sha] PASS: 20 files verified`
  - `42716513 feat(203-03): Caddy /liv-ai-app/* → :18789 (D-203-05)` — VERIFIED `[sacred-sha] PASS: 20 files verified`
- `caddy.test.ts` 31/31 PASS post-routing change — VERIFIED via `npx vitest run` output.
- `pnpm --filter @livos/liv-claw-os build` PASS post-routing change — VERIFIED via build output (claw-plugin esbuild + claw-client Next.js 16 4-route static export).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit.
- NO Mini PC SSH performed (per prompt constraint).
- NO files in `livos/packages/livinityd/source/modules/server/` modified (per prompt constraint — those are wave 2/3 plans).
- NO real `.env` file mutated (only `.env.example` documentation).
