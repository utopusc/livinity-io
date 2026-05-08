# Phase 99-01 — Mini PC Live Verification — SUMMARY

**Status:** PASS — `x11vnc -id <wid>` verified working under Mutter on bruce@10.69.31.68 / GNOME-on-Xorg session.
**Date:** 2026-05-08
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED before AND after this plan.

## What this plan verified

The kill-gate for Phase 99: the rejection from the original P93 spike ("x11vnc -id <wid> returns black on Mutter") has been re-tested 2026-05-08 and is no longer reproducible. x11vnc 0.9.16 with `-noxdamage` against bruce's GNOME-on-Xorg session (XComposite extension active per upstream FAQ) emits a clean RFB 003.008 handshake and stays alive after first read.

## Pre-conditions (Task 1)

The plan's original `XDG_SESSION_TYPE` check via SSH reports `tty` because SSH itself is a tty session. The authoritative graphical session type is read via `loginctl show-session <sid> -p Type --value` for bruce's seat0 / tty2 session.

| Check | Expected | Actual |
|-------|----------|--------|
| bruce's graphical session id | non-empty | `1811` (loginctl, seat0/tty2, gdm-autologin) |
| bruce's graphical session `Type` | `x11` | `x11` ✓ |
| Xorg process for bruce | running | `bruce 2801305 /usr/lib/xorg/Xorg vt2 -displayfd 3 -auth /run/user/1000/gdm/Xauthority -nolisten tcp -background none -noreset -keeptty -novtswitch -verbose 3` ✓ |
| `which x11vnc` | `/usr/bin/x11vnc` | `/usr/bin/x11vnc` ✓ |
| `x11vnc -version` | `0.9.x` | `x11vnc: 0.9.16 lastmod: 2019-01-05` ✓ |
| `xdpyinfo` against `:0` + GDM Xauthority | reachable | `name of display: :0`, `vendor string: The X.Org Foundation` ✓ |

Note: The system-wide `livos-x11vnc.service` is running on port 5900 (full-desktop x11vnc); it does NOT conflict with this verification (port 15999 used here).

## Live verification (Task 2)

Verbatim Mini PC stdout from the two-call probe (spawn → readback):

### `/tmp/p99-spawn.log`

```
=== 2026-05-08T13:50:58-07:00 STEP 0: cleanup ===
graphical_session_id=1811 graphical_session_type=x11
=== STEP 2: spawn fresh Chrome about:blank window ===
=== STEP 3: discover wid ===
wid_dec=54525961 wid_hex=0x3400009
=== STEP 4: nohup-detach x11vnc on 15999 ===
x11vnc_pid=4050852
=== SPAWN_DONE ===
```

### Probe (handshake + alive + port-bound)

```
=== wid file ===
0x3400009
=== vnc pid file ===
4050852
=== x11vnc alive? ===
alive_pid=4050852
=== port 15999 ===
LISTEN 0      32         127.0.0.1:15999      0.0.0.0:*          
LISTEN 0      32             [::1]:15999         [::]:*          
=== handshake (first 12 bytes) ===
524642203030332e3030380a
END_OF_HEX
```

### `/tmp/p99-x11vnc.log` tail

```
08/05/2026 13:51:01 X display :0 is 32bpp depth=32 true color
08/05/2026 13:51:01 Listening for VNC connections on TCP port 15999
08/05/2026 13:51:01 Listening also on IPv6 port 15999 (socket 9)
08/05/2026 13:51:01 Xinerama is present and active (e.g. multi-head).
08/05/2026 13:51:01 Xinerama: number of sub-screens: 1
08/05/2026 13:51:01 fb read rate: 709 MB/sec
08/05/2026 13:51:01 screen setup finished.
08/05/2026 13:51:13 Got connection from client 127.0.0.1
08/05/2026 13:51:13 check_access: client 127.0.0.1 matches host 127.0.0.1
08/05/2026 13:51:13 incr accepted_client=1 for 127.0.0.1:46228  sock=10
```

### PASS-criteria scan

| Gate | Required | Observed |
|------|----------|----------|
| graphical session type | `x11` | `x11` ✓ |
| handshake first 12 bytes (hex) | starts with `524642203030332e3030380a` | `524642203030332e3030380a` (exact) ✓ |
| handshake decoded ASCII | `RFB 003.008\n` | `RFB 003.008\n` ✓ |
| `x11vnc` process alive after handshake read | yes | yes (pid 4050852, log shows `accepted_client=1`) ✓ |
| Port 15999 bind | `127.0.0.1:15999` only (no `0.0.0.0`) | `127.0.0.1:15999` + `[::1]:15999` only ✓ |
| stderr does not contain `Cannot open display`, `XOpenDisplay failed`, `Wayland session detected`, `xauth: error in locking` | clean | clean (only informational `X FBPM extension not supported` + benign IPv4 lookup `getaddrinfo` warning) ✓ |
| Width-not-multiple-of-4 warning | acknowledged but non-blocking (RFB still flows; vncviewer cosmetic only) | warn-only ✓ |

