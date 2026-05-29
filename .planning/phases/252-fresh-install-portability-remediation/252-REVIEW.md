---
phase: 252-fresh-install-portability-remediation
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - README.md
  - livos/install.sh
  - livos/packages/livinityd/source/index.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/__tests__/display-manager.test.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/display-manager.ts
  - livos/packages/livinityd/source/modules/computer-use/displays/types.ts
  - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
  - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts
  - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
  - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/seed.test.ts
  - livos/packages/livinityd/source/modules/mcp-registrar/seed.ts
  - livos/packages/livinityd/source/modules/mcp-registrar/types.ts
  - livos/packages/livinityd/source/modules/pty-sessions/__tests__/session.test.ts
  - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts
  - livos/packages/livinityd/source/modules/pty-sessions/session.ts
  - livos/packages/livinityd/source/modules/pty-sessions/types.ts
  - livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts
  - livos/packages/livinityd/source/modules/server/index.ts
  - livos/packages/livinityd/source/modules/webapps/window-manager.ts
  - platform/web/src/app/install.sh/route.ts
  - scripts/install/deploy-livinityd.sh
  - scripts/install/env-seed.sh
  - scripts/install/seeds/mcp-servers.json
  - systemd/liv-assistant.service
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 252: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed the Phase 252 fresh-install portability remediation. The change set
de-hardcodes the `bruce` service user, adds apt + seed install steps, ports the
`liv:mcp:config` MCP seed across the three install paths (A=deploy-livinityd,
B=env-seed, C=livos/install.sh), hardens secrets generation (`CHANGEME` →
`openssl rand`), resolves the luse DISPLAY/XAUTHORITY at runtime, and namespaces
the cross-process WID marker + luse temp prefix under `$XDG_RUNTIME_DIR`.

Security posture is generally strong. The TOCTOU symlink handling in
`readSingleActiveWebappWidFromFile` (mcp/tools.ts) is well-constructed: `lstat`
to reject non-regular-files plus an `O_NOFOLLOW` open with `fd`-cleanup in a
`finally`. The secrets hardening is correct (URL-safe hex, `umask 0177`, no
echo, `unset` after use). The PTY root-rejection and path-sandbox allowlist are
intact.

No critical issues found. The four warnings are correctness gaps that could
silently degrade a fresh install on a non-standard path (Path C luse placeholder
not substituted, REDIS_URL regex format drift across the three .env writers, a
non-anchored marker-file `startsWith` allowlist edge, and a `realpath`-then-read
TOCTOU window on the sandboxed file read). The info items are minor consistency
and robustness notes.

Pre-existing ~389-error typecheck baseline was respected — no pre-existing
unrelated type errors are reported below.

## Warnings

### WR-01: Path C luse seed leaves `__LIVOS_DISPLAY__` / `__LIVOS_XAUTHORITY__` placeholders unsubstituted

**File:** `livos/install.sh:1337-1343` (function `seed_mcp_servers`)
**Issue:** The seed file `scripts/install/seeds/mcp-servers.json` was changed
(this phase) so the `luse` entry now carries `"DISPLAY": "__LIVOS_DISPLAY__"`
and `"XAUTHORITY": "__LIVOS_XAUTHORITY__"` placeholders. Path A
(`deploy-livinityd.sh:_dld_seed_mcp_servers`) was updated to substitute both
(lines 1138-1163). But the Path C mirror in `livos/install.sh:seed_mcp_servers`
only substitutes the original 4 placeholders:

```bash
substituted_json=$(printf '%s' "$seed_json" | sed \
    -e "s|__LIVOS_REDIS_URL__|${redis_url}|g" \
    -e "s|__LIVOS_LIV_API_KEY__|${liv_api_key}|g" \
    -e "s|__LIVOS_USER_SLUG__|${user_slug}|g" \
    -e "s|__LIVOS_DOMAIN_ROOT__|${domain_root}|g")
```

A Path-C (legacy `get.livinity.io`) or route.ts clone-fallback install will HSET
the luse MCP entry with literal `DISPLAY=__LIVOS_DISPLAY__` and
`XAUTHORITY=__LIVOS_XAUTHORITY__`. The luse server reads these as the X display
string — `resolveDisplay()` will return the bogus literal (it does NOT match
`/^:[1-9][0-9]?$/`, so for `LUSE_TARGET_DISPLAY` it would warn-and-drop, but
`DISPLAY` itself is taken verbatim), breaking screenshot/input on Path-C boxes.
The README explicitly states Path C "no longer downgrade[s] a fresh install" —
this leaves a residual downgrade for the two new placeholders.

