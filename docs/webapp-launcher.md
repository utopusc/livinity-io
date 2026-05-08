# WebApp Launcher

LivOS lets you turn any website into a desktop app. Right-click your LivOS desktop, paste a URL, and a new icon appears. Click the icon and the website opens in a real Chrome window on the Mini PC, streamed back to your browser. An AI panel sits next to the stream and can watch you, learn from you, or run a goal for you while you do something else.

This page is the user manual. The architecture lives in `.planning/v33-DRAFT.md` and the phase summaries (`.planning/phases/9X-*/SUMMARY.md`).

---

## 1. What is the WebApp Launcher

A WebApp is a desktop shortcut to a website. Click it and LivOS opens a fresh Chrome window on the Mini PC at that URL, captures the window with a screen-cast pipeline, and shows you the live stream inside a LivOS window. Next to the stream is a small AI panel with four modes:

- **Watch** — passive viewing.
- **Teach** — record what you do as a reusable skill.
- **Auto** — give the AI a goal and let it drive that one window.
- **Chat** — talk to the AI without it touching the window.

All three default sites (Facebook, Gmail, X, or anything else you add) share the **same Chrome profile** on the host. Logging into Google once means every WebApp you create is already signed in.

---

## 2. Prerequisites

- LivOS v33.0 or later, deployed to your Mini PC.
- The Mini PC user (`bruce`) is signed in on the X11 console session — not headless. The launcher captures from the same display the user is logged into.
- Chrome on the Mini PC is already signed into your Google account (one-time setup; cookies persist).
- Single-user only in v33. Multi-user WebApps land in v34.

---

## 3. Adding a WebApp

1. Right-click any empty area of the LivOS desktop.
2. Click **Add WebApp** in the context menu.
3. Paste the URL of the site you want (any HTTPS page works best — sites that work in your existing browser session will work here).
4. Wait a moment — LivOS fetches the page title and favicon and shows you a preview.
5. Optionally edit the title manually.
6. Click **Save**.

A new icon appears on your desktop with the title and favicon. The shortcut survives reloads and reboots — it lives in the Postgres `webapps` table.

You can add as many WebApps as you like. Adding the same URL twice is a no-op — LivOS detects the duplicate and reuses the existing icon.

To remove a WebApp, right-click its icon → **Delete WebApp** → confirm. The icon disappears, any open window closes, and any skills or agent sessions tied to that WebApp are cleaned up automatically (Postgres `ON DELETE CASCADE` on `webapp_skills.webapp_id` and `webapp_agent_sessions.webapp_id`, plus disk GC for skill thumbnails).

---

## 4. Streaming a WebApp

Click any WebApp icon. A LivOS window opens with three panes:

- **Top** — small toolbar (back, forward, refresh, copy URL, fullscreen, popout).
- **Left / main** — the live stream of your Chrome window.
- **Right** — the AI panel with the mode pill (Watch / Teach / Auto / Chat).

The stream renders Chrome's actual window content, not a screenshot of your whole desktop. Mouse moves in the streamed pane forward to the host Chrome cursor; clicks and keystrokes are sent to the host window via the input plumbing (`xdotool` / `ydotool` under the hood).

Behind the scenes there are two streaming paths:

- **PipeWire screencast portal** is the primary path. The Wayland portal hands LivOS a file-descriptor for that one window; gstreamer pipes the frames into a fragmented MP4 stream that your browser plays via Media Source Extensions.
- **ffmpeg `x11grab` window-crop** is the fallback when the portal is unavailable. A geometry tracker follows the window position so the crop stays accurate even if you move the host window.

You don't have to choose — LivOS tries the portal first and falls back transparently. Frame rate, latency and quality are equivalent to the user.

If you click the same WebApp icon while its window is already open, LivOS focuses the existing window instead of opening a duplicate.

