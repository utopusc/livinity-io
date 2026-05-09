---
phase: 100-multi-stream-window-redesign
plan: 05
status: partial-pass
date: 2026-05-08
---

# Phase 100-05 SUMMARY

**Date:** 2026-05-08
**Outcome:** Deploy GREEN; UAT in progress (user-walked checkpoint).

## Deploy

### git push origin master
- Pre-push HEAD: `4954d9ba8723f1f8d06aede91693bad1c4dd43ea`
- Push range: `66f6b75e..4954d9ba` (21 commits — Phase 100 planning iterations + 13 execution commits across 100-01..100-04)
- Post-push: `git status` clean against `origin/master`; remote HEAD == local HEAD == `4954d9ba…`
- Sacred SHA pre-push: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓

### Mini PC update.sh
- Wrapper: `/tmp/run-update.sh` invoked `sudo bash /opt/livos/update.sh` with exec-redirect to `/tmp/p100-update.log` and `DONE` sentinel write at completion (per memory `reference_zerotier_unstable.md` — every long Mini PC operation backgrounded).
- Detached PID: `4163618`.
- Duration: ~3-4 min (typical for `pnpm install + UI rebuild + liv core build + service restart`).
- Result: `LivOS updated successfully!` — `[OK] Deployed SHA recorded: 4954d9b`.

### Service status (post-deploy)
| Service | `systemctl is-active` |
|---------|-----------------------|
| `livos.service` | **active** ✓ |
| `liv-core.service` | **active** ✓ |
| `liv-worker.service` | **active** ✓ |
| `liv-memory.service` | **active** ✓ |

### liv-memory carry-over
**NOT TRIGGERED this run.** `liv-memory.service` is `active` (no restart loop). Classifier `journalctl -u liv-memory --since '5 min ago' | grep "Cannot find module .*memory/dist/index.js"` returned no matches because the service is running fine — `update.sh` evidently builds memory's `dist/` correctly on this run. The pre-existing breakage carry-over from MEMORY.md (2026-04-25) appears to have been resolved either by a script change or a transient state — no action required for Phase 100.

