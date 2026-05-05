# v32 UAT Checklist — Mini PC Walk-Through

**Audience:** the user, walking the live system on the Mini PC after `bash /opt/livos/update.sh` completes for the v32 ship batch.

**Pre-flight:**
- Mini PC reachable at `bruce@10.69.31.68` (ZeroTier up — see memory if peer dropped)
- `bash /opt/livos/update.sh` ran, no errors at end
- `systemctl status livos liv-core liv-worker` all green
- Browser: open https://bruce.livinity.io/ (or your bookmarked LivOS frontend URL)

**Legend:**
- **ACTION** — what to do
- **EXPECTED** — what should happen
- **PASS** / **FAIL** / **NOTES** — write your result. Use NOTES for partial passes / quirks worth recording.

---

## A. Visual / Theme

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| A1 | Open https://bruce.livinity.io/ | Desktop loads, dock visible at bottom, no console errors | [ ] PASS  [ ] FAIL  NOTES: |
| A2 | Click AI Chat icon in dock | v32 chat window opens (NOT legacy igrenc UI). New empty state with Liv suggestion pills visible | [ ] PASS  [ ] FAIL  NOTES: |
| A3 | Locate ThemeToggle in v32 chat header (right side, sun/moon icon) | Visible; clicking opens dropdown with Light / Dark / System | [ ] PASS  [ ] FAIL  NOTES: |
| A4 | Cycle: System → Light → Dark → System | Each switch applies immediately, no flash, no reload | [ ] PASS  [ ] FAIL  NOTES: |
| A5 | Reload page after picking Light | Theme persists (does NOT reset to System) | [ ] PASS  [ ] FAIL  NOTES: |
| A6 | Open `/playground/v32-theme` (paste URL or use direct link) | All primitives render (cards / buttons / badges / inputs); ThemeToggle present; both themes preview correctly | [ ] PASS  [ ] FAIL  NOTES: |
| A7 | Open `/playground/v32-tool-views` | All 9 view types render with fixture data (browser screenshot, command output, file diff, str-replace, web-search, web-crawl, web-scrape, MCP, generic). 2-col grid. | [ ] PASS  [ ] FAIL  NOTES: |
| A8 | In LIGHT theme, read body text (assistant message prose, agent card descriptions, secondary metadata) | Text feels readable — secondary/metadata lines no longer "washed out" (post P91 WCAG fix). No paragraph appears low-contrast. | [ ] PASS  [ ] FAIL  NOTES: |

---

## B. Chat surface (v32)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| B1 | Open AI Chat from dock | Lands on v32 (NOT legacy /ai-chat) — verifiable: empty-state design with 4 prompt suggestion pills + agent emoji + light theme aware | [ ] PASS  [ ] FAIL  NOTES: |
| B2 | Locate Agent Selector dropdown (compact pill near header or in composer) | Dropdown shows 5 seed agents: Liv Default, Researcher, Coder, Computer Operator, Data Analyst | [ ] PASS  [ ] FAIL  NOTES: |
| B3 | Pick "Liv Default", type "Hello, can you tell me about yourself?", hit Enter | Composer clears; assistant message starts streaming | [ ] PASS  [ ] FAIL  NOTES: |
| B4 | Watch the streaming text | Tokens append with caret animation; caret hugs the last token | [ ] PASS  [ ] FAIL  NOTES: |
| B5 | While streaming, observe area above composer | StatusDetailCard visible: animated icon (pulsing dots / wrench / hourglass) + phrase ("Pondering…", "Contemplating…", etc — Hermes verbs) + elapsed time ms counter | [ ] PASS  [ ] FAIL  NOTES: |
| B6 | When complete, send: "List files in /tmp" | Tool pill appears inline in the thread (gradient pill with tool name + status); ToolCallPanel auto-opens on right side (480px wide, slides in from right) | [ ] PASS  [ ] FAIL  NOTES: |
| B7 | Inside ToolCallPanel: drag the slider scrubber | Position scrubs through tool calls. Mode badge changes from "Live" (green pulsing dot) to "Manual" (amber static dot). "Jump to Live" pill becomes visible. | [ ] PASS  [ ] FAIL  NOTES: |
| B8 | Click "Jump to Live" pill | Mode returns to Live, slider snaps to last tool call | [ ] PASS  [ ] FAIL  NOTES: |
| B9 | Press Cmd+I (or Ctrl+I on Linux) | ToolCallPanel closes (slides off right edge) | [ ] PASS  [ ] FAIL  NOTES: |
| B10 | Send another tool-triggering message | Panel re-opens automatically (auto-open re-armed) | [ ] PASS  [ ] FAIL  NOTES: |
| B11 | Watch the chat width when panel opens/closes | Chat content area shifts (sidebar event listener `liv-sidebar-toggled` working) — no horizontal scroll, no clipped content | [ ] PASS  [ ] FAIL  NOTES: |

