---
phase: 102
slug: per-app-display-pivot
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 102 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

Phase 102 has NO separate Wave 0 stub plan — each plan creates its own test files inline as Task 1 (RED phase per TDD). Wave 0 is implicit; `wave_0_complete: true` is flipped by 102-01 Task 1.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.9 (existing in livinityd + ui packages, scripts in Phase 101 101-00) |
| **Config file** | `livos/packages/livinityd/vitest.config.ts`, `livos/packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @livos/livinityd test:run -- --reporter=dot` |
| **Full suite command** | `pnpm -r test:run` |
| **Estimated runtime** | ~30s (livinityd unit) / ~90s full (incl. UI) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <changed-package> test:run -- --reporter=dot <changed-file-pattern>`
- **After every plan wave:** Run `pnpm --filter @livos/livinityd test:run -- --reporter=dot && pnpm --filter @livos/ui test:run -- --reporter=dot`
- **Before `/gsd-verify-work`:** Full suite must be green + Sacred SHA verified
- **Max feedback latency:** 90s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 102-01-01 | 01 | 1 | D-102-DISPLAY-ALLOCATOR | — | range [10, 100), idempotent release | unit | `pnpm --filter @livos/livinityd test:run streaming/display-allocator.test.ts` | ❌ create | ⬜ pending |
| 102-01-02 | 01 | 1 | D-102-PER-APP-XVFB | — | xvfb-spawner readiness wait + cleanup | unit | `pnpm --filter @livos/livinityd test:run streaming/xvfb-spawner.test.ts` | ❌ create | ⬜ pending |
| 102-02-01 | 02 | 1 | D-102-PER-APP-CHROME | T-102-02 (Chrome arg injection) | URL validated (no shell-meta) before --app= | unit | `pnpm --filter @livos/livinityd test:run webapps/chrome-process-spawner.test.ts` | ❌ create | ⬜ pending |
| 102-02-02 | 02 | 1 | D-102-PER-APP-CHROME | — | --start-fullscreen + --app=URL + --user-data-dir per-app verified in argv | unit | same as 102-02-01 | ❌ create | ⬜ pending |
| 102-03-01 | 03 | 1 | D-102-MASTER-PROFILE-SEED | T-102-03 (path traversal) | dest path must be /tmp/livos-chrome-app-<uuid> (regex) | unit | `pnpm --filter @livos/livinityd test:run chrome-master/profile-seeder.test.ts` | ✅ created | ✅ green |
| 102-03-02 | 03 | 1 | D-102-MASTER-PROFILE-SEED | — | Cookies + Login Data + Local State copied; cleanup on app close | integration | same as 102-03-01 | ✅ created | ✅ green |
| 102-04-01 | 04 | 2 | D-102-PER-APP-XVFB | T-102-02 | window-manager.spawn() routes via XvfbSpawner+ChromeProcessSpawner not CDP | unit | `pnpm --filter @livos/livinityd test:run webapps/window-manager.test.ts` | ✅ (extend) | ⬜ pending |
| 102-04-02 | 04 | 2 | D-102-PHASE-101-SALVAGE | — | --app=URL flag REPLACES CDP createTarget in spawn body | unit | same as 102-04-01 | ✅ (extend) | ⬜ pending |
| 102-04-03 | 04 | 2 | D-102-CLOSE-LIFECYCLE | — | close() invokes Chrome+x11vnc+Xvfb kill + /tmp rm | unit | same as 102-04-01 | ✅ (extend) | ⬜ pending |
| 102-05-01 | 05 | 2 | D-102-NATIVE-APP-PARITY | — | native-app-binder uses DisplayAllocator+XvfbSpawner (no WM_CLASS poll on shared :1) | unit | `pnpm --filter @livos/livinityd test:run apps/native-app-binder.test.ts` | ✅ (extend) | ⬜ pending |
| 102-05-02 | 05 | 2 | D-102-NATIVE-APP-PARITY | — | native app spawns with DISPLAY=:N env | integration | same as 102-05-01 | ✅ (extend) | ⬜ pending |
| 102-06-01 | 06 | 2 | D-102-LUSE-DISPLAY-SCOPING | T-102-06 (display injection) | LUSE_TARGET_DISPLAY pattern match `:[1-9][0-9]?$` (1..99) | unit | `pnpm --filter @livos/livinityd test:run livinity-broker/agent-runner-factory.test.ts` | ✅ (extend) | ✅ green |
| 102-06-02 | 06 | 2 | D-102-LUSE-DISPLAY-SCOPING | — | agent-prompt-builder injects "Active Display Context" snippet with :N + bounds | unit | `pnpm --filter @livos/livinityd test:run ai/agent-prompt-builder.test.ts` | ✅ (extend) | ❌ red |
| 102-06-03 | 06 | 2 | D-102-LUSE-DISPLAY-SCOPING | T-102-06 | mcp/server.ts reads LUSE_TARGET_DISPLAY env, scopes X11 ops to that display | unit | `pnpm --filter @livos/livinityd test:run computer-use/mcp/server.test.ts` | ❌ create or extend | ❌ red |
| 102-07-01 | 07 | 3 | D-102-MASTER-LOGIN-UI | T-102-07 (admin gate) | adminProcedure on chromeMaster.startLogin mutation | unit | `pnpm --filter @livos/livinityd test:run chrome-master/master-login-routes.test.ts` | ❌ create | ⬜ pending |
| 102-07-02 | 07 | 3 | D-102-MASTER-LOGIN-UI | — | UI affordance renders + tRPC mutation fires | unit (RTL) | `pnpm --filter @livos/ui test:run settings/master-chrome-login.test.tsx` | ❌ create | ⬜ pending |
| 102-08-01 | 08 | 3 | D-102-CLOSE-LIFECYCLE | — | close order: Chrome SIGTERM→SIGKILL→x11vnc→Xvfb→rm /tmp→release port+display | unit | `pnpm --filter @livos/livinityd test:run webapps/window-manager.test.ts` | ✅ (extend) | ⬜ pending |
| 102-08-02 | 08 | 3 | D-102-CLOSE-LIFECYCLE | — | idempotent close (re-call no-op) | unit | same as 102-08-01 | ✅ (extend) | ⬜ pending |
| 102-09-01 | 09 | 3 | D-102-X11VNC-WHOLE-DISPLAY | — | vnc-bridge spawn x11vnc with -display :N (not -id <wid>) | unit | `pnpm --filter @livos/livinityd test:run streaming/vnc-bridge.test.ts` | ✅ (extend) | ⬜ pending |
| 102-09-02 | 09 | 3 | D-102-X11VNC-WHOLE-DISPLAY | — | stream-manager VncDisplayTarget variant routes to display-mode spawn | unit | `pnpm --filter @livos/livinityd test:run streaming/stream-manager.test.ts` | ✅ (extend) | ⬜ pending |
| 102-10-01 | 10 | 4 | (UAT) | — | Sacred SHA `f3538e1d…` verified on Mini PC | manual | `ssh bruce@10.69.31.68 'git -C /opt/liv hash-object packages/core/src/sdk-agent-runner.ts'` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan. Each plan creates its test stubs in Task 1 (RED). Wave 0 flag flipped by 102-01 Task 1 (first plan):
- [ ] `livos/packages/livinityd/source/modules/streaming/display-allocator.test.ts` — stubs for D-102-DISPLAY-ALLOCATOR (102-01 Task 1)
- [ ] `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.test.ts` — stubs for XvfbSpawner readiness + cleanup (102-01 Task 2)
- [ ] `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.test.ts` — stubs for ChromeProcessSpawner args validation (102-02 Task 1)
- [ ] `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.test.ts` — stubs for MasterProfileSeeder (102-03 Task 1)
- [ ] `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.test.ts` — stubs for tRPC routes (102-07 Task 1)
- [ ] `livos/packages/ui/src/modules/settings/master-chrome-login.test.tsx` — stubs for UI affordance (102-07 Task 3)
- [ ] `livos/packages/livinityd/source/modules/computer-use/mcp/server.test.ts` — extend or create for LUSE_TARGET_DISPLAY env handling (102-06 Task 3)

*Shared fixtures: existing `vitest.config.ts` + `__mocks__/` directory covers most patterns. CDP mock pattern NOT needed (no CDP in Phase 102 v1). Subprocess mock pattern is `vnc-bridge.ts:87-160` factory-injection style.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Master Chrome Login UX flow | D-102-MASTER-LOGIN-UI | Real Chrome on bruce's :0 + Google OAuth flow | Settings → Chrome Master Login → log in → close → confirm `/opt/livos/data/chrome-master/Default/Cookies` has Google auth tokens |
| Multiple WebApps same Google login | D-102-MASTER-PROFILE-SEED | Visual verification of profile inheritance | Open 2 WebApps in dock, verify top-right shows same `lucyfeilu123@gmail.com` (or active account) |
| Per-app Xvfb at 1280x720 (no 1920x1080 drift) | D-102-PER-APP-XVFB | Real Mini PC + Luse screenshot | Open WebApp, run Luse `computer_screenshot`, verify returned image is 1280x720 (not 1920x1080) |
| Chrome fullscreen with no chrome chrome | D-102-PER-APP-CHROME | Visual check | Open WebApp, verify stream shows ONLY app content (no tabs, no address bar) |
| Window overlap impossible | D-102-PER-APP-XVFB | Concurrent visual check | Open 5 WebApps + 2 native apps, verify zero stream contamination (each shows ONLY its own app) |
| Antigravity IDE spawn + stream | D-102-NATIVE-APP-PARITY | Real binary install on Mini PC | Install Antigravity, add via dock form, click icon, verify stream window shows Antigravity at 1280x720 |
| App close clean lifecycle | D-102-CLOSE-LIFECYCLE | Verify zero zombie processes | Close WebApp, `pgrep -af 'Xvfb \|x11vnc\|chrome.*livos-chrome-app'` should not include that app's instances; `ls /tmp/livos-chrome-app-*` should not list closed app's dir |
| 25-row UAT walk on Mini PC | (UAT) | Live system | Run UAT-CHECKLIST.md against deployed Mini PC |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or per-plan Wave 0 stub
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter (flipped after all Wave 1-3 plans complete + test gate passes)
- [ ] `wave_0_complete: true` flipped by 102-01 Task 1 (first plan in Wave 1)

**Approval:** pending
