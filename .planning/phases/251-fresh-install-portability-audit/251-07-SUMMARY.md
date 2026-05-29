---
phase: 251-fresh-install-portability-audit
plan: 07
subsystem: infra
tags: [audit, portability, terminal, pty, xterm, webgl, sudoers, feature-flag, caddy, websocket]

# Dependency graph
requires:
  - phase: 251-fresh-install-portability-audit
    provides: 251-RESEARCH.md verified leads (ws-handler.ts:466 username:'bruce', server/index.ts WS branch, common.ts httpOnlyPaths, PersistentTerminalPanel.tsx WebGL+font, @xterm/addon-webgl pin, use-terminal-ws.ts host)
provides:
  - "Terminal hot-fix (246) portability findings — 5-item COVERED/GAP table, fresh-box verdict, 2 remediation items (PTY self-sudo sudoers gap + feature-flag never seeded)"
affects: [251-09, 252-remediation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Audit findings doc tracing the build chain (dep pin + lockfile) AND the runtime privilege chain (sudoers vs spawn argv) to a single fresh-box verdict"]

key-files:
  created: [.planning/phases/251-fresh-install-portability-audit/findings/251-07-FINDINGS.md]
  modified: []

key-decisions:
  - "Verdict: build chain is portable (WebGL addon exact-pin 0.18.0 in ui/package.json:75 + lockfile:821/8393/27154, node-pty dep present, WS host derived from window.location — no hardcode), but the panel will NOT open a shell on a fresh box for TWO reasons: (1) PTY spawns sudo --user bruce --login bash (session.ts:103) with NO sudoers grant for bash/login shell in sudoers.d/livinityd — bruce->bruce self-sudo prompts for an unsupplyable password; (2) feature flag livos:v43:terminal_panel defaults OFF (feature-flag.ts:28) and is seeded nowhere in scripts/install/ so the dock entry is hidden"
  - "WS route + Caddy matcher (@livos_terminal_ws unconditional, caddy.ts:453) + cookie auth (LIVINITY_PROXY_TOKEN -> getAdminUser, the 2026-05-29 boolean-true hot-fix) + httpOnlyPaths force-HTTP (common.ts:737) all COVERED and box-agnostic"
  - "R-251-07-A (PTY sudo-bash sudoers gap) overlaps the 251-04 PTY-user dimension — flagged not duplicated; synthesis (251-09) to dedup"

patterns-established:
  - "When auditing a feature, separate the BUILD chain (deps/lockfile/bundler resolution) from the RUNTIME privilege chain (systemd User= + sudoers vs the actual spawn argv) — a feature can build perfectly and still fail to run for privilege reasons"

requirements-completed: [PORT-251-TERMINAL]

# Metrics
duration: ~10min
completed: 2026-05-29
---

# Phase 251 Plan 07: Terminal Hot-Fix (246) Portability Summary

**Read-only audit proving the LivOS desktop terminal panel BUILDS cleanly on a fresh box (WebGL addon exact-pinned + lockfile-present, node-pty dep declared, WS host fully relative via `window.location` — zero hardcode) and its WS route + Caddy matcher + cookie auth are all portable — BUT it will NOT open a shell on a fresh install because (1) the PTY spawns `sudo --user bruce --login bash` (`session.ts:103`) with no matching sudoers grant (a `bruce→bruce` self-`sudo` that prompts for an unsupplyable password) and (2) the `livos:v43:terminal_panel` feature flag defaults OFF and is seeded nowhere in the installer, hiding the dock entry.**

## What Was Done

Audited the full terminal build + runtime chain across 5 dimensions, citing file:line evidence for each:

- **(a) `@xterm/addon-webgl` build** — COVERED. Exact-pin `0.18.0` in `ui/package.json:75`; present in `pnpm-lock.yaml` at importer (`:821`), package (`:8393`), and resolution (`:27154`) levels. Sibling xterm addons all in deps. Runtime WebGL2-unavailable handled via `try/catch` → DOM-renderer fallback (`PersistentTerminalPanel.tsx:311-323`).
- **(b) WS route + Caddy** — COVERED. `/livos/terminal/ws` mounted (`server/index.ts:1393`) with a dedicated upgrade branch bypassing the `?token=` gate (`:1099-1110`); Caddy emits `@livos_terminal_ws` unconditionally → `127.0.0.1:8080` (`caddy.ts:453`, drift-locked by tests).
- **(c) Feature flag default** — GAP. `feature-flag.ts:28-33` is default-OFF; `terminal_panel` is grepped only in a UAT-close script, never seeded at install time.
- **(d) PTY `username:'bruce'`** — GAP/BLOCKER. `bruce` user IS created (`bruce-user-bootstrap.sh:34`), but `sudoers.d/livinityd` grants Runas-bruce NOPASSWD only for chrome/xvfb/x11vnc/xdotool — no `bash`/login-shell alias for the `sudo --user bruce --login bash` spawn (`session.ts:82-103`). livinityd runs `User=bruce` (`test-systemd-user-bruce.sh:28`), so this is a self-`sudo` that fails on password prompt. Cross-ref 251-04.
- **(e) Hardcoded WS host** — COVERED (no hardcode). `buildTerminalWsUrl()` derives protocol/host/port entirely from `window.location` (`use-terminal-ws.ts:61-74`).

## Deviations from Plan

None - plan executed exactly as written (single read-only audit task → findings doc → commit).

## Self-Check: PASSED

- FOUND: `.planning/phases/251-fresh-install-portability-audit/findings/251-07-FINDINGS.md`
- FOUND: commit `eeaa159a` (`docs(251-07): terminal hot-fix (246) portability audit findings`)
