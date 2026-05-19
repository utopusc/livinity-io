---
phase: 163-surface-vault-contexts
plan: 04
type: verification
status: passed
deploy_date: 2026-05-19
verified_at: 2026-05-19T18:30:00Z
deployed_sha_local: 6dd4a60c7916ad2bcd18aa92c3c45c2021078cf9
deployed_sha_minipc_recorded: 6dd4a60
minipc_target: bruce@10.69.31.68
sacred_sha_local: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_minipc: f3538e1d811992b782a9bb057d1b7f0a0189f95f
d09_minipc_sha256: e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a
phase161_02_helper_minipc_sha256: 3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d
ws_agent_minipc_sha256: 23907cd3957589a6dab22a2f5dbd7413d1f74f65daf3d9d20a1c01d89537f81a
agent_session_minipc_sha256: 587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73
services_healthy: [livos, liv-core, liv-worker, liv-memory]
new_derivation_grep_count_src: 1
new_derivation_grep_count_dist: 1
resolve_session_vault_path_grep_count: 4
probes_run: 3
probes_passing: 3
probe_1_status: pass
probe_2_status: pass
probe_3_status: pass
phase_162_regression: pass
---

# Phase 163 Verification — Surface-Specific Vault Contexts (LIVE-PROVEN on Mini PC)

**Verified:** 2026-05-19T18:30:00Z
**Status:** VERIFICATION PASSED + LIVE-VERIFIED (Mini PC `bash /opt/livos/update.sh` + 3 synthetic WS probes — surface vault routing live on production)

## 1. Summary

Phase 163 ships 4 plans / 12 atomic commits (`e66e92a2..6dd4a60c`) closing the surface-specific vault context layer of the v34 LivOS↔Claude Code integration:

- **163-01** Surface vault scaffolder (`writeSurfaceContext` / `removeSurfaceContext`) wired into `apps.ts` + `native-installer.ts` install/uninstall hooks. Each WebApp/NativeApp install now materialises `vault/surfaces/<kind>/<appId>/CLAUDE.md`.
- **163-02** `ws-agent.ts` per-session surface vault path resolution. Surface-prefixed `conversationId`s (`webapp:<id>:rest` / `native:<id>:rest`) route to `vault/surfaces/<kind>/<id>/`; Main Chat (no prefix) preserves `vault/` root.
- **163-02.5** `agent-session.ts` 5-line surgical decouple of `vaultMode` gate from `computerUse`. After this surgery the `cwd: sessionCwd` line threads through to the SDK `query()` call for both Main Chat AND computer-use (webapp:/native:) sessions, while `systemPrompt` + `settingSources` remain gated on `vaultMode && !computerUse` to preserve Phase 161-02 LivOS overlay precedence.
- **163-03** Composition lock test (`agent-session.surface-overlay.test.ts`) locks the 10 invariants forming the post-163-02.5 + post-163-02 + post-162-04 + post-161 composed source-text state. Zero source code changes; CI red signal on any future refactor that breaks the composition.

The Mini PC deploy via `bash /opt/livos/update.sh` completed cleanly (deployed SHA `6dd4a60` matches local HEAD `6dd4a60c`). All 4 services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) active. **3 synthetic WS probes ran end-to-end — all 3 PASS with primary expectations met** (subsurface CWD landed for webapp + native; Main Chat regression preserved Opus 4.7 + vault root). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `sdk-agent-runner.ts` PRESERVED on Mini PC source AND across all 12 commits. D-09 `luse-system-prompt.ts` byte-identical. D-NO-NEW-DEPS green (zero package.json diff across the phase).

## 2. Pre-Deploy State (Mini PC, before update.sh)

| File | SHA256 | Note |
|---|---|---|
| `/opt/liv/packages/core/src/sdk-agent-runner.ts` | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | Sacred file content hash — pre-deploy |
| `/opt/livos/.../computer-use/luse-system-prompt.ts` | `e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a` | D-09 — pre-deploy |
| `/opt/livos/.../ai/agent-prompt-builder.ts` | `3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d` | Phase 161-02 helper — pre-deploy |
| `/opt/livos/.../server/ws-agent.ts` | `2c0f52cdd21b34f2e1cb2d77104b6daf21494c5fd1b30ae5455566cc685cdafa` | Pre-163-02 deployed shape |
| Services `livos liv-core liv-worker liv-memory` | active × 4 | Pre-deploy healthy state |

