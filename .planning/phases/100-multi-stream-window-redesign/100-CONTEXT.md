# Phase 100: Multi-Stream + Stream-Window Redesign — CONTEXT

**Gathered:** 2026-05-08 (post Phase 99 UAT)
**Status:** Ready for planning (`/gsd-plan-phase 100`)
**Trigger:** Phase 99 UAT-discovered four gaps (G-99-UAT-1..4). Phase 99 was the protocol-level swap (fMP4 → x11vnc) and that part PASSED for the single-stream case. Phase 100 closes the remaining concurrency + UI shape gaps so v33 can ship.

<phase_boundary>
## Phase Boundary

**In scope:**
1. Diagnose why a SECOND WebApp click does not produce a second concurrent stream window with its own x11vnc port. Root-cause on the Mini PC.
2. Backend fix for multi-stream concurrency (likely Chrome IPC-merge mitigation via `--app=URL` site-specific-browser mode or per-WebApp profile dir; final argv locked by 100-01 verification).
3. Frontend: remove URL bar from `webapp-stream-window.tsx`'s top toolbar; collapse the toolbar so the stream area fills the window (`stream pencere boyutu kadar`).
4. Frontend: replace the inline `webapp-mode-selector.tsx` + `WebAppAgentPanel` placement with a **floating icon-button row** anchored to the stream window's bottom edge (mirroring the existing top drag-to-move + close button pattern). Each button (Chat / Teach / Watch / Auto) opens its own popover/sheet on click — NOT inline.
5. Mini PC deploy + user-walked UAT closing the v33 ship gate (must verify 2 concurrent streams + new UI shape).

**Out of scope:**
- WebRTC upgrade for the desktop stream (deferred to v34 per `v33-DRAFT.md`).
- Multi-user concurrency (single Mini PC user only in v33; D-V33-07).
- Multi-tab same-WebApp coordination (`-shared` x11vnc allows multiple tabs to drive the same window — known minor UX nit, out of scope per Phase 99 §"Open Questions" Q3).
- Per-WebApp Chrome profile isolation (loses shared Google login; user explicitly wants shared profile per memory `feedback_subscription_only.md` adjacent / D-V33-01). If 100-01 finds this is the only fix, escalate before committing.
- `liv/packages/core/` edits (sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout — D-100-SACRED).
- BYOK or any Anthropic SDK changes (D-NO-BYOK).
- Server4 (D-NO-SERVER4 — Mini PC `bruce@10.69.31.68` only).
</phase_boundary>

<problem_evidence>
## Problem Evidence (from Phase 99 UAT)

User report (Turkish, paraphrased):
> "Stream is currently working but two screens are not opening at the same time — only working through one window. When I click an app, a new screen should open and a port should stream from there. Bytebot also needs to be able to switch between windows. The system isn't working that way. Re-plan it so two streams can be open at the same time. Also: in the UI there should not be a URL bar at the top — just stream the window area. Chat / Teach / Watch / Auto operations should not be in the same window. Instead, like the drag-drop and X-button at the top, there should be buttons immediately below the window with icons; clicking opens Teach mode, chat area, etc."