### Deployed SHA verification
- `cat /opt/livos/.deployed-sha` → `4954d9ba8723f1f8d06aede91693bad1c4dd43ea` ✓ matches local HEAD
- `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ sacred file UNTOUCHED on Mini PC

### livos service startup log (excerpt)
```
[ai] Tool registry populated from nexus: 66 tools
[ai] AI module started
[livinityd] ComputerUseContainerManager started (5-min idle reaper armed)
[livinityd] Seeded 9 built-in tool manifests to capability registry
[livinityd] Seeded broker model aliases to livinity:broker:alias:*
[streaming] vainfo probe complete (vaapi=true profiles=VAProfileH264High,...)
[streaming] StreamManager started (cap=10)
[webapps] WebAppWindowManager started (5s idle-cleanup poll armed)
[tunnel] Connected! Session: p2pYwrKfzSromrAgsH2YB, URL: https://bruce.livinity.io
[tunnel] Full domain list synced: 1 domain(s)
```
No ERROR / FATAL lines.

## UAT

**Walker:** `bruce` (user) via interactive checkpoint
**Outcome:** **9 / 11 PASS, 2 / 11 FAIL → PARTIAL-PASS**
**Detailed log:** `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` (Phase 100 section appended at file tail)

### Row summary

| # | Criterion | Result |
|---|-----------|--------|
| 1 | WebApp A → port 15900, RFB handshake, Chrome visible | PASS |
| 2 | WebApp B → port 15901, independent stream | PASS |
| 3 | No cross-talk in clicks | **FAIL** (routing bug — input → last-opened wid) |
| 4 | No URL bar (only drag-strip + X) | PASS |
| 5 | Stream area fills the window | PASS |
| 6 | Bottom 4-icon row visible | PASS |
| 7 | Chat icon opens slide-in drawer; close returns | PASS |
| 8 | Teach icon opens recorder UI | PASS |
| 9 | Bytebot Auto in A doesn't disturb B | **FAIL** (chat → bytebot scope routing bug) |
| 10 | Sacred SHA unchanged on Mini PC | PASS |
| 11 | UAT signoff | PARTIAL (rows 3 + 9 FAIL) |

### Why FAIL on rows 3 + 9

**Multi-stream RENDERING works** — the user sees 2 distinct stream windows with different captured Chrome content. B1 (`--app=URL`) successfully broke the Chrome IPC merge at the window-creation layer.

**But input + chat ROUTING does not** — both clicks (Row 3) and chat agent tool calls (Row 9) always target the most-recently-opened WebApp's wid. Diagnosis via in-tree code reading:

- **Click input (Row 3):** `vnc-bridge.ts:59-87 spawnVncForWindow` correctly binds `x11vnc -id <wid>` per stream (Phase 99-01). But x11vnc's `-id` flag binds the **capture target** only — input events received over RFB are forwarded via `XTestFakeKeyEvent`/`XTestFakeMotionEvent` against the X11 display, which by default routes to the **focused** window. Hence clicks always land on whichever Chrome window has X11 focus (= last-opened, due to Chrome's spawn-then-raise behavior).
- **Chat → bytebot scope (Row 9):** `bytebot-mcp-config.ts:200` correctly sets `BYTEBOT_TARGET_WINDOW_ID = String(descriptor.windowId)` per per-WebApp MCP child process spawn (Phase 97). `mcp-client-manager.ts:257 registerWebAppInstance(serverName="bytebot:webapp:<wid>")` registers each as a distinct MCP server. **But** the agent loop's tool list aggregates tools from ALL registered MCP servers without per-chat scoping, so the model picks tools by name-match rather than webapp namespace — and host bytebot (or the most-recent webapp bytebot) wins.

### Plan 100-06 — creative routing-fix queued

Three-prong creative solution proposed (file plan via `/gsd-plan-phase 100-06` next):

1. **Click bypass via xdotool tRPC.** Frontend stream window converts click coords (relative to the stream image) into a tRPC `webapp.input.click({wid, x, y, button})` mutation; backend dispatches `xdotool mousemove --window <wid> <x> <y> click 1` (or `xdotool key --window <wid> <key>`). Bypasses x11vnc input entirely; guaranteed per-wid routing.
2. **Chat MCP scoping.** Each chat surface invocation pins the agent's tool-whitelist to `mcp__bytebot:webapp:<wid>__*` only (host `mcp__bytebot__*` hidden for that chat). System prompt explicitly says "all bytebot tool calls scope to WebApp X (wid=<wid>)". Eliminates scope ambiguity.
3. **Bonus — every bytebot tool call gets explicit `windowId` param.** `tools.ts:98 defaultWindowId` already supports per-call override; frontend passes the explicit wid on every chat-driven tool call rather than relying on env-fallback.

100-06 is autonomous (TDD) once specced. Rough scope: 3-4 plans, 1-2 days.

## Close (PARTIAL-PASS)

Phase 100 closes as **PARTIAL-PASS** (mirrors Phase 99). All 5 plans shipped + deployed:
- 100-01 (sacred-SHA hook + Probe B): SHIPPED
- 100-02 (B1 argv swap): SHIPPED
- 100-03 (full-bleed UI): SHIPPED
- 100-04 (action-bar + drawers): SHIPPED
- 100-05 (deploy GREEN; UAT 9/11 PASS): SHIPPED-PARTIAL

**v33 milestone status:** remains CODE-COMPLETE-PENDING-UAT-SIGNOFF. Does NOT flip to ✅ Shipped until Plan 100-06 lands and Phase 100 UAT re-walks 11/11.

### Sacred SHA timeline (Phase 100, all 21 commits)

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNTOUCHED across:
- 100-01 commits: a6c519fd / bb36e8d1 / f364694c
- 100-02 commits: 3bbcfb2f / 00a5b0bd / 688887fd
- 100-03 commits: ff99ebfd / 6702780c / 684ae493
- 100-04 commits: b2145d09 / b7e19f60 / af77d2e6 / 4954d9ba
- 100-05 deploy: live verification on Mini PC `f3538e1d…`
- Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) fired on every commit and passed every time.

### Carry-overs

- **liv-memory pre-existing breakage:** NOT TRIGGERED on this deploy (service active, no module-not-found in journal). Memory note `feedback_milestone_uat_gate.md` + MEMORY.md "Pre-existing breakage 2026-04-25" can be marked resolved if confirmed across follow-up deploys.
- **Plan 100-01 PLAN.md SSH key drift:** PLAN.md listed `contabo_master` SSH key but actual working key is `minipc` (per memory `reference_minipc_ssh.md`). 100-05 used `minipc` throughout. Future Phase 100-* / 101-* plans should reference the memory-correct path.

### Memory updates pending (for `/gsd-cleanup` or follow-up)

- `feedback_p100_partial_pass.md` — visual ship + multi-stream creation work, but x11vnc input forwarding + chat MCP scoping are next-wave problems. Sacred-SHA pre-commit hook is now live; future phases inherit it without setup.
- `reference_x11vnc_input_semantics.md` — `-id <wid>` binds capture only; input forwards to X11 focused window. For per-window input routing, bypass x11vnc and use `xdotool --window <wid>` server-side.
- `reference_per_webapp_mcp_scoping.md` — bytebot per-WebApp MCP server registration works; the agent loop needs explicit per-chat tool-whitelist filtering for this to manifest as per-window input routing.