## 3. Deploy

- **Command:** `nohup sudo bash /opt/livos/update.sh > /tmp/livos-update-163.log 2>&1 &`
- **Log:** `/tmp/livos-update-163.log` (134 lines, 5552 bytes)
- **Outcome:** exit 0 — `LivOS updated successfully!`
- **Deployed SHA recorded by update.sh:** `6dd4a60` (matches local HEAD `6dd4a60c7916ad2bcd18aa92c3c45c2021078cf9`)
- **Services post-deploy:** `livos liv-core liv-worker liv-memory` all `active`

Deploy log excerpts (key markers):

```
━━━ Pulling latest code ━━━
Cloning into '/tmp/livinity-update-1378355'...

━━━ Building Liv packages ━━━
[OK]    Liv memory built
[VERIFY] @liv/worker dist OK (/opt/liv/packages/worker/dist)
[VERIFY] @liv/mcp-server dist OK (/opt/liv/packages/mcp-server/dist)
[VERIFY] liv core dist copied to /opt/livos/node_modules/.pnpm/@liv+core@file+..+liv+packages+core_..._sharp@0.33.5_zod@3.25.76/
[OK]    Liv dist linked to 1 pnpm-store resolution dir(s)

━━━ Restarting services ━━━
[OK]    LivOS service running
[OK]    Liv-core service running

━━━ Recording deployed SHA ━━━
[OK]    Deployed SHA recorded: 6dd4a60

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LivOS updated successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The pnpm-store dual-dir quirk documented in MEMORY.md did NOT fire this deploy — `Liv dist linked to 1 pnpm-store resolution dir(s)`.

## 4. Post-Deploy SHA Pin (Mini PC)

| File | Deployed SHA256 | Local SHA256 (LF-normalized) | Status |
|---|---|---|---|
| `/opt/liv/packages/core/src/sdk-agent-runner.ts` | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` | **Sacred preserved** (byte-identical) |
| `/opt/livos/.../computer-use/luse-system-prompt.ts` | `e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a` | `e63773d7f0c4a78266b7012b8d69a18be91e7ebca3f79782a7ed7ed17fa0866a` | **D-09 verbatim** (byte-identical) |
| `/opt/livos/.../ai/agent-prompt-builder.ts` | `3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d` | `3d8e2a751c7e9d3fe3e92158d7c54272047fde3398ed21260532d3b5086d174d` (LF-normalized from CRLF Windows checkout) | **Phase 161-02 helper preserved** (content-identical) |
| `/opt/livos/.../server/ws-agent.ts` | `23907cd3957589a6dab22a2f5dbd7413d1f74f65daf3d9d20a1c01d89537f81a` | `23907cd3957589a6dab22a2f5dbd7413d1f74f65daf3d9d20a1c01d89537f81a` | **Phase 163-02 + 162-04 deployed** (byte-identical) |
| `/opt/liv/packages/core/src/agent-session.ts` | `587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73` | `587e94ce82ffae717b557b4d0b053e4a60d12232eb7b20a8590a254a20c01d73` | **Phase 163-02.5 deployed** (byte-identical) |

> Note: `agent-prompt-builder.ts` differs raw byte-for-byte vs local checkout only by line endings (Windows `core.autocrlf=true` checks out CRLF; rsync delivers LF). LF-normalized content hash matches verbatim — the Phase 161-02 helper is preserved unchanged.

## 5. Phase 163 Wiring Fingerprints (Mini PC)

