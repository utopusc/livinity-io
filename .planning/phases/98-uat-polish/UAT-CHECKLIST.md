# v33 UAT Checklist — Mini PC Walk-Through

**Audience:** the user (`bruce`), walking the live system on the Mini PC after `bash /opt/livos/update.sh` completes for the v33 ship batch (P92-P98 + lifecycle hookup + vainfo libva-utils fix).

**Pre-flight:**
- Mini PC reachable at `bruce@10.69.31.68` (ZeroTier up — see memory `reference_zerotier_unstable.md` if peer dropped; SSH from LAN if ZT flaky).
- `bash /opt/livos/update.sh` ran clean for the v33 batch — last 30 lines show no `error:` and no `npm ERR!`. The update.sh apt-step apt-installed the 18 streaming/window binaries (ffmpeg, gstreamer, xdotool, ydotool, vainfo via `libva-utils`, pipewire portal, etc.) and ensured the `ydotoold.service` systemd unit is active.
- `systemctl status livos liv-core liv-worker` — main services Active (running). `liv-memory` may still be in restart loop (pre-existing per memory note `feedback_milestone_uat_gate.md`); not a v33 regression.
- Browser open at `https://bruce.livinity.io/` (or your bookmarked LivOS frontend URL).
- Pre-condition (G-98-05): Chrome on the Mini PC console session (X11, not headless) is already logged into the user's Google account. UAT confirms persistence, not first-login flow.
- UAT-walker is the `bruce` Mini PC user (D-V33-07; multi-user is v34).

**Legend:**
- **ACTION** — what to do.
- **EXPECTED** — what should happen.
- **PASS** / **FAIL** / **NOTES** — write your result. Use NOTES for partial passes / quirks.

---

## A. Deploy verification + service health

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| A1 | SSH to Mini PC: `ssh -i .../minipc bruce@10.69.31.68 'tail -50 /tmp/livos-update.log 2>/dev/null \|\| journalctl -u livos -n 50 --no-pager'` | Update flow recently ran; no fatal errors near the tail | [ ] PASS  [ ] FAIL  NOTES: |
| A2 | Run on Mini PC: `which ffmpeg gst-launch-1.0 xdotool ydotool vainfo wmctrl xprop maim` | All 8 binaries resolve to absolute paths (libva-utils provides `vainfo`) | [ ] PASS  [ ] FAIL  NOTES: |
| A3 | Run on Mini PC: `vainfo 2>&1 \| head -20` | Either prints VAEntrypointEncSlice for an H264 profile (VAAPI present) OR a graceful "no driver" error (libx264 fallback). Either is OK — the boot probe persists `liv:streaming:caps` accordingly | [ ] PASS  [ ] FAIL  NOTES: |
| A4 | Run on Mini PC: `systemctl is-active livos liv-core liv-worker ydotoold` | All four print `active` (livinityd, liv core/worker, and the ydotoold systemd unit installed by P93 update.sh) | [ ] PASS  [ ] FAIL  NOTES: |
| A5 | Run on Mini PC: `redis-cli -a "$REDIS_PASSWORD" hgetall liv:streaming:caps` (password from `/opt/livos/.env`) | HASH has fields `vaapi`, `profiles`, `probedAt` (set by `persistVaapiCaps` at livinityd boot — P98 lifecycle hookup) | [ ] PASS  [ ] FAIL  NOTES: |
| A6 | Run on Mini PC: `journalctl -u livos -n 200 --no-pager \| grep -E 'StreamManager\|WebAppWindowManager\|streaming caps'` | At least one log line each for `StreamManager started` (or similar) and `WebAppWindowManager started` (lifecycle hookup boot logs) | [ ] PASS  [ ] FAIL  NOTES: |

---

