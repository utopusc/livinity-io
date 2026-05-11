# Phase 100-10 UAT Checklist

**Mini PC:** bruce@10.69.31.68
**Deploy commit:** `722a2af1` (master HEAD after 100-10-01..12 ship — includes Phase 99 revert + MCP DISPLAY :1 + Redis cleanup + chat-response hoist + per-tool streaming UI + cascade window-position + SelfClaude research)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
**Date:** 2026-05-10
**Plan:** [100-10-07-PLAN.md](100-10-07-PLAN.md) — Mini PC deploy + 15-row UAT walk

---

## How to walk this checklist

For each row:

1. **Command-driven rows** (1, 2, 5, 6, 7, 8, 14, 15) — Claude runs the SSH command and pastes evidence into the Evidence column.
2. **Visual rows** (3, 4, 9, 10, 11, 12, 13) — user observes the behavior in the LivOS UI and types `pass` or `fail` (+ description if fail).
3. Mark each `Result` cell `[x] PASS` or `[ ] FAIL` once observed.

After all 15 rows are walked:
- 15/15 PASS → Claude flips ROADMAP/STATE (Task 4) + writes PHASE-SUMMARY (Task 5).
- < 15/15 → Open hot-fix sub-plans `100-10-08+` for each FAIL row; do NOT flip ROADMAP.

---

## Pre-walk setup

**Open WebApp A** (any app from the LivOS dock) **before starting row 1.** Rows 1, 2, 5 depend on at least one WebApp being open. After row 2 verifies you have 2 concurrent streams, you can close one before row 5+ to keep the test clean.

**Row 8 prerequisite** — enable the `luse_can_create_streams` flag on Mini PC Redis before testing row 8:

```bash
ssh -i /c/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 \
  "sudo bash -c 'source /opt/livos/.env && redis-cli -u \"\$REDIS_URL\" SET liv:config:luse_can_create_streams true'"
```

After row 8 passes, flip back to `false` to restore production-default security:

```bash
ssh ... bruce@10.69.31.68 \
  "sudo bash -c 'source /opt/livos/.env && redis-cli -u \"\$REDIS_URL\" SET liv:config:luse_can_create_streams false'"
```

---

## 15-row UAT table (verbatim from 100-10-CONTEXT.md lines 343-361)

| # | Test | Pass Criteria | Result | Evidence |
|---|------|---------------|--------|----------|
| 1 | `xdpyinfo -display :1` returns valid info | Shared Xvfb `:1` daemon running (Phase 100-08-01 baseline restored by 100-10-08) | [x] | `name of display: :1 / X.Org Foundation / X.Org 21.1.11` (verified pre-UAT) |
| 2 | Open WebApp A then WebApp B (10-08 single-display semantics) | Two Chrome windows on `:1` (same Chrome process, shared profile via singleton). Each has own WID. `x11vnc -id <wid>` captures each independently. NO IPC merge failures, NO timeout, NO same-content stream-cross. | [ ] | _<observe + paste `DISPLAY=:1 xdotool search --name . `>_ |
| 3 | Chrome `--app=URL` windows fit window-size 1280x720 | `xdotool getwindowgeometry <wid>` returns 1280x720 (config-locked) | [ ] | _<observe>_ |
| 4 | Stream area in LivOS WebApp window fills entire window | NO black border below (CSS-cover applied) | [ ] | _<observe>_ |
| 5 | `pgrep -af luse` shows per-WebApp Luse MCP children | Naming reflects rename; not `bytebot` anymore | [ ] | _<paste stdout>_ |
| 6 | `mcp__luse__list_windows` callable from chat | Returns windows on caller's display | [ ] | _<chat invocation + response>_ |
| 7 | `mcp__luse__screenshot_window` callable | Returns base64 PNG of specified wid | [ ] | _<chat invocation + response truncated>_ |
| 8 | `mcp__luse__create_stream` callable (with flag set) | Returns new wsUrl + port | [ ] | _<chat invocation; KNOWN PARTIAL per 100-10-04 SUMMARY: cross-process StreamManager bridge deferred. Tool registers, but MCP child has streamManager=undefined → handler not registered there. UAT row 8 will surface as `tool not available` until follow-up plan adds RPC bridge. Mark FAIL with note "deferred per 10-04 SUMMARY" — does NOT block 100-10 flip if user accepts.>_ |
| 9 | Skill button visible OUTSIDE WebApp window at top-right | Click opens popover with skills | [ ] | _<observe>_ |
| 10 | Auto button gone from floating action bar | Only Chat + Teach (2 icons — Skill is OUTSIDE separately) | [ ] | _<observe>_ |
| 11 | Click Chat icon → input shows | 09-08 state machine intact | [ ] | _<observe>_ |
| 12 | Type + Enter → response streams IN PLACE | Input area replaced by response area | [ ] | _<observe>_ |
| 13 | Stop button visible during streaming | Click Stop → response halts | [ ] | _<observe>_ |
| 14 | Old action_log v2 skills still replayable post-rename | Backwards-compat shim translates `mcp__bytebot__*` → `mcp__luse__*` | [ ] | _<play an existing v2 Teach skill; observe completion>_ |
| 15 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED | `git hash-object` on Mini PC matches | [x] | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified Mini PC post-deploy) |

