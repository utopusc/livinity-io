---
phase: 160
plan: 160-05
subsystem: livinityd computer-use mcp (luse) — file-read sandbox
tags: [luse-sandbox, path-allowlist, realpath-symlink-resolution, jailbreak-mitigation, llm-file-read, no-new-deps]
dependency-graph:
  requires:
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (Phase 72-native-05 computer_read_file handler + readFileBase64 dispatch)
    - livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts (Phase 97-05 LUSE_USER_ID env wire-through to the child)
    - Plan 160-03 (resolver dispatch) — independent; shares the same tools.ts file but touches a different handler (`computer_application` vs. `computer_read_file`). Layered cleanly on top of 160-03 commits with zero conflict.
  provides:
    - `isPathAllowed(resolved, userSlug, userId)` — exported pure allowlist check used by the `computer_read_file` sandbox guard. Returns true iff the resolved path starts with one of three allowlisted prefixes: `/home/<user>/`, `/tmp/luse-`, `/opt/livos/data/uploads/<userId>/`.
    - `__setRealpathForTest(fn)` — test-only seam mirroring the existing `__setReaddirForTest` pattern. Lets unit tests override `nodeRealpath` so symlink-resolution can be simulated without real fs.
    - Hardened `computer_read_file` handler: NUL-byte reject → realpath-resolve → allowlist-check → original base64 read. Rejection error echoes `requested=… resolved=… (allowed prefixes: …)` for agent self-correction without leaking file content.
  affects:
    - Plan 160-04 (dynamic display size) — independent file set (agent-prompt-builder + screenshot); zero conflict.
    - Plan 160-06 (verification sweep) — verifier should re-run the 15 new tests added here as part of its sandbox-section sweep.
    - Future: agent jailbreak hardening passes should treat `computer_read_file` as DONE per the operator's P3 review concern; remaining LLM-controlled fs surface is the open `computer_application` launcher (LivOS app resolver — different attack surface, intentional).