## B. Add WebApp metadata + persistence (P92 + P94)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| B1 | Right-click an empty area of the LivOS desktop | Context menu appears; `Add WebApp` item visible between `Add Widget` and `New Folder` | [ ] PASS  [ ] FAIL  NOTES: |
| B2 | Click `Add WebApp` → dialog opens → type `https://facebook.com` | Within ~3s the metadata preview shows Facebook's title + favicon | [ ] PASS  [ ] FAIL  NOTES: |
| B3 | Click Save | Dialog closes; a Facebook icon appears on the desktop with title + favicon | [ ] PASS  [ ] FAIL  NOTES: |
| B4 | Reload the page (Cmd/Ctrl-R) | Facebook icon persists | [ ] PASS  [ ] FAIL  NOTES: |
| B5 | Repeat B2-B4 for `https://gmail.com` and `https://x.com` | Three icons total on the desktop | [ ] PASS  [ ] FAIL  NOTES: |
| B6 | Add `https://facebook.com` again | Idempotent — no duplicate icon (P94 D-94-01 idempotent on `(userId, url)`) | [ ] PASS  [ ] FAIL  NOTES: |
| B7 | Reject path: open Add WebApp, type `javascript:alert(1)` | Dialog rejects with validation error; no row inserted | [ ] PASS  [ ] FAIL  NOTES: |
| B8 | (Optional terminal) On Mini PC: `psql -U livos -d livos -c "SELECT slug, title FROM webapps;"` | Three rows: facebook, gmail, x (slug + title populated) | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |

---

## C. Profile sharing (D-V33-01, D-V33-07)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| C1 | Click the Facebook desktop icon | New WebApp window opens; stream renders the Chrome window content; user is already logged in (no Google sign-in screen) | [ ] PASS  [ ] FAIL  NOTES: |
| C2 | Without closing Facebook, click the Gmail icon | Second window opens; same Google account already authenticated (no login wall) | [ ] PASS  [ ] FAIL  NOTES: |
| C3 | Click the X icon | Third window opens; same Google account authenticated | [ ] PASS  [ ] FAIL  NOTES: |
| C4 | In any open window, inspect the Chrome profile menu (top-right avatar) | All three windows reflect the SAME Google identity — confirms shared profile (D-V33-01) | [ ] PASS  [ ] FAIL  NOTES: |

---

## D. Window focus / re-launch (D-V33-04)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| D1 | With the Facebook window open, click the Facebook desktop icon AGAIN | Existing Facebook window receives focus (foreground); NO duplicate window opens (idempotency in `WebAppWindowManager.spawn`) | [ ] PASS  [ ] FAIL  NOTES: |
| D2 | Close the Facebook Chrome window via its `✕` | Stream tears down; LivOS WebApp shell shows "Stream ended" (or equivalent close-state UI) with a `Reopen` affordance | [ ] PASS  [ ] FAIL  NOTES: |
| D3 | Click `Reopen` | Fresh window spawns; same Google session preserved (cookies survived) | [ ] PASS  [ ] FAIL  NOTES: |

---

## E. Stream backend verified (P93 outcome)

Per `93-SUMMARY.md`: VAAPI-aware ffmpeg fMP4 + Node WS fan-out replaces the originally proposed per-window `x11vnc` design. PipeWire screencast portal is the primary per-window source (D-93-04); ffmpeg `x11grab` + `GeometryTracker` is the fallback when the portal is unavailable. UAT cares about behaviour, not which path activates.

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| E1 | Within ~5s of clicking a desktop icon, observe the WebApp window | Live frames render — not black, not all-grey, not frozen. Frame rate feels live (≥10fps subjectively) | [ ] PASS  [ ] FAIL  NOTES: |
| E2 | Move the mouse over the streamed window in the LivOS browser | Host Chrome cursor mirrors movement (latency tolerable, <500ms feels live) | [ ] PASS  [ ] FAIL  NOTES: |
| E3 | Click into a Chrome text field via the stream and type a character | Keystroke registers in the host Chrome window (input plumbed via `xdotool` / `ydotool`) | [ ] PASS  [ ] FAIL  NOTES: |
| E4 | Resize the LivOS WebApp shell window (drag corner) | Stream content resizes / rescales gracefully; no scrollbars; no clipped frames | [ ] PASS  [ ] FAIL  NOTES: |
| E5 | (Optional terminal) On Mini PC: `journalctl -u livos -n 100 --no-pager \| grep -E 'mode=pipewire-fd\|mode=window-crop'` | Records which path activated — pipewire-fd primary; window-crop fallback. Either is acceptable per D-93-04 | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |

---