---

## C. Bytebot via Computer Operator agent

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| C1 | Switch agent dropdown to "Computer Operator" | Selection persists; agent badge updates | [ ] PASS  [ ] FAIL  NOTES: |
| C2 | Send: "Take a screenshot of the desktop" | Tool pill appears: `mcp_bytebot_screenshot` (or similar); ToolCallPanel auto-opens; image of Mini PC desktop renders inside the BrowserToolView (P83) | [ ] PASS  [ ] FAIL  NOTES: |
| C3 | Verify the screenshot is the actual Mini PC GNOME desktop (per P79 stack: scrot subprocess + GDM XAUTHORITY) | Real screenshot visible; not a black frame, not a placeholder | [ ] PASS  [ ] FAIL  NOTES: |
| C4 | Send: "Click on the time in the top right" (or any low-stakes click) | Tool call executes, screenshot updates; agent narrates the action | [ ] PASS  [ ] FAIL  NOTES: |

---

## D. Agents management

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| D1 | Click Agents icon in dock (new in P90) | /agents window opens; 4-col responsive grid renders | [ ] PASS  [ ] FAIL  NOTES: |
| D2 | Verify the 5 seed agents are visible (Liv Default + Researcher + Coder + Computer Operator + Data Analyst) | All 5 present with distinct emoji + color zone + name + description | [ ] PASS  [ ] FAIL  NOTES: |
| D3 | Click any seed agent | Two-pane editor opens: left pane Manual + Agent Builder Beta tabs; right pane preview chat | [ ] PASS  [ ] FAIL  NOTES: |
| D4 | Edit the agent name, wait 500ms | "Saved" pill appears (debounced autosave) | [ ] PASS  [ ] FAIL  NOTES: |
| D5 | Click "+ New Agent" button | Blank agent created; navigates to /agents/:id editor | [ ] PASS  [ ] FAIL  NOTES: |
| D6 | Try to delete the seed "Liv Default" | Delete affordance is HIDDEN (X button absent for system seeds) | [ ] PASS  [ ] FAIL  NOTES: |
| D7 | Try to delete the user-created agent from D5 | Confirm dialog appears; on confirm, agent removed; CASCADE cleans up related records | [ ] PASS  [ ] FAIL  NOTES: |

---

## E. Marketplace

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| E1 | Click Marketplace icon in dock (new in P90) | /marketplace window opens; hero "Discover Agents" + filters + 4-col grid | [ ] PASS  [ ] FAIL  NOTES: |
| E2 | Verify 5 seed agents visible (all is_public=true) | 5 cards render with avatarColor zones + tag badges + creator/date | [ ] PASS  [ ] FAIL  NOTES: |
| E3 | Click "+ Add to Library" on a seed (e.g. Researcher) | Toast: "Added to Library" (or similar success); agent appears in /agents grid | [ ] PASS  [ ] FAIL  NOTES: |
| E4 | Type "researcher" in search input | After ~300ms (debounce), grid filters to matching agents | [ ] PASS  [ ] FAIL  NOTES: |
| E5 | Change sort dropdown to "Most downloaded" | Order changes; cards re-arrange | [ ] PASS  [ ] FAIL  NOTES: |
| E6 | Click a tag chip in the filter strip | Grid filters to agents tagged with that tag | [ ] PASS  [ ] FAIL  NOTES: |
| E7 | Click "All" sentinel | Filter clears; full grid restored | [ ] PASS  [ ] FAIL  NOTES: |

---

## F. MCP single source of truth

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| F1 | Open /agents/:id editor for any agent | "MCP Servers" section visible (P84 MCPConfigurationNew) — shows ConfiguredMcpList | [ ] PASS  [ ] FAIL  NOTES: |
| F2 | Click "+ MCP Server" button | BrowseDialog modal opens with sidebar (categories) + grid (server cards) | [ ] PASS  [ ] FAIL  NOTES: |
| F3 | Locate source pill at top of dialog | Two pills: "Official" (default, enabled) and "Smithery" (disabled, tooltip explaining "Add API key in Settings to enable") | [ ] PASS  [ ] FAIL  NOTES: |
| F4 | Type a search query (e.g. "github") | Server cards filter; search debounced | [ ] PASS  [ ] FAIL  NOTES: |
| F5 | Click any server card | ConfigDialog opens with credentials form (driven by configSchema) + tool-selection checkboxes | [ ] PASS  [ ] FAIL  NOTES: |
| F6 | Fill required credentials and submit | Dialog closes; ConfiguredMcpList shows the new server with color pill (per `getMCPServerColor`) | [ ] PASS  [ ] FAIL  NOTES: |
| F7 | Click the X / Remove button on the new server | Confirmation; server removed from agent | [ ] PASS  [ ] FAIL  NOTES: |

---

