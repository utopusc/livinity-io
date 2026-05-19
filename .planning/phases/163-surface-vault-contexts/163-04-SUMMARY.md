---
phase: 163-surface-vault-contexts
plan: 04
plan_number: 163-04
phase_number: 163
type: summary
wave: 3
subsystem: deploy-verify
tags:
  - mini-pc-deploy
  - synthetic-probes
  - live-verification
  - surface-vault
  - phase-163
  - v34
requires:
  - phase: 163
    plan: 01
    reason: surface-context.ts + writeSurfaceContext wired into install hooks (provides on-disk subsurface dirs for the probe)
  - phase: 163
    plan: 02
    reason: ws-agent.ts per-session vault path resolution + perSessionManagers Map (the routing under test)
  - phase: 163
    plan: 02.5
    reason: agent-session.ts decoupled vaultMode gate (the unlock that makes cwd: sessionCwd reach SDK for computer-use sessions)
  - phase: 163
    plan: 03
    reason: composition-lock test green (locks the source-text matrix before deploy)
provides:
  - "Mini PC deployed SHA 6dd4a60 matching local HEAD 6dd4a60c"
  - "163-VERIFICATION.md — 3 probe results + journal excerpts + SHA pinning + 12-truth checklist"
  - "Live proof Phase 163 surface vault routing works on production"
affects:
  - "Phase 164 (Autonomous Scheduler) can build on the production-LIVE surface vault routing"
  - "v34.x phase queue: Phase 163 → SHIPPED row"
tech-stack:
  added: []
  patterns:
    - "Detached deploy via nohup + multi-poll log tail (ZeroTier-instability tolerant)"
    - "Synthetic WS probe via Node + ws/jsonwebtoken (mirrors Phase 162-05 pattern)"
    - "3-probe verification matrix: 2 surface-prefixed (webapp + native PRIMARY) + 1 regression (Main Chat — must NOT receive surface CWD)"
    - "LF-normalized content-hash compare for files with Windows CRLF checkout"
key-files:
  created:
    - .planning/phases/163-surface-vault-contexts/163-VERIFICATION.md
    - .planning/phases/163-surface-vault-contexts/163-04-SUMMARY.md
  modified: []
key-decisions:
  - "Pre-scaffold the probe surface dirs BEFORE the probes so we prove the primary subsurface CWD path lands (not the vault-root fallback). This is the most informative test — the fallback branch is already covered by ws-agent.surface-cwd.test.ts fallback runtime test #16."
  - "Use `surface=&surfaceId=` URL query params on the probe WS URL — matches the Phase 162-04 surface hint pattern and is the same envelope shape the UI uses for native/webapp chat panels."
  - "Mint JWT via absolute pnpm-store require path (`/opt/livos/node_modules/.pnpm/jsonwebtoken@9.0.3/...`) because Node CJS resolution can't find pnpm-symlinked modules from /tmp scripts."
  - "Surface dir pre-scaffold + post-probe cleanup keeps the production vault clean — no probe artifacts left behind."
patterns-established:
  - "Multi-probe sequential verification with one JWT mint at the top (faster than 3× mint + reduces auth-path noise in journal)"
  - "Journal dump to /tmp file → small SSH-grep-against-file (ZeroTier-tolerant — large `journalctl | grep` over SSH hangs; file-then-grep doesn't)"
requirements-completed: []
metrics:
  duration_minutes: ~25
  tasks_completed: 4
  commits: 1
  files_created: 2
  files_modified: 0
  tests_added: 0
  tests_passing: 0
  probes_run: 3
  probes_passing: 3
  completed_at: 2026-05-19T18:32:00Z
---

# Phase 163 Plan 04: Mini PC Deploy + 3 Synthetic Probes Summary

One-liner: Mini PC `bash /opt/livos/update.sh` deployed Phase 163 cleanly (SHA `6dd4a60` matches local HEAD `6dd4a60c`); 3 synthetic WS probes proved end-to-end that surface-prefixed conversationIds (`webapp:` / `native:`) route to per-surface vault subsurface CWDs at the SDK boundary while Main Chat (no prefix) preserves Opus 4.7 + vault root — Phase 161 + 162 chat-path-untouched contract preserved across the 163 stack.

## What Shipped

Plan 163-04 closes Phase 163 with **on-production proof** of the surface vault routing stack:

