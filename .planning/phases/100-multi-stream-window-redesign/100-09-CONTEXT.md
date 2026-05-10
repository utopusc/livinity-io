# Plan 100-09: Bug Sweep + UX Refinement (Inline Chat + Popup Teach + Detailed Skills)

**Gathered:** 2026-05-10
**Status:** Ready for planning (`/gsd-plan-phase 100-09`)
**Parent context:** `100-CONTEXT.md` (phase-level), `100-08-CONTEXT.md` (sub-plan 100-08)
**Trigger:** User feedback after live-testing Plan 100-08 deploy. Multi-stream + per-WebApp control confirmed working ✅. Six new issues surfaced — 4 bugs + 2 UX rewrites — to be addressed atomically as 6 sub-plans (100-09-01 through 100-09-06).

<scope>
## Plan Boundary

**In scope (six atomic sub-plans):**

1. **100-09-01 — Screenshot resolution fix** — bytebot screenshot tool currently captures full Xvfb display (`1920x1080`). Should capture WebApp window only (`1280x720` or actual wid geometry). Path: `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` — likely needs `maim -i <wid>` instead of `maim` full-display.

2. **100-09-02 — Scroll wheel scroll-down fix** — user reports scroll-down doesn't work (scroll-up may work). Path: investigate noVNC RFB scroll event mapping (button 4 = up, button 5 = down) AND xdotool fallback path. `livos/packages/livinityd/source/modules/webapps/input-dispatcher.ts` for tRPC user-canvas path; `livos/packages/livinityd/source/modules/computer-use/native/input.ts` for bytebot path.

3. **100-09-03 — Mouse smoothness** — bytebot mouse moves are jerky/teleport. Selfclaude pattern: `mousemove --sync` with intermediate steps + `--delay`. Patch `computer-use/native/input.ts` mouse helper to interpolate path with sync sleeps.

4. **100-09-04 — Mouse latency (click → reaction lag)** — investigate. Candidates: x11vnc deferral, xdotool sync flag, RFB queue pile-up. Diagnose first via Mini PC instrumentation, then patch.

