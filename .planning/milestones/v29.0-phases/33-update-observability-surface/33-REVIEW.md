---
phase: 33
slug: update-observability-surface
status: findings_present
files_reviewed: 13
files_reviewed_list:
  - livos/packages/livinityd/source/modules/system/routes.ts
  - livos/packages/livinityd/source/modules/system/system.unit.test.ts
  - livos/packages/livinityd/source/modules/server/trpc/common.ts
  - livos/packages/ui/src/components/update-log-viewer-dialog.tsx
  - livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx
  - livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx
  - livos/packages/ui/src/routes/settings/_components/past-deploys-table.unit.test.tsx
  - livos/packages/ui/src/routes/settings/_components/menu-item-badge.tsx
  - livos/packages/ui/src/routes/settings/_components/menu-item-badge.unit.test.tsx
  - livos/packages/ui/src/routes/settings/_components/settings-content.tsx
  - .planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh
  - .planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh
  - .planning/phases/33-update-observability-surface/artifacts/tests/phase33-trap-block.sh.tmpl
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
created: 2026-04-27
---

# Phase 33: Code Review Report

**Reviewed:** 2026-04-27
**Depth:** standard
**Files Reviewed:** 13
**Status:** findings_present

## Summary

Phase 33 adds an update observability surface: two new admin tRPC routes (`listUpdateHistory`, `readUpdateLog`), a bash patch script that splices structured logging into `update.sh`, and three React components wiring those routes into the Settings UI.

The **security core — the 3-layer path traversal guard on `readUpdateLog`** — is correctly implemented. All three layers are present and in the right order. All six documented traversal vectors are rejected before `fs.readFile` is ever called. The test suite (17 tests across 6 `describe` blocks) covers the happy path, every traversal vector, and edge cases properly. `httpOnlyPaths` registration is correct.

The **bash patch script** has one critical issue: the `reason_field` string interpolated into the JSON heredoc is not stripped of backslash characters. A log line containing `\n` or `\"` after `tr -d '"'` would produce invalid JSON. It also has three warning-level issues detailed below. The frontend and tRPC layer are clean.

---

## Critical Issues

### CR-01: JSON injection via backslash characters in `reason_field`

**File:** `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh:169-170` (identical in `phase33-trap-block.sh.tmpl:122-123`)

**Issue:** The `reason` field extraction strips double-quote characters (`tr -d '"'`) but does NOT strip backslash characters. A log line like:

```
[FAIL] rsync: error reading: \n unexpected end of file
```

would leave `\n` in `last_err`, which — when interpolated into the heredoc — produces:

```json
"reason": "rsync: error reading: \n unexpected end of file"
```

That is technically valid JSON (a JSON escape sequence), but a log line like `[FAIL] path\to\thing` produces a raw backslash-n sequence that many strict JSON parsers reject. More dangerously, a log line containing `\"` after `tr -d '"'` strips the quote but leaves `\` alone, so a line like `[FAIL] config: expected \"key\"` becomes `[FAIL] config: expected \key\` — a trailing bare backslash immediately before the closing `"` of the JSON string value would produce broken JSON:

```json
"reason": "config: expected \key\"
```

The `JSON.parse()` in `listUpdateHistory`'s `try/catch` silently discards the whole entry (the `catch { return null }` block at `routes.ts:137`), meaning any failed deploy whose log line triggers this produces a `null` record and the entry disappears from the UI entirely. This is a silent data-loss path, not a crash, but it directly undermines the observability goal of Phase 33.

**Fix:** Add `| tr -d '\\'` (strip backslashes) or `| sed 's/\\/\//g'` (replace with `/`) after `tr -d '"'`:

```bash
last_err=$(grep -E '\[FAIL\]|fail|Error|error' "$final_log_file" 2>/dev/null \
    | grep -vF '[PHASE33-SUMMARY]' \
    | tail -1 | tr -d '"\\' | tr -d '\n' | cut -c1-200)