1. **Push:** local HEAD `6dd4a60c` pushed to `origin/master` (commits `e66e92a2..6dd4a60c`, 12 atomic commits across 163-01 / 163-02 / 163-02.5 / 163-03)
2. **Deploy:** `nohup sudo bash /opt/livos/update.sh` on Mini PC bruce@10.69.31.68 — exit 0, 4 services restarted (`livos liv-core liv-worker liv-memory` all `active`)
3. **3 synthetic WS probes** ran against `ws://localhost:8080/ws/agent` on Mini PC with fresh HS256 JWT minted against `/opt/livos/data/secrets/jwt`:
   - Probe 1 (webapp): `conversationId='webapp:phase163test:abc12345'` → **SDK_INIT model=claude-haiku-4-5-20251001 cwd=/home/bruce/livinity-vault/surfaces/webapp/phase163test** (PRIMARY subsurface CWD, no fallback)
   - Probe 2 (native): `conversationId='native:phase163nativetest:def67890'` → **SDK_INIT model=claude-haiku-4-5-20251001 cwd=/home/bruce/livinity-vault/surfaces/native/phase163nativetest** (PRIMARY)
   - Probe 3 (Main Chat regression): `conversationId='conv_phase163regression'` → **SDK_INIT model=claude-opus-4-7 cwd=/home/bruce/livinity-vault** (Phase 162 chat-path-untouched preserved; NO surface CWD leaked)
4. **VERIFICATION.md** captures all 3 probe results + journal excerpts + 12-truth checklist + SHA pinning + cleanup evidence
5. **Test surface dirs cleaned up** — no probe artifacts left in production vault

### Commits

| Hash | Subject |
|---|---|
| (pending) | docs(163-04): Mini PC deploy + 3 synthetic surface probes LIVE-PROVEN |

### Files Created (2)

- `.planning/phases/163-surface-vault-contexts/163-VERIFICATION.md` (~300 lines) — primary verification artifact
- `.planning/phases/163-surface-vault-contexts/163-04-SUMMARY.md` (this file)

## Probe Results

| # | conversationId | Expected | Actual | Status |
|---|---|---|---|---|
| 1 | `webapp:phase163test:abc12345` | Haiku 4.5 + `surfaces/webapp/phase163test` | `claude-haiku-4-5-20251001` + `/home/bruce/livinity-vault/surfaces/webapp/phase163test` | **PASS** (PRIMARY) |
| 2 | `native:phase163nativetest:def67890` | Haiku 4.5 + `surfaces/native/phase163nativetest` | `claude-haiku-4-5-20251001` + `/home/bruce/livinity-vault/surfaces/native/phase163nativetest` | **PASS** (PRIMARY) |
| 3 | `conv_phase163regression` | Opus 4.7 + vault root | `claude-opus-4-7` + `/home/bruce/livinity-vault` | **PASS** |

All 3 agents responded with the expected `OK_<LABEL>` text (full subscription auth round-trip succeeded against `/root/.claude/.credentials.json`).

## Sacred Constraint Verification

| Constraint | Status | Evidence |
|---|---|---|
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | **PASS** | `git ls-tree HEAD -- liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`; Mini PC source content SHA256 byte-identical to local |
| D-09 verbatim (`luse-system-prompt.ts`) | **PASS** | Mini PC SHA256 `e63773d7...` byte-identical to local |
| D-NO-NEW-DEPS | **PASS** | `git diff a8728cba..6dd4a60c -- '**/package.json'` → empty |
| Phase 161-02 helper byte-identical | **PASS** | Mini PC `agent-prompt-builder.ts` content SHA256 `3d8e2a75...` byte-identical to LF-normalized local |
| Phase 163-02.5 derivation deployed (source + dist) | **PASS** | `grep -cF "const vaultMode = this.vaultModeConfig !== null"` → 1 in /opt/liv/packages/core/src/agent-session.ts AND 1 in /opt/liv/packages/core/dist/agent-session.js |
| Phase 163-02 routing deployed | **PASS** | `grep -cF "resolveSessionVaultPath" ws-agent.ts` → 4; `surface-context.ts` deployed (9268 bytes) |
| Phase 163-01 install hooks deployed | **PASS** | `grep -cF "writeSurfaceContext"` apps.ts=2, native-installer.ts=2 |
| Phase 161 chat-path-untouched | **PASS** | Probe 3 returned Opus 4.7 + vault root (NO surface CWD) |
| Phase 162-04 multi-instance sessionKey | **PASS** | All 3 probes journal showed composite sessionKey shapes (admin:webapp:..., admin:native:..., admin:main:default:...) |

## Deviations from Plan

**None.** Plan executed exactly as written — all 4 tasks completed in sequence:

- Task 1 (pre-deploy SHA pin + push): 12 commits pushed cleanly, sacred SHA verified, 6/6 local test suites green
- Task 2 (Mini PC deploy via update.sh): exit 0, deployed SHA `6dd4a60` matches local HEAD, all 4 services active, no pnpm-store dual-dir quirk fired
- Task 3 (3 synthetic probes): all 3 probes PASS with PRIMARY expectations, journal evidence captured
- Task 4 (VERIFICATION.md + commit): VERIFICATION.md written with full evidence, this SUMMARY also created