## F. Teach mode (P96)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| F1 | In the Facebook WebApp shell, switch the mode pill from `Watch` → `Teach` | Privacy toast surfaces (per-install ack via `liv:webapp:teach:warning-ack:v1` localStorage). Red pulsing recording dot appears (TeachRecordingOverlay) | [ ] PASS  [ ] FAIL  NOTES: |
| F2 | In the streamed Chrome window, click the "What's on your mind" composer and type a short non-public draft (do NOT click Post) | Mouse + keyboard events captured by `useTeachRecorder` (mousedown / keydown / heartbeat) | [ ] PASS  [ ] FAIL  NOTES: |
| F3 | Click `Stop` in the mode pill | Save dialog prompts for a name → enter `compose-status-draft` → save | [ ] PASS  [ ] FAIL  NOTES: |
| F4 | Skills sidebar (right edge) | Auto-refreshes; the saved skill appears with action count + first-frame thumbnail (within ~1s of save) | [ ] PASS  [ ] FAIL  NOTES: |
| F5 | Open the skill replay scrubber | Linear timeline of mouse/keyboard events with thumbnails; scrubbing reveals each step (IntersectionObserver lazy-loads beyond 20 tiles) | [ ] PASS  [ ] FAIL  NOTES: |
| F6 | (Optional terminal) On Mini PC: `psql -U livos -d livos -c "SELECT skill_name, jsonb_array_length(action_log->'events') AS n FROM webapp_skills ORDER BY created_at DESC LIMIT 1;"` | Returns the saved skill row with N>=4 events | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |

---

## G. Auto mode (P97)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| G1 | In the Facebook WebApp shell, switch the mode pill to `Auto` | Auto-mode panel surfaces (skill picker + free-form goal field + Run button). Skills sidebar hides (per P96 SUMMARY) | [ ] PASS  [ ] FAIL  NOTES: |
| G2 | (Per gray area G-98-03 — never instruct a public post during UAT.) Type goal: `Open the post composer and type 'hello world' as a draft. Do not click Post.` Optionally select the F3 saved skill as guidance | Field accepts goal; Run button enables | [ ] PASS  [ ] FAIL  NOTES: |
| G3 | Click `Run` | Chat panel narrates each step with `status_detail` phrases (Hermes verbs: "Pondering…", "Contemplating…", elapsed ms). Side panel shows screenshot tool calls + click coordinates. Bytebot tools fire with `targetWindowId` matching the WebApp's wid (window-scoped — does NOT touch other Chrome windows) | [ ] PASS  [ ] FAIL  NOTES: |
| G4 | Watch the streamed window | Within ~60s the composer opens and the text "hello world" appears as a draft. Post is NOT clicked. | [ ] PASS  [ ] FAIL  NOTES: |
| G5 | Failure-recovery probe — Run a goal that requires a non-existent UI element (e.g. `click the purple unicorn button`) | Within ≤3 vision-validation strikes, agent emits a "needs help" event and pauses; UI reflects paused state with takeover affordance | [ ] PASS  [ ] FAIL  NOTES: |
| G6 | (Optional terminal) On Mini PC: while G3 runs, in another shell `ps aux \| grep bytebot \| grep BYTEBOT_TARGET_WINDOW_ID` | One bytebot MCP child process per active Auto-mode WebApp; env shows the WebApp's wid | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |

---

## H. Resource cleanup + WebApp deletion cascade (P94 + P96)