5. **100-09-05 — UI rewire: inline chat input at bottom (NO drawer)** — user explicit: "Chat penceresi olmasin sadece yazi yazalim mesela. Yazilar sadece Alt kisimda gozuksun. Butonlar kalsin o sirada." Translation: drop the chat drawer. Add a slim text input below the stream window (between window bottom edge and the floating action-bar from 100-06). Messages render inline at bottom (no panel/drawer). The 4 floating icon buttons (100-06's bar) stay where they are.

6. **100-09-06 — Teach mode rewire: popup-per-click + stop button + save dialog (selfClaude pattern)** — user explicit: "altadki teach mode da da aynisi gecerli tiklandiginda panel acilmasin onun yerine Click yapildiktan sonra Pop up a yazsin step i ve ardindan stop teaching dendiginde dursun ve kullanici bunu skill olarak kaydetsin. Teaching mod da skill kaydedilirken biraz daha detayli kayit edilsin." Translation: drop the teach drawer. When user clicks Teach button, recording starts. Each user action triggers a small toast/popup showing the captured step. Stop Teaching button stops recording. Save dialog asks for skill name. Skill record carries MORE detail than current P96 implementation — at minimum: timestamps, full event coordinates, screenshots per event, optional user annotations.

**Out of scope:**

- Replacing the 100-04 4-drawer architecture wholesale. Auto + Watch drawers stay (per 100-06 D-100-08). Only Chat + Teach drawers affected.
- WebRTC stream upgrade (deferred to v34).
- Multi-user / WebApp sharing.
- Touching `liv/packages/core/src/sdk-agent-runner.ts` (D-100-SACRED, sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`).
- BYOK / Anthropic SDK direct path (D-100-NO-BYOK).
- Server4 (D-100-NO-SERVER4 — Mini PC `bruce@10.69.31.68` only).
- Re-implementing teach mode end-to-end. Only the UX layer (recording trigger + per-click popup + stop+save flow) changes; the underlying P96 action_log schema stays — extended with extra fields for "more detail" per user request.

</scope>

<decisions>
## Implementation Decisions

### D-100-09-A — Bug fixes use surgical patches, not rewrites

Each of 09-01 through 09-04 is a focused bug fix in 1-2 files. No module rewrites. Sentinel grep tests verify behavior change.

### D-100-09-B — UI hybrid: keep current Aurora theme, change layout

Per user: "Mevcut UI i koru sadece daha islevsel hale getir" (Keep current UI, just make it more functional). Aurora theme + Lucide icons + shadcn primitives stay. The CHANGE is layout:
- Chat surface: from Sheet drawer (35% slide-in) → inline text input + message list at bottom of stream window.
- Teach surface: from Sheet drawer → no drawer at all; popup toasts + save modal only.

### D-100-09-C — Chat input affordance — slim text input + collapsible message log

Mockup intent (user's words paraphrased into structure):
```
┌─────────────────────────────────────┐
│  [  STREAM WINDOW (Chrome)  ]       │ ← stream fills majority
├─────────────────────────────────────┤
│  💬 Last 3 messages (collapsible)   │ ← message log, slim, expandable
├─────────────────────────────────────┤
│  [text input ............ ] [send]  │ ← chat input always visible
└─────────────────────────────────────┘
                                       
              [💬] [🎓] [👁] [🤖]      ← floating bar from 100-06 (unchanged)
```

The 4 floating icon buttons from 100-06 STAY (per user "Butonlar kalsin"). The Chat icon button now toggles the message log expanded/collapsed instead of opening a drawer.

### D-100-09-D — Teach popup + stop+save modal (selfClaude pattern)

When Teach button clicked:
1. Button flips state to "RECORDING" (red, pulse animation).
2. Cursor over the stream area becomes crosshair.
3. Each user click/keystroke captured. **Each captured event triggers a transient popup** (toast-style, top-right-of-window) showing:
   - Event type (Click / Key / Scroll)
   - Coordinates or key name
   - Step number (1, 2, 3, ...)
4. Continue Teach button → re-records (additive).
5. Stop Teach button → opens save modal:
   - Skill name input
   - Description textarea (optional)
   - Tags input (optional)
   - Save / Cancel
6. Saved skill appears in skills sidebar (existing P96 component, repositioned per D-100-09-E).

### D-100-09-E — Skills sidebar disposition

Current P96 puts skills in WebAppTeachDrawer. With drawer removed, skills sidebar moves to:
- **D-100-09-E1 (Recommended):** A top-right compact button "Skills" that opens a popover (Radix Popover) listing skills with Play/Delete buttons. Lightweight, doesn't eat screen real estate.
- D-100-09-E2: Persistent right-edge slim sidebar, always visible. More prominent but eats horizontal space.

Locked: D-100-09-E1.

### D-100-09-F — Skill record: more detail (selfClaude alignment)

Per user "biraz daha detayli kayit edilsin" (a bit more detailed recording). Extend `webapp_skills.action_log` JSONB schema:
- `version: 2` (was 1 in P96)
- Per event: `screenshot_b64?: string` (256x256 thumb of WebApp window at event time)
- Per event: `viewport: {w, h}` at capture time (handle window resizes)
- `metadata: {browser_url?: string, page_title?: string, recorded_by_user_id: string}` at session level
- Backwards-compat: v1 action_logs still replayable (if (event.screenshot_b64) present, optional UI affordance to preview thumb during replay).

### D-100-09-G — Sacred SHA preserved (D-100-SACRED carries forward)

`liv/packages/core/src/sdk-agent-runner.ts` SHA = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. NEVER edited in any 09-* plan.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these:**

### Parent context
- `.planning/phases/100-multi-stream-window-redesign/100-CONTEXT.md`
- `.planning/phases/100-multi-stream-window-redesign/100-08-CONTEXT.md`
- `.planning/phases/100-multi-stream-window-redesign/CONTINUE.md`

### External reference
- https://github.com/utopusc/selfclaude — selfClaude v1.0 Teach mode implementation. Read `src/teach-recorder.js` (or equivalent) and `src/skills.js` for the action_log schema, popup-per-event pattern, and stop+save modal flow.

### LivOS code paths to study/modify

**Bug fixes (09-01..04):**
- `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` — bytebot ss tool (currently full-display capture)
- `livos/packages/livinityd/source/modules/computer-use/native/input.ts` — bytebot mouse path (smoothness + latency)
- `livos/packages/livinityd/source/modules/webapps/input-dispatcher.ts` — user-canvas tRPC scroll path (also affects scroll-down)
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — x11vnc argv (latency tuning candidate)

**UI rewrite (09-05..06):**
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — main edit target
- `livos/packages/ui/src/modules/window/app-contents/webapp-chat-drawer.tsx` — DELETE or repurpose
- `livos/packages/ui/src/modules/window/app-contents/webapp-teach-drawer.tsx` — DELETE or repurpose
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` — KEEP (Chat icon repurposed: toggle bottom message log)
- `livos/packages/ui/src/hooks/use-webapp-agent.ts` — chat hook stays (consumed by inline input now)

**Teach skill schema (09-06):**
- `livos/packages/livinityd/source/modules/webapps/skills-repo.ts` — action_log shape (existing P96)
- `livos/packages/livinityd/source/modules/webapps/skills-trpc-router.ts` — POST /api/skills create
- `livos/packages/livinityd/source/modules/database/migrations/` — possible schema migration for v2 action_log fields (additive JSONB)

### Locked files (NEVER touch)
- `liv/packages/core/src/sdk-agent-runner.ts` — D-100-SACRED. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

</canonical_refs>

<code_context>
## Code Insights

### Bug 1 (screenshot res): native bytebot screenshot tool path
Currently `computer-use/native/screenshot.ts` likely uses `maim` (full display). Selfclaude uses `maim -i 0x<wid>` (window-bound). Per-WebApp MCP child has `BYTEBOT_TARGET_WINDOW_ID` env (from 100-08-04). Use that to scope the screenshot to the target wid.

### Bug 2 (scroll-down): two paths
- User-canvas RFB clicks (100-07.1/.2 path via `webapp.input.click`): RFB protocol button5 (scroll-down) may not be sent correctly. noVNC sends button4/5 events to backend; backend translates to xdotool. Verify the tRPC payload includes button param and translate path covers button5.
- Bytebot path: `xdotool click --window <wid> 5` for scroll-down. May need `--clearmodifiers` or focus-first chain like 100-07.3 click.

### Bug 3 (mouse smoothness): selfclaude pattern
SelfClaude README mentions per-event `min(ev.ts - prevTs, 2000)` ms sleeps during replay. For real-time mouse cursor, mousemove with intermediate interpolation. Patch:
```ts
async function smoothMove(targetX, targetY, currentX, currentY, steps = 20) {
  for (let i = 1; i <= steps; i++) {
    const x = currentX + (targetX - currentX) * (i / steps);
    const y = currentY + (targetY - currentY) * (i / steps);
    await spawn('xdotool', ['mousemove', '--sync', String(x), String(y)]);
    await sleep(5); // 5ms per step → smooth perceived
  }
}
```

### Bug 4 (mouse latency): diagnose first
Candidates:
- x11vnc `-deferupdate <ms>` flag (default ~30ms). Might be too aggressive. Try `-deferupdate 5`.
- RFB queue depth in noVNC client (`use-webapp-vnc.ts` or similar).
- xdotool `--sync` flag overhead. Already used per 100-07.3.
- Network round-trip via WebSocket bridge. ZeroTier latency varies.

100-09-04 first probes (instrumented timing capture on Mini PC), then patches the highest-impact factor.

### UI rewrite: webapp-stream-window.tsx layout
Currently 524 lines (post 100-03 simplification). Main structure (per 100-04):
```tsx
<div className="webapp-window">
  <NoVncCanvas .../>            // stream
  <WebAppFloatingActionBar/>    // 4 buttons OUTSIDE window (100-06.1)
  <Sheet>                       // drawer host (Chat/Teach/Watch/Auto)
    <WebAppChatDrawer/> (or others)
  </Sheet>
</div>
```

After 100-09-05/06:
```tsx
<div className="webapp-window">
  <NoVncCanvas .../>            // stream — top region
  <ChatMessageLog collapsed/>   // bottom band, slim, message log
  <ChatInput/>                  // bottom edge, persistent text input
  <WebAppFloatingActionBar/>    // 4 buttons (100-06.1, unchanged position)
  <TeachPopupHost/>             // teach popups + stop+save modal portal
  <SkillsPopover/>              // top-right "Skills" button + popover
  // Sheet drawer for Auto + Watch only (Chat + Teach removed)
</div>
```

</code_context>

<deferred>
## Deferred Ideas

- v34: Multi-user WebApp sharing (chat in WebApp A by user X visible to user Y).
- v34: Skill marketplace — share teach skills publicly.
- v34: Streaming improvements (WebRTC vs RFB).
- v34: Keyboard-driven teach mode (record raw keystrokes vs translated key events).
- 100-10 (next): Plan 100-10 = formal Mini PC deploy + UAT walk for the 6 sub-plans landed in 100-09. (Defer the formal UAT walk gate to a separate plan, like 100-08-06 was for 100-08.)

</deferred>

<success_criteria>
## Success Criteria (UAT-walkable on Mini PC)

After 100-09-01..06 deploy, verify on Mini PC:

1. Open WebApp Gmail. Bytebot screenshot tool returns image of EXACTLY the Gmail window (e.g., 1280x720), NOT full Xvfb 1920x1080. (09-01)
2. In WebApp, scroll down with mouse wheel. Page scrolls down (not just up). Both directions work. (09-02)
3. Move mouse via bytebot from (100,100) to (500,500). Trajectory smooth, not teleport. (09-03)
4. Click button via bytebot. Click → reaction lag <100ms (instrumented log on Mini PC). (09-04)
5. Open WebApp. NO Chat drawer slides in. Bottom of window has message log + text input. Type message → send → see in log → response renders inline. (09-05)
6. Click Teach button. NO drawer. Cursor crosshair. Click in Gmail → toast popup "Step 1: Click at (320,180)". Type "hello" → toast "Step 2: Type 'hello'". Click Stop Teach → save modal opens → name + tags + save. Skill appears in top-right Skills popover. (09-06)
7. Replay saved skill from Skills popover → Gmail performs the recorded steps. Replayed events visible in screenshot via 09-01 (window-bound). (cross-09)
8. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 09-* commits. (D-100-SACRED)

</success_criteria>

<implementation_notes>
## Implementation Notes

### 09-04 (mouse latency): diagnose, then patch

This plan should INVESTIGATE first (autonomous: false, user-walked SSH probe), then SHIP a fix. Pattern:
1. Add timing logs to bytebot input dispatch + RFB click path.
2. Deploy probe to Mini PC.
3. User runs bytebot click + reports observed lag.
4. Identify highest-impact factor.
5. Patch.

If too risky for autonomous, mark 09-04 as `autonomous: false` and skip it from the wave-1 chain.

### 09-05 mockup detail

```tsx
// New chat affordance — replaces Sheet drawer for Chat
function WebAppChatBottomBar({ webappId }: { webappId: string }) {
  const { messages, sendMessage, isStreaming } = useWebAppAgent(webappId);
  const [input, setInput] = useState('');
  const [logExpanded, setLogExpanded] = useState(false);

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-white/95 backdrop-blur-md border-t">
      {logExpanded && (
        <ScrollArea className="max-h-[160px] px-3 py-2">
          {messages.map(m => <MessageRow key={m.id} {...m} />)}
        </ScrollArea>
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <Button variant="ghost" size="icon" onClick={() => setLogExpanded(!logExpanded)}>
          <ChevronUp className={cn("h-4 w-4", logExpanded && "rotate-180")} />
        </Button>
        <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Mesaj yaz..." />
        <Button onClick={() => { sendMessage(input); setInput(''); }} disabled={isStreaming}>Send</Button>
      </div>
    </div>
  );
}
```

### 09-06 mockup detail

```tsx
// Teach mode — popup-per-event + stop+save modal
function TeachPopupHost({ webappId }: { webappId: string }) {
  const { isRecording, events, stop, save } = useTeachRecorder(webappId);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Toast popup per event (radix-ui Toast)
  // (subscribe to events stream, render last event for ~2s)

  return (
    <>
      <ToastProvider>
        {events.slice(-1).map(e => (
          <Toast key={e.id}>
            <ToastTitle>Step {e.stepNumber}: {e.type}</ToastTitle>
            <ToastDescription>{describeEvent(e)}</ToastDescription>
          </Toast>
        ))}
      </ToastProvider>
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent>
          <DialogTitle>Save Skill</DialogTitle>
          <Input placeholder="Skill name" />
          <Textarea placeholder="Description (optional)" />
          <Input placeholder="Tags (comma-separated)" />
          <Button onClick={() => save({ name, description, tags })}>Save</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

### 09-06 schema migration (additive)

```sql
-- migrations/2026-05-10-skill-action-log-v2.sql
-- (no schema change required; action_log is JSONB. Just bump version field.)
-- Document v2 shape in skills-repo.ts type definitions.
```

</implementation_notes>

<risks>
## Risks

1. **UI rewrite test churn** — many existing tests assert the Sheet-drawer pattern. Tests need migration; some may be removed if drawers go away. Acceptable for this scope.
2. **Skill backwards-compat** — v1 action_logs (existing teach recordings on Mini PC, if any) must still replay. Migration: lazy-upgrade reads — `version: 1` records skip the v2-only screenshot rendering during replay, otherwise render normally.
3. **Mouse latency root cause may need multiple patches** — if it's RFB queue + x11vnc deferral + xdotool sync compounded, one patch may move the needle but not fully solve. Document residual in 09-04 SUMMARY.
4. **Inline chat at bottom may obscure stream** — if message log expanded eats too much vertical space, user can't see Gmail. Make log collapsed by default; user opens by clicking chevron.
5. **Sacred SHA gate** — pre-commit hook fires on every commit. Hook is reliable per 100-08 record.

</risks>

---

**Next step:**

```
/gsd-plan-phase 100-09
```

Output: 6 plans (`100-09-01..06-PLAN.md`) per D-100-09 split decision. Wave dependencies:
- Wave 1: 09-01 (ss fix, isolated)
- Wave 2: 09-02 (scroll, isolated)
- Wave 3: 09-03 (mouse smoothness, isolated)
- Wave 4: 09-04 (mouse latency probe + fix; may be `autonomous: false`)
- Wave 5: 09-05 (UI: inline chat at bottom)
- Wave 6: 09-06 (Teach popup + skills detail)

Sacred SHA gate: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