tech-stack:
  added: []
  patterns:
    - exported-pure allowlist function adjacent to its consumer (parallels Phase 103-B `parseDisplayArg` shape — small, side-effect-free guard exported for unit tests)
    - test-only ESM-binding override seam (parallels Phase 100-10's `__setReaddirForTest` — vitest cannot spyOn frozen `node:fs/promises` named exports, so a mutable resolver shipped from prod code is the established pattern in this module)
    - resolve-then-check ordering (symlinks resolved FIRST so an allowlisted symlink targeting a denied file is still rejected — pattern is invariant-locked via source-text test that asserts `realpathFn(requestedPath)` appears before `isPathAllowed(resolved` in source order)
    - rejection-error format leaks resolved target but never file content (defense-in-depth signal for agent self-correction; matches the security-error shape used by the existing `parseDisplayArg` validation block)
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts (+139/-17 — `realpath as nodeRealpath` import added, `__setRealpathForTest` seam exported, `isPathAllowed` helper exported, `computer_read_file` handler rewritten with NUL-byte reject + realpath resolve + allowlist check while preserving the original base64-read return shape under the guard)
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts (+213 — `__setRealpathForTest` imported, T12 updated to use allowlisted path with realpath stub, two new describe blocks: 7 source-text invariants locking the sandbox literal + 8 runtime rejection tests exercising hostile inputs and accept cases)
decisions:
  - "Static top-level import of `realpath as nodeRealpath` from `node:fs/promises` (paired with the existing `readdir as nodeReaddir` import) instead of the plan's dynamic `await import('node:fs')` inside the handler. Reason: dynamic import on every read is a per-call overhead with zero benefit since `node:fs/promises` is already in the module's import graph for readdir. The static import also lets us mirror the existing `__setReaddirForTest` seam exactly (Phase 100-10 pattern), giving us a coherent test surface — vitest cannot spyOn the ESM-frozen `node:fs/promises.realpath` binding, but the indirection through `__realpathOverride ?? nodeRealpath` makes the resolver mockable from tests."
  - "Exported `isPathAllowed` (not local-scoped) even though only the one handler calls it. Reason: the source-text invariant `expect(SRC).toMatch(/function isPathAllowed/)` matches whether the function is exported or not, but exporting it (a) lets a future plan unit-test the allowlist policy in isolation without going through the MCP handler, and (b) makes the security policy auditable as a standalone API surface. Cost is one extra export keyword."
  - "Added a NUL-byte pre-flight reject BEFORE realpath. Reason: NUL inside a POSIX path is a classic null-byte truncation attack (`/home/bruce/safe.txt\\x00/../../../etc/passwd` — the kernel may truncate at the NUL on some syscall boundaries). The plan didn't explicitly call for this but the success_criteria block in the executor prompt did (\"reject NUL-byte path\"). Treated as a Rule 2 auto-add (missing critical functionality for security). Runtime test asserts the NUL reject fires BEFORE realpath spawns — no per-call overhead in the common path."
  - "Used `process.env.LUSE_USER_ID ?? 'bruce'` fallback instead of `?? 'admin'` from the plan's snippet. Reason: this module's other consumers (`luse-mcp-config.ts`) and the live Mini PC deployment both use `bruce` as the single-tenant default; defaulting to `admin` would mean a host-display read attempt without LUSE_USER_ID set would look in `/home/admin/` (non-existent on the Mini PC) and `/opt/livos/data/uploads/admin/` (non-existent). The MEMORY confirms Mini PC user is `bruce`. Defaulting to the actual user keeps the host-display path functional pre-multi-tenant wire-up."
  - "Kept `userSlug` and `userId` as SEPARATE parameters in `isPathAllowed` even though today they're the same value (both default to `LUSE_USER_ID`). Reason: documented in the inline comment — a future uuid/slug split (when multi-tenant maps a stable user-id UUID onto a human-readable slug) can flow through the existing call site without changing the allowlist function shape. Defense-in-depth costs nothing."
  - "T12 updated in-place rather than left in place + a new accept-test added. Reason: T12 was the ORIGINAL `computer_read_file` test and used `/tmp/foo.txt` — a path the new sandbox correctly rejects (no `/tmp/luse-` prefix). Leaving T12 as-is would have meant T12 FAILED post-patch — which is correct security behavior, but breaks the test suite. The clean fix is to update T12 to use an allowlisted path (`/home/bruce/foo.txt`) with a realpath stub so the original assertion (readFileBase64 is called with the right path + result is wrapped as MCP content) still meaningfully exercises the post-guard read path. Eight new runtime tests separately exercise the rejection cases the plan calls for."
  - "Added 8 runtime rejection tests (beyond the plan's 7 source-text invariants) because the executor prompt's success_criteria explicitly required them: \"must reject /etc/passwd, ../../etc/shadow, NUL-byte path, symlink-out-of-jail\". Source-text invariants alone catch literal-string regressions but don't catch logic regressions (e.g. accidentally inverting the allowlist check). The runtime tests double-cover the security policy at the behavior level — they're the actual contract; the source-text invariants are the cheap drift detector."
metrics:
  duration: "~20 minutes"
  completed: 2026-05-19
  task-count: 2
  file-count: 2
  commit-count: 2
  test-count-delta: +15 (7 Phase 160-05 source-text invariants + 8 runtime rejection cases)
---

# Phase 160 Plan 05: computer_read_file Path Sandbox Summary

**One-liner:** Hardens `computer_read_file` against LLM-controlled jailbreak reads by gating it behind a per-user allowlist (`/home/<user>/` + `/tmp/luse-*` + `/opt/livos/data/uploads/<userId>/`) with `fs.realpath` symlink resolution BEFORE the allowlist check and a NUL-byte pre-flight reject — `/etc/passwd`, `../../etc/shadow`, NUL-byte paths, and symlink-out-of-jail attacks now all reject with a structured error that echoes requested + resolved path for agent self-correction but never leaks file content.

## Performance

- **Duration:** ~20 minutes
- **Started:** 2026-05-19T10:50:00Z (approximate — agent spawn time)
- **Completed:** 2026-05-19T11:10:07Z
- **Tasks:** 2 (both via plan's `<task>` blocks)
- **Files modified:** 2 (`tools.ts`, `tools.test.ts`)
- **Commits:** 2 atomic (`feat` + `test`)

## Accomplishments

- LLM-controlled `computer_read_file` jailbreak vector closed via 3-prefix per-user allowlist
- `fs.realpath` symlink resolution runs BEFORE the allowlist check (symlink-out-of-jail attack blocked)
- NUL-byte path pre-flight reject (null-byte truncation attack blocked)
- Test-only `__setRealpathForTest` seam exported (matches existing `__setReaddirForTest` pattern — vitest-mockable without spawning real fs)
- 15 new test cases (7 source-text invariants + 8 runtime rejection/accept cases) — tools.test.ts went 50 → 65 PASS / 0 FAIL
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` and D-09 verbatim luse-system-prompt.ts (`2083f0a3…`) both preserved across both commits

## Task Commits

1. **Task 1: Add sandbox guard to computer_read_file handler** — `5def1871` (feat)
2. **Task 2: Source-text invariants + runtime rejection tests** — `42b04ff2` (test)

_No TDD cycle (plan is `autonomous=true`, scaffolding work — invariants + runtime tests batched per Task 2)._

## Files Created/Modified

- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (+139/-17) — `realpath as nodeRealpath` import, `__setRealpathForTest` test seam, `isPathAllowed` exported helper, `computer_read_file` handler rewritten with NUL-reject + realpath + allowlist guard + preserved base64-read behavior beneath
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` (+213) — `__setRealpathForTest` imported, T12 updated to allowlisted path + realpath stub, "Phase 160-05 — computer_read_file sandbox" describe with 7 source-text invariants, "Phase 160-05 — computer_read_file sandbox runtime rejection" describe with 8 runtime tests

## Decisions Made

See `decisions` in the frontmatter above. Highlights:

- **Static realpath import** (not dynamic per-call) — matches the existing `readdir` import + lets us mirror `__setReaddirForTest` for vitest mocking.
- **NUL-byte pre-flight reject** — added as a Rule 2 auto-fix because the executor prompt's success_criteria required it (`reject NUL-byte path`) even though the plan didn't.
- **`'bruce'` default for LUSE_USER_ID fallback** — matches the live Mini PC single-tenant user (per MEMORY) instead of the plan's `'admin'` placeholder.
- **8 runtime rejection tests beyond the plan's 7 source-text invariants** — invariants catch literal-string drift; runtime tests catch logic drift (e.g. accidentally inverting the allowlist check). Together they double-cover the security contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Security] Added NUL-byte pre-flight reject before realpath**
- **Found during:** Task 1 (sandbox guard implementation)
- **Issue:** The plan's snippet had no explicit NUL-byte handling. NUL inside a POSIX path is a classic null-byte truncation attack vector (`/safe.txt\\x00/../../etc/passwd`) — without a pre-flight reject, the behavior depended on whether `realpath` happened to throw on NUL (implementation-defined). The executor prompt's success_criteria explicitly required NUL-byte rejection.
- **Fix:** Added `if (requestedPath.includes('\\x00'))` reject BEFORE the realpath call. Returns structured error with `JSON.stringify(requestedPath)` so the NUL is escaped in the error text.
- **Files modified:** `tools.ts` only
- **Verification:** Runtime test "rejects NUL-byte path before realpath even fires" asserts both (a) the reject fires and (b) `realpathSpy` was NEVER called — proves the pre-flight order.
- **Committed in:** `5def1871` (part of Task 1 commit)

**2. [Rule 3 — Blocking] T12 broke under sandbox guard (used `/tmp/foo.txt` — no `/tmp/luse-` prefix)**
- **Found during:** Task 1 (post-implementation test run)
- **Issue:** The original T12 test passed `/tmp/foo.txt` (Phase 72-native-05 era — predates the sandbox). After the guard, `/tmp/foo.txt` does NOT match `/tmp/luse-` prefix → sandbox rejects → readFileBase64 never called → T12's `expect(mocks.readFileBase64).toHaveBeenCalledWith('/tmp/foo.txt')` fails.
- **Fix:** Updated T12 to use `/home/bruce/foo.txt` (allowlisted via `/home/<user>/` branch) and added `__setRealpathForTest(async (p) => String(p))` stub so realpath doesn't actually try to stat the path. Original test intent (readFileBase64 called with the right path + result wrapped as MCP content) preserved unchanged.
- **Files modified:** `tools.test.ts` only
- **Verification:** T12 now PASSES — `npx vitest run source/modules/computer-use/mcp/tools.test.ts` reports 65 PASS / 0 FAIL.
- **Committed in:** `5def1871` (bundled with Task 1 since T12 is in the same file and the fix is causally linked to the guard).

**3. [Rule 1 — Cosmetic] Used `'bruce'` default instead of plan's `'admin'`**
- **Found during:** Task 1 (LUSE_USER_ID fallback)
- **Issue:** The plan's snippet had `process.env.LUSE_USER_ID ?? 'admin'`. The live Mini PC single-tenant default is `bruce` (per MEMORY: `/home/bruce/`, `bruce@10.69.31.68`). Defaulting to `admin` would mean the host-display path checks against `/home/admin/` and `/opt/livos/data/uploads/admin/` — both nonexistent on the actual deployment.
- **Fix:** Used `?? 'bruce'` instead. Consistent with MEMORY-documented Mini PC user.
- **Files modified:** `tools.ts` only
- **Verification:** Runtime test "accepts /opt/livos/data/uploads/<userId>/ path" uses `/opt/livos/data/uploads/bruce/photo.png` and expects accept.
- **Committed in:** `5def1871`

### Out-of-scope (deferred — not fixed)

None — pre-existing test failures in this package (input.test.ts, screenshot.test.ts, etc.) were already documented in Plan 160-03 SUMMARY and remain unrelated to this plan's files.

---

**Total deviations:** 3 auto-fixed (1 security add, 1 blocking test fix, 1 cosmetic default change)
**Impact on plan:** All auto-fixes essential for completeness. NUL-byte reject was explicitly required by the executor prompt's success_criteria. T12 fix was necessary to keep the test suite green. `bruce` default keeps the host-display path operational on the live deployment. No scope creep — all changes are within the `computer_read_file` handler + its test, exactly matching `files_modified` in the plan frontmatter.

## Authentication Gates

None — this plan modifies LLM-controlled file-read input validation only. No external auth surface (no MCP server reconnect, no DB credentials, no remote API).

## Hard Guardrails

- [x] **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` preserved across both 160-05 commits. Verified at start (`f3538e1d…`), after Task 1 `5def1871` (`f3538e1d…`), after Task 2 `42b04ff2` (`f3538e1d…`).
- [x] **D-09 verbatim contract** — `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` bytes UNCHANGED. Tree SHA at HEAD = `2083f0a3dfc798b4841613b9576b94929f2faf2f`, identical to pre-160-05 value.
- [x] **D-NO-NEW-DEPS** — `git diff --stat HEAD~2..HEAD -- '**/package.json'` = empty. Zero npm packages added.
- [x] **Files-modified disjoint from Plan 160-04** — verified: my 2 files are `mcp/tools.ts` + `mcp/tools.test.ts`. Plan 160-04 touches `agent-prompt-builder.ts` + `screenshot.ts`. Zero overlap. Parallel safety contract honored.
- [x] **Atomic commits per task** — 2 commits, one per task: `feat(160-05): add path sandbox guard` (Task 1) + `test(160-05): source-text invariants + runtime rejection cases` (Task 2).
- [x] **Test pattern** — source-text invariants follow the existing vitest pattern in this same file (matches Phase 100-10, 160-03 invariants). No `@testing-library/react`. Runtime tests use the established `StubMcpServer` + `mocks.*` hoisted-mock pattern from the rest of the file.

## Issues Encountered

**1. Edit tool encoded `'\\x00'` source string as a literal NUL byte in the file**
- The Edit tool's `new_string` content `if (requestedPath.includes('\\x00'))` had its `\x00` escape sequence collapsed into an actual NUL byte during file write — the resulting file was binary (grep reported "binary file matches"), and the TypeScript would still have worked at runtime but the source was unreadable / un-grep-able.
- **Resolved:** Used a Python heredoc with `bytes([0x5c]) + b"x00"` to write the literal 4-char escape sequence `\x00` into the file as text. Verified via `python -c "data.count(b'\\x00')"` returning 0 post-fix.
- This is a tool quirk specific to escape-sequence content in Write/Edit; not a plan-level issue.

## User Setup Required

None — this is a pure-code hardening patch. No env vars, no service restarts, no external configuration.

The new sandbox is active immediately on next `livos.service` restart on the Mini PC (or per-WebApp Luse MCP child reload). The runtime behavior change is:

- Before: agent could read any path the livinityd process could read (effectively the whole user filesystem + many root-owned files).
- After: agent reads ONLY `/home/<user>/`, `/tmp/luse-*/`, `/opt/livos/data/uploads/<userId>/`. Out-of-bounds reads return a structured "path outside sandbox" error.

If an existing agent workflow relied on reading e.g. `/opt/livos/.env` (which it should NOT have done), it will now fail with a useful error message. This is the intent.

## Next Phase Readiness

**Phase 160 wave 2 progress:**
- Plan 160-04 (dynamic display size) — in-flight in parallel agent, disjoint file set.
- Plan 160-05 (this plan) — CODE-COMPLETE, awaiting Plan 160-06 verification sweep + UAT.

**Plan 160-06 verification sweep should:**
- Re-run `npx vitest run source/modules/computer-use/mcp/tools.test.ts` and confirm 65 PASS / 0 FAIL (or 65+ if Plan 160-04 added invariants here too).
- Manual smoke on Mini PC post-deploy:
  - Ask agent to read `/etc/passwd` — expect "path outside sandbox" rejection.
  - Ask agent to read `/home/bruce/somefile.txt` (create the file first) — expect successful base64-wrapped read.
  - Symlink test: `ln -s /etc/passwd /home/bruce/escape && agent read /home/bruce/escape` — expect rejection with `resolved=/etc/passwd` in the error.
- Verify no LLM workflow regressions (the previous Luse agent workflows MUST stay green for paths inside the allowlist).

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (modified, `5def1871`)
- FOUND: `livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts` (modified, `5def1871` + `42b04ff2`)

**Commits verified to exist:**
- FOUND: `5def1871` Task 1 — feat(160-05): add path sandbox guard to computer_read_file
- FOUND: `42b04ff2` Task 2 — test(160-05): source-text invariants + runtime rejection cases for sandbox

**Sacred SHA verified preserved:**
- FOUND: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` matches `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`

**D-09 verbatim invariant verified:**
- FOUND: `git rev-parse HEAD:livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` = `2083f0a3dfc798b4841613b9576b94929f2faf2f` (byte-identical preservation)

**Tests verified to pass:**
- `npx vitest run source/modules/computer-use/mcp/tools.test.ts` → **65 PASS / 0 FAIL** (was 50 / 0 — added 7 Phase 160-05 invariants + 8 runtime rejection/accept tests = +15)

**Acceptance criteria greps verified:**
- `grep -c "Phase 160-05" tools.ts` → 3 (≥1)
- `grep -c "isPathAllowed" tools.ts` → 2 (definition + handler call)
- `grep -cE "fs.realpath|realpath" tools.ts` → 9 (≥1)
- `grep -c "path outside sandbox" tools.ts` → 1 (=1, exactly the rejection branch)
- `grep -c "computer_read_file:" tools.ts` → 1 (=1, handler definition intact)
- `grep -c "Phase 160-05" tools.test.ts` → 4 (≥1)

**No new dependencies:**
- `git diff --stat HEAD~2..HEAD -- '**/package.json'` = empty

**Files-modified disjoint with Plan 160-04:**
- This plan: `mcp/tools.ts`, `mcp/tools.test.ts`
- Plan 160-04: `agent-prompt-builder.ts`, `screenshot.ts` (+ `display-size.ts` per current untracked)
- Intersection: ∅

---
*Phase: 160-luse-livos-overlay-haiku-routing*
*Plan: 160-05*
*Completed: 2026-05-19*