Cascade mechanism per `94-SUMMARY.md` / `96-SUMMARY.md`: Postgres `ON DELETE CASCADE` on `webapp_skills.webapp_id` and `webapp_agent_sessions.webapp_id` (FK-level; the skills-router additionally GCs disk-backed thumbnails via `meta.sessionId`). UAT confirms behaviour regardless of mechanism.

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| H1 | Close the Facebook WebApp window via its `✕` | Encoder process tears down (no orphan ffmpeg/gst-launch); WS `/ws/stream/:id` closes with code 1011 | [ ] PASS  [ ] FAIL  NOTES: |
| H2 | (Optional terminal) On Mini PC: `pgrep -af 'ffmpeg\|gst-launch-1.0' \| wc -l` immediately after H1 | Count drops by 1 (vs. before close); idle reaper poll (5s) sweeps any residual | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |
| H3 | Right-click the Facebook desktop icon → `Delete WebApp` → confirm | Icon disappears from desktop; if the window is open it closes; stream tears down | [ ] PASS  [ ] FAIL  NOTES: |
| H4 | (Optional terminal) On Mini PC: `psql -U livos -d livos -c "SELECT count(*) FROM webapp_skills WHERE webapp_id='<facebook-uuid>';"` | Returns 0 (cascade) | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |
| H5 | (Optional terminal) On Mini PC: `psql -U livos -d livos -c "SELECT count(*) FROM webapp_agent_sessions WHERE webapp_id='<facebook-uuid>';"` | Returns 0 (cascade) | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |
| H6 | Verify no stray skill thumbnails on disk: `ls /opt/livos/data/webapp-skills/<facebook-sessionId>/ 2>/dev/null \| wc -l` | Returns 0 (skills-router GC ran on cascade) | [ ] PASS  [ ] FAIL  [ ] SKIP  NOTES: |

---

## I. Multi-user isolation reminder (single-user scope — v34 fix)

v33 ships single-user only on the Mini PC (D-V33-07). Multi-user WebApp isolation (per-user Chrome profile, per-user webapp namespace, per-user stream caps) is a v34 carry-over. No UAT step is required here — record it as a **scope reminder** in the sign-off block so a future multi-user UAT regression doesn't blame v33.

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| I1 | Read this section. Acknowledge that multi-user isolation is NOT in scope for v33 UAT | Walker checks the box and notes "v34 carry-over" in NOTES | [ ] ACK  NOTES: |

---

## J. Sacred + regression (CRITICAL — do not skip)

