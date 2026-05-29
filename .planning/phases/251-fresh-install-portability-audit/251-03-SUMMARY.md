---
phase: 251-fresh-install-portability-audit
plan: 03
subsystem: computer-use / luse / terminal / installer
tags: [audit, read-only, binaries, apt, packages, portability, fresh-install, xterm, xephyr]
requires: []
provides: "Binary/package dependency matrix + definitive MISSING-PACKAGE list for the v44/250-hotfix computer-use change surface"
affects: []
tech-stack:
  added: []
  patterns: ["read-only evidence-backed audit (D-251-EVIDENCE)"]
key-files:
  created:
    - .planning/phases/251-fresh-install-portability-audit/findings/251-03-FINDINGS.md
  modified: []
decisions:
  - "17 external binaries spawned in the computer-use change neighbourhood; mapped each to its apt package + the feature it powers + the missing-binary error path"
  - "6 packages MISSING from every installer apt list: xserver-xephyr + xterm (HIGH), gnome-terminal (MED), x11-utils + xclip + wmctrl (LOW)"
  - "xterm is the only strictly NEW-this-session dep (b774c20b terminal->xterm); Xephyr gap is latent P248 hole the manual Mini PC apt install masked"
  - "imagemagick/import RULED OUT as a code dependency — no spawn/execFile of import anywhere in computer-use/; the live-box apt install imagemagick was manual debugging-only"
metrics:
  duration: "~12 min"
  completed: 2026-05-29
---

# Phase 251 Plan 03: Binary/Package Dependency Matrix Audit Summary

Read-only audit enumerating every OS binary the Luse/terminal change neighbourhood spawns, mapping each to a
Debian/Ubuntu apt package, and diffing against the installer apt lists to produce a definitive MISSING-PACKAGE
list. Result: 6 packages are absent from every install path; the two HIGH-severity gaps (`xserver-xephyr`,
`xterm`) leave the v44 display-lifecycle default mode and the 250-hotfix terminal-launch path DEAD on a fresh
install. The recon-flagged `imagemagick` dependency is ruled out — no code spawns `import`.

## What Was Done

- **Task 1 — binary enumeration (committed `5bf39936`):** Grepped `spawn`/`execFile`/`exec`/child_process and
  the APP_MAP/APP_ALIASES tables across `computer-use/`. Produced a 17-row matrix: each binary, its spawn site
  (`file:line`), the feature it powers, the missing-binary error path (caught-and-swallowed vs graceful-fallback
  vs isError), and its apt package. Key sites: Xephyr/Xvfb (`displays/display-manager.ts:114-123`), xterm via
  `APP_ALIASES.terminal` (`mcp/tools.ts:1174,1183`), gnome-terminal/firefox/code/nautilus/thunderbird
  (`native/window.ts:56-67` APP_MAP), xdotool (`native/input.ts`), xclip (`native/input.ts:965`), maim/scrot
  (`native/screenshot.ts:159,199`), xdpyinfo (`native/display-size.ts:74`), wmctrl (`native/window.ts`).
- **Task 2 — installer diff (same commit):** Quoted the verbatim apt lists from
  `deploy-livinityd.sh:118-122` (system) + `:513-524` (streaming) and `update.sh:359-372`, then marked each
  binary INSTALLED (with the apt line) or MISSING. Built the severity-ordered MISSING list with a
  copy-pasteable remediation snippet targeting `_dld_install_streaming_packages` + the `update.sh` mirror, and
  flagged NEW-this-session (`xterm`) vs LATENT (`xserver-xephyr`, `gnome-terminal`, `x11-utils`, `xclip`,
  `wmctrl`) deps.

## Key Findings (verdicts)

- **`xterm` MISSING (HIGH, NEW):** breaks `computer_launch_app_in_display({app:'terminal'})`. Worse, the ENOENT
  is swallowed by the `child.on('error')` listener (`tools.ts:1198`) → SILENT failure, agent gets no terminal
  and no error. Introduced by commit `b774c20b`.
- **`xserver-xephyr` MISSING (HIGH, LATENT):** breaks `computer_create_display` DEFAULT mode (xephyr). Only the
  opt-in `xvfb` mode works out-of-box. (Corroborates 251-02.)
- **`gnome-terminal` MISSING (MED, LATENT):** `computer_application({application:'terminal'})` on host `:1`.
- **`x11-utils` (xdpyinfo), `xclip`, `wmctrl` MISSING (LOW, LATENT):** graceful degrade / fallback paths exist;
  `input.ts:920,945` even has a comment falsely claiming xclip is on the apt list.
- **`imagemagick`/`import`: NOT a dependency** — zero `import` binary spawns in `computer-use/`; nested-display
  dimensions come from `xdpyinfo`, screenshots from `maim`/`scrot`. The live-box `apt install imagemagick` was
  manual-only and is excluded from the MISSING list.
- All Path-A-covered binaries (Xvfb / xdotool / maim / scrot / x11vnc / websockify / fluxbox): present & verified.

## Remediation (for 251-09 backlog)

Single apt block added to `_dld_install_streaming_packages` (`deploy-livinityd.sh`) + the `update.sh:359-372`
mirror: `xserver-xephyr xterm gnome-terminal x11-utils xclip wmctrl`. Optionally extend the post-install verify
loop (`deploy-livinityd.sh:534`) with `Xephyr xterm` so missing critical binaries surface a warning. Full
copy-pasteable snippet is in the findings doc §3.

## Deviations from Plan

None — plan executed exactly as written. Read-only audit; the ONLY file created is the findings doc under the
phase directory (D-251-READONLY satisfied). No source modified; sacred SHA preserved (commit hook
`[sacred-sha] PASS: 20 files verified`, D-V44-SACRED held). The two plan tasks were combined into one commit
since the matrix and the diff form a single cohesive findings document.

## Self-Check: PASSED

- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-03-FINDINGS.md` (137 lines > 40 min)
- FOUND: commit `5bf39936` `docs(251-03): binary/package dependency matrix audit findings`
