# PLAN — Show a real, usable desktop in the Displays popover (1280×720)

> Handoff doc written 2026-06-02 for review AFTER `/clear`. Self-contained: a fresh
> session should be able to execute from this without re-discovering everything.

## Goal (operator's words)
- The Displays popover host should show a **real, usable desktop** (operator: "Ubuntu",
  "eskiden farklı/daha iyi çalışıyordu" = "it used to work differently/better before").
- Stable **1280×720**.
- The empty branded `:1` fluxbox shell is unsatisfying; operator wants the real thing.

## Where we are now (baseline after this session)
- Popover registers **`:1`** = branded fluxbox shell (wallpaper + tint2 dock), **renders fine**,
  1280×720. Registered in `index.ts` boot via `displayManager.registerExisting(':1', …)`.
- Resolution unified to **1280×720** everywhere: `DEFAULT_DISPLAY_WIDTH/HEIGHT` + `HOST_DISPLAY_WIDTH/HEIGHT`
  in `livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts`.
- Chrome-on-created-display FIXED: `mcp/tools.ts` `computer_launch_app_in_display` injects a
  per-display `--user-data-dir` (+ `--disable-gpu --disable-dev-shm-usage --window-size=1280,720`,
  no `--no-sandbox`). Proven: Chrome renders on a fluxbox display.
- Orphan webapp displays reaped on boot (`reapDeadDisplays` in display-manager.ts); host `:0`/`:1` excluded.

## THE BLOCKER (proven this session)
Tried to register the real **`:0` Ubuntu/GNOME** desktop in the popover. Wired it fully
(forced `:0`→1280×720 via xrandr newmode+addmode+output on disconnected HDMI-1; x11vnc `-auth
/run/user/1000/gdm/Xauthority`; registered as "Ubuntu Desktop"). **Result: BLACK capture.**
- `:0` is **pure X11** (`XDG_SESSION_TYPE=x11`, NO Xwayland), gnome-shell alive (pid varies),
  mutter managing windows (apport-gtk dialogs in the tree).
