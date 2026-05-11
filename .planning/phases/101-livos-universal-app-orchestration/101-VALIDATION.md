---
phase: 101
slug: livos-universal-app-orchestration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 101 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.9 (existing in livos/packages/livinityd + ui) |
| **Config file** | `livos/packages/livinityd/vitest.config.ts`, `livos/packages/ui/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @livos/livinityd test:run -- --reporter=dot` |
| **Full suite command** | `pnpm -r test:run` |
| **Estimated runtime** | ~30 seconds (livinityd alone), ~90 seconds full |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <changed-package> test:run -- --reporter=dot`
- **After every plan wave:** Run `pnpm -r test:run` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green + Sacred SHA verified
- **Max feedback latency:** 90 seconds (full suite) / 30 seconds (per-package)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 101-01-01 | 01 | 1 | D-101-CHROME-CDP | T-101-01 (CDP port exposure) | Chrome bound to 127.0.0.1:9222 only | unit | `pnpm --filter @livos/livinityd test:run chrome-cdp/bootstrap.test.ts` | ❌ W0 | ⬜ pending |
| 101-01-02 | 01 | 1 | D-101-CHROME-CDP | T-101-01 | Reconnect on Chrome crash within 5s | integration | `pnpm --filter @livos/livinityd test:run chrome-cdp/client.test.ts` | ❌ W0 | ⬜ pending |
| 101-02-01 | 02 | 1 | D-101-PORT-ALLOC | — | Port allocator: 15900-15999 range, no overlap | unit | `pnpm --filter @livos/livinityd test:run streaming/port-allocator.test.ts` | ❌ W0 | ⬜ pending |
| 101-02-02 | 02 | 1 | D-101-PORT-ALLOC | — | releasePort idempotent | unit | same as 101-02-01 | ❌ W0 | ⬜ pending |
| 101-03-01 | 03 | 1 | D-101-NATIVE-APPS | T-101-02 (binary injection) | Redis-stored binary paths validated against execve | unit | `pnpm --filter @livos/livinityd test:run apps/native-app-spawner.test.ts` | ❌ W0 | ⬜ pending |
| 101-03-02 | 03 | 1 | D-101-NATIVE-APPS | — | spawn() with DISPLAY=:1 + detached:true | unit | same as 101-03-01 | ❌ W0 | ⬜ pending |
| 101-04-01 | 04 | 2 | D-101-CDP-SPAWN | T-101-01 | window-manager.spawn() routes via CDP not argv | unit | `pnpm --filter @livos/livinityd test:run webapps/window-manager.test.ts` | ✅ (extend) | ⬜ pending |
| 101-04-02 | 04 | 2 | D-101-CDP-SPAWN | — | WID from getWindowForTarget matches setWindowBounds target | integration | `pnpm --filter @livos/livinityd test:run webapps/window-manager.test.ts` | ✅ (extend) | ⬜ pending |
| 101-05-01 | 05 | 2 | D-101-NATIVE-APPS | T-101-02 | WM_CLASS poll match within 5s timeout | unit | `pnpm --filter @livos/livinityd test:run apps/native-app-binder.test.ts` | ❌ W0 | ⬜ pending |
| 101-05-02 | 05 | 2 | D-101-NATIVE-APPS | — | Port bind on first matching wid | integration | same as 101-05-01 | ❌ W0 | ⬜ pending |
| 101-06-01 | 06 | 2 | D-101-LUSE-CONTEXT | T-101-03 (prompt injection) | activeWid+activeAppMeta sanitized before injection | unit | `pnpm --filter @livos/livinityd test:run ai/agent-session.test.ts` | ✅ (extend) | ⬜ pending |
| 101-06-02 | 06 | 2 | D-101-LUSE-CONTEXT | — | System prompt contains "Active Window Context" snippet | unit | `pnpm --filter @livos/livinityd test:run ai/agent-prompt-builder.test.ts` | ✅ (extend) | ⬜ pending |
| 101-07-01 | 07 | 3 | D-101-NATIVE-APPS | — | Native app form validates binaryPath non-empty + iconUrl pattern | unit | `pnpm --filter @livos/ui test:run dock/native-app-form.test.tsx` | ❌ W0 | ⬜ pending |
| 101-07-02 | 07 | 3 | D-101-NATIVE-APPS | — | tRPC apps.native.create wire works | integration | `pnpm --filter @livos/ui test:run dock/native-app-icon.test.tsx` | ❌ W0 | ⬜ pending |
| 101-08-01 | 08 | 3 | D-101-TEACH-V3 | T-101-04 (popover XSS) | Instruction text sanitized via DOMPurify before render | unit | `pnpm --filter @livos/ui test:run window/teach-popover.test.tsx` | ❌ W0 | ⬜ pending |
| 101-08-02 | 08 | 3 | D-101-TEACH-V3 | — | Click capture via canvas mousedown listener | unit | `pnpm --filter @livos/livinityd test:run webapps/teach-recorder.test.ts` | ✅ (extend) | ⬜ pending |
| 101-08-03 | 08 | 3 | D-101-BACKWARDS-COMPAT | — | v2 skill replay still passes via lazy-translation shim | unit | `pnpm --filter @livos/livinityd test:run skills/skill-replay-tool.test.ts` | ✅ (extend) | ⬜ pending |
| 101-09-01 | 09 | 3 | D-101-CHAT-ANIMS | — | Thinking dots render when isStreaming && messages.length === lastSent | unit | `pnpm --filter @livos/ui test:run window/webapp-floating-action-bar.test.tsx` | ✅ (extend) | ⬜ pending |
| 101-09-02 | 09 | 3 | (Pillar F) | — | RunStore status_detail relays to agent-session WebSocket | unit | `pnpm --filter @livos/livinityd test:run ai/agent-session.test.ts` | ✅ (extend) | ⬜ pending |
| 101-09-03 | 09 | 3 | D-101-CHAT-ANIMS | — | prefers-reduced-motion honored (no animation when set) | unit | `pnpm --filter @livos/ui test:run window/webapp-chat-bottom-bar.test.tsx` | ❌ W0 | ⬜ pending |
| 101-10-01 | 10 | 4 | (UAT) | — | Sacred SHA `f3538e1d…` verified on Mini PC | manual | `ssh bruce@10.69.31.68 'git -C /opt/liv hash-object packages/core/src/sdk-agent-runner.ts'` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts` — stubs for D-101-CHROME-CDP
- [ ] `livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts` — stubs for chrome-remote-interface wrapper
- [ ] `livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts` — stubs for D-101-PORT-ALLOC
- [ ] `livos/packages/livinityd/source/modules/apps/native-app-spawner.test.ts` — stubs for D-101-NATIVE-APPS
- [ ] `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts` — stubs for WM_CLASS binding
- [ ] `livos/packages/ui/src/modules/dock/native-app-form.test.tsx` — stubs for dock UI form
- [ ] `livos/packages/ui/src/modules/dock/native-app-icon.test.tsx` — stubs for dock icon
- [ ] `livos/packages/ui/src/modules/window/teach-popover.test.tsx` — stubs for Teach v3 popover
- [ ] `livos/packages/ui/src/modules/window/webapp-chat-bottom-bar.test.tsx` — stubs for idle pulse + prefers-reduced-motion
- [ ] Install `chrome-remote-interface@^0.34.0` + `@types/chrome-remote-interface@^0.33.0` in livinityd workspace

*Shared fixtures: existing `vitest.config.ts` + `__mocks__/` directory already covers most patterns. CDP mock pattern documented in RESEARCH.md.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multiple WebApps same Google login | D-101-SHARED-PROFILE | Requires real Google auth state | Open 2 WebApps in dock, verify top-right shows same `lucyfeilu123@gmail.com` |
| Antigravity IDE spawns + streams | D-101-NATIVE-APPS | Requires real native binary install on Mini PC | Install Antigravity, add via dock form, click icon, verify stream window appears |
| Teach v3 popover anchored at click point | D-101-TEACH-V3 | Visual placement check | Click on stream, verify popover appears at click coords (±5px) |
| Chat thinking dots visually | D-101-CHAT-ANIMS | Animation timing visual | Send chat msg, observe dots before first token |
| Per-tool Hermes phrase | Pillar F | Real agent run | Run agent task that calls list_windows, verify "Listing windows..." appears in status bar |
| 20-row UAT walk on Mini PC | (UAT) | Live system | Run UAT-CHECKLIST.md against deployed Mini PC |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