If you close the Chrome window via its `✕`, the LivOS shell shows a "Stream ended" state with a **Reopen** button. Click Reopen and a fresh Chrome window spawns at the same URL — your Google session is preserved.

---

## 5. Teaching a Skill

Teach mode records a sequence of actions (clicks, keystrokes, scrolls) so the AI can replay them later as a reusable skill.

1. Open a WebApp window.
2. Flip the mode pill to **Teach**.
3. A privacy toast appears (one-time per install — the ack is stored in your browser's localStorage). A red pulsing dot indicates recording.
4. Perform the actions you want to record in the streamed pane.
5. Click **Stop** in the mode pill.
6. A Save dialog asks for a skill name. Pick something memorable (e.g. `compose-status-draft`).
7. The skill appears in the right-edge skills sidebar with an action count and a thumbnail of the first frame.
8. Click any saved skill to open the replay scrubber — a horizontal timeline with one tile per recorded event. Scrub through to inspect what was captured.

**Privacy note.** Teach mode captures screenshots after every event. Anything visible in the streamed window — including text you type — may end up in the saved skill. **Do not enter passwords, 2FA codes, or other sensitive credentials while teaching.** Skills are private to your account, but the screenshots live on disk and survive a backup.

A 10-minute auto-stop guards against forgotten recordings. After the cap, recording stops automatically and a banner offers to save or discard what was captured.

If a website redesigns its UI and a saved skill no longer works, re-record it. There is no automatic skill-drift detection in v33.

---

## 6. Auto Mode

Auto mode runs an AI goal scoped to one WebApp window. The AI uses the same Bytebot tooling as the global desktop bytebot in `Computer Operator`, but every screenshot and click is restricted to that one Chrome window via `maim -i <wid>` and `xdotool --window <wid>`.

1. Open a WebApp window.
2. Flip the mode pill to **Auto**.
3. (Optional) Pick a previously taught skill from the dropdown — it gets injected into the AI's system prompt as a `<previously-learned-skill>` block.
4. Type a goal in plain English (e.g. `Open the post composer and type 'hello world' as a draft. Do not click Post.`).
5. Click **Run**.

The AI panel narrates each step with a Hermes-style status phrase ("Pondering…", "Contemplating…") and an elapsed-ms counter. Every tool call (screenshot, click, type) is shown as a pill in the chat thread; the side panel renders the screenshots inline. The streamed pane keeps showing the live Chrome window so you can watch the AI work in real time.

If the AI gets stuck — three consecutive screenshots that don't validate as expected — it emits a "needs help" event and pauses. You can take over manually (the streamed pane still accepts your mouse and keyboard) or refine the goal and click Run again.

Auto mode in v33 is single-window-scoped. Each Auto run spawns its own Bytebot MCP child process with `BYTEBOT_TARGET_WINDOW_ID` set to the WebApp's window id. Multiple WebApps can run Auto mode in parallel without colliding.

---

## 7. Privacy and security notes

- **Profile sharing is a UX choice, not a security boundary.** Every WebApp you add reads from the same Chrome user-data dir on the Mini PC. Logging out of Google in one WebApp logs you out everywhere.
- **The stream pipeline crops to your window.** Other windows on the Mini PC desktop are NOT visible to the WebApp shell — the PipeWire portal hands LivOS only that one surface, and the ffmpeg fallback uses a per-window geometry crop. This is still UX, not a security boundary; treat the Mini PC console as trusted.
- **Teach mode screenshots persist on disk.** If a skill captures sensitive text, delete the skill (the on-disk thumbnails are GC'd) or wipe `/opt/livos/data/webapp-skills/<sessionId>/`.
- **Single-user only in v33.** All WebApps are owned by the Mini PC `bruce` user. Multi-user isolation (per-user Chrome profile, per-user stream caps) is v34 work.

---

## 8. Troubleshooting

### The stream is black or grey

- The Chrome window may have been minimised or closed. Click the WebApp icon again to focus or reopen.
- VAAPI hardware encode might be unhealthy. Check `redis-cli hgetall liv:streaming:caps` — if `vaapi=true` but you're seeing artifacts, restart `livos.service` and let the boot probe re-detect. The libx264 fallback always works but consumes more CPU.

### "Stream ended" with no obvious cause

The host Chrome window was closed (by you, by Chrome itself, or because Chrome crashed). Click **Reopen** in the WebApp shell to spawn a fresh window. Your Google cookies survive.

### `vainfo` says "command not found"

The deploy step missed the libva-utils package. Run `sudo apt install -y libva-utils` (the `vainfo` binary ships in this package, not in `vainfo`). LivOS will redetect on the next service restart.

### "Logged out unexpectedly" in a WebApp

Chrome profile issue. Open one WebApp, sign in to Google once, close. The cookies persist for every WebApp afterwards.

### Auto mode can't find a button

- The AI's vision missed the element. Try adding a hint in the goal ("the blue Login button at the top right").
- Record a Teach skill that demonstrates the action and select it as guidance for the next Auto run.
- Take over manually in the streamed pane, then resume Auto mode after the tricky step.

### A Teach skill stopped working

Websites change. Re-record the skill — there's no automatic drift detection in v33.

### Stream is choppy or very high latency

- The Mini PC iGPU may be saturated with concurrent WebApps. With VAAPI present, the concurrent-stream cap is 10. Without VAAPI (libx264 fallback), the cap drops to 5.
- Network: ZeroTier hops add latency. From the LAN, latency should be <500ms. From WAN over ZeroTier, expect 800ms-2s on a flaky day.

### How to fully reset

1. Close every WebApp window.
2. `systemctl restart livos liv-core` on the Mini PC.
3. If the underlying Chrome window manager is stuck, restart the X session (log out and back in on the Mini PC console).

If the issue survives a restart, file an issue with the contents of `journalctl -u livos -n 200 --no-pager` and the relevant rows from `psql -U livos -d livos -c "SELECT * FROM webapps;"`.

---

## 9. Known limits (v33)

- **Single user.** Multi-user WebApps with per-user Chrome profiles are v34.
- **One Chrome profile shared across all WebApps.** Same Google identity everywhere.
- **Desktop-first.** The streamed Chrome window has no special mobile rendering; mobile-aware streaming is v34+.
- **Skills are private to your account.** No marketplace or skill-sharing in v33.
- **No CDP/WebRTC.** v33 uses ffmpeg fMP4 + PipeWire portal; CDP-based control and WebRTC streaming are v34 candidates.
- **Per-window VNC isolation deferred.** The stream pipeline crops to one window via the portal or x11grab, but a determined process on the Mini PC could still observe the broader X session. Treat the Mini PC console as trusted.

---

## 10. What's next

The v33 architectural draft (`.planning/v33-DRAFT.md` §9) lists the planned v34 follow-ups:

- Per-user Chrome profiles + multi-user WebApp namespaces.
- CDP-based control (faster than `xdotool`, no input race conditions).
- WebRTC streaming as an alternative to MSE-fed fMP4.
- Voice control of Auto mode.
- Mobile-aware streamed rendering.
- Skill marketplace.

---

## 11. Sources and further reading

- Architecture: `.planning/v33-DRAFT.md`
- Streaming subsystem decisions: `.planning/phases/93-window-manager/93-SUMMARY.md`
- Add-WebApp UI + persistence: `.planning/phases/94-desktop-launcher/94-SUMMARY.md`
- Stream window + AI panel: `.planning/phases/95-stream-window/95-SUMMARY.md`
- Teach mode internals: `.planning/phases/96-teach-mode/96-SUMMARY.md`
- Auto mode internals: `.planning/phases/97-auto-mode/97-SUMMARY.md` (or `UAT.md`)
- UAT walkthrough: `.planning/phases/98-uat-polish/UAT-CHECKLIST.md`