```

The `tr -d '\n'` is also needed to guard against a pathological case where `tail -1` returns a line still containing an embedded newline (e.g., from a CRLF file), which would break the single-line JSON string value.

Apply the same fix to both `phase33-update-sh-logging-patch.sh` (line 169) and `phase33-trap-block.sh.tmpl` (line 122) — the comment at the top of the patch script correctly states both must stay in sync.

---

## Warnings

### WR-01: Static import after lazy `React.lazy()` declarations breaks module evaluation order expectations

**File:** `livos/packages/ui/src/routes/settings/_components/settings-content.tsx:113-116`

**Issue:** Three static `import` statements appear after several `React.lazy()` calls:

```ts
const AiConfigLazy = React.lazy(() => import('@/routes/settings/ai-config'))
import {SoftwareUpdateListRow} from './software-update-list-row'   // line 114
import {PastDeploysTable} from './past-deploys-table'               // line 115
import {MenuItemBadge} from './menu-item-badge'                     // line 116
```

JavaScript/TypeScript hoists `import` declarations to the top of the module before any statements are evaluated, so this works at runtime (Vite handles it), but it is explicitly disallowed by `eslint-plugin-import/first` and is a consistent pattern violation throughout this codebase where all other imports appear at the top. If a linter is configured with that rule, it will fail. More practically, placing `import` statements mid-file after `const` declarations makes the dependency graph harder to read and is a maintenance hazard.

**Fix:** Move lines 114-116 to the import block at the top of the file alongside the other same-directory imports (around line 84-87).

### WR-02: `reason_field` can contain uncontrolled log content — backslash not the only injection vector

**File:** `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh:186-190` (and `phase33-trap-block.sh.tmpl:139-144`)

**Issue:** The JSON heredoc interpolates `${reason_field}`, `${from_field}`, and `${to_field}` directly. The SHA fields (`from_sha`, `to_sha`) are sourced from `cat .deployed-sha | tr -d '[:space:]'` and from `git rev-parse HEAD` — both produce hex strings only, so SHA injection is not a concern. However `reason_field` is assembled from arbitrary log file content. Beyond the backslash issue (CR-01), if the `cut -c1-200` boundary splits a multi-byte UTF-8 character, the resulting truncated byte sequence can be invalid UTF-8, which causes `JSON.parse()` to throw in Node.js strict mode (depending on the file encoding).

**Fix:** After CR-01's `tr -d '"\\' | tr -d '\n'`, add `| LC_ALL=C cut -c1-200` (the `LC_ALL=C` forces byte-mode cutting, avoiding the mid-character split). Alternatively, restrict to ASCII-safe characters: `| tr -dc '[:print:]'` before the cut.

### WR-03: `log-format.sh` test uses `eval` on paths derived from `mktemp` output — safe in this context, but fragile

**File:** `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh:64-65`

**Issue:** The `assert` helper does `eval "$cond"` where `$cond` is a caller-supplied shell condition string. Many assertion conditions contain raw file paths produced by `ls "$hist"/...`. If `$hist` contained spaces or shell metacharacters (e.g., a temporary directory whose path included `$()`), the `eval` would execute arbitrary commands. In the current test, `mktemp -d` paths on Linux are always under `/tmp/tmp.XXXXXXXX` (no spaces or metacharacters), so this is not exploitable in practice. However it is a fragile pattern: if the test is ever run on a system where `TMPDIR` contains spaces (e.g., macOS CI with user home directories) the assertions would silently mis-evaluate.

**Fix:** Replace `eval "$cond"` with a bash `[[ ]]` based assertion that accepts a callback function or use `bash -c "$cond"` with proper quoting. Minimum safe fix: document the constraint with `# NOTE: mktemp output must not contain spaces or shell metacharacters` and add a guard at the top of `run_scenario`:

```bash
if [[ "$sandbox" == *' '* || "$sandbox" == *'$'* ]]; then
    echo "FATAL: sandbox path '$sandbox' contains unsafe characters" >&2
    exit 1
fi
```

### WR-04: `readUpdateLog` — missing file size cap; a very large log file is fully read into memory

**File:** `livos/packages/livinityd/source/modules/system/routes.ts:196`

**Issue:** `fs.readFile(resolved, 'utf8')` reads the entire file into a Node.js string before the 500-line tail is applied. The plan comment at line 13 of `update-log-viewer-dialog.tsx` mentions "capped at 50MB upstream — R-04," but no such cap exists in `routes.ts`. A rogue or corrupted log file could be gigabytes in size (e.g., if `tee -a` was running while disk usage was measured and the log captured itself recursively). Reading it fully into a string would exhaust the livinityd heap and crash the process, taking down the server management UI with it.