| # | ACTION | EXPECTED | RESULT |
|---|--------|----------|--------|
| J1 | On dev box: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | Returns exactly `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | [ ] PASS  [ ] FAIL  NOTES: |
| J2 | `systemctl is-active livos liv-core liv-worker` | All three `active` | [ ] PASS  [ ] FAIL  NOTES: |
| J3 | `systemctl is-active liv-memory` | MAY still be `activating` / restart-loop pre-existing per memory; not a v33 regression. Mark `PRE-EXISTING` in NOTES if observed | [ ] PASS  [ ] FAIL  [ ] PRE-EXISTING  NOTES: |
| J4 | Open `/ai-chat` (v32 path) | Still works; no regression from v33 work | [ ] PASS  [ ] FAIL  NOTES: |
| J5 | Open the global desktop bytebot via `Computer Operator` agent (P79 baseline; v33 added per-window `targetWindowId` plumbing) | Still works on the global desktop (no `targetWindowId` → defaults to whole desktop) | [ ] PASS  [ ] FAIL  NOTES: |
| J6 | Browser console (F12) on the WebApp shell page | No NEW red errors. Pre-existing chunk-size / fontsource warnings are acceptable | [ ] PASS  [ ] FAIL  NOTES: |

---

## Sign-off

- **Date walked:** ____________________
- **Walker:** bruce (Mini PC `10.69.31.68`)
- **Overall result:** [ ] PASS — v33 milestone signs off  [ ] FAIL — defects to file in v34 carryover
- **Defects to file (bullets, become v34 phases or `/gsd-insert-phase` hot-fix):**
  - ___
  - ___
  - ___
- **Subjective vibe — Add WebApp flow:** ____________________
- **Subjective vibe — Teach + Auto modes (vs. global-desktop bytebot):** ____________________
- **Subjective vibe — overall feel of WebApp Launcher feature:** ____________________

---

*Generated by Phase 98. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved. Mini PC walk; not auto-executable. Per `feedback_milestone_uat_gate.md`: walker's signature is the only valid milestone PASS — no agent-side declaration overrides it.*

---

## Phase 100 — Multi-Stream + Stream-Window Redesign (PARTIAL-PASS 2026-05-08)

**Walker:** `bruce` (the user)
**Deployed SHA at UAT time:** `4954d9ba8723f1f8d06aede91693bad1c4dd43ea` (Phase 100 ship)
**Sacred SHA on Mini PC:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓
**Outcome:** **9 / 11 PASS, 2 / 11 FAIL** → PARTIAL-PASS. Routing fix queued as Plan 100-06; v33 milestone does NOT flip to ✅ Shipped until 100-06 lands and a follow-up walk shows 11/11.

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | WebApp A → port 15900, RFB handshake, Chrome visible | **PASS** | User-confirmed: WebApp A click → first stream window with live VNC content. Multi-stream creation already worked on prior build per user. |
| 2 | WebApp B → port 15901, independent stream | **PASS** | User-confirmed: 2 ekran açık, ikisi farklı ekran paylaşımlarında (different content). B1 (`--app=URL`) Chrome IPC merge issue resolved at OS-window-creation layer. |
| 3 | Both render simultaneously, no cross-talk in clicks | **FAIL** | User: "ekran tıklamaları son açtığımı kontrol ediyor" → mouse clicks on stream A always operate on the last-opened WebApp B's Chrome window. **Root cause (not B1):** x11vnc `-id <wid>` binds capture, but input forwards to focused window via `XTestFakeKey/MotionEvent`. Fix queued as Plan 100-06 (creative: bypass x11vnc input via `xdotool --window <wid>` tRPC mutation). |
| 4 | No URL bar (only top drag-strip + close-X) | **PASS** | 100-03 dropped WebAppToolbar + ResizablePanelGroup; visual confirmed. |
| 5 | Stream area fills the window | **PASS** | 100-03 root wrapper = `relative flex h-full w-full flex-col`; stream pane has `pb-9` reservation for action bar. |
| 6 | Bottom 4-icon row visible (Chat / Teach / Watch / Auto) | **PASS** | 100-04 added `absolute inset-x-0 bottom-0 z-20` action bar with MessageCircle / GraduationCap / Eye / Bot Lucide icons. |
| 7 | Chat icon opens slide-in drawer; close returns full stream | **PASS** | 100-04 `<Sheet side='right' className='!w-[35%]'>` controlled by `openDrawer` state; toggleDrawer second-click closes. |
| 8 | Teach icon opens recorder UI in drawer | **PASS** | 100-04 WebAppTeachDrawer renders skills sidebar + replay scrubber + Record/Stop. |
| 9 | Bytebot Auto in WebApp A doesn't disturb WebApp B | **FAIL** | User: "pencerenin altında Chat kısmında yazdığımda son açılan uygulama için çalışıyor onu görüyor sadece" → typing in WebApp A's Chat drawer always operates on WebApp B's bytebot. **Root cause (not B1):** per-WebApp `bytebot:webapp:<wid>` MCP servers ARE registered (Phase 97), but the agent loop's tool routing falls back to default host `bytebot` MCP server when chat is invoked, OR the system prompt doesn't scope the agent's tool whitelist to the per-webapp MCP namespace. Fix queued as Plan 100-06 (creative: chat MCP scoping system-prompt fix + every bytebot tool call gets explicit windowId param). |
| 10 | Sacred SHA unchanged on Mini PC | **PASS** | `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ verified live (deploy section of 100-05-SUMMARY.md). |
| 11 | UAT signoff documented here | **PARTIAL** | User signed off as PARTIAL-PASS via interactive checkpoint: visual scope (rows 4-8) + multi-stream creation (rows 1-2) + sacred (row 10) all PASS; rows 3 + 9 (routing) FAIL with documented remediation in Plan 100-06. **v33 milestone remains CODE-COMPLETE-PENDING-UAT**, NOT ✅ Shipped. |

**Subjective vibe — overall feel of multi-stream redesign:** Visual rewire feels right (chromeless, full-bleed, cleaner action bar). Multi-stream concurrency works at the rendering layer. Routing bugs are the gap between "shippable" and "ready to ship".

**Path to v33 ✅ Shipped:** Plan 100-06 ships → re-walk Phase 100 UAT → 11/11 PASS → flip v33 ✅ Shipped.

---

## Phase 110 — Phase 99 WebApp Launcher VNC Swap Carry-over (OPERATOR-PENDING 2026-05-13)