Backend status as of `cd6f442a`:
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` — `startStream({mode:'vnc-window', target:{wid}})` allocates a fresh `rfbPort` per call from `VNC_PORT_COUNTER` (15900..16099 ring). Idempotency cache keyed on `(userId, mode, JSON.stringify(target))`.
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts:222-237` — Chrome spawn argv: `sudo -n -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority google-chrome --user-data-dir=/home/bruce/.config/livos-chrome --new-window <url>`. **Suspected root cause:** when Chrome is already running with the same `--user-data-dir`, a second `--new-window` invocation IPC-merges with the existing process. The new top-level window may or may not be created depending on Chrome's heuristics; even if created, `xdotool search --name <hostname>` may return the existing first WebApp's wid if the title matches more loosely.
- `livos/packages/livinityd/source/modules/webapps/window-discovery.ts:findNewWindowMatching()` — uses `xdotool search` against title hints (the WebApp's URL hostname + optional expected title); if both WebApps have similar titles or Chrome merges them, this returns the wrong wid OR no wid.

Frontend status:
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (776 lines) — top toolbar with URL bar (`WebAppToolbar` ~line 38), a center stream pane (noVNC), and a bottom AgentPanel (mode selector + chat surface, 95-07.B). All in one window.
- `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` (125 lines) — has copy-URL action; URL is shown in a text input at the top of the stream window.
- `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx` (133 lines) — pill-style mode selector inline ABOVE the chat panel.

The symptoms:
- "tek pencere üzerinden çalışıyor" — only one stream/window works at a time.
- Bytebot can't switch between WebApp windows because there isn't a SECOND distinct `wid` to switch TO.
- URL bar is shown in stream window — user finds this redundant.
- Chat/Teach/Watch/Auto are inline below the stream — user wants them as floating icon buttons opening popovers.
</problem_evidence>

<gray_areas>
## Gray Areas (decide via `/gsd-discuss-phase` or in 100-01)

### G-100-A — Multi-stream root-cause hypothesis (kill-gate)

The 100-01 plan must empirically verify which of these is the real cause:

| Hypothesis | Test on Mini PC | If true → fix |
|------------|-----------------|---------------|
| **H1** Chrome `--new-window` IPC-merges so 2nd invocation does NOT open a new top-level X11 window at all | Spawn `chrome --user-data-dir=X --new-window URL_A`, wait, spawn `chrome --user-data-dir=X --new-window URL_B`; `xdotool search --class chrome` should return TWO distinct wids | Switch to `chrome --app=URL` mode (each invocation opens its own dedicated chromeless window; no IPC merge) — also fixes G-99-UAT-2 (no URL bar) for free |
| **H2** Chrome opens 2 windows but `xdotool search --name <hostname>` matches the wrong one | Verify both wids exist (xdotool sees them) but the `findNewWindowMatching` title filter is racy | Tighten window matcher (use `_NET_WM_PID` + creation timestamp instead of title match) |
| **H3** Backend opens 2 streams correctly but FRONTEND only renders one stream window component | Verify two `webapps.window.spawn` tRPC calls return distinct `streamId`s; verify `livos/packages/ui/src/modules/window/window-content.tsx` opens two WebAppStreamWindow instances | Frontend: ensure each WebApp click pushes a new window into the window-manager Zustand store with a distinct key |
| **H4** Chrome merges into ONE window; X11 has only ONE wid; the 2nd `findNewWindowMatching` returns the same wid as the first; idempotency check returns existing stream | Same probe as H1 — count distinct wids | Same fix as H1 |

The 100-01 plan runs the probe on the Mini PC and writes the canonical "what fix to apply" recommendation into `100-01-SUMMARY.md`. 100-02 implements the fix.

### G-100-B — Chrome spawn mode for the 100-02 fix (depends on G-100-A)

| Option | Pros | Cons |
|--------|------|------|
| **B1: `--app=URL` site-specific-browser** | Each invocation = separate top-level chromeless window (no URL bar, no tabs). NO IPC merge. Solves G-99-UAT-1 + G-99-UAT-2 + G-99-UAT-3 (full-bleed) in one stroke. | Loses Chrome's tab UX (no problem for WebApp use case). PWA-style; visually different from regular Chrome window. |
| **B2: per-WebApp `--user-data-dir`** | Forces fresh process per WebApp. | Loses shared Google login (D-V33-01). User explicitly wants shared profile per memory. NOT recommended. |
| **B3: keep `--new-window` + frontend-only fix** | Minimal backend change. | Only viable if H3 is the real root cause (backend already opens 2 windows; frontend is the bug). |

**Locked default:** B1 (`--app=URL`) is strongly preferred because it ALSO solves G-99-UAT-2 (no URL bar) for free. 100-01 verifies whether B1 actually opens two distinct windows on bruce's Mini PC.

### G-100-C — Floating action-button anchor point

The user said: "Yukarıda sürükle bırak yaptığımız ve çarpı işareti olan butonlar gibi hemen pencerenin altında da buton olsun" → "like the drag-drop and X buttons we have at the top, there should be buttons immediately below the window".

| Option | Pros | Cons |
|--------|------|------|
| **C1: anchored to bottom edge of stream window** (inside the window border) | Tightly coupled to the stream window; moves with it; clean visual | Eats vertical space inside the stream area |
| **C2: floating ROW just below the window** (outside the window, like a system tray) | Stream gets full window space | Coordination with window manager z-order needed |
| **C3: floating buttons on the right edge of the window** (vertical strip) | Common pattern; doesn't eat top/bottom | Different from "below the window" the user described |

**Locked default:** C1 — the user's literal description is "hemen pencerenin altında" (immediately below the window). Implement as a 32px-tall row of icon buttons anchored to the bottom edge, INSIDE the window border, mirroring the existing top drag/close strip pattern from `window-content.tsx`.

### G-100-D — Where do the panels open when an icon is clicked?

| Option | Pros | Cons |
|--------|------|------|
| **D1: popover anchored to the clicked button** (Radix Popover) | Lightweight; doesn't disturb the stream | Limited width — Chat surface needs decent space |
| **D2: full-height drawer slides in from the right** | Plenty of room for chat | Covers part of the stream |
| **D3: separate floating window** (dedicated window manager entry) | Most flexible; user can move it | Heaviest UX change; requires window-manager wiring |

**Locked default:** D2 (slide-in drawer). 30-40% of the window width. The user's existing v32 chat surface is wide; this matches it. Chat / Teach / Watch / Auto each get their own drawer that opens on click and closes on a second click of the same button OR on close-X.

### G-100-E — Drop URL bar entirely vs. keep as collapsible

If we go with `--app=URL` (G-100-B / B1), Chrome shows no URL bar inside the captured window. So the LivOS-side toolbar's URL display becomes redundant.

| Option | Pros | Cons |
|--------|------|------|
| **E1: drop the entire top toolbar; only top drag-strip remains** | Cleanest; matches "stream fills window" | Loses copy-URL convenience (user can right-click WebApp icon for that) |
| **E2: keep top toolbar but remove URL input; keep copy-URL icon-button only** | Preserves convenience | Still eats vertical space |

**Locked default:** E1 — drop the whole top toolbar. The drag-strip + close-X stays (existing window-content.tsx pattern). Copy-URL action moves to the right-click menu on the WebApp desktop icon (already exists OR easy to add).

### G-100-F — How to handle Bytebot per-window switching for Auto mode

Phase 97 wired `BYTEBOT_TARGET_WINDOW_ID` env per-WebApp MCP spawn so bytebot's screenshot/input tools target a specific wid. With multi-stream concurrent, two Bytebot agents can run in parallel — one per WebApp window. Existing wiring should already support this (each WebApp spawns its own MCP child with its own env). 100-01 also verifies this empirically (Auto mode in WebApp A doesn't disturb WebApp B).

