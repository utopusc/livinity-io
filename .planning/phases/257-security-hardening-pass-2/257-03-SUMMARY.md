---
phase: 257-security-hardening-pass-2
plan: 03
subsystem: computer-use / luse MCP sandbox
tags: [security, sandbox, luse, credential-exfiltration, LIVOS-010]
requires: []
provides:
  - "isPathAllowed credential/dotfile denylist (deny-wins) within the luse home allowlist"
affects:
  - "computer_read_file path guard"
tech-stack:
  added: []
  patterns:
    - "deny-wins two-stage path gate (allowlist admit → sensitive-dir denylist) mirroring 256-01 files-sandbox.ts"
    - "POSIX path-boundary compare (target===root || target.startsWith(root + '/')) to avoid .claudeX false-deny"
key-files:
  created:
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.sandbox.test.ts
  modified:
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
decisions:
  - "Mirror the operator-chosen 256 files-allowlist shape: keep the whole-home allowlist + add a post-realpath credential-dir denylist (deny wins), rather than narrowing the home prefix to an explicit subdir allowlist."
  - "Include the bare ~/.claude.json file (LIVOS-034) in the denylist so a poisoned Claude Code project config can't be read back."
  - "Keep isPathAllowed pure (no fs/realpath) — the caller already realpaths, which closes symlink-escape; the denylist closes the in-home credential read."
metrics:
  duration: ~2m
  completed: 2026-06-03
requirements: [LIVOS-010]
---

# Phase 257 Plan 03: luse File Exposure (WS-D) Summary

Closed LIVOS-010: luse `computer_read_file` no longer reads the operator's
in-home AI-provider OAuth credentials. `isPathAllowed` now enforces a
credential/secret dotfile DENYLIST (deny wins) after the whole-home allowlist
admit, so `~/.claude/.credentials.json`, `~/.gemini/oauth_creds.json`,
`~/.kimi/credentials/*`, `~/.ssh`, `~/.config`, and the bare `~/.claude.json`
are rejected even though they sit inside the allowed `/home/<slug>/` prefix —
while Downloads / livos-files / uploads / runtime-tmp reads keep working.

## Still-Exists Verification

CONFIRMED OPEN at plan time. Read `tools.ts:512-528` — `isPathAllowed`'s
allowlist was `[ \`/home/${userSlug}/\`, LUSE_TMP_PREFIX, uploads ]` with
`allowlist.some(p => resolved.startsWith(p))` and **no** dotfile/credential
exclusion. The realpath step in `computer_read_file` (:944-1010) closes
symlink-escape but does not exclude sensitive dotfiles within the allowed home.
256 did not touch this livinityd file. Finding reproduced before the fix
(RED: Tests 1/2/3/6 failed — the credential paths returned `true`).

## What Was Built

`isPathAllowed` (tools.ts) is now a two-stage gate (DENY WINS):
1. Admit only if `resolved` starts with one of the three allowed prefixes
   (whole-home, `LUSE_TMP_PREFIX`, `${LIVOS_ROOT}/data/uploads/<uid>/`).
2. Then reject if `resolved` is, or is nested under,
   `/home/<slug>/<dir>` for any `dir` in
   `SENSITIVE_HOME_DIRS = ['.claude','.gemini','.kimi','.ssh','.config','.claude.json']`.

Added `isUnderPosix(target, root)` — `target === root || target.startsWith(root + '/')`
— path-boundary compare so `.claudeX` is NOT falsely denied. Function stays
pure (no fs/realpath inside); the `computer_read_file` realpath→base64 flow is
unchanged beyond it already calling `isPathAllowed`.

## Tests (RED → GREEN)

New `tools.sandbox.test.ts` (6 cases), `npx vitest run` from `livos/`:
1. `~/.claude/.credentials.json` → DENIED
2. `~/.gemini/oauth_creds.json` → DENIED
3. `~/.kimi/credentials/x.json`, `~/.ssh/id_ed25519`, `~/.config/anything`, `~/.claude.json` → DENIED
4. `~/Downloads/report.pdf`, `~/livos-files/a.txt`, `~/.claudeX/notes.txt` (boundary safety) → ALLOWED
5. uploads dir + `LUSE_TMP_PREFIX` path → ALLOWED
6. realpathed traversal target into a denied dir → DENIED

- RED (pre-fix): `4 failed | 2 passed (6)`.
- GREEN (post-fix): `6 passed (6)`.
- Regression check: existing `tools.test.ts` → `20 passed (20)`, no regression.

## SC-D Status

MET (unit-proven). A luse read of `~/.claude/.credentials.json` (and
`.gemini`/`.kimi`/`.ssh`/`.config`/`.claude.json`) is denied; legitimate
home/uploads/tmp reads still work; deny precedence + path-boundary safety are
unit-proven. The live Mini-PC probe (`computer_read_file{path:'~/.gemini/oauth_creds.json'}`
→ DENIED, `~/Downloads/<file>` → succeeds) is deferred to the 257-07 deploy walk.

## Deviations from Plan

None — plan executed exactly as written.

## Deploy Note (carried to 257-07)

This plan is code + tests only. luse MCP servers run as
`tsx computer-use/mcp/server.ts` spawned PER claude/aioncore session via
`/usr/local/bin/liv-mcp-luse`; a `livos`/`livinityd` restart does NOT reload
them — they cache the old `tools.ts` in memory. Live apply requires:
`systemctl restart liv-assistant` THEN `pkill -f "computer-use/mcp/server.ts"`
so fresh agent tasks respawn with the new denylist. NO deploy performed here
(Mini PC only; deploy = 257-07).

## Commits

- `12a187b8` fix(257-03): deny luse read of in-home credential dotfiles (LIVOS-010)

## Self-Check: PASSED

- FOUND: livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (modified)
- FOUND: livos/packages/livinityd/source/modules/computer-use/mcp/tools.sandbox.test.ts (created)
- FOUND commit: 12a187b8