**Fix:** Mirror the Path A resolution into `livos/install.sh:seed_mcp_servers`:
```bash
local _desktop_user="${LIVOS_DESKTOP_USER:-bruce}"
local _desktop_uid; _desktop_uid=$(id -u "$_desktop_user" 2>/dev/null || echo 1000)
local luse_display=":1"
local luse_xauthority
luse_xauthority=$(find "/run/user/${_desktop_uid}" -maxdepth 2 -name 'Xauthority' 2>/dev/null | head -1)
[[ -z "$luse_xauthority" ]] && luse_xauthority="/home/${_desktop_user}/.Xauthority"
# add to the sed pipeline:
    -e "s|__LIVOS_DISPLAY__|${luse_display}|g" \
    -e "s|__LIVOS_XAUTHORITY__|${luse_xauthority}|g"
```

### WR-02: REDIS_URL password-extraction regex format drift between .env writers and seed helpers

**File:** `scripts/install/env-seed.sh:72` vs `scripts/install/deploy-livinityd.sh:1422` (and `:1093`, `:1249`, `:1482`)
**Issue:** This phase changed `env-seed.sh` (Path B) to write
`REDIS_URL=redis://:${_redis_pass}@localhost:6379` — i.e. the password-only form
with NO `default` user. The deploy-livinityd seed helpers
(`_dld_seed_terminal_panel_flag`, `_dld_seed_mcp_servers`,
`_dld_seed_domain_config`, `_dld_seed_platform_api_key`) all extract the
password with:
```bash
redis_pass=$(echo "$redis_url" | sed -E 's|^redis://default:([^@]+)@.*|\1|')
```
That regex only matches `redis://default:<pass>@`. Against a Path-B `.env`
(`redis://:<pass>@`) the substitution does not match, so `redis_pass ==
redis_url` and the guard `[[ "$redis_pass" == "$redis_url" ]]` trips →
"Could not extract Redis password — skipping seed". Path B doesn't call these
deploy-livinityd helpers today, so this is latent rather than live — but the two
writers now disagree on the canonical REDIS_URL shape, which is a trap for any
future cross-path reuse (and the Path-C `seed_mcp_servers` in `livos/install.sh`
already uses the tolerant `(default)?` form, proving the inconsistency is known).

**Fix:** Make the deploy-livinityd extraction regex tolerant of both forms, as
the Path-C helper already does:
```bash
redis_pass=$(echo "$redis_url" | sed -E 's|^redis://(default)?:([^@]+)@.*|\2|')
```
Apply to all four `_dld_seed_*` helpers, OR standardize every .env writer on one
REDIS_URL shape and document it.

### WR-03: `isPathAllowed` prefix check is vulnerable to sibling-directory prefix confusion

**File:** `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:512-528`
**Issue:** The sandbox allowlist uses `resolved.startsWith(prefix)` where the
prefixes are `/home/${userSlug}/`, `LUSE_TMP_PREFIX` (`${XDG_RUNTIME_DIR}/luse-`),
and `${LIVOS_ROOT}/data/uploads/${userId}/`. The `/home/<user>/` and uploads
prefixes are trailing-slash-anchored (safe). But `LUSE_TMP_PREFIX` ends in
`luse-` (no slash), so it is a *string* prefix, not a *path* prefix: a resolved
path of `/run/user/1000/luse-evil-sibling` is accepted even if it is not a
luse-owned workspace. Because the prefix has no path boundary, any attacker who
can create a directory named `luse-<x>` directly under `$XDG_RUNTIME_DIR`
(0700, same uid — so only the user themself, lowering severity) gets read access
through `computer_read_file`. The realpath-first resolution closes the symlink
vector, but not the sibling-prefix vector.

**Fix:** Anchor the luse temp prefix to a directory boundary, or match the
canonical per-workspace shape. Simplest: keep the `luse-` prefix but additionally
require the next path segment to be the runtime dir child (e.g. validate
`resolved` is under `${XDG_RUNTIME_DIR}/` AND the basename-chain segment starts
with `luse-`), or switch the workspace layout to `${XDG_RUNTIME_DIR}/luse/<id>/`
and anchor on `${XDG_RUNTIME_DIR}/luse/`.

### WR-04: `computer_read_file` realpath-then-read leaves a residual TOCTOU window

**File:** `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:967-1004`
**Issue:** The sandbox does `resolved = await realpathFn(requestedPath)`, then
`isPathAllowed(resolved, ...)`, then `readFileBase64(requestedPath)` — note the
final read uses the ORIGINAL `requestedPath`, not `resolved`. Between the
realpath check and the read, the path could be swapped (symlink planted at
`requestedPath`) so the validated `resolved` no longer corresponds to what
`readFileBase64` opens. The marker-file reader in the same module was hardened
against exactly this with `lstat` + `O_NOFOLLOW`; `computer_read_file` was not.
Severity is bounded (single-uid, LLM-driven, requires a concurrent local writer),
but it is the same class the phase set out to close on the WID marker.

