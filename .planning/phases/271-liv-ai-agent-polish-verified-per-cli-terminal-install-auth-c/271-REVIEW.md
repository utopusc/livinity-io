---
phase: 271-liv-ai-agent-polish
reviewed: 2026-06-15T23:37:51Z
depth: deep
files_reviewed: 13
files_reviewed_list:
  - livos/packages/livinityd/source/modules/cli-installer/auth.ts
  - livos/packages/ui/src/hooks/use-cli-auth-bridge.ts
  - livos/packages/ui/src/components/launcher-icon.tsx
  - livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx
  - scripts/aionui-patches/local-agents-install-section.js
  - livos/packages/ui/public/agent-logos/auggie.svg
  - livos/packages/ui/public/agent-logos/codebuddy.svg
  - livos/packages/ui/public/agent-logos/droid.svg
  - livos/packages/ui/public/agent-logos/hermes.svg
  - livos/packages/ui/public/agent-logos/kiro.svg
  - livos/packages/ui/public/agent-logos/nanobot.svg
  - livos/packages/ui/public/agent-logos/openclaw.svg
  - livos/packages/ui/public/agent-logos/qodercli.svg
  - livos/packages/ui/public/agent-logos/snow.svg
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 271: Code Review Report

**Reviewed:** 2026-06-15T23:37:51Z
**Depth:** deep
**Files Reviewed:** 13
**Status:** clean

## Summary

Phase 271 (Liv AI agent polish) source changes were reviewed at deep depth, with
explicit focus on the security-sensitive D-239-07 RCE boundary, the server/UI
auth-command mirror, the display-ID validation gate, the favicon CORS
short-circuit, and XSS hygiene of the 9 new brand SVGs. All five focus areas are
correct. No Critical or Warning findings. One Info-level UX edge is noted.

### 1. auth.ts CLI_AUTH_COMMANDS (codex / openclaw) — VERIFIED SAFE

- **RCE boundary intact.** `authCli` resolves the spawn target via
  `CLI_AUTH_COMMANDS[input.name]` (NAME-keyed lookup into a frozen registry),
  destructures `[bin, args] = command`, and calls `spawn(bin, args as string[],
  {env: authEnv})` (auth.ts:493, 523, 727). Argv-array form, **no `shell: true`,
  no string interpolation** of any user-controlled value. The new literals
  `['openclaw', ['onboard']]` and `['codex', ['login', '--device-auth']]` are
  static array elements — they cannot inject.
- **Drift-lock unaffected.** The edits change VALUES only, not KEYS. The 20-key
  contract (`auth-methods.test.ts` lines 33-37, 97-102) asserts key count and
  shape, never the specific openclaw/codex argv. The only hard value-equality
  assertion is claude-code `['claude', []]` (auth-methods.test.ts:124), which is
  unchanged in auth.ts.
- **Existing auth.test.ts assertions hold.** The codex/openclaw test cases
  (auth.test.ts:258-272, 388-391) exercise spawn-failure and device-poll, not
  argv equality. The lone argv assertion is claude-code → `[]` (auth.test.ts:181-
  183), unchanged.
- **Mirrors auth-methods.ts loginArgv.** Confirmed byte-for-byte:
  openclaw `['openclaw', ['onboard']]` (auth-methods.ts:105), codex
  `['codex', ['login', '--device-auth']]` (auth-methods.ts:112).

### 2. use-cli-auth-bridge.ts mirror — VERIFIED SAFE

- NAME→fixed-command boundary preserved: the iframe message is charset-guarded
  (`/^[a-z0-9-]+$/`) and allowlist-checked (`INSTALLABLE_CLIS.has(cli)`) BEFORE
  the map lookup (use-cli-auth-bridge.ts:179). The command strings are static
  literals; `cli` is never interpolated into them.
- Byte-consistent with auth.ts: `claude` ↔ `['claude', []]`,
  `openclaw onboard` ↔ `['openclaw', ['onboard']]`,
  `codex login --device-auth` ↔ `['codex', ['login', '--device-auth']]`.
- This map now only feeds the demoted "run in Terminal" fallback; the constant
  string lands in a fresh PTY tab — safe (no shell-string built from user input).

### 3. x11-display-stream-window.tsx getVncUrl guard — VERIFIED CORRECT

- `isValidDisplayId()` regex `/^:\d+(\.\d+)?$/` is **identical** to the server
  zod `displayIdSchema` (trpc-router.ts:45). Valid IDs (`:1`, `:10`, `:10.0`)
  pass — no functional regression.
- Malformed/empty IDs set `resolveError` and return early instead of firing the
  doomed mutation, killing the 404/400 console noise. The `useEffect` re-trigger
  guard (line 105) prevents a loop.

### 4. launcher-icon.tsx no-ACAO favicon short-circuit — VERIFIED CORRECT

- `isNoCorsFaviconSrc()` matches only exact hostnames or `.`-suffixed subdomains
  of `google.com` / `antigravity.google` / `gstatic.com`. Normal favicons still
  run full canvas analysis — no regression.
- The short-circuit returns `{status: 'blocked'}`, byte-identical to the
  pre-existing CORS-taint catch path (line 160-163) → identical logo-mode
  rendering. It only skips the `getImageData()` call that emitted the error.

### 5. aionui patch + 9 new SVGs — VERIFIED SAFE

- `node --check scripts/aionui-patches/local-agents-install-section.js` → OK.
- All 19 `logo:` references resolve to an existing `public/agent-logos/*.svg`
  (programmatically cross-checked: zero missing, zero orphan files).
- XSS hygiene: all SVGs in `public/agent-logos/` contain only `<svg>`/`<title>`/
  `<path>` with static fills. No `<script>`, `onload`/`onerror`/event handlers,
  `javascript:`, `<foreignObject>`, `<use>`, `<image href>`, external `href`/
  `xlink:href`, `<!ENTITY>`, or `<!DOCTYPE>`. Safe for both inline and served
  rendering.

## Info

### IN-01: x11 window may stay in error state if a bad displayId later resolves to a valid one

**File:** `livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx:80-109`
**Issue:** If a window mounts with an empty/malformed `displayId` (the exact
"mounted before `DISPLAY_:N` resolved" scenario the fix targets), the guard sets
`resolveError`. When the prop later updates to a valid display string, the
mount `useEffect` short-circuits at line 105 (`if (wsUrl || resolveError)
return`) because the error is still set, so it will NOT auto-resolve — the
operator must click Retry. The previous behavior auto-fired (producing the
noise this phase removes), so this is a deliberate trade-off, not a regression,
and Retry recovers it. Acceptable as-is.
**Fix (optional):** Clear `resolveError` and reset `resolvedForRef.current` when
`displayId` transitions from invalid to valid, so a late-resolving display
auto-recovers without a manual Retry. Example: in the mount `useEffect`, gate
the early-return on whether the current `displayId` matches `resolvedForRef`
even when `resolveError` is set.

---

_Reviewed: 2026-06-15T23:37:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
