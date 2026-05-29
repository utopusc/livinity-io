# 251-03 FINDINGS — External-Binary Dependency Matrix

**Dimension:** Every OS binary the Luse/terminal change-neighbourhood `spawn`s/`execFile`s, matched against
the installer `apt install` lists, producing a DEFINITIVE MISSING-PACKAGE list.
**Mode:** Read-only audit (D-251-READONLY). Evidence = repo `file:line` + installer `script:line` (D-251-EVIDENCE).
**Produced:** 2026-05-29.

---

## 1. Binary → feature → package matrix

Every external binary spawned in the change neighbourhood (`livos/packages/livinityd/source/modules/computer-use/`),
the tool/feature that needs it, the error path on a missing binary, and the Debian/Ubuntu apt package that provides it.

| # | Binary | Spawn site (file:line) | Feature it powers | Missing-binary path | apt package |
|---|--------|------------------------|-------------------|---------------------|-------------|
| 1 | `Xephyr` | `displays/display-manager.ts:120-123` (buildSpawnArgs default) | `computer_create_display` (default mode `xephyr`, D-V44-DISPLAY-XEPHYR-DEFAULT) | spawn ENOENT → create fails (caught by manager error path) | **`xserver-xephyr`** |
| 2 | `Xvfb` | `displays/display-manager.ts:114-118` (xvfb mode) | `computer_create_display(mode:'xvfb')` headless | spawn ENOENT → create fails | `xvfb` |
| 3 | `xterm` | `mcp/tools.ts:1174` (`APP_ALIASES.terminal → 'xterm'`), spawned `:1183` | `computer_launch_app_in_display({app:'terminal'})` into nested Xephyr | async `'error'` listener `:1198` swallows ENOENT → call returns OK-ish but NO terminal appears | **`xterm`** |
| 4 | `gnome-terminal` | `native/window.ts:60-63` (APP_MAP `terminal`); `mcp/tools.ts:1175` (alias passthrough) | `computer_application({application:'terminal'})` on host `:1` (fluxbox+dbus) | `spawnAndForget` detached, no error surface | **`gnome-terminal`** |
| 5 | `firefox` | `native/window.ts:57` (APP_MAP); `mcp/tools.ts:1176` | `computer_application({application:'firefox'})` / `launch_app_in_display({app:'firefox'})` | detached spawn / swallowed error | **`firefox`** |
| 6 | `code` | `native/window.ts:59` (APP_MAP vscode); `mcp/tools.ts:1177` (`vscode → 'code'`) | launch VS Code | detached spawn / swallowed error | (3rd-party `code` apt repo) |
| 7 | `nautilus` | `native/window.ts:64` (APP_MAP directory); `mcp/tools.ts:1178-1179` (`directory`/`files → 'nautilus'`) | launch file manager | detached spawn / swallowed error | `nautilus` |
| 8 | `thunderbird` | `native/window.ts:58` (APP_MAP) | `computer_application({application:'thunderbird'})` | detached spawn | `thunderbird` |
| 9 | `wmctrl` | `native/window.ts:137,140,158,247,277` | window list / activate / show-desktop (APP_MAP focus path) | `exec` rejects → isError | `wmctrl` |
| 10 | `xdotool` | `native/input.ts:275,341,525` (+ helpers); `mcp/tools.ts:~1614` | mouse-move/key/type/getmouselocation in scoped display | spawn ENOENT → helper returns `false` (never throws) | `xdotool` |
| 11 | `xclip` | `native/input.ts:965` | clipboard paste (`computer_paste`); falls back to keyboard.type on ENOENT | ENOENT → keyboard.type fallback (`input.ts:944`) | `xclip` |
| 12 | `maim` | `native/screenshot.ts:159` | primary screenshot (`computer_screenshot`, window/full) | execFile rejects → `scrot` fallback | `maim` |
| 13 | `scrot` | `native/screenshot.ts:199` | screenshot fallback | execFile rejects → error | `scrot` |
| 14 | `xdpyinfo` | `native/display-size.ts:74` | nested-display dimension probe (prepends `DISPLAY: WxH` to screenshots) | spawn ENOENT → null (graceful, no DISPLAY line) | `x11-utils` |
| 15 | `x11vnc` | (luse `create_stream`, `streaming/` neighbour) `luse-tools.ts:638,654` | `create_stream` VNC on a display | spawn fail → isError | `x11vnc` |
| 16 | `websockify` | streaming neighbour | WS↔VNC bridge for create_stream | spawn fail → stream dead | `websockify` |
| 17 | `fluxbox` | streaming/WebApp display `:1` | host window-manager for `:1` (APP_MAP focus surface) | absent → no WM on `:1` | `fluxbox` |