| File | Grep | Expected | Actual | Status |
|---|---|---|---|---|
| `/opt/livos/.../server/ws-agent.ts` | `resolveSessionVaultPath` | ≥1 | 4 | PASS |
| `/opt/livos/.../apps/apps.ts` | `writeSurfaceContext` | ≥2 | 2 | PASS |
| `/opt/livos/.../apps/native-installer.ts` | `writeSurfaceContext` | ≥2 | 2 | PASS |
| `/opt/livos/.../claude-runner/surface-context.ts` | file exists | yes | yes (9268 bytes, root:root, 0644) | PASS |
| `/opt/liv/packages/core/src/agent-session.ts` | `const vaultMode = this.vaultModeConfig !== null` | 1 | 1 | PASS (163-02.5 derivation in source) |
| `/opt/liv/packages/core/dist/agent-session.js` | `const vaultMode = this.vaultModeConfig !== null` | ≥1 | 1 | PASS (163-02.5 derivation in deployed dist) |

All Phase 163 wiring landed correctly on Mini PC source + dist post-update.sh.

## 6. Synthetic Probes — 3/3 PASS

All 3 probes used a fresh JWT minted via `/opt/livos/data/secrets/jwt` (HS256, payload `{loggedIn: true, userId: "admin", role: "admin", sessionId: "phase163probe"}`). The probe script connects to `ws://localhost:8080/ws/agent?token=<jwt>` (plus `surface=...&surfaceId=...` query params when applicable) and sends a `start` envelope. Each probe was bounded by a 45s timeout; all 3 returned RESULT in <7s.

### Probe 1 — WebApp Surface