This is not a security vulnerability (the path is fully validated, so only files inside `HISTORY_DIR` can be read), but it is a correctness issue: one bad log file brings down the management plane.

**Fix:** Add a file-size check before `readFile`:

```ts
const stat = await fs.stat(resolved)
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB
if (stat.size > MAX_BYTES) {
    throw new TRPCError({
        code: 'PAYLOAD_TOO_LARGE',
        message: `Log file too large (${Math.round(stat.size / 1048576)}MB, max 50MB)`,
    })
}
```

---

## Info

### IN-01: `system.unit.test.ts` has `@ts-nocheck` at the top — new Phase 33 tests are untyped

**File:** `livos/packages/livinityd/source/modules/system/system.unit.test.ts:1-4`

**Issue:** The file opens with `// @ts-nocheck`, inherited from pre-existing test debt. The 17 new Phase 33 tests (lines 108-262) are written in a fully typed manner and would pass TypeScript checking, but the blanket `@ts-nocheck` means type errors in the new tests are invisible. If a caller passes the wrong shape to `caller.readUpdateLog()` or `caller.listUpdateHistory()`, TypeScript won't catch it.

**Fix:** The pre-existing comment says "Re-enable this, we temporarily disable TS here since we broke tests." The Phase 33 tests could be split into a separate `system-phase33.unit.test.ts` file without the `@ts-nocheck` flag, or the underlying type mismatch in the old tests could be fixed and `@ts-nocheck` removed. At minimum, track this as tech debt; the new tests should not inherit the suppression flag.

### IN-02: `makeCaller` uses `dangerouslyBypassAuthentication: true` — bypasses `adminProcedure` role check in a misleading way

**File:** `livos/packages/livinityd/source/modules/system/system.unit.test.ts:108-115`

**Issue:** The new routes (`listUpdateHistory`, `readUpdateLog`) use `adminProcedure` which chains `privateProcedure.use(requireRole('admin'))`. The test caller uses `dangerouslyBypassAuthentication: true`. Tracing the middleware:

1. `isAuthenticated` is short-circuited at line 12 of `is-authenticated.ts` — `ctx.currentUser` is never set.
2. `requireRole('admin')` is still called, but at line 76 of `is-authenticated.ts` it short-circuits: "If no currentUser is set, we're in legacy single-user mode — treat as admin."

So the tests actually do exercise the route body, but they never test that the role check itself works — a `member` or `guest` user calling these routes would get `FORBIDDEN`, but the test suite doesn't cover that. This is not a bug in the routes (the role check is real in production), but the test coverage gap means a future refactor that accidentally removes `adminProcedure` from one of these routes would go unnoticed by the test suite.

**Fix (optional, low priority):** Add two role-rejection tests that set `ctx.currentUser` with `role: 'member'` and verify the routes throw `FORBIDDEN`. These would serve as regression guards for the `adminProcedure` enforcement.

### IN-03: `basenameFromLogPath` in `past-deploys-table.tsx` uses `split('/')` — assumes POSIX server paths, does not handle Windows backslash-style paths

**File:** `livos/packages/ui/src/routes/settings/_components/past-deploys-table.tsx:74-77`

**Issue:**

```ts
const parts = logPath.split('/')
```

The `log_path` in JSON records is always the server-absolute POSIX path (e.g., `/opt/livos/data/update-history/update-…log`) since the server is a Linux host. So this is correct in production. However if the JSON fixture is ever produced on a Windows machine during local dev/test, paths would use `\` separators and `split('/')` would return the entire path as a single element, causing `basenameFromLogPath` to return the full path rather than `null`. The full path would then be passed to `readUpdateLog`, which the 3-layer guard correctly rejects with `BAD_REQUEST` — so no security issue — but the UI row would appear clickable and open a dialog that immediately shows an error.

**Fix:** Use `logPath.split(/[\\/]/).filter(Boolean).pop() ?? null` to handle both separator styles, consistent with the similar split used in `system.unit.test.ts` line 125.

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