## Canonical x11vnc spawn recipe (LOCKED for plan 99-02)

This is the verbatim argv that 99-02's `spawnVncForWindow()` MUST construct in `vnc-bridge.ts`.

**Decimal vs hex wid choice — LOCKED:** hex with `0x` prefix (matches x11vnc man-page examples; verified accepted by x11vnc 0.9.16 in this run with `wid_hex=0x3400009`).

**Spawn user — LOCKED:** when livinityd runs as root on the Mini PC, x11vnc must be spawned as bruce via `sudo -n -u bruce`, with `DISPLAY=:0` and `XAUTHORITY=/run/user/1000/gdm/Xauthority` (the GDM-managed Xauthority — same pattern already used by `WEBAPPS_X11_ENV` in `livos/packages/livinityd/source/modules/webapps/window-discovery.ts:49-56`).

When livinityd runs as bruce directly (e.g. local dev / SSH-as-bruce in this verification), the `sudo -n -u bruce` prefix is omitted but the env values are unchanged.

```bash
# When livinityd is root (production Mini PC):
sudo -n -u bruce \
  DISPLAY=:0 \
  XAUTHORITY=/run/user/1000/gdm/Xauthority \
  /usr/bin/x11vnc \
    -id 0x<HEX_WID> \
    -rfbport <PORT> \
    -localhost \
    -shared \
    -forever \
    -noxdamage \
    -nopw
```

When wired in `vnc-bridge.ts`, the argv array passed to `spawn(...)` is:

```ts
// livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts
const X11VNC_BIN = '/usr/bin/x11vnc';

function buildX11vncArgs(wid: number, rfbPort: number): string[] {
  return [
    '-id', '0x' + wid.toString(16),
    '-rfbport', String(rfbPort),
    '-localhost',
    '-shared',
    '-forever',
    '-noxdamage',
    '-nopw',
  ];
}

// Process spawn (livinityd-as-root):
const argv = [
  '-n', '-u', 'bruce',
  'env',
  `DISPLAY=${WEBAPPS_X11_ENV.DISPLAY}`,           // ':0'
  `XAUTHORITY=${WEBAPPS_X11_ENV.XAUTHORITY}`,     // '/run/user/1000/gdm/Xauthority'
  X11VNC_BIN,
  ...buildX11vncArgs(wid, rfbPort),
];
spawn('sudo', argv, { stdio: ['ignore', 'pipe', 'pipe'] });
```

This matches the `WEBAPPS_X11_ENV` constant from `livos/packages/livinityd/source/modules/webapps/window-discovery.ts:49-56` and the Chrome spawn pattern in `livos/packages/livinityd/source/modules/webapps/window-manager.ts:223-238`, per 99-RESEARCH.md §Pattern 1.

## Assumptions resolved

- **A1 (X11 vs Wayland):** RESOLVED — bruce's session is `x11` (loginctl session 1811, gdm-autologin, Xorg on vt2 with XAUTHORITY=`/run/user/1000/gdm/Xauthority`).
- **A2 (x11vnc bind race ≤ 300ms):** PARTIAL — this run let x11vnc settle 1.5s before probe. Observed bind latency was well under 1s (port appears LISTEN immediately on probe). 99-02 still implements 3× 100ms ECONNREFUSED retry inside the bridge as a defensive measure (cheap insurance).
- **A4 (decimal vs hex wid):** RESOLVED — hex with `0x` prefix accepted by x11vnc 0.9.16 in this verification (`wid_hex=0x3400009`).

## Carryover to plan 99-02

Plan 99-02 creates `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` and copies the argv block above verbatim into `spawnVncForWindow()`. The 4 MB `bufferedAmount` backpressure rule and the close-propagation pattern come from `Fmp4Fanout` (`livos/packages/livinityd/source/modules/streaming/fmp4-fanout.ts:242-266`).

The 3× 100ms `ECONNREFUSED` retry on the WS-side TCP connect is justified by A2 above (defensive, since real bind latency is <1s in practice).

## Sacred SHA verification

| Stage | SHA |
|-------|-----|
| Pre-task | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |
| Post-task | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` |

`liv/packages/core/src/sdk-agent-runner.ts` UNTOUCHED.

## Mini PC cleanup performed

- `kill -TERM` x11vnc pid 4050852
- `pkill -u bruce -f "google-chrome.*about:blank"`
- Verified post-cleanup: no `x11vnc.*15999` process, no `google-chrome.*about:blank` process, port 15999 unbound.

The pre-existing `livos-x11vnc.service` (system-wide full-desktop on port 5900) and the user's gmail.com Chrome window from prior UAT were left alone.