**`import` (ImageMagick) — RULED OUT as a code dependency.** The recon lead flagged `imagemagick`'s `import`
binary as used "to screenshot nested displays." A full grep of `computer-use/` (incl. `displays/`) finds **NO
`spawn`/`execFile` of `import`** — nested-display dimension probing uses `xdpyinfo` (`display-size.ts:74`) and
screenshots use `maim`/`scrot` (`screenshot.ts:159,199`). The `apt install imagemagick` done by hand on the live
Mini PC was an **operator ad-hoc convenience for manual `import` screenshots during debugging**, NOT a code
dependency. It is therefore a NON-dependency and is **excluded from the MISSING-PACKAGE list below.** (Evidence:
`mcp/tools.ts`, `displays/display-manager.ts`, `native/*.ts` contain zero `'import'` spawn tokens; the only
`import` tokens are ES-module `import` statements.)

---

## 2. Diff against installer apt lists

**Installer apt sources (verbatim, verified):**

- **Path A — `_dld_install_system_packages`** (`scripts/install/deploy-livinityd.sh:118-122`):
  `postgresql postgresql-client redis-server build-essential python3 git rsync openssl samba samba-common-bin`
  (+ `mender-client4` :130, Node 22 :98).
- **Path A — `_dld_install_streaming_packages`** (`scripts/install/deploy-livinityd.sh:513-524`):
  `x11vnc xdotool x11-xserver-utils ydotool maim scrot gnome-screenshot websockify vncsnapshot ffmpeg
  gstreamer1.0-tools gstreamer1.0-plugins-{good,bad,ugly} xdg-desktop-portal-gnome xvfb fluxbox` (+ VAAPI :527-529).
- **`update.sh:359-372`** — same streaming block as Path A.
- **Thin Path B — `scripts/install/system-deps.sh`** — much narrower (build-essential / postgresql-16 / redis-server
  / caddy / git / curl / ca-certificates) per recon; no X stack at all.

**Coverage diff** (per binary from §1; `x11-xserver-utils` provides `xrandr` etc., NOT `xdpyinfo` — `xdpyinfo` is
in `x11-utils`):

| Binary | Package | Path A status | Evidence |
|--------|---------|---------------|----------|
| Xvfb | `xvfb` | ✅ INSTALLED | `deploy-livinityd.sh:523` |
| xdotool | `xdotool` | ✅ INSTALLED | `:514` |
| maim | `maim` | ✅ INSTALLED | `:515` |
| scrot | `scrot` | ✅ INSTALLED | `:515` |
| x11vnc | `x11vnc` | ✅ INSTALLED | `:514` |
| websockify | `websockify` | ✅ INSTALLED | `:516` |
| fluxbox | `fluxbox` | ✅ INSTALLED | `:523` |
| wmctrl | `wmctrl` | ⚠️ **NOT in apt lists** | grep `scripts/install` = 0 hits — likely present via desktop meta-pkg on Mini PC; LATENT GAP on minimal box |
| **xdpyinfo** | **`x11-utils`** | ❌ **MISSING** | `x11-xserver-utils` ≠ `x11-utils`; grep = 0 hits. Degrades gracefully (no DISPLAY-dim line) → LOW |
| **xclip** | **`xclip`** | ❌ **MISSING** | grep `scripts/install` = 0 `xclip` apt hits; `input.ts:920,945` comment claims "72-native-07 includes it" but it is absent. Falls back to keyboard.type → MEDIUM-LOW |
| **Xephyr** | **`xserver-xephyr`** | ❌ **MISSING** | grep = 0 hits; only `xvfb` present. Breaks `computer_create_display` DEFAULT mode → HIGH |
| **xterm** | **`xterm`** | ❌ **MISSING** | grep = 0 hits | Breaks `launch_app_in_display(terminal)` → HIGH (NEW this session) |
| **gnome-terminal** | **`gnome-terminal`** | ❌ **MISSING** | grep = 0 hits; only `gnome-screenshot` present | `computer_application(terminal)` no-op → MEDIUM |
| **firefox** | **`firefox`** | ❌ **MISSING** | grep = 0 hits | `computer_application/launch(firefox)` no-op → LOW (optional app) |
| code | (vscode apt repo) | ❌ MISSING | grep = 0 hits | optional app → LOW |
| nautilus | `nautilus` | ❌ MISSING | grep = 0 hits | optional app → LOW |
| thunderbird | `thunderbird` | ❌ MISSING | grep = 0 hits | optional app → LOW |

