---
phase: 227-livos-shell-livassistant-window
plan: 03
subsystem: minipc-deploy + smoke + uat
tags: [v42, deploy, minipc, checkpoint, auto-approved, sacred-sha-pinned, idempotent]
requirements: [SC-01, SC-02, SC-03, SC-04, SC-05, SC-06]
dependency_graph:
  requires:
    - "ui-component:LivAssistantWindow (Plan 227-01)"
    - "ui-dock-entry:LIVINITY_liv-assistant (Plan 227-02)"
    - "ui-window-branch:LIVINITY_liv-assistant → LivAssistantWindow (Plan 227-02)"
    - "caddy:LIV_ASSISTANT_HANDLE (Phase 226-04 — /liv/ reverse-proxy live)"
    - "liv-assistant.service (Phase 223 — AionUi v2.1.4 vendored at 127.0.0.1:3020)"
    - "update.sh (Phase 225-03 — wired liv-assistant deploy + probe)"
  provides:
    - "deployed-iframe-mount:https://bruce.livinity.io (LivOS shell with LivAssistantWindow reachable via dock)"
    - "deploy-log:227-03-DEPLOY-LOG.md (audit trail, 483 lines)"
    - "phase-227-shipped:✅ closed 3/3 plans"
  affects:
    - "Phase 228 (Claude auth bridge — UNBLOCKED: iframe surface now reachable, can verify AionUi picks up /home/bruce/.claude/.credentials.json)"
    - "Phase 231 (legacy LIV_AI_CHAT removal — coexists for now; visible tile order documented)"
tech_stack:
  added: []
  patterns:
    - "Batched-SSH preflight + deploy + smoke (fail2ban-friendly, matches 225-03/226-04 precedent)"
    - "2-run idempotency proof (update.sh sha byte-identical pre/post both RUNs)"
    - "External-from-orchestrator curl traversing full Cloudflare DNS → Server5 relay → Mini PC tunnel path"
    - "Auto-approved checkpoint:human-verify per workflow._auto_chain_active=true (operator UAT items deferred, not blocked)"
key_files:
  created:
    - ".planning/phases/227-livos-shell-livassistant-window/227-03-DEPLOY-LOG.md"
  modified:
    - ".planning/STATE.md (Plan 227-03 position + Phase 227 ✅ SHIPPED)"
    - ".planning/ROADMAP.md (Phase 227 progress + status update)"
decisions:
  - "Auto-approved checkpoint:human-verify per `workflow._auto_chain_active=true` chain flag (matches Phase 223-05 / 224-04 / 225-02 / 225-03 / 226-04 precedent). All 6 SCs GREEN on automated evidence (vitest + pnpm build + push + Mini PC update.sh + sacred SHA pin + external curl); operator browser UAT walk items deferred to next operator Mini PC session (NOT blockers — pure visual confirmation of already-proven backend)."
  - "Single batched SSH per major step (preflight+RUN1+smoke combined into one heredoc; RUN 2 batched into one heredoc; external curls separate). Phase 226-04 demonstrated this avoids fail2ban tripping."
  - "Used `npx vitest run liv-assistant-window dock.test` from inside `livos/packages/ui/` rather than `pnpm --filter ui vitest run` because the ui package has no `vitest` script (it's a devDep). Phase 224-03 + 227-01 + 227-02 used the same pattern."
  - "RUN 1 + RUN 2 both expected EXIT 0 (no self-update needed): Phase 226-04 already self-rsynced update.sh to `23a4a64f2cee5d8a26af12df1dad1159ab8bc4dc22b83086109e2ad25c4e0ced`, so Phase 227 RUN 1 + RUN 2 are byte-identical no-ops for the update.sh artifact itself; the new UI bundle gets rsynced + rebuilt fresh on each run (matching Phase 224-04 / 225-03 + every prior UI-only deploy)."
metrics:
  duration_seconds: 900
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 1
  completed_date: "2026-05-27"
---

# Phase 227 Plan 03: Mini PC Deploy + Smoke + UAT Summary

## One-liner

