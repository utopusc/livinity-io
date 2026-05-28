---
phase: 241-mcp-auto-add-liv-tools
plan: 04
subsystem: livinityd / boot wire-up + Mini PC deploy
tags: [livinityd, boot, mcp, aionui, deploy, minipc, uat, idempotency, customization]

# Dependency graph
requires:
  - phase: 241
    plan: 03
    provides: seedAionUiMcpConfig + MCP_SEED_SENTINEL_KEY + SeedDeps + SeedRedisClient (the orchestrator this plan wires into livinityd boot)
provides:
  - livinityd/source/index.ts boot-time invocation site (post Phase 112 fallback, pre Phase 104 heartbeat)
  - Mini PC deployed SHA 814a6eb with sentinel SET + 5 system MCPs registered
  - Phase 241 milestone-level CODE-COMPLETE + LIVE
  - Pattern: AIONUI_BASE_URL env override (defaults http://127.0.0.1:3020)
  - Pattern: defense-in-depth outer try/catch even though orchestrator never throws
affects: [Phase 240 (Local Agents install-from-UI — unblocked), Phase 242 (Luse docs polish — unblocked)]

# Tech tracking
tech-stack:
  added: [] # zero new deps — purely uses existing seed.ts orchestrator
  patterns:
    - "Boot-time hook placement: post Phase 112 livos:domain:config fallback, pre Phase 104 heartbeat (mirrors Phase 141-01 drain-install-pending-redis-keys pattern)"
    - "AIONUI_BASE_URL env override for local dev / off-default ports (Mini PC uses 127.0.0.1:3020 default)"
    - "SeedLogger 3-level → livinityd 2-level adapter inline at the call site (info → log, warn/error → error)"
    - "Defense-in-depth outer try/catch: orchestrator never throws but boot block STILL wraps so livinityd boot continues even if import resolution itself crashes"
    - "PRE/POST snapshot diffing across deploys (sacred sha256 byte-identical invariant)"
    - "Rule 3 catalog seed: pre-deploy Redis HSET when install seed never ran on existing box (D-109-IDEMPOTENT skip)"

key-files:
  created:
    - .planning/phases/241-mcp-auto-add-liv-tools/241-04-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/index.ts # +33 lines: import + Phase 241 boot block
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "Boot-block placement post-Phase-112: matches plan-as-written. liv:domain:config must be settled before any AionUi-dependent code runs because the Caddy /liv proxy lives under that domain config; if Phase 112 throws and the seed runs first, AionUi may not be reachable through the front door yet (back-door at 127.0.0.1:3020 still works which is what we use, but the ordering keeps the dependency direction sane for future phases)."
  - "Single log-line summary keeps boot journal scannable: `Phase 241: AionUi MCP seed (created=N skipped=N errored=N sentinel=set|unchanged)` — operator parses created/skipped delta at a glance (first-boot vs idempotent restart)"
  - "Defense-in-depth outer try/catch despite never-throws invariant: cheap insurance; if a future hot-fix accidentally breaks the never-throws contract, livinityd still boots"
  - "Rule 3 pre-deploy catalog seed (HSET 5 system MCPs into liv:mcp:config preserving operator's filesystem entry): the install seed never re-runs on existing boxes (D-109-IDEMPOTENT), so the catalog was 1-entry. Surgical HSET maintained the operator-additive invariant while satisfying the plan's 5-MCP target. Documented as Rule 3 deviation; future install-time covers this via _dld_seed_mcp_servers on fresh boxes."

patterns-established:
  - "Phase XXX boot block shape: try { const r = await seedXxx({redis, baseUrl, logger}); logger.log('Phase XXX: <summary>') } catch (err) { logger.error('Phase XXX: <module> threw (non-fatal)', err) }"
  - "3-walk UAT for boot-time idempotent seeders: (1) first-boot creates N entries + sentinel SET; (2) DEL sentinel + restart = created=0 skipped=N + sentinel re-SET; (3) operator DELETE+POST same name = preserved across both no-op restart AND forced re-run"
  - "Rule 3 catalog seed when install seed is D-IDEMPOTENT-SKIP on existing boxes: HSET each system entry individually so operator-added entries in the same hash are preserved"

requirements-completed: [] # plan 241-04 has no requirements field

# Metrics
duration: ~25min
completed: 2026-05-28
---

# Phase 241 Plan 04: livinityd wire-up + Mini PC deploy + 3-walk UAT Summary

**Wires the `seedAionUiMcpConfig` orchestrator into `livinityd/source/index.ts` at the canonical lifecycle slot, deploys to Mini PC via `bash /opt/livos/update.sh`, and verifies the full pipeline end-to-end with 3 UAT walks (first-seed / idempotency / customization). All 5 Liv system MCPs (luse / liv-docker / liv-system / liv-apps / liv-vault) registered into AionUi on first boot, distributed to all CLI agents via /api/mcp/sync-to-agents, with operator customizations preserved across both no-op restarts AND forced re-runs (D-241-04 strict-name-match invariant). Sacred AionUi sha256 byte-identical PRE/POST, sacred sdk-agent-runner blob SHA preserved via pre-commit hook, 6/6 services active post-deploy, Phase 226 Caddy /liv proxy intact.**

## Performance

- **Duration:** ~25 min (wire-up patch + sacred verify + Rule 3 catalog seed + deploy + 3 UAT walks + bookkeeping)
- **Started:** 2026-05-28T00:46:00Z
- **Completed:** 2026-05-28T00:56:30Z
- **Tasks:** 7 (1 wire-up + 1 commit + 1 PRE snapshot + 1 deploy + POST snapshot + 1 idempotency UAT + 1 customization UAT + 1 STATE/ROADMAP)
- **Files modified:** 3 (`livinityd/source/index.ts` + `STATE.md` + `ROADMAP.md`)
- **Files created:** 1 (this SUMMARY.md)

## Accomplishments

- **Wire-up shipped:** `seedAionUiMcpConfig` invoked from livinityd boot at the canonical slot (post Phase 112 fallback, pre Phase 104 heartbeat). 33-line atomic patch to `livinityd/source/index.ts` — import line 33 next to `drainInstallPendingRedisKeys` + 32-line boot block at line ~641. AIONUI_BASE_URL env override allows local-dev redirection (defaults to `http://127.0.0.1:3020`).
- **Mini PC deploy GREEN:** `bash /opt/livos/update.sh` exit 0; `Deployed SHA recorded: 814a6eb`. Update script ran every step including the Phase 226 Caddy /liv proxy emit and the liv-assistant /api/auth/status healthcheck (HTTP 200/204). All 6 services restarted cleanly.
- **First-boot seed full chain ran on Mini PC** (journalctl evidence):
  ```
  [mcp-registrar] AionUi ready after 2 attempt(s)
  [mcp-registrar] liv-apps  → injected into AionUi (id=mcp_019e6c12-7f0b-7b70-9adc-cc88796341f9)
  [mcp-registrar] liv-system → injected into AionUi (id=mcp_019e6c12-7f11-7d62-b96b-b245b1010e31)
  [mcp-registrar] liv-vault  → injected into AionUi (id=mcp_019e6c12-7f16-73b3-b555-6ba0751ab4d0)
  [mcp-registrar] liv-docker → injected into AionUi (id=mcp_019e6c12-7f1b-7c03-9c56-75d40f549454)
  [mcp-registrar] luse       → injected into AionUi (id=mcp_019e6c12-7f22-72c3-895c-79498c190d48)
  [mcp-registrar] luse       → toggled enabled
  [mcp-registrar] sync-to-agents → distributed 5 servers to all CLI agents
  [mcp-registrar] sentinel livos:v43:mcp_seeded:v1 set
  Phase 241: AionUi MCP seed (created=5 skipped=0 errored=0 sentinel=set)
  ```
- **UAT-1 (Idempotency)** — DEL sentinel + restart livos → registrar re-runs, EXISTS-skips all 5, no overwrites:
  ```
  [mcp-registrar] AionUi ready after 1 attempt(s)
  [mcp-registrar] liv-apps  → already present in AionUi, skipping
  [mcp-registrar] liv-system → already present in AionUi, skipping
  [mcp-registrar] liv-vault  → already present in AionUi, skipping
  [mcp-registrar] liv-docker → already present in AionUi, skipping
  [mcp-registrar] luse       → already present in AionUi, skipping
  [mcp-registrar] sync-to-agents → distributed 5 servers to all CLI agents
  [mcp-registrar] sentinel livos:v43:mcp_seeded:v1 set
  Phase 241: AionUi MCP seed (created=0 skipped=5 errored=0 sentinel=set)
  ```
  `luse.updated_at` byte-identical PRE/POST (`1779929612071`) — proves Pitfall 1 guard (re-POST clobbers operator edits) is REAL.
- **UAT-2 (Customization preservation)** — operator DELETE+POST `liv-system` with `transport.command=/operator/edit/marker` and `description=OPERATOR-EDITED-MARKER`:
  - **Sub-1 (sentinel-SET restart):** `[mcp-registrar] sentinel set — skip` + `Phase 241: AionUi MCP seed (created=0 skipped=0 errored=0 sentinel=unchanged)`. Operator edit preserved (PRE_CMD == POST_CMD; PRE_DESC == POST_DESC).
  - **Sub-2 (forced re-run — sentinel DEL + restart):** registrar runs, EXISTS-skips all 5 including liv-system, operator's `/operator/edit/marker` STILL preserved (FINAL_CMD == `/operator/edit/marker`). D-241-04 strict-name-match invariant proven under both gates.
  - **Cleanup:** liv-system restored to canonical `/usr/bin/npx` payload via DELETE+POST. Final state: 5 servers (liv-apps / liv-docker / liv-system / liv-vault / luse) with canonical configs.
- **Sacred invariants intact:**
  - AionUi sha256 of `/opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore` = `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` PRE = POST (byte-identical across deploy). NB: this differs from MEMORY's `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` — drift from a prior Phase 238.x deploy, NOT introduced by Phase 241.
  - Sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` PRESERVED via pre-commit hook `[sacred-sha] PASS: 20 files verified` on both commits.
- **6/6 services active post-deploy:** livos / liv-core / liv-worker / liv-memory / liv-assistant / caddy (all reported `active`).
- **Phase 226 Caddy /liv proxy intact:** `@liv path /liv /liv/*` block present (grep count 1 in `/etc/caddy/Caddyfile`).
- **agent-configs API confirms distribution:** GET /api/mcp/agent-configs shows all 5 Liv system MCPs in the `aionui` source array (with the original `detected_liv-*` IDs); claude source carries pre-existing claude.ai-detected entries; opencode source empty. Liv's MCPs now travel into every CLI agent's tool-discovery surface inside Liv AI.

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Wire seedAionUiMcpConfig into livinityd index.ts | `814a6ebd` (feat) |
| 2 | Sacred SHA verify + commit (same commit as Task 1) | `814a6ebd` |
| 3 | Mini PC PRE-deploy snapshot (transient — captured in this SUMMARY) | (no commit) |
| 4 | Deploy via update.sh + POST snapshot (Mini PC operation only) | (no commit) |
| 5 | UAT-1 Idempotency (Mini PC operation only) | (no commit) |
| 6 | UAT-2 Customization (Mini PC operation only) | (no commit) |
| 7 | STATE.md + ROADMAP.md + SUMMARY.md final commit | (this commit) |

## Files Modified

- `livos/packages/livinityd/source/index.ts` — +33 lines: import next to `drainInstallPendingRedisKeys` (line 33) + Phase 241 boot block at line ~641 with defense-in-depth try/catch + AIONUI_BASE_URL env override + single summary log line.
- `.planning/STATE.md` — Current Position updated to Phase 241 SHIPPED 4/4; resume banner updated; previous-Plan-03 entry rolled down.
- `.planning/ROADMAP.md` — Phase 241 row: status `🟡 IN PROGRESS` → `✅ SHIPPED`, plan count `3/4` → `4/4`, plan 241-04 checkbox `[ ]` → `[x]` with full ship evidence + UAT log lines.

## Files Created

- `.planning/phases/241-mcp-auto-add-liv-tools/241-04-SUMMARY.md` — this file.

## Deviations from Plan

### Rule 3 — Pre-deploy catalog seed (blocking issue auto-fixed)

**Found during:** Task 3 (PRE-deploy snapshot)
**Issue:** Mini PC's `liv:mcp:config` Redis hash contained only the operator-added `filesystem` entry — NOT the 5 expected system MCPs (luse / liv-docker / liv-system / liv-apps / liv-vault). This is because `_dld_seed_mcp_servers` (the install-time helper that populates the system 5) is D-109-IDEMPOTENT and SKIPs when `liv:mcp:config` already exists. Once the operator adds any entry post-install, the install seed never re-runs and the system 5 never land in Redis.

Without the catalog seed, `seedAionUiMcpConfig` would gracefully NO-OP (`readSystemMcpCatalog` filters to `SYSTEM_MCP_NAMES_SET` and returns 0 targets; orchestrator warns "no system MCPs in liv:mcp:config — install seed missing? skipping" and early-returns with sentinel UNSET). Plan 241-04 acceptance criteria (5 entries in AionUi) would have been UNREACHABLE.

**Fix:** Surgically `HSET` each of the 5 system MCP payloads (copied verbatim from `scripts/install/seeds/mcp-servers.json` with `__LIVOS_REDIS_URL__` placeholder substituted for `luse.env.LUSE_REDIS_URL`) into `liv:mcp:config` on Mini PC BEFORE running `update.sh`. HSET is per-field, so the operator's `filesystem` entry was preserved byte-identical.

**Verification post-fix:**
- `HKEYS liv:mcp:config` → `[filesystem, liv-apps, liv-docker, liv-system, liv-vault, luse]` (6 entries; operator + 5 system)
- `HGET liv:mcp:config filesystem` → unchanged from PRE-fix state

**Files modified:** None in repo (Mini PC Redis state only — out-of-repo deployment-side fix).
**Commit:** N/A (deployment-side; documented here per Rule 3 protocol).

**Follow-up consideration:** This same situation will surface on every existing-operator box (`filesystem` operator addition implies install seed already SKIPped). Future install/upgrade phases could:
- (a) drop the IDEMPOTENT guard for system MCPs specifically — re-HSET the 5 system entries on every install regardless of existing HASH, since they're delete-forbidden by Phase 219 T3 anyway (operator can't legitimately remove them);
- (b) ship a one-time fixup script under `scripts/maintenance/` that bootstraps missing system MCPs;
- (c) extend Phase 241 itself to fall back to install-seed payloads when the Redis catalog lacks system entries (would couple the registrar to install-seed paths — undesirable layering);

Decision deferred to a future planning session. Phase 241's 4/4 ship is complete and correct: the registrar mirrors whatever's in the catalog into AionUi, which is the right behavior. The "catalog completeness" concern is upstream of Phase 241's scope.

### Documentation drift (no action taken; flagged for future)

1. **Sacred sha256 drift** — MEMORY records `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` as the AionUi binary sha256, but Mini PC actually has `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b`. The drift was introduced by some prior Phase 238.x update.sh run (not by Phase 241). Phase 241's true invariant — `byte-identical PRE/POST` — held. The MEMORY entry should be refreshed to `293a499...` and rephrased as "verify UNCHANGED across deploys" rather than asserting a fixed value.

2. **Plan PRE-snapshot greps had wrong paths** — Plan task 3 greps `/opt/livos/livos/packages/ui/index.html` for Phase 238 favicon markers, but the actual path on Mini PC is `/opt/livos/packages/ui/index.html` (no nested `livos/livos/`). And the Caddy `handle_path /liv*` pattern is actually `@liv path /liv /liv/*` + `handle @liv` (Caddy v2 matcher syntax with `uri strip_prefix`). The intent of the non-regression checks was satisfied — Phase 226 Caddy /liv block IS present (grep count 1 for `@liv path /liv`) — but the plan's grep patterns need updating for future plans that reuse the snapshot template.

## Verification

**Deployment evidence (Mini PC `bruce@10.69.31.68` 2026-05-28):**

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| update.sh exit code | 0 | 0 | ✅ |
| 6 services active | livos, liv-core, liv-worker, liv-memory, liv-assistant, caddy | all 6 `active` | ✅ |
| Sentinel `livos:v43:mcp_seeded:v1` post-deploy | `1` | `1` | ✅ |
| AionUi GET /api/mcp/servers count | 5 | 5 | ✅ |
| AionUi GET /api/mcp/servers names | luse, liv-docker, liv-system, liv-apps, liv-vault | all 5 present, `missing=NONE` | ✅ |
| journalctl Phase 241 seed summary | `created=5 skipped=0 errored=0 sentinel=set` | exact match | ✅ |
| Sacred AionUi sha256 PRE/POST | byte-identical | both `293a499...4788cbab1bfe` | ✅ |
| Sacred blob SHA `sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | hook PASS: 20 files verified | ✅ |
| Phase 226 Caddy `@liv path /liv` | ≥1 grep match | 1 | ✅ |
| Idempotency UAT seed summary | `created=0 skipped=5 errored=0 sentinel=set` | exact match | ✅ |
| Idempotency UAT luse.updated_at | unchanged | `1779929612071` PRE=POST | ✅ |
| Customization UAT Sub-1 (no-op restart) | edit preserved + log `sentinel set — skip` + `created=0 skipped=0 errored=0 sentinel=unchanged` | all three match | ✅ |
| Customization UAT Sub-2 (forced re-run) | edit STILL preserved + log `created=0 skipped=5 errored=0 sentinel=set` | both match | ✅ |

**Local code verification:**

| Check | Command | Result |
|-------|---------|--------|
| Import added | `grep -n "seedAionUiMcpConfig" livos/packages/livinityd/source/index.ts` | line 33 (import) + line 656 (invocation) + line 669 (comment in catch — matches plan code verbatim) |
| Phase 241 log lines | `grep -n "Phase 241:" livos/packages/livinityd/source/index.ts` | line 666 (success) + line 671 (catch) = 2 matches ✅ |
| Typecheck on changes | `npx tsc --noEmit \| grep -E "mcp-registrar\|source/index\\.ts"` | 0 errors ✅ |
| mcp-registrar tests | `npx vitest run source/modules/mcp-registrar` | 37/37 PASS (5 files) ✅ |
| Sacred blob SHA | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✅ |

## Self-Check: PASSED

Verified before commit:
- `livos/packages/livinityd/source/index.ts` — FOUND (modified — +33 lines)
- `.planning/STATE.md` — FOUND (Current Position updated)
- `.planning/ROADMAP.md` — FOUND (Phase 241 row SHIPPED 4/4)
- `.planning/phases/241-mcp-auto-add-liv-tools/241-04-SUMMARY.md` — FOUND (this file)
- Commit `814a6ebd` — FOUND (Task 1 wire-up `feat(241-04): livinityd boot wire-up — seedAionUiMcpConfig invocation`)
- Sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — VERIFIED via `git hash-object` post-commit
- Sacred AionUi sha256 `293a499...4788cbab1bfe` — VERIFIED byte-identical PRE/POST on Mini PC
- 6/6 services active on Mini PC — VERIFIED via `systemctl is-active livos liv-core liv-worker liv-memory liv-assistant caddy`
- Phase 241 sentinel `livos:v43:mcp_seeded:v1=1` on Mini PC — VERIFIED via `redis-cli GET`
- 5 AionUi MCP servers visible on Mini PC — VERIFIED via curl /api/mcp/servers
- 3-walk UAT (first-seed / idempotency / customization) — all 3 emit PASS lines verbatim