**Fix:** Read from the validated `resolved` path instead of `requestedPath`
(`readFileBase64(resolved)`), or open with `O_NOFOLLOW` / re-`lstat` the resolved
path immediately before read and confirm it is still a regular file matching the
checked inode.

## Info

### IN-01: `seed_mcp_servers` (Path C) and `_dld_seed_mcp_servers` (Path A) are near-duplicate ~90-line helpers that have already drifted

**File:** `livos/install.sh:1286-1388` and `scripts/install/deploy-livinityd.sh:1054-1219`
**Issue:** The two MCP-seed helpers are deliberate mirrors but have diverged
(WR-01 is a direct consequence: Path A got the two new substitutions, Path C did
not). Maintaining two copies guarantees future drift.
**Fix:** Extract the substitute-and-HSET logic into a single sourced helper
(e.g. `scripts/install/seeds/_seed-mcp.sh`) consumed by both entrypoints, or
have Path C `source` the Path A helper. At minimum, add a cross-reference comment
in each pointing at the other and listing the full placeholder set.

### IN-02: Mixed/contradictory AI-provider messaging in install banners vs README

**File:** `livos/install.sh:954-955`, `:968`, `:1052`, `:1683-1684`
**Issue:** `livos/install.sh` still hardcodes Kimi as the AI provider ("AI
Provider: Kimi", `DEFAULT_MODEL=kimi-for-coding`, "Run 'kimi login' after
install"), while the README (this phase) and project direction describe Claude
(default) + Gemini. This is a UX/consistency issue, not a correctness bug, but a
fresh Path-C installer will tell the operator to run `kimi login` for a
Claude-primary product.
**Fix:** Reconcile the install banner + `DEFAULT_MODEL` with the current
Claude-primary provider story, or gate the Kimi messaging behind an actual
Kimi-selected config.

### IN-03: `XDG_RUNTIME_DIR` fallback assumes uid 1000 when `process.getuid` is unavailable

**File:** `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:319-322` and `webapps/window-manager.ts:835-838`
**Issue:** Both the reader and writer compute
`` `/run/user/${process.getuid?.() ?? 1000}` `` when `$XDG_RUNTIME_DIR` is unset.
On a host where the desktop user is not uid 1000 AND `$XDG_RUNTIME_DIR` is unset
(e.g. a non-systemd login or a service started without the user's session env),
reader and writer could still agree (both default 1000) but point at the wrong
uid's runtime dir — re-introducing exactly the cross-user mismatch this phase
aimed to remove. The duplicated literal `1000` in two files is also a drift risk.
**Fix:** Centralize the runtime-dir resolution in one exported helper (it is
already duplicated verbatim) and prefer `process.getuid()` failure to throw/skip
rather than silently assume 1000; or resolve the desktop uid from the same
`livos:desktop:user` source the PTY layer uses.

### IN-04: `parseDisplayArg` / `DISPLAY_ARG_RE` rejects displays `:100`+ but the allocator can mint `:100`+

**File:** `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts:540` and `displays/display-manager.ts:206-210`
**Issue:** `DISPLAY_ARG_RE = /^:[1-9][0-9]?$/` caps validated display args at two
digits (`:1`..`:99`). The display-manager allocator starts at `:10` and
monotonically increments with no upper bound, and `discoverActiveX11Displays`
accepts `1..999`. A long-lived box that allocates past `:99` would mint displays
that `parseDisplayArg` then silently rejects (falling back to defaultDisplay),
so `computer_launch_app_in_display({display:":100"})` would target the wrong
display. Not reachable on a fresh install; flagged as a latent inconsistency.
**Fix:** Widen `DISPLAY_ARG_RE` to `/^:[1-9][0-9]{0,2}$/` to match the allocator
+ discovery ranges (still rejecting `:0`).

### IN-05: `find ... -name Xauthority` in seed helpers picks an arbitrary match with `head -1`

**File:** `scripts/install/deploy-livinityd.sh:1147` (and the WR-01 Path-C fix)
**Issue:** `luse_xauthority=$(find "/run/user/${_desktop_uid}" -maxdepth 2 -name
'Xauthority' ... | head -1)` returns whichever match `find` enumerates first.
With multiple display managers / nested dirs this is non-deterministic and could
select a stale Xauthority. Low impact (luse displays spawn with `-ac`), but worth
a deterministic ordering.
**Fix:** Prefer the GDM path explicitly, then sort, e.g. `find ... | sort | head
-1`, or check `/run/user/<uid>/gdm/Xauthority` first before the broad find.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