Mini PC `bruce@10.69.31.68` deployment of Phase 227 Plans 01+02 via `bash /opt/livos/update.sh` (2-run idempotency proof, RUN 1 + RUN 2 both EXIT 0) — all 6 services (`livos`, `liv-core`, `liv-worker`, `liv-memory`, `liv-assistant`, `caddy`) `active` post-deploy, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED on Mini PC (sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`), external `https://bruce.livinity.io/liv/api/auth/status` returns HTTP 200 (Phase 226-04 non-regression), 8/8 vitest GREEN pre-push, deployed SHA marker `5f6f4300aaa21cde3fe1db5e0414341762bd94cb` recorded — auto-approved `checkpoint:human-verify` per `workflow._auto_chain_active=true` chain flag, 6/6 SCs GREEN, Phase 227 ✅ SHIPPED.

## What shipped

### Step 1 — Local preflight (orchestrator shell)

- `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (matches canonical).
- 8 unpushed commits enumerated: `ad731bb5..5f6f4300` (roadmap port + Phase 227 plan + 3 Plan 01 commits + 4 Plan 02 commits).
- `npx vitest run liv-assistant-window dock.test` → **`Test Files  2 passed (2)` / `Tests  8 passed (8)`** in 3.05s. Both spec files (`liv-assistant-window.unit.test.tsx` 4 tests + `dock.test.tsx` 4 tests) GREEN.
- `pnpm --filter @livos/config build` → success (tsc, no output noise).
- `pnpm --filter ui build` → **`✓ built in 35.71s`**. Largest chunk `index-4e872dbc.js` 1218.70 kB (370.20 kB gzip) — pre-existing baseline.

### Step 2 — `git push origin master`

```
   9cd55dd4..5f6f4300  master -> master
```

8 commits delivered to GitHub master in one push.

### Step 3 — Mini PC preflight (batched SSH)

- All 6 services pre-active.
- `/opt/livos/update.sh` sha256 = `23a4a64f2cee5d8a26af12df1dad1159ab8bc4dc22b83086109e2ad25c4e0ced` (already up-to-date from Phase 226-04 self-rsync).
- `/etc/caddy/Caddyfile` line 58 `@liv path /liv /liv/*` (Phase 226-04 emit still present pre-deploy).
- Sacred SHA sha256 = `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`.

### Step 4 — Mini PC RUN 1: `sudo bash /opt/livos/update.sh`

`RUN_1_EXIT 0`. Update.sh successfully:
- Rsynced fresh source from GitHub `utopusc/livinity-io` master.
- Ran pnpm install (warnings about peer dependency mismatches — pre-existing, not introduced by Phase 227).
- Built `@livos/config` + `@livos/ui` (the new LivAssistantWindow component + dock entry both compile in).
- Built liv core/worker/mcp-server.
- Restarted `livos`, `liv-core`, `liv-worker`, `liv-memory`, `livos-app-liv-ai`, `liv-claw-gateway`, `liv-assistant`.
- Phase 225 `/api/auth/status` probe → `[OK] liv-assistant /api/auth/status = 200/204 OK`.
- Phase 223 password capture no-op (already captured 16-char credentials).
- Step 4.7 deprecation stub (Phase 226-04) fired correctly: `[INFO] /etc/caddy/conf.d/liv-assistant.caddy not installed — skipping caddy reload + /liv smoke (pre-Phase 226 deploy)` — exit 0, no daemon-reload churn.
- Recorded deployed SHA: `5f6f430` (matches local HEAD).

Post-RUN-1 state:
- All 6 services still `active`.
- Sacred SHA `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` UNCHANGED.
- External `https://bruce.livinity.io/liv/api/auth/status` → HTTP 200.
- Loopback `http://127.0.0.1:8080/` → HTTP 200.
- Pnpm-store sanity: single `@liv+core@file+..+liv+packages+core_@types+express@4.17.25_hono@4.12.22_sharp@0.33.5_zod@3.25.76` dir (no quirk, no manual cp needed).

### Step 5 — External-from-orchestrator curl (full relay)

```
--- /liv/api/auth/status --- HTTP 200
--- /liv/ (AionUi HTML)  --- HTTP 200
--- / (LivOS shell)       --- HTTP 200
```

All three paths reachable through the full Cloudflare DNS → Server5 relay → Mini PC tunnel chain.

### Step 6 — Mini PC RUN 2: idempotency proof

`RUN_2_EXIT 0`. Same flow, byte-identical update.sh sha pre/post (`23a4a64f...`), all 6 services still `active`, sacred SHA still `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`, external + loopback both HTTP 200, deployed-SHA marker on disk = `5f6f4300aaa21cde3fe1db5e0414341762bd94cb`, Caddyfile owned `bruce:bruce 644 3104` with `@liv path` line still at 58. **Idempotency PROVEN.**

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| Deploy + log | docs(227-03): DEPLOY-LOG + SUMMARY + STATE/ROADMAP — Phase 227 ✅ SHIPPED | (this commit) |

Plan 03 itself ships as a single docs commit (DEPLOY-LOG + SUMMARY + STATE/ROADMAP) — there are no code changes in this plan. The Plan 01 + Plan 02 code commits (`49a08391`, `b7e06131`, `516b0e32`, `3104e29f` + their docs) shipped via the `git push origin master` step.

## Acceptance criteria — all PASS

| Criterion | Expected | Actual |
|-----------|----------|--------|
| `227-03-DEPLOY-LOG.md` lines | ≥ 50 | 483 |
| `f3538e1d...` (sacred git SHA) tokens | ≥ 1 | 9 |
| `62f9245...` (Mini PC sha256) tokens | ≥ 1 | 9 |
| `8 passed` (vitest result) | 1+ | 5 |
| `pnpm --filter ui build` success | 1 | present, `✓ built in 35.71s` |
| Service `active` lines (6 units × 2 RUNs + preflight) | ≥ 12 | 18 |
| `HTTP 200` occurrences | ≥ 3 | 18 |
| RUN 1 + RUN 2 exit | both 0 | RUN_1_EXIT 0 + RUN_2_EXIT 0 |
| update.sh sha byte-identical pre/post | YES | `23a4a64f...` both runs |
| `git diff HEAD~3..HEAD -- liv/packages/core/` | empty (0 lines) | empty (0 lines) |

## Success criteria mapping (Phase 227 ROADMAP)

- **SC-01 (LivAssistantWindow renders the right URL):** **FULL PASS** — Step 1 vitest Test 1 asserts iframe src ends `/liv/` + `LIV_ASSISTANT_DEFAULT_URL === '/liv/'`. Component delivered through pnpm UI build → Mini PC RUN 1 rsync + UI rebuild → livos.service restart.
- **SC-02 (dock has Liv Assistant entry visible by default):** **FULL PASS (automated) + visual UAT deferred** — Step 1 vitest dock.test Test 1 GREEN (gate ON → `[data-test-dock-item="liv-assistant"]` rendered). Backend `useV42MigrationActive()` default-ON (Redis key missing → `{active:true}`). Visual confirmation deferred to operator (NICE-TO-HAVE — `https://bruce.livinity.io/` dock walk).
- **SC-03 (click opens window with iframe loading AionUi):** **FULL PASS (automated) + visual UAT deferred** — Step 1 vitest dock.test Test 3 GREEN (click → `openWindow` spy called once with exact args). Window-content registry (Plan 02 Task 1) routes appId to `<LivAssistantWindow />`. Step 5 external curl `/liv/` → HTTP 200 confirms AionUi UI reachable through the iframe-target path.
- **SC-04 (unit tests passing):** **FULL PASS** — 8/8 vitest GREEN (4 component + 4 dock) on `npx vitest run liv-assistant-window dock.test`.
- **SC-05 (sacred SHA unchanged):** **FULL PASS** — `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` pre-push. Mini PC sha256 = `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` at every snapshot (pre-deploy, post-RUN-1, post-RUN-2). `git diff HEAD~3..HEAD -- liv/packages/core/` returns empty. Pre-commit hook PASS on all Phase 227 commits.
- **SC-06 (pnpm UI build + livos.service clean):** **FULL PASS** — `pnpm --filter ui build` exit 0 (`✓ built in 35.71s`). `systemctl is-active livos` = `active` after both RUNs.

## Sacred SHA verification

```bash
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f

$ ssh ... bruce@10.69.31.68 'sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts'
62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe  (UNCHANGED across pre/RUN1/RUN2)

$ git diff HEAD~3..HEAD -- liv/packages/core/ | wc -l
0
```

Pre-commit `[sacred-sha] PASS: 20 files verified` on all 4 Plan 01/02 code commits + this docs commit. No edits under `liv/packages/core/**` across the full phase diff.

## Auto-Chain Checkpoint Handling

Task 2 (`checkpoint:human-verify`) AUTO-APPROVED per `workflow._auto_chain_active=true` chain flag. **`⚡ Auto-approved checkpoint:human-verify per --auto chain`** (matches 223-05 / 224-04 / 225-02 / 225-03 / 226-04 precedent).

All 6 SCs GREEN on automated evidence (vitest + pnpm build + git push + Mini PC update.sh + sacred SHA pin + external curl + caddyfile non-regression). Operator browser UAT walk items deferred:

### Deferred operator UAT walk (NICE-TO-HAVE)

1. **SC-02 visual** — Visit `https://bruce.livinity.io/`. Look at the bottom dock. Confirm a new "Liv Assistant" tile is present, immediately before the existing Liv (`LIV_AI_CHAT`) tile. (Both currently reuse the same `/figma-exports/liv-ai.svg` icon — distinguishing them visually is a Phase 232 brand-overlay job; coexistence is intentional until Phase 231 removes LIV_AI_CHAT.)
2. **SC-03 visual** — Click the new Liv Assistant tile. Confirm:
   - A window opens.
   - The window contains an iframe.
   - The iframe loads the AionUi UI (login page or chat interface served at `/liv/`).
   - No "refused to connect" iframe error, no 4xx.
3. **SC-05 non-regression visual** — Open one non-AI app from the dock (e.g. Files, App Store, Settings) and confirm it opens normally. Confirm the existing LIV_AI_CHAT / Chat dock entries also still work (Phase 231 is the remover, this phase coexists).
4. **Optional reversibility spot-check (NICE-TO-HAVE)**:
   ```
   REDIS_PW=$(sudo grep -oP 'redis://\S+:\K[^@]+' /opt/livos/.env | python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.stdin.read().strip()))')
   sudo redis-cli -a "$REDIS_PW" --no-auth-warning SET liv:config:liv_v42_migration_active false
   ```
   Within 30s (hook staleTime) the Liv Assistant dock tile should disappear. Reset: `SET liv:config:liv_v42_migration_active true` to restore.

If any of these visual checks surface a regression, file as a Phase 231 / Phase 232 follow-up (depending on category) — they do NOT invalidate the automated Plan 03 PASS verdict.

## Rollback contract

**Live rollback (no code revert, no restart):**

```bash
# On Mini PC, flip the v42 migration flag:
sudo redis-cli -u "$REDIS_URL" SET liv:config:liv_v42_migration_active false
# Within 30s (hook staleTime), the Liv Assistant dock tile hides.
```

**Code-level rollback (if ever needed):**

```bash
git revert 5f6f4300 3104e29f 516b0e32 b7e06131 49a08391
bash /opt/livos/update.sh
```

Sacred SHA stays unchanged in both rollback paths.

## Threat Flags

None. Phase 227 introduces no new network endpoints, auth paths, file-access patterns, or schema changes. Phase 226-04 owns the `/liv` Caddy handle (regen-survivable, iframe-friendly CSP, WS-compatible); Phase 223 owns the `liv-assistant` service binding; this plan only deploys a UI-side iframe shell + dock entry pointing at those already-validated surfaces.

## Deviations from Plan

**1. [Rule 3 - Tooling] vitest invocation pattern.** Plan `<action>` specifies `pnpm --filter ui vitest run liv-assistant-window dock.test`, but the `ui` package has no `vitest` script defined (only the devDep). Fixed by invoking `npx vitest run liv-assistant-window dock.test` from inside `livos/packages/ui/` directly — same vitest binary, same test discovery, same `8 passed (8)` result. Pattern matches Plan 02 SUMMARY's own usage (`pnpm --filter ui test:run dock.test` is documented but the actual ui package script is also missing). No functional regression.

No other deviations. Plan executed verbatim, all gates GREEN.

## Idempotency Summary

`update.sh` already at Phase 226-04's `23a4a64f2cee5d8a26af12df1dad1159ab8bc4dc22b83086109e2ad25c4e0ced` sha pre-deploy — Phase 227 doesn't perturb the deploy script. RUN 1 (this deploy's new UI bundle) + RUN 2 (no-op for code, fresh restart for services) both EXIT 0. Sacred SHA unchanged at every snapshot. Caddyfile size + `@liv path` line still at byte/line identical state pre/post (3104 bytes, line 58).

## Phase Close-out

**Phase 227 SHIPPED 3/3 plans:**
- Plan 01 (`49a08391`) — LivAssistantWindow component + 4 jsdom unit tests
- Plan 02 (`b7e06131..3104e29f` × 3 commits) — systemApps + window-content + dock entry + 4 dock vitest tests
- Plan 03 (this commit) — Mini PC deploy + 6/6 SCs GREEN + DEPLOY-LOG + auto-approved checkpoint

**v42.0 milestone advances:** 222 ✅ + 223 ✅ + 224 ✅ + 225 ✅ + 226 ✅ + 227 ✅ → 6/12 phases.

**Phase 228 (Claude auth bridge) UNBLOCKED:** the iframe surface is now live on Mini PC. Phase 228 verifies AionUi's Claude Code agent picks up `/home/bruce/.claude/.credentials.json` (Phase 221 / 223-05 seeded) so the first chat turn succeeds on subscription auth without configuration.

## Self-Check: PASSED

- FOUND: `.planning/phases/227-livos-shell-livassistant-window/227-03-DEPLOY-LOG.md` (483 lines)
- FOUND: push range `9cd55dd4..5f6f4300` on origin/master.
- FOUND: `8 passed (8)` vitest tally in DEPLOY-LOG.md (5 occurrences).
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` sacred-SHA token in DEPLOY-LOG.md (9 occurrences).
- FOUND: `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` Mini PC sha256 (9 occurrences).
- FOUND: `HTTP 200` (18 occurrences across loopback + external + orchestrator-relay curls).
- FOUND: 18 `service: active` lines (3 × 6 services for preflight + post-RUN-1 + post-RUN-2).
- RUN 1 + RUN 2 both EXIT 0.
- update.sh sha byte-identical pre/post (`23a4a64f2cee5d8a26af12df1dad1159ab8bc4dc22b83086109e2ad25c4e0ced`).
- `git diff HEAD~3..HEAD -- liv/packages/core/` returns empty (0 lines).
- All 6 SCs PASS in verdict block.

Ready for Phase 228 (Claude auth bridge) — iframe surface live and reachable.
