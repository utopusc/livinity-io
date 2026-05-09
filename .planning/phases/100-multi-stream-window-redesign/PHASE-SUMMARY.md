---
phase: 100-multi-stream-window-redesign
status: partial-pass
closed: 2026-05-08
---

# Phase 100 — PHASE-SUMMARY (PARTIAL-PASS)

**Closed:** 2026-05-08
**Outcome:** PARTIAL-PASS (9 / 11 UAT criteria PASS; routing-fix queued for Plan 100-06)
**Verified hypothesis (100-01):** **H1** — Chrome IPC-merges by `--user-data-dir` (single Chrome process for 2× `--app=URL` invocations; +1 distinct uniquely-titled wid per invocation). Probe B on Mini PC `bruce@10.69.31.68`.
**Backend fix (100-02):** **B1** — replaced argv `'--new-window', opts.url` with `` `--app=${opts.url}` `` in `livos/packages/livinityd/source/modules/webapps/window-manager.ts`. Solves V33-MULTI-01 (multi-stream creation) + V33-MULTI-02 bonus (chromeless windows; no URL bar at X11 layer).
**Plans shipped:** 5 / 5
**Commits:** 13 execution commits (+ 8 prior planning iterations) = 21 commits in `66f6b75e..4954d9ba` push range
**Sacred SHA at every commit + at deploy:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED throughout. Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) installed by 100-01 fired on every subsequent commit and passed every time.

## Plan-by-plan

| Plan | Title | Status | SUMMARY |
|------|-------|--------|---------|
| 100-01 | Mini PC kill-gate + sacred-SHA hook | **SHIPPED** | `100-01-SUMMARY.md` (H1 verified, B1 fix locked, sacred hook installed) |
| 100-02 | Backend argv swap → `--app=URL` (V33-MULTI-01) | **SHIPPED** | `100-02-SUMMARY.md` (Test 11 PASS, all 226 tests green) |
| 100-03 | Frontend full-bleed (drop URL bar + ResizablePanelGroup) | **SHIPPED** | `100-03-SUMMARY.md` (-252 lines from `webapp-stream-window.tsx`; `webapp-toolbar.tsx` deleted) |
| 100-04 | Bottom action-bar + 4 slide-in drawers (V33-MULTI-03/04) | **SHIPPED** | `100-04-SUMMARY.md` (4 new drawer files; mode-selector collapsed to constants-only) |
| 100-05 | Mini PC deploy + UAT walk + v33 ✅ flip | **SHIPPED-PARTIAL** | `100-05-SUMMARY.md` (deploy GREEN, UAT 9/11 PASS; routing FAIL → 100-06 queued) |

## Sacred SHA timeline

```
HEAD before Phase 100:  f3538e1d… (sacred SHA)
↓
100-01: a6c519fd / bb36e8d1 / f364694c  → f3538e1d… (hook installed; SHA preserved)
100-02: 3bbcfb2f / 00a5b0bd / 688887fd  → f3538e1d… (gated by hook)
100-03: ff99ebfd / 6702780c / 684ae493  → f3538e1d… (gated by hook)
100-04: b2145d09 / b7e19f60 / af77d2e6 / 4954d9ba  → f3538e1d… (gated by hook)
100-05: deploy `4954d9ba` to Mini PC → f3538e1d… (verified live on `/opt/liv/packages/core/src/sdk-agent-runner.ts`)
↓
HEAD after Phase 100:   f3538e1d… (sacred SHA preserved end-to-end)
```

## v33 ship signal

Phase 100 closes 4 of the 6 V33-MULTI-* requirements (V33-MULTI-01 through V33-MULTI-04 + V33-MULTI-05 partial via deploy gate). The remaining gap is in V33-MULTI-05 itself: the UAT requires 11/11 PASS and we shipped 9/11. The two FAILs (Row 3 click routing + Row 9 chat → bytebot scope) are a single root-cause class — input + tool-call routing don't honor per-WebApp wid scope — and B1 doesn't address them (B1 fixes Chrome window creation, not input forwarding).

**v33 milestone status:** **CODE-COMPLETE-PENDING-UAT-SIGNOFF.** Phases 92-100 all shipped to Mini PC; v33 does NOT flip to ✅ Shipped in ROADMAP.md until Plan 100-06 ships AND Phase 100 UAT re-walks 11/11.

## Plan 100-06 — routing fix (queued)

The user explicitly chose path "(a) ship 100-02..04 + new 100-06 routing-fix" during the 100-01 checkpoint. Creative solution proposed in `100-05-SUMMARY.md`:

1. **Click bypass.** Stream window → tRPC `webapp.input.click({wid, x, y, button})` → backend `xdotool mousemove --window <wid> ... click 1` (or `xdotool key --window <wid>`). Bypasses x11vnc input entirely — guaranteed per-wid routing.
2. **Chat MCP scoping.** Each chat surface pins agent's tool-whitelist to `mcp__bytebot:webapp:<wid>__*` only; host `mcp__bytebot__*` hidden for that chat. System prompt explicitly scopes to "WebApp X (wid=<wid>)".
3. **Explicit windowId on every tool call.** `tools.ts:98 defaultWindowId` already supports per-call override; frontend passes explicit wid on every chat-driven bytebot tool call.

Run `/gsd-plan-phase 100-06` (or `/gsd-discuss-phase 100-06`) when ready to plan it.

## Carry-over (from prior memory; status updated by this phase)

- **liv-memory pre-existing breakage** — NOT TRIGGERED on this deploy. `liv-memory.service` active; no `Cannot find module .../memory/dist/index.js` in journal. Memory `MEMORY.md` "Pre-existing breakage 2026-04-25" can likely be marked resolved after one more clean deploy as confirmation.
- **Plan 100-01 SSH key drift** — PLAN.md `<interfaces>` listed `contabo_master` key, but the working key is `minipc` per memory `reference_minipc_ssh.md`. 100-05 used `minipc`. Phase 101+ plans should reference memory-correct paths.
- **Routing bug (Row 3 + Row 9)** — newly characterized in this phase; fix queued as Plan 100-06.

## Memory updates pending

- `feedback_p100_partial_pass.md` — visual rewire + multi-stream creation shipped; x11vnc input semantics + per-WebApp MCP scoping are next-wave issues. Sacred-SHA pre-commit hook (`.husky/pre-commit`) is now live; subsequent phases inherit it without setup.
- `reference_x11vnc_input_semantics.md` — `x11vnc -id <wid>` binds capture only; input events forward via `XTestFakeKey/MotionEvent` against the X11 display, defaulting to focused window. For per-window input routing, bypass x11vnc and dispatch via `xdotool --window <wid>` server-side.
- `reference_per_webapp_mcp_scoping.md` — `bytebot:webapp:<wid>` per-instance MCP servers ARE registered (Phase 97 wiring confirmed in code); the agent loop needs explicit per-chat tool-whitelist filtering and a webapp-scoped system prompt addendum to manifest as per-window tool routing.

## Push state

- Local HEAD: `4954d9ba8723f1f8d06aede91693bad1c4dd43ea`
- origin/master: `4954d9ba8723f1f8d06aede91693bad1c4dd43ea`
- Mini PC `/opt/livos/.deployed-sha`: `4954d9ba8723f1f8d06aede91693bad1c4dd43ea`
- Mini PC `/opt/liv/packages/core/src/sdk-agent-runner.ts` SHA: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