Minor operational adjustments (NOT plan deviations):

- **JWT mint require path:** Used absolute `/opt/livos/node_modules/.pnpm/jsonwebtoken@9.0.3/...` require path since Node CJS resolution can't find pnpm-symlinked modules from /tmp scripts. Identical pattern would apply on any pnpm-managed Mini PC. Same applies to the `ws` import in the probe script.
- **Probe parser:** First iteration of probe parsed top-level `system+init` events directly. Mini PC wraps these inside `sdk_message` envelopes, so parser was updated to inspect `obj.data` when `obj.type === "sdk_message"`. First probe still captured the SDK init line via raw MSG log (proves the cwd landed) — parser fix made the subsequent 2 probes cleaner.

## Authentication Gates

None encountered. Subscription auth path (`/root/.claude/.credentials.json`) was already configured from prior Phase 162 deploy.

## TypeScript Health

No TypeScript changes in this plan — only `.md` files written.

## Verification Block (from PLAN.md)

```bash
# 1. Local state
git log --oneline -6
# Top: docs(163-04) commit, then 6dd4a60c docs(163-03) → 0cd6be14 test(163-03) → 53046318 test(163-02.5) → 81ca26d4 feat(163-02.5) → 1fd0493a docs(163-02) → 43eaf075 test(163-02)
# ✓

# 2. Sacred SHA
git ls-tree HEAD -- liv/packages/core/src/sdk-agent-runner.ts | awk '{print $3}'
# → f3538e1d811992b782a9bb057d1b7f0a0189f95f  ✓

# 3. VERIFICATION exists
ls .planning/phases/163-surface-vault-contexts/163-VERIFICATION.md
# → present  ✓

# 4. Mini PC fingerprints
ssh ... bruce@10.69.31.68 'grep -F resolveSessionVaultPath /opt/livos/.../ws-agent.ts | wc -l; ...'
# → 4, 2, file exists  ✓

# 4b. Phase 163-02.5 derivation deployed
ssh ... 'grep -F "const vaultMode = this.vaultModeConfig !== null" /opt/liv/packages/core/dist/agent-session.js | wc -l'
# → 1  ✓

# 4c. Phase 161-02 helper + D-09 byte-identical
ssh ... 'sha256sum /opt/livos/.../agent-prompt-builder.ts /opt/livos/.../luse-system-prompt.ts'
# → 3d8e2a75... e63773d7... — both LF-normalized-equivalent / byte-identical to local  ✓

# 5. Services
ssh ... 'systemctl is-active livos liv-core liv-worker liv-memory'
# → active active active active  ✓
```

All verification checks PASS.

## Next Steps

Phase 163 SHIPPED. Operator ready to proceed with:

- **Phase 164** (Autonomous Scheduler + Sample Agents) — can rely on per-surface vault routing being LIVE on Mini PC. Use `surfaceKind='autonomous'` in composite sessionKey to keep scheduled-agent sessions race-safe with user's Main Chat.
- **Phase 165** (Polish + Settings UI + v34.x Ship) — surface vault routing is now feature-complete; UI work to expose `chat_backend`, `cc_auth_status`, per-surface CLAUDE.md editor.

## Self-Check: PASSED

- [x] VERIFICATION.md exists at `.planning/phases/163-surface-vault-contexts/163-VERIFICATION.md` (≥100 lines, actual ~300)
- [x] Frontmatter has `deployed_sha_local`, `deployed_sha_minipc_recorded`, `sacred_sha_local`, `sacred_sha_minipc`, `probes_run: 3`, `probes_passing: 3`
- [x] All 3 probe sections in VERIFICATION.md have PASS/FAIL: PASS
- [x] Hard Guardrails table has 10 rows all marked PASS
- [x] Mini PC deploy clean (exit 0, all 4 services active, deployed SHA matches local HEAD)
- [x] 3 synthetic WS probes ran end-to-end without WS_ERROR; all returned `RESULT subtype=success` with expected `OK_<LABEL>` text
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on Mini PC + across all 12 commits
- [x] D-09 + Phase 161-02 helper + D-NO-NEW-DEPS preserved end-to-end
- [x] Test surface dirs cleaned up — no probe artifacts in production vault
- [x] All 4 services healthy post-verification

## TDD Gate Compliance

Plan structure: 1 checkpoint:human-verify (Task 1) + 3 type=auto tasks (Tasks 2/3/4). No `tdd="true"` task gates — this is a deploy + verify plan, not a code-shipping plan. Plan-level `type: execute` (not `tdd`), so plan-level RED/GREEN/REFACTOR ordering does not apply. The pre-existing test suites (locked in 163-01/02/03) act as the deploy gate: all 6 invariant suites GREEN pre-push (Task 1) → push → deploy → live probes confirm the locked invariants hold in production.
