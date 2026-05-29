---
phase: 251-fresh-install-portability-audit
plan: 02
subsystem: computer-use / luse display lifecycle / installer
tags: [audit, read-only, luse, display, xephyr, xvfb, portability, fresh-install]
requires: []
provides: "Findings on luse display backend portability (Xephyr default vs only-Xvfb-installed; create_display on a fresh box)"
affects: []
tech-stack:
  added: []
  patterns: ["read-only evidence-backed audit (D-251-EVIDENCE)"]
key-files:
  created:
    - .planning/phases/251-fresh-install-portability-audit/findings/251-02-FINDINGS.md
  modified: []
decisions:
  - "computer_create_display default mode is xephyr (display-manager.ts:216 + tools.ts:1028) — fresh install FAILS because no script installs xserver-xephyr (only xvfb)"
  - "Failure is a silent false-positive success: display-manager create() has no child.on('error') handler, returns success envelope + writes Redis key even when Xephyr binary is absent"
  - "Seed XAUTHORITY=/run/user/1000/gdm/Xauthority assumes GDM; fresh box runs Xvfb :1 via fluxbox (no GDM) — RISK for host-display screenshots, not a create_display blocker"
  - "xvfb opt-in path works fresh (Xvfb installed + verified); only the default xephyr path is broken"
metrics:
  duration: "~10 min"
  completed: 2026-05-29
---

# Phase 251 Plan 02: Luse Display Backend (Xephyr/Xvfb) Audit Summary

Read-only audit determining that `computer_create_display()` with DEFAULT args FAILS on a fresh install:
the handler defaults to mode `xephyr` (`D-V44-DISPLAY-XEPHYR-DEFAULT`) but no installer apt list installs
`xserver-xephyr` (only `xvfb`), and the display-manager swallows the resulting spawn ENOENT — returning a
false-positive success with a bogus pid and a written Redis key.

## What Was Done

- **Task 1 — backend requirements (committed `42db9429`):** Confirmed the default mode is `xephyr` via the
  handler (`mcp/tools.ts:1028` passes `undefined` when caller omits `mode`) cascading into the manager
  default (`display-manager.ts:216` `input.mode ?? 'xephyr'`). Quoted the per-mode spawn argv:
  Xephyr (`:120-123` `Xephyr :N -screen WxH -ac -noreset`) and Xvfb (`:114-118`
  `Xvfb :N -screen 0 WxHx24 -ac -noreset`). Documented that Xephyr is a nested X server (needs the
  `xserver-xephyr` binary + a parent DISPLAY/XAUTHORITY) while Xvfb is headless/standalone.
- **Task 2 — install-side coverage:** Confirmed `xserver-xephyr` is installed by NO script (grep `.sh` =
  only docs/close scripts); only `xvfb` is present (`deploy-livinityd.sh:523`, `update.sh:369`). The
  install-time verify loop checks `Xvfb` but not `Xephyr` (`deploy-livinityd.sh:534`, `update.sh:380`), so
  the missing binary is never surfaced. Assessed the seed `XAUTHORITY=/run/user/1000/gdm/Xauthority`
  (`seeds/mcp-servers.json:176`) GDM assumption against a fluxbox+Xvfb `:1` fresh box (no GDM).
- Identified the silent-failure mechanism: `display-manager.ts` `create()` (`:212-253`) spawns with
  `stdio:'ignore'`, immediately HSETs Redis, and returns `{pid: handle.pid ?? -1}` with NO
  `child.on('error')` handler — so a missing-Xephyr ENOENT is swallowed and reported as success (contrast
  `tools.ts launch_app_in_display` which DID add `child.on('error')` in commit `e87b9dfd`).

## Key Findings (verdicts)

- **Default `create_display`: FAILS fresh (GAP, HIGH)** — mode `xephyr` + `Xephyr` binary absent. False
  positive: AI told display created, Redis key written, no X server actually running.
- **`xvfb` opt-in: COVERED** — Xvfb installed + verified; `mode:'xvfb'` works on a clean box.
- **No `child.on('error')` in manager `create()`: GAP/RISK, HIGH** — converts the missing-binary error into a
  fake success; independent of which binary is chosen.
- **GDM Xauthority hardcode: RISK, MEDIUM** — `/run/user/1000/gdm/Xauthority` doesn't exist on fluxbox+Xvfb;
  poisons host-display screenshot auth, not a create_display blocker.

## Portable Fix Recommendations (for 251-09 backlog)

1. Add `xserver-xephyr` to streaming apt lists (`deploy-livinityd.sh:513-524` + `update.sh:359-376`) and to
   both verify loops (trivial; primary fix, keeps visible-by-default UX).
2. Fall back xephyr→xvfb in `display-manager.ts` `create()` when `Xephyr` is absent (small; defense-in-depth).
3. Add a `child.on('error')` handler to `create()` so a missing/failed binary returns `isError:true` and does
   NOT write the Redis key / fake pid (small; closes the false-positive-success class).
4. Resolve XAUTHORITY at seed time (or rely on the `-ac` no-auth the displays already spawn with) instead of
   hardcoding the GDM path (medium; touches `_dld_seed_mcp_servers`).

## Deviations from Plan

None — plan executed exactly as written. Read-only audit; the ONLY file created is the findings doc under the
phase directory (D-251-READONLY satisfied). No source modified; sacred SHA preserved (commit hook PASS:
20 files verified, D-V44-SACRED held).

## Self-Check: PASSED

- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-02-FINDINGS.md` (117 lines > 35 min)
- FOUND: commit `42db9429` `docs(251-02): luse display backend (Xephyr/Xvfb) audit findings`