### G-100-G — Idempotency cache invalidation when wid changes

Current idempotency cache is `(userId, mode, JSON.stringify(target))`. With `target = {wid: N}`, if a WebApp window dies and respawns, the wid changes → new key → new stream. This is correct. But: if Chrome process is the same and the user clicks the same WebApp icon twice quickly, the second click finds the existing alive entry, returns existing — that's the desired idempotent behavior (verified in Phase 99 Test 14). No action needed unless 100-01 surfaces an edge case.
</gray_areas>

<locked_decisions>
## Locked Decisions (carried into all 100-* plans)

- **D-100-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` SHA must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit. Pre/post `git hash-object` gate on every commit.
- **D-100-NO-SERVER4:** Server4 is NOT touched. Mini PC `bruce@10.69.31.68` is the only deploy target.
- **D-100-NO-BYOK:** No `@anthropic-ai/sdk` paths. Subscription-only Agent SDK. No raw broker fallback.
- **D-100-FMP4-ALIVE:** `Fmp4Fanout`, `encoder-args` (3 fmp4 modes), `pipewire-portal`, `geometry-tracker` — all preserved byte-for-byte. The desktop-stream native app continues to use them. Phase 99's D-99-04 carries forward.
- **D-100-SHARED-PROFILE:** Chrome continues to share `/home/bruce/.config/livos-chrome` profile across all WebApps. No per-WebApp `--user-data-dir`. (G-100-B: choose B1 over B2.)
- **D-100-X11VNC-CANONICAL:** vnc-bridge's `spawnVncForWindow` argv is the locked recipe from Phase 99-01 SUMMARY: `sudo -n -u bruce DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority /usr/bin/x11vnc -id 0xHEX -rfbport <port> -localhost -shared -forever -noxdamage -nopw`. Phase 100 does NOT modify this.
- **D-100-LIVE-VERIFY-FIRST:** No backend code change ships in 100-02 until 100-01 has empirically pinned which hypothesis (H1..H4) is the real root cause. Avoids the v33 mistake where P93 spike rejected x11vnc without verifying compatibility under the new Mutter version.
</locked_decisions>

<files_likely_modified>
## Files likely touched (planner verifies in 100-PLAN.md)

### Backend
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — Chrome spawn argv (likely `--new-window` → `--app=URL`); possibly `findNewWindowMatching` matcher tightening
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` — test cases for new spawn argv