**Walker:** `bruce` (the user) — operator-pending; not yet walked
**Deployed SHA at smoke-test time:** `1df2ec666dc7f12ff5aeccc21e437d333610c652` (master tip, post Phase 111 + tunnel + cmdk cleanup; Phase 99 source already live on Mini PC since Phase 99-04 ship `351bcb62`)
**Sacred SHA on Mini PC:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (verified at Phase 100 Row 10 PASS — UNCHANGED since)
**Outcome:** **CODE-COMPLETE-PLUS-RUNTIME-SMOKE; OPERATOR-PENDING for binding browser walk**

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| P110-1 | x11vnc backend on Mini PC `:0` produces RFB 003.008 handshake banner on a fresh listener | **PASS** | Smoke test (Plan 110-01 Task 1): ephemeral `x11vnc -display :0 -localhost -rfbport 5933 -timeout 30 -shared -nopw -noxdamage` + `nc 127.0.0.1 5933` captured ASCII `RFB 003.008` (hex `5246 4220 3030 332e 3030 380a`); x11vnc log confirms 2× `Got connection from client 127.0.0.1` + `check_access: client 127.0.0.1 matches host 127.0.0.1` + RFB ProtocolVersion handshake. Cleanup via `pkill -f "x11vnc.*5933"` (log: `caught signal: 15`). |
| P110-2 | No production-state pollution from smoke test | **PASS** | Pre-state had only the canonical Mini PC production `x11vnc -rfbport 5900` (PID 3095510, `-display :0 -auth /run/user/1000/gdm/Xauthority`) which is the GNOME-on-Xorg session helper — UNTOUCHED across the smoke test. Post-state `pgrep -af "x11vnc.*5933"` returns empty. Smoke port 5933 chosen outside the production [15900,16100) per-stream port ring (D-110-EPHEMERAL-LOCALHOST-ONLY). |
| P110-3 | WebApp click → stream window → noVNC handshake (browser-walked binding) | **OPERATOR-PENDING** | Mini PC is bruce's active OwnCloud per [feedback_minipc_is_owncloud_primary]. Browser walk happens at operator's discretion in their own session. Procedure: open `https://bruce.livinity.io`, click WebApp icon, confirm stream window opens with no `Invalid server version ftypiso` error, confirm DevTools console shows `[RFB] handshake state: started → ProtocolVersion → … → connected`. |
| P110-4 | Bidirectional input pass-through (mouse + keyboard via `xdotool --window <wid>`) | **OPERATOR-PENDING** | Same as P110-3 — operator-walked. Per Phase 99 SUMMARY, this was confirmed PASS on 2026-05-08 against deployed SHA `cd6f442` (the Phase 99 ship); regression risk between then and `1df2ec6` is low (no streaming-subsystem edits in the 14 master commits between). |
| P110-5 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved | **PASS** | Plan 110-01 Task 2 Step E re-verified `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d…` before commit. Pre-commit hook gated. |
| P110-6 | No source-tree changes from Phase 110 closure (D-110-NO-RECODE) | **PASS** | `git diff HEAD~1..HEAD -- liv/ livos/` = empty (asserted in 110-SUMMARY.md Self-Check). Closure is 6 `.planning/` files only. |

**Subjective note:** Phase 110 closure is intentionally lightweight. The hard work (TDD-driven `vnc-bridge.ts` + `StreamSession` discriminated union + `WindowManager` swap + WS dispatch) shipped in Phase 99-01..99-04 (11 commits, 66/66 vitest cases). Phase 99-05 partial-closed it (`66f6b75e docs(99-05/100): close Phase 99 PARTIAL-PASS, queue Phase 100`) and queued the multi-stream + UI gaps to Phase 100, which itself partial-shipped on 2026-05-08. Phase 110 captures the missing carry-over `[x]` artifact + adds a non-disruptive runtime smoke + records the binding UAT as operator-pending so v34.0 can flip to CODE-COMPLETE without forcing the operator to interrupt their OwnCloud session.

**Path to Phase 110 ✅ Shipped:** Operator opens `https://bruce.livinity.io` in their own browser → walks P110-3 + P110-4 → reports PASS in chat → next session flips Phase 110 ROADMAP entry from `[~]` (CODE-COMPLETE-PLUS-RUNTIME-SMOKE) to `[x]` (SHIPPED) and Phase 110 UAT row's P110-3 + P110-4 from OPERATOR-PENDING to PASS.