---

## 3. DEFINITIVE MISSING-PACKAGE list (severity-ordered, remediation-ready)

Classification: **NEW** = dependency introduced by THIS session's commits; **LATENT** = pre-existing gap.

| Sev | Package | Binary | Breaks | New/Latent | Target installer fn |
|-----|---------|--------|--------|-----------|---------------------|
| 🔴 HIGH | `xserver-xephyr` | Xephyr | `computer_create_display` (DEFAULT mode) → entire v44 display-lifecycle feature | LATENT (P248 shipped code; apt never updated) | `_dld_install_streaming_packages` |
| 🔴 HIGH | `xterm` | xterm | `computer_launch_app_in_display({app:'terminal'})` → silent no terminal | **NEW** (`b774c20b` terminal→xterm) | `_dld_install_streaming_packages` |
| 🟡 MED | `gnome-terminal` | gnome-terminal | `computer_application({application:'terminal'})` on host `:1` | LATENT (APP_MAP pre-existing) | `_dld_install_streaming_packages` |
| 🟢 LOW | `x11-utils` | xdpyinfo | nested-display dimension annotation (graceful degrade) | LATENT | `_dld_install_streaming_packages` |
| 🟢 LOW | `xclip` | xclip | clipboard paste (keyboard.type fallback exists) | LATENT (comment falsely claims installed) | `_dld_install_streaming_packages` |
| 🟢 LOW | `wmctrl` | wmctrl | window activate/focus path; LATENT — may arrive via desktop meta-pkg | LATENT | `_dld_install_streaming_packages` |
| ⚪ OPT | `firefox` / `code` / `nautilus` / `thunderbird` | — | optional app launches via APP_MAP | LATENT | (operator choice — not auto-install) |

**NOT a dependency (excluded):** `imagemagick` / `import` — no code spawns it; the live-box install was manual-only.

### Copy-pasteable remediation snippet

Add to `_dld_install_streaming_packages` (`scripts/install/deploy-livinityd.sh`, alongside the existing
`:513-524` block) **and** the mirror block in `update.sh:359-372`:

```sh
# Phase 251 portability — luse display-lifecycle + terminal binaries the
# v44/250-hotfix code now hard-requires but were never on the apt list.
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    xserver-xephyr \
    xterm \
    gnome-terminal \
    x11-utils \
    xclip \
    wmctrl \
    2>&1 | tail -5 || warn "Some luse display/terminal packages failed to install (non-fatal)"
```

Optionally extend the post-install verify loop (`deploy-livinityd.sh:534`) to include
`Xephyr xterm` so a missing critical binary surfaces a warning.

---

## 4. Verdict per success-criterion

- **xterm → `launch_app_in_display` terminal:** ❌ GAP on every fresh install (HIGH, NEW). Code swallows the
  ENOENT (`tools.ts:1198`) so it FAILS SILENTLY — agent gets no terminal, no error. Worst kind.
- **Xephyr → `create_display`:** ❌ GAP on every fresh install (HIGH, LATENT). Default mode unusable; only the
  opt-in `xvfb` mode works out-of-box.
- **gnome-terminal → `computer_application(terminal)`:** ❌ GAP (MED, LATENT).
- All Path-A-covered binaries (Xvfb/xdotool/maim/scrot/x11vnc/websockify/fluxbox): ✅ present.
- **imagemagick:** non-issue — confirmed not a code dependency.

**Bottom line:** A clean install (Path A) brings up the screenshot + xvfb + input stack, but the v44 visible
display-lifecycle (Xephyr default) and the 250-hotfix terminal-launch path are DEAD until 6 packages are added
to the streaming apt block. Two are HIGH severity; the xterm gap is the only strictly NEW-this-session one, the
Xephyr gap is a latent P248 hole the manual Mini PC `apt install` papered over.
