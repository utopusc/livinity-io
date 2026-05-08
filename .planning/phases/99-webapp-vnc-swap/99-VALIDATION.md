---
phase: 99
slug: webapp-vnc-swap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 99 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 99-RESEARCH.md §"Validation Architecture" (lines 679-726).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (livinityd: `npm test`; UI: `pnpm --filter ui test`) |
| **Config file** | `livos/packages/livinityd/vitest.config.ts` (existing); `livos/packages/ui/vitest.config.ts` (existing) |
| **Quick run command** | `cd livos/packages/livinityd && npm test -- streaming webapps server` |
| **Full suite command** | `cd livos/packages/livinityd && npm test && pnpm --filter ui test` |
| **Estimated runtime** | ~2-5 seconds (livinityd scoped); ~20-30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick command (~2-5s)
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite green AND Mini PC live verification PASSED
- **Max feedback latency:** ~5 seconds (scoped); ~30 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 99-01-* | 01 | 1 | V33-VNC-01 | T-99-Mutter | Mini PC RFB handshake `nc localhost <port> | head -c 12` returns `RFB 003.008\n` | smoke (manual) | `bash` script over SSH | ❌ W0 — verification script | ⬜ pending |
| 99-02-* | 02 | 2 | V33-VNC-02 | T-99-DoS-Slow | Bridge drops `bufferedAmount > 4 MB` | unit | `vitest streaming/vnc-bridge.test.ts -t "backpressure"` | ❌ W0 — `vnc-bridge.test.ts` to be created | ⬜ pending |
| 99-02-* | 02 | 2 | V33-VNC-02 | — | spawn argv contains `-id`, `-rfbport`, `-localhost`, `-shared`, `-forever`, `-noxdamage`, `-nopw` | unit | `vitest streaming/vnc-bridge.test.ts -t "spawn argv"` | ❌ W0 | ⬜ pending |
| 99-02-* | 02 | 2 | V33-VNC-02 | — | bridge byte-pipe forwards both directions unmodified | unit | `vitest streaming/vnc-bridge.test.ts -t "byte pipe"` | ❌ W0 | ⬜ pending |
| 99-02-* | 02 | 2 | V33-VNC-02 | — | close propagation: ws→tcp.destroy, tcp→ws.close(1011), ws.error→tcp.destroy, tcp.error→ws.close(1011) | unit | `vitest streaming/vnc-bridge.test.ts -t "close propagation"` | ❌ W0 | ⬜ pending |
| 99-03-* | 03 | 2 | V33-VNC-03 | — | StreamManager discriminated-union: `kind:'fmp4'` vs `kind:'vnc'` start/stop both work | unit | `vitest streaming/stream-manager.test.ts -t "stopStream vnc kind"` | ✅ Existing — extend `stream-manager.test.ts` | ⬜ pending |
| 99-03-* | 03 | 2 | V33-VNC-03 | T-99-CrossUser | `/ws/stream/:streamId` ownership check 404s on cross-user (existing pattern unchanged) | unit / source-string | `vitest server/ws-stream.test.ts -t "VNC dispatch"` | ✅ Existing — extend `ws-stream.test.ts` | ⬜ pending |
| 99-04-* | 04 | 3 | V33-VNC-04 | — | window-gone cascade fires `vnc-bridge.stop` (SIGTERM x11vnc) | unit | `vitest webapps/window-manager.test.ts -t "vnc-window cleanup"` | ✅ Existing — extend `window-manager.test.ts` | ⬜ pending |
| 99-04-* | 04 | 3 | V33-VNC-04 | — | UI no-regression: `use-webapp-vnc.ts` tests still pass (frontend untouched) | unit | `pnpm --filter ui test use-webapp-vnc` | ✅ Existing | ⬜ pending |
| 99-05-* | 05 | 4 | V33-VNC-05 | T-99-Sacred | Sacred SHA preserved before AND after every commit | smoke (CI gate) | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✅ pattern shipped in P93/P95 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — implementation (covers V33-VNC-02)
- [ ] `livos/packages/livinityd/source/modules/streaming/vnc-bridge.test.ts` — unit tests (byte-pipe, backpressure, close propagation, spawn argv)
- [ ] Modifications to `streaming/stream-manager.test.ts` — add `kind:'vnc'` cases (start, stop, idempotency)
- [ ] Modifications to `webapps/window-manager.test.ts` — add `mode:'vnc-window'` spawn path test
- [ ] Modifications to `server/ws-stream.test.ts` — add VNC-dispatch source-string assertion
- [ ] Mini PC verification bash script (one-shot, embedded in plan 99-01, not a recurring CI job)
- [ ] UAT-CHECKLIST.md addition under `.planning/phases/98-uat-polish/` — single row "WebApp window opens with live RFB stream + bidirectional input"

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| x11vnc spawn produces a working RFB stream under Mutter on bruce's GDM session | V33-VNC-01 | Requires live X server + bruce's actual session (cannot CI under Wayland or stubbed X) | `ssh bruce@10.69.31.68 'echo $XDG_SESSION_TYPE'` (must be `x11`); spawn `google-chrome --new-window about:blank`; xdotool capture wid; spawn `x11vnc -id <wid> -rfbport 15999 -localhost -shared -forever -noxdamage -nopw &`; `nc 127.0.0.1 15999 \| head -c 12` must return `RFB 003.008\n` |
| End-to-end UAT: WebApp click → noVNC handshake → mouse click in noVNC fires xdotool input → real Chrome reacts | V33-VNC-04 | Live UI + real WebApp + real Chrome session required | Update `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` with new row; user-walk via Mini PC after deploy |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (scoped) / 30s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