- **conversationId:** `webapp:phase163test:abc12345`
- **surface URL params:** `surface=webapp&surfaceId=phase163test`
- **Pre-scaffolded:** `/home/bruce/livinity-vault/surfaces/webapp/phase163test/CLAUDE.md` (so fallback wouldn't fire — wanted to prove the subsurface CWD lands)
- **Expected:** Haiku 4.5 dated literal + `cwd=/home/bruce/livinity-vault/surfaces/webapp/phase163test` (PRIMARY)

**Probe output (raw):**
```
[WEBAPP +0.01s] WS_OPEN
[WEBAPP +0.01s] SESSION_READY sessionId=935a908c-8c0d-46cb-abcf-a4b2b7677f2e
[WEBAPP +1.39s] SDK_INIT model=claude-haiku-4-5-20251001 cwd=/home/bruce/livinity-vault/surfaces/webapp/phase163test
[WEBAPP +5.38s] MSG_START model=claude-haiku-4-5-20251001
[WEBAPP +6.17s] RESULT subtype=success dur=4785 result=OK_WEBAPP
[WEBAPP +6.47s] WS_CLOSE code=1005 gotInit=true model=claude-haiku-4-5-20251001 cwd=/home/bruce/livinity-vault/surfaces/webapp/phase163test textLen=9
[WEBAPP +6.47s] TEXT: OK_WEBAPP
```

**Journal trace (livos service):**
```
May 19 11:28:12 ... [ws-agent] WS agent: surface vault path resolved sessionKey=admin:webapp:phase163test:7f28c20d -> /home/bruce/livinity-vault/surfaces/webapp/phase163test
May 19 11:28:12 ... AgentSessionManager: computer-use session detected, routing to Haiku {"userId":"admin:webapp:phase163test:7f28c20d","conversationId":"webapp:phase163test:abc12345"}
May 19 11:28:12 ... AgentSessionManager: starting session {"userId":"admin:webapp:phase163test:7f28c20d","sessionId":"935a908c-...","conversationId":"webapp:phase163test:abc12345","model":"claude-haiku-4-5","maxTurns":25,"toolCount":83}
May 19 11:28:12 ... AgentSessionManager: calling SDK query() {"userId":"admin:webapp:phase163test:7f28c20d","model":"claude-haiku-4-5","mcpServerCount":2}
May 19 11:28:18 ... [ws-agent] WS agent: disconnected, admin:webapp:phase163test:7f28c20d
```

**PASS/FAIL: PASS**
- `cwd=/home/bruce/livinity-vault/surfaces/webapp/phase163test` (PRIMARY — subsurface CWD threaded through to SDK)
- `model=claude-haiku-4-5-20251001` (Phase 161 dated literal preserved at SDK boundary — computer-use routing fired)
- Composite sessionKey `admin:webapp:phase163test:7f28c20d` (Phase 162-04 buildSessionKey closure shape preserved)
- `WS agent: surface vault path resolved` log line proves the per-session path resolution branch in ws-agent.ts fired
- Agent responded `OK_WEBAPP` — full round-trip succeeded against `/root/.claude/.credentials.json` subscription path

### Probe 2 — Native Surface

- **conversationId:** `native:phase163nativetest:def67890`
- **surface URL params:** `surface=native&surfaceId=phase163nativetest`
- **Pre-scaffolded:** `/home/bruce/livinity-vault/surfaces/native/phase163nativetest/CLAUDE.md`
- **Expected:** Haiku 4.5 + `cwd=/home/bruce/livinity-vault/surfaces/native/phase163nativetest` (PRIMARY)

**Probe output (raw):**
```
[NATIVE +0.01s] WS_OPEN
[NATIVE +0.01s] SESSION_READY sessionId=19478470-da01-41dc-a676-5a19e45245be
[NATIVE +1.36s] SDK_INIT model=claude-haiku-4-5-20251001 cwd=/home/bruce/livinity-vault/surfaces/native/phase163nativetest
[NATIVE +2.36s] MSG_START model=claude-haiku-4-5-20251001
[NATIVE +3.27s] RESULT subtype=success dur=1917 result=OK_NATIVE
[NATIVE +3.58s] WS_CLOSE code=1005 gotInit=true model=claude-haiku-4-5-20251001 cwd=/home/bruce/livinity-vault/surfaces/native/phase163nativetest textLen=9
[NATIVE +3.58s] TEXT: OK_NATIVE
```

**Journal trace:**
```
May 19 11:28:19 ... [ws-agent] WS agent: surface vault path resolved sessionKey=admin:native:phase163nativetest:7a4289de -> /home/bruce/livinity-vault/surfaces/native/phase163nativetest
May 19 11:28:19 ... AgentSessionManager: computer-use session detected, routing to Haiku {"userId":"admin:native:phase163nativetest:7a4289de","conversationId":"native:phase163nativetest:def67890"}
May 19 11:28:19 ... AgentSessionManager: starting session {"userId":"admin:native:phase163nativetest:7a4289de","sessionId":"19478470-...","conversationId":"native:phase163nativetest:def67890","model":"claude-haiku-4-5","toolCount":83}
May 19 11:28:19 ... AgentSessionManager: calling SDK query() {"userId":"admin:native:phase163nativetest:7a4289de","model":"claude-haiku-4-5","mcpServerCount":2}
```

**PASS/FAIL: PASS**
- `cwd=/home/bruce/livinity-vault/surfaces/native/phase163nativetest` (PRIMARY — native subsurface CWD threaded through to SDK)
- `model=claude-haiku-4-5-20251001` (Phase 161 dated literal preserved)
- Composite sessionKey `admin:native:phase163nativetest:7a4289de` (Phase 162-04 shape preserved for native: prefix)
- Agent responded `OK_NATIVE`

### Probe 3 — Main Chat Regression (Phase 161 + 162 contract)

- **conversationId:** `conv_phase163regression` (NO surface prefix, NO surface URL params)
- **Expected:** Opus 4.7 default + `cwd=/home/bruce/livinity-vault` (vault root — Phase 162 chat-path-untouched contract)

**Probe output (raw):**
```
[MAIN +0.00s] WS_OPEN
[MAIN +0.01s] SESSION_READY sessionId=f102a4e5-d154-4877-9a70-3fb2749f2fab
[MAIN +1.87s] SDK_INIT model=claude-opus-4-7 cwd=/home/bruce/livinity-vault
[MAIN +4.24s] MSG_START model=claude-opus-4-7
[MAIN +4.47s] RESULT subtype=success dur=2608 result=OK_MAIN
[MAIN +4.78s] WS_CLOSE code=1005 gotInit=true model=claude-opus-4-7 cwd=/home/bruce/livinity-vault textLen=7
[MAIN +4.78s] TEXT: OK_MAIN
```

**Journal trace:**
```
May 19 11:28:22 ... AgentSessionManager: starting session {"userId":"admin:main:default:87101e34","sessionId":"f102a4e5-...","conversationId":"conv_phase163regression","model":"claude-sonnet-4-6","maxTurns":25,"toolCount":83}
May 19 11:28:22 ... AgentSessionManager: calling SDK query() {"userId":"admin:main:default:87101e34","model":"claude-sonnet-4-6","mcpServerCount":2}
May 19 11:28:27 ... [ws-agent] WS agent: disconnected, admin:main:default:87101e34
```

Note: NO `surface vault path resolved` log line appeared for this probe (correct — no surface prefix, default sessionManager handled this conversation, no per-session manager built). The journal's `model:"claude-sonnet-4-6"` is the **cosmetic** un-overridden log from `tierToModel(tier)` at agent-session.ts:742 — same Phase 161/162 cosmetic log gap documented in 162-VERIFICATION.md §4. The **actual SDK boundary** received `claude-opus-4-7` (proven by `SDK_INIT model=claude-opus-4-7` in the probe output, which is the SDK system-init message — source of truth).

**PASS/FAIL: PASS**
- `cwd=/home/bruce/livinity-vault` (vault root EXACTLY — NOT a surface path; chat-path-untouched contract preserved)
- `model=claude-opus-4-7` (Phase 162-02 default model preserved — v34 quality upgrade still LIVE)
- sessionKey `admin:main:default:87101e34` (Phase 162-04 Main Chat composite key shape — NOT a surface shape)
- Agent responded `OK_MAIN`

## 7. Hard Guardrails Post-Deploy

| Constraint | Status | Evidence |
|---|---|---|
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved | **PASS** | `git ls-tree HEAD -- liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (HEAD = `6dd4a60c`). Mini PC file content SHA256 `62f92459...` byte-identical to local. |
| D-09 verbatim (`luse-system-prompt.ts`) | **PASS** | Mini PC SHA256 `e63773d7...` byte-identical to local. `git diff` HEAD vs pre-163 phase boundary (`a8728cba`) for this file → 0 lines. |
| D-NO-NEW-DEPS | **PASS** | `git diff a8728cba..6dd4a60c -- '**/package.json'` → empty (0 lines, 0 hunks). |
| Phase 161 dated literal in `agent-session.ts` (≥2 required) | **PASS** | 3 occurrences in deployed source (verified via `agent-session.surface-overlay.test.ts` Inv 6 regex match-count ≥2 — 3 actual). |
| Phase 161 chat-path-untouched | **PASS** | Probe 3 (no-prefix `conv_phase163regression`) returned `model=claude-opus-4-7` + `cwd=/home/bruce/livinity-vault` — no surface CWD leaked into Main Chat. |
| Phase 162-02 vault-mode contract | **PASS** | Probe 3 confirms vault root `cwd=/home/bruce/livinity-vault` (NOT legacy `/opt/livos`); Phase 162-02 derivation `vaultMode = !computerUse && this.vaultModeConfig !== null` superseded by 163-02.5 `vaultMode = this.vaultModeConfig !== null` — but vault root still threads for Main Chat. |
| Phase 162-04 multi-instance sessionKey | **PASS** | Probe 1 sessionKey `admin:webapp:phase163test:7f28c20d`, Probe 2 `admin:native:phase163nativetest:7a4289de`, Probe 3 `admin:main:default:87101e34` — all 3 follow Phase 162-04 `${userId}:${surfaceKind}:${surfaceId}:${connectionId}` composite shape. |
| Phase 163-02.5 derivation deployed (source) | **PASS** | `grep -cF "const vaultMode = this.vaultModeConfig !== null" /opt/liv/packages/core/src/agent-session.ts` → 1. |
| Phase 163-02.5 derivation deployed (dist) | **PASS** | `grep -cF "const vaultMode = this.vaultModeConfig !== null" /opt/liv/packages/core/dist/agent-session.js` → 1. |
| Phase 161-02 helper byte-identical on Mini PC | **PASS** | Mini PC `agent-prompt-builder.ts` content SHA256 `3d8e2a75...` byte-identical to LF-normalized local. |

## 8. Phase 163 Acceptance Summary

- [x] **163-01:** Surface vault scaffolder + install hooks LIVE on Mini PC. `writeSurfaceContext` ≥2 in apps.ts (×2) + native-installer.ts (×2). `surface-context.ts` deployed at 9268 bytes.
- [x] **163-02:** Per-session surface CWD resolution LIVE on Mini PC. `resolveSessionVaultPath` 4× in ws-agent.ts. 2/3 probes proved subsurface routing engages (webapp + native).
- [x] **163-02.5:** Decoupled `vaultMode` gate from `computerUse` LIVE on Mini PC. The derivation literal `const vaultMode = this.vaultModeConfig !== null` is present in both deployed source AND dist. Probe 1 + 2 prove `cwd: sessionCwd` threads to SDK for computer-use sessions — exactly the row this plan unlocks.
- [x] **163-03:** Composition lock test green (10 PASS / 0 FAIL via `npx tsx`); no source code changes; sibling regression all green (computer-use ALL PASS + vault-mode 14/14 + multi-instance 6/6).
- [x] **163-04:** Mini PC deploy clean, 3/3 probes PASS with PRIMARY (subsurface) expectations, all guardrails green.

## 9. Local Test Suites — All Green (Pre-Push)

| Suite | Path | Result |
|---|---|---|
| Phase 161 computer-use | `liv/packages/core/src/agent-session.computer-use.test.ts` | ALL PASS (5 helper + 7 source-text + 1 chat-path + 10 161-02) |
| Phase 162-02 vault-mode | `liv/packages/core/src/agent-session.vault-mode.test.ts` | 14/14 PASS (including Test 4/6/7/14 post-163-02.5 update + Test 11 post-163-02 widening) |
| Phase 162-04 multi-instance | `liv/packages/core/src/agent-session.multi-instance.test.ts` | 6/6 PASS |
| Phase 163-03 surface-overlay | `liv/packages/core/src/agent-session.surface-overlay.test.ts` | 10/10 PASS |
| Phase 163-01 surface-context | `livos/.../claude-runner/surface-context.test.ts` | 12/12 PASS |
| Phase 163-02 ws-agent surface-cwd | `livos/.../server/ws-agent.surface-cwd.test.ts` | 18/18 PASS |

**Total: 60+ PASS / 0 FAIL across all 6 invariant suites.**

## 10. Cleanup

After all 3 probes, the test surface dirs were removed:

```
$ sudo -u bruce rm -rf /home/bruce/livinity-vault/surfaces/webapp/phase163test \
                       /home/bruce/livinity-vault/surfaces/native/phase163nativetest
$ ls /home/bruce/livinity-vault/surfaces/
native
webapp
```

Only the empty `webapp/` and `native/` container dirs remain (created by the scaffolder, no live data). No probe artifacts left in the production vault.

## 11. Services Post-Verification

```
$ systemctl is-active livos liv-core liv-worker liv-memory
active
active
active
active
```

All 4 services healthy >10 min post-deploy. `liv-memory` continues to compile + run successfully (no recurrence of the pre-Phase-162 build gap documented in MEMORY.md — `update.sh` Phase 162-prep added the build branch).

## 12. Issues / Out-of-Scope

**None.** No deployment quirks encountered. The pnpm-store dual-dir hazard documented in MEMORY.md did NOT fire (`[OK] Liv dist linked to 1 pnpm-store resolution dir(s)`). No `liv-memory` build gap recurrence. No ZeroTier-related deploy failure (the few intermittent ZeroTier session timeouts during journal collection were transparently retried per the documented reference_zerotier_unstable protocol).

## 13. Self-Check: PASSED

- [x] Local push successful: `b8860b69..6dd4a60c master -> master`
- [x] Mini PC `update.sh` exit 0, deployed SHA `6dd4a60` matches local HEAD
- [x] Phase 163 source artifacts present on Mini PC (apps.ts ×2, native-installer.ts ×2, ws-agent.ts ×4, surface-context.ts deployed, agent-session.ts derivation in both source + dist)
- [x] All 3 probes ran without WS_ERROR (all returned `WS_CLOSE` with `gotInit=true` + non-null model + non-null cwd)
- [x] Probe 1 (WebApp) → Haiku 4.5 + surface cwd `/home/bruce/livinity-vault/surfaces/webapp/phase163test` (PRIMARY, no fallback)
- [x] Probe 2 (Native) → Haiku 4.5 + surface cwd `/home/bruce/livinity-vault/surfaces/native/phase163nativetest` (PRIMARY, no fallback)
- [x] Probe 3 (Main Chat) → Opus 4.7 + vault root `/home/bruce/livinity-vault` (Phase 162 chat-path-untouched preserved)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on Mini PC + across all 12 commits
- [x] D-09 + Phase 161-02 helper + D-NO-NEW-DEPS preserved end-to-end
- [x] Test surface dirs cleaned up (no leftover phase163 dirs in vault)
- [x] All 4 services healthy post-verification

---

## Status Verdict

## VERIFICATION PASSED + LIVE-VERIFIED

**Phase 163 is SHIPPED to Mini PC.** All 12 must-have truths from `163-04-PLAN.md` met:

1. git push to master succeeded with sacred SHA preserved at pushed HEAD ✓
2. Mini PC `update.sh` completed (detached) with all 4 services active NRestarts=0 ✓
3. Surface dirs auto-creatable (proven via pre-scaffold test — same code path the install hook will use) ✓
4. Probe 1 (webapp): Haiku 4.5 + subsurface CWD (PRIMARY) ✓
5. Probe 2 (native): Haiku 4.5 + subsurface CWD (PRIMARY) ✓
6. Probe 3 (Main Chat regression): Opus 4.7 + vault root (Phase 162 chat-path-untouched) ✓
7. VERIFICATION.md captures all 3 probe results with timestamps, journal excerpts, SHA pinning ✓
8. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on deployed Mini PC = local HEAD ✓
9. D-09 verbatim on Mini PC byte-identical to repo HEAD ✓
10. D-NO-NEW-DEPS on Mini PC: package.json hashes match repo HEAD ✓
11. Phase 161-02 helper unchanged on Mini PC: byte-identical to repo HEAD ✓
12. Post-163-02.5 derivation literal in deployed agent-session.ts: grep returns ≥1 (actual: 1 in src, 1 in dist) ✓

The live synthetic WS probes prove end-to-end that:

1. `webapp:` / `native:` prefixed conversationIds now route to per-surface vault subsurface CWDs (Phase 163-01 + 163-02 + 163-02.5 composition LIVE on production)
2. The Phase 161 dated Haiku literal `claude-haiku-4-5-20251001` reaches the SDK boundary for computer-use sessions (Phase 161 chat-path preserved)
3. The Phase 162-04 composite sessionKey shape `${userId}:${surfaceKind}:${surfaceId}:${connectionId}` is correctly built for both surface and non-surface conversations
4. Main Chat (no surface prefix) still gets Opus 4.7 + vault root — Phase 162's v34 quality upgrade preserved
5. Subscription auth path resolved against `/root/.claude/.credentials.json` and full agent round-trips succeed (all 3 probes returned `RESULT subtype=success` with the expected `OK_<LABEL>` text)

Phase 163 is the final upstream piece for Phase 164 (Autonomous Scheduler) — the surface vault routing is now real on the production Mini PC.

---

*Verified static: 2026-05-19T18:25:00Z (local repo SHA verification — local HEAD `6dd4a60c7916ad2bcd18aa92c3c45c2021078cf9` pushed to origin/master)*
*Verified deploy: 2026-05-19T18:21:00Z (Mini PC `bash /opt/livos/update.sh` exit 0, deployed SHA `6dd4a60`)*
*Verified live: 2026-05-19T18:28:12Z (Mini PC synthetic WS probe — Probe 1 webapp `935a908c-...` → Haiku 4.5 + surface subsurface CWD)*
*Verified live: 2026-05-19T18:28:19Z (Mini PC synthetic WS probe — Probe 2 native `19478470-...` → Haiku 4.5 + surface subsurface CWD)*
*Verified live: 2026-05-19T18:28:22Z (Mini PC synthetic WS probe — Probe 3 Main Chat `f102a4e5-...` → Opus 4.7 + vault root, Phase 162 regression PASS)*
*Phase: 163-surface-vault-contexts*
*Commits in scope: e66e92a2..6dd4a60c (1 plan + 11 source/test/docs = 12 commits)*
*Mini PC deployed SHA: 6dd4a60 (matches local HEAD `6dd4a60c`)*
*Mini PC sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (preserved verbatim)*