### Frontend
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` (776 lines — heavy edit) — drop top toolbar, drop inline mode selector + agent panel placement, add floating action-button row at bottom edge, add popover/drawer host for the 4 modes
- `livos/packages/ui/src/modules/window/webapp-toolbar.tsx` (125 lines — likely deprecate / inline copy-URL into right-click menu) — possibly delete
- `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx` (133 lines — likely repurpose into icon-only horizontal row OR delete and inline icons in webapp-stream-window.tsx)
- `livos/packages/ui/src/modules/window/window-content.tsx` (existing top drag-strip pattern — read-only reference)
- `livos/packages/ui/src/modules/window/webapp-skills-sidebar.tsx`, `livos/packages/ui/src/modules/window/skill-replay-scrubber.tsx` — may need to move into the Teach drawer (D-100-G's D2)

### Untouched (D-100-SACRED + D-100-FMP4-ALIVE + D-100-NO-BYOK + D-100-X11VNC-CANONICAL)
- `liv/packages/core/src/sdk-agent-runner.ts`
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (Phase 99-02 — argv locked)
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` (Phase 99-03 — discriminated union locked; vnc-window already supports concurrent calls because `VNC_PORT_COUNTER` allocates fresh ports)
- `livos/packages/livinityd/source/modules/server/index.ts` (Phase 99-04 — WS dispatch locked)
- `livos/packages/livinityd/source/modules/streaming/fmp4-fanout.ts`, `encoder-args.ts`, `pipewire-portal.ts`, `geometry-tracker.ts`
</files_likely_modified>

<requirements>
## Requirements

- **V33-MULTI-01** Two concurrent WebApps must each have their own stream + own x11vnc port + own stream window component instance.
- **V33-MULTI-02** Stream window UI: no URL bar, no inline mode selector, no inline chat panel. Stream area fills the window minus the standard top drag-strip + close-X.
- **V33-MULTI-03** Floating icon-button row anchored to the bottom edge of the stream window. Contains 4 buttons: Chat, Teach, Watch, Auto. Each is icon-only (Lucide or Tabler icon set, matching project conventions).
- **V33-MULTI-04** Each button opens its own panel (mode selector D2: slide-in drawer ~35% window width). Second click of the same button closes the drawer. Switching between buttons swaps the drawer content.
- **V33-MULTI-05** v33 milestone closes (full UAT-CHECKLIST.md sections A-J ship to PASS) AFTER Phase 100 ships.
</requirements>

<success_criteria>
## Success Criteria (UAT-walkable)

