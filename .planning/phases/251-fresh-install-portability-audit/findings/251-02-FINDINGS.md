# 251-02 Findings — Luse Display Backend (Xephyr/Xvfb) Portability

**Dimension:** Does `computer_create_display` succeed on a fresh install, given the default mode is
`xephyr` while only Xvfb is installed by the installer?
**Date:** 2026-05-29
**Classification key:** PRE-EXISTING vs NEW-THIS-SESSION · COVERED vs GAP vs RISK · evidence = file:line / script:line.

---

## Verdict (headline)

**`computer_create_display()` with DEFAULT args FAILS on a fresh install.** The handler defaults to
mode `xephyr` (`D-V44-DISPLAY-XEPHYR-DEFAULT`), but **no installer apt list installs `xserver-xephyr`** —
only `xvfb` is installed. The spawn of the missing `Xephyr` binary fails ENOENT, *but the failure is
silent*: `create()` returns a success envelope (with a bogus pid and a Redis HSET) before the async
`error` event fires, because the display-manager has **no `child.on('error')` handler**. Net effect on a
clean box: AI is told the display was created, a `luse:display:<id>` Redis key exists, but **no X server
is actually running** — every subsequent `launch_app_in_display` / screenshot against that display fails.

The `xvfb` opt-in path (`mode:'xvfb'`) *does* work on a fresh box — Xvfb is installed and verified. So the
backend is only broken for the **default** call shape.

A second, latent issue: the seed `mcp-servers.json` hardcodes `XAUTHORITY=/run/user/1000/gdm/Xauthority`,
which assumes a **GDM** login session for uid 1000. A fresh LivOS box runs **Xvfb `:1` under fluxbox with
NO GDM**, so `/run/user/1000/gdm/Xauthority` does not exist. This does not block nested-display creation
(create_display spawns its own X server `:10+` and does not consume that XAUTHORITY for the spawn), but it
poisons the *parent* DISPLAY/XAUTHORITY environment luse inherits for host-display screenshots.

---

## Findings table

| # | Finding | Evidence | Class | Status | Severity |
|---|---------|----------|-------|--------|----------|
| 1 | Default `create_display` mode is `xephyr` | `display-manager.ts:216` `input.mode ?? 'xephyr'` + `mcp/tools.ts:1028` passes `undefined` when caller omits `mode` | NEW (P248) | — | — |
| 2 | Xephyr spawn argv = `Xephyr :N -screen WxH -ac -noreset` | `display-manager.ts:120-123` | NEW (P248) | — | — |
| 3 | Xvfb spawn argv = `Xvfb :N -screen 0 WxHx24 -ac -noreset` | `display-manager.ts:114-118` | NEW (P248) | — | — |
| 4 | `xserver-xephyr` installed by NO script (grep `.sh` = only docs/close scripts) | `deploy-livinityd.sh:513-524` (streaming apt), `update.sh:359-376`; no `xephyr` in any apt list | NEW (recon-confirmed) | **GAP** | **HIGH** |
| 5 | `xvfb` IS installed + verified | `deploy-livinityd.sh:523` `xvfb fluxbox`, verify loop `:534` checks `Xvfb`; `update.sh:369,380` | PRE-EXISTING | COVERED | — |
| 6 | Verify loop checks `Xvfb` but NOT `Xephyr` → missing-Xephyr is never surfaced at install time | `deploy-livinityd.sh:534`, `update.sh:380` (`for bin in ffmpeg ... Xvfb fluxbox`) | PRE-EXISTING | **GAP** | MEDIUM |
| 7 | `create()` has NO `child.on('error')` handler → ENOENT on missing Xephyr is swallowed; success envelope + Redis HSET returned anyway | `display-manager.ts:224-253` (spawn → hset → return; no error listener; `pid: handle.pid ?? -1`) | NEW (P248) | **GAP/RISK** | **HIGH** |
| 8 | Seed hardcodes `XAUTHORITY=/run/user/1000/gdm/Xauthority` (GDM assumed) | `seeds/mcp-servers.json:176`; fresh box = Xvfb `:1` via fluxbox, no GDM (recon `deploy-livinityd.sh:523`) | PRE-EXISTING | RISK | MEDIUM |
| 9 | Seed hardcodes parent `DISPLAY=":1"` | `seeds/mcp-servers.json:175` | PRE-EXISTING | COVERED (fresh box does run `:1`) | LOW |

---

## Per-mode binary requirements