- But **maim/x11vnc capture solid black + cursor** (2 screenshots, 5446 bytes = pure black).
- **Root cause:** mutter composites via **GL**; on a headless / software-GL (llvmpipe, no GPU
  scanout) box the composited framebuffer is **NOT readable via XGetImage** — which is exactly
  what x11vnc and maim use. Non-compositing **fluxbox `:1` captures fine** (that's the difference).
- Reverted to `:1` (commits `e977f095`→`2697cc10`). `:0` is NOT registered. `vnc-bridge.ts` keeps
  the `:0` `-auth` support (harmless, documents the attempt).

## "It worked before" — PRIOR ART to investigate (key leads)
The current popover uses `displays.getVncUrl` → StreamManager `startStream({mode:'vnc-window'})`
→ **x11vnc** (vnc-bridge.ts). That's the path that's black for GNOME. But the codebase has OTHER
capture paths that predate the popover and may be what the operator remembers working:

1. **`mode: 'desktop'` (ffmpeg `x11grab`)** — `streaming/encoder-args.ts:79-84` builds
   `ffmpeg -f x11grab … :0`. Different grab path than x11vnc. **TEST whether x11grab captures the
   GL-composited `:0`** (it may also be black, OR may work where XGetImage fails). Quick test:
   `ffmpeg -f x11grab -video_size 1280x720 -i :0 -frames:v 1 /tmp/grab.png` (as bruce, DISPLAY=:0,
   XAUTHORITY=/run/user/1000/gdm/Xauthority) → scp + view. If non-black → this is the path.

2. **`mode: 'pipewire-fd'` (gst `pipewiresrc`)** — `encoder-args.ts:133-155`. **PipeWire/portal
   screencast = the compositing-aware capture** that CAN grab GL-composited desktops (this is the
   "correct" modern answer for GNOME). Phase 93 (`D-93-04`) already wired a `pipewire-fd` gst path.
   Investigate: does the StreamManager `'pipewire-fd'` branch (stream-manager.ts:302) still work?
   What feeds the pipewire fd (xdg-desktop-portal-gnome is installed per update.sh apt list)?
   This is likely the BEST path for a real GNOME desktop.

3. **install.sh historical desktop streaming** — `livos/install.sh` ~L90-160 sets up "desktop
   streaming" with GUI detection + **switches GDM Wayland→X11 for x11vnc** + a `livos-x11vnc`
   service (currently INACTIVE) + `livos-set-resolution` (targets ' connected' output → BROKEN on
   this box since outputs are "disconnected"). Git history: `7f9e2e16` (GUI detection + x11vnc
   desktop streaming, Phase 04-01), `a7e93d95` (professional desktop streaming), `26b909aa` (native
   Chrome + desktop streaming), `740a4ff1` (05-01 idle timer during desktop streaming), Phase 103
   (`839b8f18`/`2f90e2f0` master Chrome streaming). **The operator's "worked before" is most likely
   one of these** — the `livos-x11vnc` service streaming `:0` to a fixed VNC, OR the master-Chrome
   desktop stream. Investigate what `livos-x11vnc` streamed + whether it showed a real desktop.

4. **master-chrome streaming** — `chrome-master/master-login-routes.ts:836` does
   `streamManager.startStream({mode:'vnc-window', target:{display}})`. Same x11vnc path → would be
   black for `:0` too, BUT master Chrome may run on its OWN Xvfb (`:99`? see `scripts/setup-chrome-native.sh`
   `Xvfb :99`), which is non-compositing → captures fine. Maybe the operator saw the master-Chrome
   desktop stream.

## Ranked approaches (for the fresh session)
1. **Test ffmpeg `x11grab` on `:0`** (cheap, 5 min). If it captures non-black → route the popover's
   `:0` host through `mode:'desktop'` (ffmpeg) instead of `vnc-window` (x11vnc). Lowest effort if it works.
2. **PipeWire/portal screencast** (`mode:'pipewire-fd'`, gst pipewiresrc + xdg-desktop-portal-gnome).
   The correct compositing-aware path. More work (portal session, fd plumbing) but robust + future-proof.
   Verify the Phase-93 pipewire-fd path still functions; wire `:0` host through it.
3. **Non-compositing real desktop** — instead of GNOME, make the capturable `:1` fluxbox a genuinely
   useful desktop (app menu, file manager, launcher) so it's the "desktop" — OR run a lightweight
   non-compositing session (XFCE without compositor) on a dedicated Xvfb at 1280×720 that x11vnc
   captures fine. Pragmatic, avoids the GL-capture problem entirely.
4. **Virtual connected display** (xserver-xorg-video-dummy + Virtual 1280×720, or EDID force) so
   GNOME composites to a readable scanout buffer. Fragile, needs GDM/Xorg reconfig + reboot. Last resort.

## First steps for the fresh session
1. Read this file + memory `feedback`/`project` entries (MEMORY.md "Common Pitfalls" has the `:0`
   black-capture finding + the PWA service-worker cache gotcha).
2. Run approach #1 test (ffmpeg x11grab :0 → screenshot). Branch on result.
3. If x11grab black too → investigate pipewire-fd path (#2) + what `livos-x11vnc`/master-chrome
   historically streamed (#3) via `git show` on the Phase 04/05/103 commits above.
4. Decide path with operator, then implement as a proper GSD phase (this is phase-sized, not a hotfix).

## Key facts / paths (no re-discovery needed)
- Mini PC: `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@100.112.68.1`. Deploy =
  scp source to `/opt/livos/packages/...` + `sudo systemctl restart livos` (livinityd runs via tsx).
  Redis: `redis-cli -u $(grep -oE 'REDIS_URL=[^ ]+' /opt/livos/.env | cut -d= -f2-)`.
- `:0` GNOME = pure X11, GL-composited, headless (all xrandr outputs "disconnected"). Force res via
  newmode+addmode+output in ONE xrandr session (split = "cannot find mode"). XAUTHORITY=/run/user/1000/gdm/Xauthority.
- Streaming: `streaming/stream-manager.ts` (startStream, modes), `encoder-args.ts` (ffmpeg/gst args),
  `vnc-bridge.ts` (x11vnc spawn — has `:0 -auth` support now), `trpc-router.ts`.
- Popover host registration: `livinityd/source/index.ts` boot (`registerExisting(':1', …)`).
- Display registry key: `luse:display:<:N>` (HSET). getVncUrl gate needs the record to exist.
- ⚠ UI deploys: LivOS is a PWA with a service worker — operator must Clear-site-data to see UI changes.