1. Open WebApp A → stream window opens at port 15900, RFB handshake, captured Chrome visible.
2. Open WebApp B → SECOND stream window opens at port 15901, independent RFB handshake, independent Chrome window with different URL captured.
3. Both stream windows render simultaneously; no cross-talk; mouse input in one doesn't reach the other.
4. Each window has NO URL bar at the top — only the standard drag-strip + close-X.
5. Stream area fills the window (no inline toolbar/agent panel below it).
6. Bottom edge of each window has a row of 4 icon buttons (Chat / Teach / Watch / Auto).
7. Clicking Chat opens a slide-in drawer with the chat surface; closing it returns to full-bleed stream.
8. Clicking Teach opens the teach-recorder UI in a slide-in drawer; same close behavior.
9. Bytebot can run Auto mode in WebApp A while WebApp B is open and idle (per-window MCP env confirmed).
10. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout all Phase 100 commits.
11. Mini PC user-walked UAT signoff documented in UAT-CHECKLIST.md.
</success_criteria>

<implementation_notes>
## Specific Implementation Notes

### Chrome `--app=URL` spawn argv (likely 100-02)

```bash
sudo -n -u bruce \
  DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  google-chrome \
    --user-data-dir=/home/bruce/.config/livos-chrome \
    --app=https://duckduckgo.com
```

vs. current (post-Phase 99) Phase 93 argv:
```bash
sudo -n -u bruce \
  DISPLAY=:0 XAUTHORITY=/run/user/1000/gdm/Xauthority \
  google-chrome \
    --user-data-dir=/home/bruce/.config/livos-chrome \
    --new-window https://duckduckgo.com
```

The only flag change is `--new-window URL` → `--app=URL`. Two concurrent invocations of `--app` mode produce two separate top-level windows even with shared user-data-dir.

### Floating action-button row (likely 100-04)

Pattern from `window-content.tsx` (the existing top drag-strip + close-X). Mirror the structure on the bottom edge:

```tsx
<div className="webapp-window">
  <div className="window-top-bar">
    {/* existing: drag handle + close-X */}
  </div>
  <div className="webapp-stream-area">
    <NoVncCanvas ... />
  </div>
  <div className="webapp-bottom-bar">
    <IconButton icon={MessageCircle} aria-label="Chat" onClick={() => toggleDrawer('chat')} />
    <IconButton icon={GraduationCap} aria-label="Teach" onClick={() => toggleDrawer('teach')} />
    <IconButton icon={Eye} aria-label="Watch" onClick={() => toggleDrawer('watch')} />
    <IconButton icon={Bot} aria-label="Auto" onClick={() => toggleDrawer('auto')} />
  </div>
  <Drawer mode={openDrawer} onClose={() => setOpenDrawer(null)}>
    {/* renders Chat / Teach / Watch / Auto content */}
  </Drawer>
</div>
```

Icon choice: Lucide React (already used elsewhere in the codebase per quick scan). Buttons sized 36×36px with subtle hover. Active state when its drawer is open.

### Backend port allocation already supports concurrency

Phase 99-03 shipped `VNC_PORT_COUNTER` ring (15900..16099). Two concurrent `startStream({mode:'vnc-window'})` calls allocate two different ports. Phase 99 Test 14 verified idempotency (same wid → same streamId). Phase 100 backend work is JUST the Chrome spawn argv change; the streaming subsystem ALREADY supports multi-stream — the bug is upstream of stream-manager.
</implementation_notes>

<deferred>
## Deferred to v34 / future phases

- WebRTC upgrade for the desktop fMP4 native app stream (not WebApp).
- Multi-user concurrency for WebApp launcher (single-user-only locked in v33).
- Per-WebApp Chrome profile isolation (would need separate Google logins; not requested).
- "Open in new tab" UX inside the captured Chrome (out of scope; user uses LivOS desktop icons).
- Window dragging & resizing UX polish (existing window-manager handles).
</deferred>

---

**Next step (post-`/clear`):**

```
/gsd-plan-phase 100
```

That will spawn the GSD planner agent with this CONTEXT.md as input. The planner produces 5 PLAN.md files (100-01 through 100-05) following the structure outlined in this CONTEXT's `Gray Areas` and `Files likely touched` sections.

After plans land:
```
/gsd-execute-phase 100
```

Sacred SHA gate: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