- **xephyr (DEFAULT):** needs the `Xephyr` binary (Debian/Ubuntu pkg `xserver-xephyr`). Xephyr is a
  *nested* X server: it draws into a window on a parent X display, so it conceptually needs a parent
  `DISPLAY` + matching `XAUTHORITY` to attach to. The current argv (`display-manager.ts:120-123`) targets
  a brand-new display number `:10+` and does **not** pass a parent — Xephyr opens its own top-level window
  on whatever `$DISPLAY` it inherits from the luse process env (the seed `:1`). On a fresh box the `Xephyr`
  binary is simply **absent**, so this never even gets that far.
- **xvfb (opt-in):** needs the `Xvfb` binary (pkg `xvfb`, installed). Xvfb is **headless/standalone** — it
  creates a virtual framebuffer with no parent display and no Xauthority dependency. This is the portable
  path and it works on a clean install today.

---

## Why the failure is silent (the dangerous part)

`createDisplayManager.create()` (`display-manager.ts:212-253`):

1. `spawnFn(cmd, args, {stdio:'ignore', detached:false})` — line 226. With `stdio:'ignore'`, even Xephyr's
   own stderr is discarded.
2. Immediately `redis.hset(...)` the display record — line 232.
3. Returns `{display, name, pid: handle.pid ?? -1}` — line 248-252.

Node's `child_process.spawn` does **not** throw synchronously for a missing binary; it emits an async
`'error'` event. The manager attaches **no** `'error'` listener (contrast `tools.ts` `launch_app_in_display`
which the session *did* add `child.on('error')` to — commit `e87b9dfd`). So on a box without Xephyr:

- `handle.pid` is `undefined` → return value reports `pid: -1` (a soft tell, but the MCP tool still returns
  `isError:false` with a JSON success body — see `tools.ts:1039-1042`).
- A `luse:display:<id>` Redis key is written for a display that has no live X server.
- The AI proceeds to `launch_app_in_display`, which then fails against a dead DISPLAY.

This means the GAP is worse than a clean error — it is a **false-positive success**.

---

## Recommended portable fixes (for the Phase 252 backlog — NOT applied here)

Ranked by effort/impact. Any one of A or B closes the headline gap; C+D harden.

- **A. Install Xephyr (smallest, keeps the visible-by-default UX):** add `xserver-xephyr` to the streaming
  apt list in BOTH `deploy-livinityd.sh:513-524` and `update.sh:359-376`, and add `Xephyr` to the verify
  loops (`:534` / `:380`). Effort: trivial. Keeps `D-V44-DISPLAY-XEPHYR-DEFAULT` intact. *Recommended primary.*
- **B. Make the default fall back xephyr→xvfb when Xephyr is absent:** in `display-manager.ts` `create()`,
  probe for the `Xephyr` binary (e.g. `which Xephyr` / `command -v`) once and, if missing, transparently use
  the xvfb argv. Pairs well with A as defense-in-depth. Effort: small. Note: changes the *observed* default
  on headless boxes (no visible nested window) — acceptable since nothing is visible without a parent X
  anyway on a headless VPS.
- **C. Add a `child.on('error')` handler in `create()`** so a missing/failed binary returns a real error
  envelope (`isError:true`) and does NOT write the Redis key / does NOT report a fake pid. Closes the
  false-positive-success class regardless of which binary is chosen. Effort: small. *Strongly recommended
  independent of A/B.*
- **D. Derive XAUTHORITY robustly instead of hardcoding GDM path:** the seed `XAUTHORITY=/run/user/1000/gdm/
  Xauthority` (`mcp-servers.json:176`) should be resolved at seed time to the actual running session's
  Xauthority (fresh box: the fluxbox/Xvfb `:1` Xauthority, often unset/`~/.Xauthority` or `-ac` no-auth),
  or dropped in favor of the `-ac` (disable access control) the displays already spawn with. Effort: medium
  (touches the seed substitution in `deploy-livinityd.sh _dld_seed_mcp_servers`). Affects host-display
  screenshots more than nested-display creation.

---

## Answers to the plan's success criteria

- **Does `computer_create_display` (default args) succeed on a clean install?** **NO.** Default mode is
  `xephyr`; `Xephyr` binary is installed by no script; the spawn fails ENOENT but the manager swallows it
  and reports a false success. Fix: install `xserver-xephyr` (A) and/or fall back to xvfb (B), and add an
  `error` handler (C).
- **Xauthority/GDM-vs-fluxbox assumption assessed:** the seed hardcodes a GDM Xauthority path
  (`/run/user/1000/gdm/Xauthority`) that does not exist on a fresh fluxbox+Xvfb box (RISK, MEDIUM). It does
  not block nested-display creation but poisons host-display screenshot auth; fix via D (resolve at seed
  time or rely on `-ac`).