---

## Walk log

_(Claude fills this section row-by-row as the UAT progresses; user types pass/fail in chat.)_

### Row 15 — sacred SHA on Mini PC ✅ PASS

```
$ sudo bash -c 'cd /opt/liv && git hash-object packages/core/src/sdk-agent-runner.ts'
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

### Row 1 — Display :1 valid ✅ PASS

```
$ DISPLAY=:1 sudo xdpyinfo | head -3
name of display:    :1
version number:    11.0
vendor string:    The X.Org Foundation
```

### Pre-walk auxiliary fixes applied this session (before UAT)

- `livos:system:multi_user` Redis → `false` (was `true` — wrong for v33)
- `liv:config:claude_auth_method` Redis → `sdk-subscription` (was default `api-key`)
- Killed stuck Chrome PID 174391 + cleaned SingletonLock files
- **100-10-08 ship:** revert per-WebApp Xvfb → Phase 99 single-display behavior restored
- **100-10-09 ship:** Luse MCP child DISPLAY=:1 (was :0 — AI was blind to Chrome WebApps); boot-time cleanup of legacy `liv:cap:mcp:bytebot` + `liv:cap:tool:mcp_bytebot_*` Redis keys; McpConfigManager removes orphan `bytebot` entry (UI will now show "luse" instead of "bytebot")
- **100-10-10 ship:** WebApp chat-response wire-up bug fix (Hypothesis 2 root cause: `useWebAppAgent` was double-mounted in ChatInputBar AND ChatResponseBar — separate WS sockets meant the assistant chunks arrived on the closed-on-mode-flip socket; fix: hoisted `useWebAppAgent` to parent `WebAppFloatingActionBar`, passed `agent` as prop). Per-tool streaming line added beneath chat response (`agent.agentStatus.currentTool` renders today; Hermes `phrase` is backend-gap'd per 100-10-10 SUMMARY, Phase 101 sub-goal C).
- **100-10-11 ship:** Per-WebApp cascade window-position (0/120/240/... with 10-slot wrap) — fixes the two-WebApp-overlap bug on shared :1 display.
- **100-10-12 plant:** SelfClaude Teach pattern research artifact + Phase 101 sub-goal B.

### UAT row updates (post 09/10/11 ship)

- **Row 2 (multi-stream):** Now expects 2 WebApps to land at distinct positions (0,0) and (120,120) on shared :1 — they remain visually distinct, both wid's captured independently by x11vnc.
- **Row 5 (pgrep luse):** Should NOT show `bytebot` anywhere after 100-10-09 cleanup.
- **Row 6/7 (mcp__luse__list_windows / screenshot_window):** Should now return Chrome WebApp windows on `:1` (was `:0`).
- **Rows 11-13 (chat-response flow):** Now expected to work end-to-end after 100-10-10 hoist fix.
- **NEW: Row 16 (per-tool streaming):** While streaming, a small status line shows beneath the response area: "Using tool: list_windows..." or similar phrase from `agentStatus.currentTool`. Hermes status_detail `phrase` is backend-gapped — falls back to currentTool display.

### Rows 2-14 — awaiting user walk

User opens WebApp(s) on LivOS UI; Claude SSH-probes Mini PC for rows 2, 5, 6, 7, 8, 14 (command-driven); user observes rows 3, 4, 9, 10, 11, 12, 13 (visual).

### Row 8 prerequisite — set Redis flag before testing

```bash
ssh ... bruce@10.69.31.68 \
  "sudo redis-cli -a 'a3bb23cb283fa2afdd9ad8946166d4505b5679ef107b9565' SET liv:config:luse_can_create_streams true"
```
Then in chat invoke `mcp__luse__create_stream` and observe response. Expected: `{streamId, wsUrl, port}` IF MCP child's cross-process StreamManager bridge is wired. **Known PARTIAL per 100-10-04-SUMMARY:** tool registered in TEST mocks but NOT in production MCP child (streamManager=undefined). User may mark FAIL/partial — does not block 100-10 milestone close per executor's documented deviation.

---

## Tally (filled after walk completes)

- Rows PASS: __/15
- Rows FAIL: __/15
- Known-partial accepted by user: __/15 (e.g. row 8 if user accepts cross-process bridge deferral)
- Decision: __ROADMAP flip / open hot-fix 100-10-08+__

---

## Carryover for v34 (filled at walk close)

- Row 8 cross-process StreamManager bridge — needs RPC/HTTP wire between MCP child process and parent livinityd StreamManager (documented in 100-10-04-SUMMARY)
- _<any UAT-discovered issues>_