## G. Keyboard shortcuts

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| G1 | From any v32 chat state, press Cmd+K (or Ctrl+K) | ChatComposer textarea focuses | [ ] PASS  [ ] FAIL  NOTES: |
| G2 | After a streaming assistant reply has completed, press Cmd+Shift+C | The last assistant message text is copied to clipboard; paste anywhere to verify | [ ] PASS  [ ] FAIL  NOTES: |
| G3 | With ToolCallPanel open, press Cmd+I | Panel closes | [ ] PASS  [ ] FAIL  NOTES: |
| G4 | With ToolCallPanel closed, press Cmd+I | NO action — panel stays closed (close-only shortcut) | [ ] PASS  [ ] FAIL  NOTES: |

---

## H. Redirects + cleanup

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| H1 | In browser address bar, navigate directly to /agent-marketplace | Browser network tab shows 301 redirect → /marketplace; v32 marketplace page loads | [ ] PASS  [ ] FAIL  NOTES: |
| H2 | Inspect dock from desktop | mcp-panel sidebar tab is GONE (was retired in P84/P90); Agents + Marketplace icons visible adjacent to AI Chat | [ ] PASS  [ ] FAIL  NOTES: |
| H3 | Look in routes/ai-chat — confirm legacy chat module still reachable for grace period (advanced; CL-02 in v33 will delete it) | If you check, the directory still exists on disk; routing-wise only v32 is mounted via dock | [ ] PASS  [ ] FAIL  NOTES: |
| H4 | Refresh dock-AI-Chat: ensure window opens v32 (Suna-port aesthetic) | Confirms route swap from D-90-01 | [ ] PASS  [ ] FAIL  NOTES: |

---

## I. Backend (Hermes patterns) — DEV TOOLS

These need terminal access on Mini PC. SKIP and write NOTES if not feasible during this UAT walk; they're verified by liv-core tests (see static smoke in 91-SUMMARY.md).

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| I1 | SSH to Mini PC. Run: `curl -X POST -H 'Content-Type: application/json' -d '{"task":"echo test","agentId":"<liv-default-uuid>"}' http://localhost:3200/api/agent/start` | Returns runId + 200 | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |
| I2 | Subscribe to SSE: `curl -N http://localhost:3200/api/agent/runs/<runId>/stream` | SSE chunks stream; grep for `status_detail` chunk type — appears at every assistant turn with `phase` + `phrase` + `elapsed` payload | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |
| I3 | Construct an /api/agent/start request with `maxIterations:2` and a task forcing > 2 iterations | Stream emits an error chunk with code MAX_ITERATIONS after the budget breach; loop terminates | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |
| I4 | While agent is running, send `{type:'steer','guidance':'be brief'}` over the WebSocket session at /ws/agent | Next assistant turn reflects guidance (e.g. response shorter or mentions brevity) | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |

---

## J. Sacred / regression (CRITICAL — do not skip)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| J1 | On Mini PC: `git -C /opt/livos hash-object liv/packages/core/src/sdk-agent-runner.ts` (if /opt/livos is git-tracked) OR check repo: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | Returns exactly `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | [ ] PASS  [ ] FAIL  NOTES: |
| J2 | `systemctl status liv-core` | Active (running); no restart loop in last 10 min | [ ] PASS  [ ] FAIL  NOTES: |
| J3 | `systemctl status livinityd` (called `livos.service` per memory) | Active (running); no restart loop | [ ] PASS  [ ] FAIL  NOTES: |
| J4 | `systemctl status liv-memory` | MAY still be in restart loop (pre-existing per memory note `liv-memory.service` — `update.sh` doesn't build memory dist). NOT a v32 regression. Mark NOTES if observed. | [ ] PASS  [ ] FAIL  [ ] PRE-EXISTING  NOTES: |
| J5 | `systemctl status liv-worker` | Active (running) | [ ] PASS  [ ] FAIL  NOTES: |
| J6 | Browser console (F12) on the v32 chat page | No new red errors. Pre-existing warnings (chunk-size, fontsource decode) are acceptable. | [ ] PASS  [ ] FAIL  NOTES: |
| J7 | After completing all sections, scroll up — overall feel of v32 chat | "WOW" reaction (per v32 Definition of Done section 6 line 273). Subjective; record reaction in NOTES. | [ ] PASS  [ ] FAIL  NOTES: |

---

## Sign-off

- **Date walked:** ____________________
- **Walker:** ____________________
- **Overall result:** [ ] PASS — v32 milestone signs off  [ ] FAIL — defects to file in v33 carryover
- **Defects to file:**
  - ___
  - ___
  - ___
- **Subjective vibe (LIGHT theme readability post P91 WCAG fix):** ____________________
- **Subjective vibe (overall v32 vs old igrenc /ai-chat):** ____________________

---

*Generated by Phase 91. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved. Mini PC walk; not auto-executable.*
