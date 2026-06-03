---
phase: 256-security-hardening-contained-autonomy
plan: 01
subsystem: liv-core agent sandbox / installer bootstrap
tags: [security, sandbox, bubblewrap, egress-proxy, reversibility, LIVOS-002]
requires: []
provides:
  - sandbox.ts (wrapWithBwrap + buildScrubbedEnv + LIV_AGENT_WORKSPACE + BWRAP_AVAILABLE)
  - files-sandbox.ts (isFilePathAllowed realpath allowlist)
  - agent-git-snapshot.ts (snapshotWorkspace per-session pre/post refs)
  - livos-egress allowlist proxy (tinyproxy) installed by both installer scripts
affects:
  - liv/packages/core/src/shell.ts (bwrap-routed, env-scrubbed exec)
  - liv/packages/core/src/daemon.ts (files-tool path guard, SITE A + SITE B)
  - liv/packages/core/src/sdk-agent-runner.ts (pre/post snapshot wiring)
tech-stack:
  added: [bubblewrap, tinyproxy]
  patterns: [bwrap-sandbox, allow-list-env-scrub, egress-allowlist-proxy, per-session-git-snapshot]
key-files:
  created:
    - liv/packages/core/src/sandbox.ts
    - liv/packages/core/src/sandbox.test.ts
    - liv/packages/core/src/files-sandbox.ts
    - liv/packages/core/src/files-sandbox.test.ts
    - liv/packages/core/src/agent-git-snapshot.ts
    - liv/packages/core/src/agent-git-snapshot.test.ts
  modified:
    - liv/packages/core/src/shell.ts
    - liv/packages/core/src/daemon.ts
    - liv/packages/core/src/sdk-agent-runner.ts
    - scripts/install/deploy-livinityd.sh
    - update.sh
    - scripts/sacred-shas-v38.json
key-decisions:
  - "Tests written as tsx + node:assert/strict (repo convention) instead of the plan's literal `npx vitest run` — vitest is not installed in liv/ and is unavailable offline; all sibling tests use tsx."
  - "wrapWithBwrap builds the argv unconditionally (pure string construction) and signals host bwrap availability via `usable`; shell.ts branches on `usable` (execFile bwrap vs scrubbed exec fallback). Lets the argv-shape unit test run on the non-Linux dev box."
  - "files-sandbox path comparison uses POSIX semantics (path.posix, drive-prefix stripped) so the allowlist is correct on the Linux target and deterministic on Windows dev."
  - "sdk-agent-runner.ts is a sacred-frozen file (Phase 97); it is a declared writer in this plan's frontmatter. Re-froze its SHA in scripts/sacred-shas-v38.json after the 2-call snapshot wiring — agent loop / watchdog / budget caps / safeEnv untouched, preserving the sacred rationale."
requirements-completed: [LIVOS-002]
duration: ~35 min
completed: 2026-06-03
---

# Phase 256 Plan 01: Contained Autonomy (WS-A) Summary

bubblewrap-sandboxed the agent's in-process `shell` exec (write-confined to `LIV_AGENT_WORKSPACE`, deny-read secrets/home-creds, no docker.sock, cred-scrubbed env, egress via allowlist proxy), realpath-allowlisted the `files` tool, added a per-session git-snapshot reversibility layer, and installed bubblewrap + a tinyproxy egress-allowlist proxy via both installer scripts — closing LIVOS-002 while keeping `permissionMode:'dontAsk'` autonomy intact (no manual approval gate reintroduced).

## Tasks Completed

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | bwrap sandbox + cred-scrub for `shell` | `f00f89a2` | sandbox.test.ts — 7/7 |
| 2 | path-allowlist the `files` tool | `8a031ab4` | files-sandbox.test.ts — 6/6 |
| 3 | per-session git snapshot reversibility | `b34af13e` | agent-git-snapshot.test.ts — 4/4 |
| 4 | install bubblewrap + egress proxy (both installers) | `63636e2f` | bash -n + grep + byte-identical diff |

## Key Implementation Details

**Task 1 — `sandbox.ts` + `shell.ts`:**
- `LIV_AGENT_WORKSPACE` (default `/opt/livos/data/agent-workspace`) is the SINGLE write-root shared by all three layers — never `/opt/liv` (the agent's own compiled code stays unwritable, revision fix B).
- `wrapWithBwrap()` builds `bwrap --unshare-all --share-net --die-with-parent --ro-bind /usr … --tmpfs /tmp --bind <ws> <ws> --chdir <ws> sh -c <cmd>`. The ONLY writable `--bind` is the workspace; no secret path, no `/var/run/docker.sock`, no `/opt/liv` writable bind.
- `buildScrubbedEnv()` allow-list-copies `HOME/PATH/LANG/NODE_ENV/TERM/USER`, strips `LIV_API_KEY/DATABASE_URL/REDIS_URL/JWT_SECRET/JWT_SECRET_FILE/ANTHROPIC_API_KEY/GEMINI_API_KEY/PGPASSWORD`, and sets `HTTPS_PROXY/HTTP_PROXY=http://127.0.0.1:13128` (override `LIV_EGRESS_PROXY`), `NO_PROXY=''`.
- `shell.ts` routes through `execFile('bwrap', …)` when `BWRAP_AVAILABLE`, else falls back to a plain `exec` — both with the scrubbed env and cwd `LIV_AGENT_WORKSPACE` (not `this.cwd`/`/opt/liv`). BLOCKED_PATTERNS + truncate/timeout/return-shape preserved.

**Task 2 — `files-sandbox.ts` + `daemon.ts`:**
- `isFilePathAllowed()` realpath-canonicalizes (ENOENT-safe ancestor walk), allows only `LIV_AGENT_WORKSPACE` + `/opt/livos/data/uploads`, denies `.env`/secrets/`/opt/liv`/`~/.ssh|.claude|.gemini|.kimi`/traversal. Deny wins. Never throws.
- daemon.ts SITE A (toolRegistry, `{success,output,error}`) and SITE B (router, `{success,message}`) each got an additive guard returning their OWN shape (revision fix D).

**Task 3 — `agent-git-snapshot.ts` + `sdk-agent-runner.ts`:**
- `snapshotWorkspace()` creates `refs/livos-agent/<sessionId>/<when>`, inits the repo if absent, injectable `exec`, fails soft (`{ok:false}`, never throws). Defaults workspace to `LIV_AGENT_WORKSPACE`.
- Runner wires `pre` before the `query()` loop and `post` after, guarded by `LIV_AGENT_SNAPSHOT!=='0'`, `.catch`-swallowed.

**Task 4 — installers:**
- `deploy-livinityd.sh`: `bubblewrap tinyproxy` added to the postgres/samba apt block; `update.sh`: same added to the Phase-93 streaming apt block (revision fix C). Both write byte-identical `/etc/tinyproxy/livos-egress.{conf,filter}` + `livos-egress.service` and `enable --now`, all `|| warn` non-fatal; `bwrap` added to each verify loop.

## Deviations from Plan

### [Rule 3 - Blocker] Tests use tsx + node:assert/strict, not vitest
- **Found during:** Task 1 (before writing the first test).
- **Issue:** The plan's `<verify>` blocks call `npx vitest run …`, but vitest is NOT installed in `liv/` (npm workspace, no vitest dep, no vitest config) and `npx` would require a network download (vitest@4.1.8, blocked offline). Every sibling `*.test.ts` in the package uses `tsx + node:assert/strict` (e.g. `agent-session.vault-mode.test.ts`), and the plan's own Task 3 note even says "Run with: npx tsx src/…".
- **Fix:** Wrote all three test files as functional tsx + node:assert/strict suites that exit non-zero on failure (matching repo discipline), preserving every behavior case the plan specified. RED→GREEN was exercised for each (module-not-found / assertion failure before impl, all-pass after).
- **Files:** sandbox.test.ts, files-sandbox.test.ts, agent-git-snapshot.test.ts.
- **Verification:** `npx tsx <file>` → all pass (7+6+4 = 17 checks). Same assertions vitest would have made.

### [Rule 3 - Blocker] Sacred-SHA re-freeze for sdk-agent-runner.ts
- **Found during:** Task 3 commit.
- **Issue:** `sdk-agent-runner.ts` is registered in `scripts/sacred-shas-v38.json` (frozen in Phase 97-auto-mode); the pre-commit `check-sacred.sh` hook aborted the commit. The file is, however, a DECLARED writer in this plan's frontmatter (`files_modified`) and the parallel-safety note explicitly anticipates both 256-01 and 256-06 editing it.
- **Fix:** Updated the registry `expected_sha` to the new hash and refreshed the rationale, rather than bypassing the hook with `--no-verify`. The edit is minimal and confined to 2 guarded best-effort snapshot calls + 1 import — the agent loop, watchdog, per-tier budget caps, and `safeEnv` (the invariants the sacred rationale protects) are untouched.
- **Files:** scripts/sacred-shas-v38.json (+ sdk-agent-runner.ts).
- **Verification:** `check-sacred.sh` → `PASS: 20 files verified` on the Task 3 commit.

### [Adaptation] wrapWithBwrap argv built unconditionally
- **Found during:** Task 1 GREEN.
- **Issue:** Plan said return `argv:[]` when bwrap is absent. The argv-shape unit test (Test 1) needs the argv regardless of host bwrap, and this dev box has no bwrap.
- **Fix:** Build the argv unconditionally (pure string construction) and return `usable: BWRAP_AVAILABLE`; shell.ts branches on `usable`. Net runtime behavior on the Mini PC is identical (bwrap present → usable:true → execFile bwrap).
- **Verification:** sandbox.test.ts Test 1 passes; shell.ts fallback path still env-scrubs.

### [Adaptation] POSIX path comparison in files-sandbox
- **Found during:** Task 2 GREEN.
- **Issue:** Windows `path.resolve('/opt/...')` prepends `C:\` and uses backslashes → allowlist mismatch on the dev box.
- **Fix:** Compare with `path.posix` after normalizing to forward slashes and stripping any drive prefix. Correct on the Linux target (no-op there) and deterministic on Windows.
- **Verification:** files-sandbox.test.ts all 6 pass.

**Total deviations:** 4 (2 Rule-3 blockers, 2 cross-platform adaptations). **Impact:** none on the Mini PC runtime semantics — all adaptations are dev-box determinism / offline-test fixes; the sacred re-freeze is the sanctioned in-band path for a declared-writer edit.

## Success Criteria

- **SC1 (secret-read blocked + self-modify blocked):** SATISFIED in code. `shell` exec runs under bwrap whose only writable/visible bind is `LIV_AGENT_WORKSPACE` — `/opt/livos/.env` and `/opt/livos/data/secrets` are never bound (deny-read by absence); `files` tool rejects `.env`/secrets/`/opt/liv` via `isFilePathAllowed` before any `fs` call. Unit tests assert both. Live agent probe is the 256-05 deploy/UAT step (this plan is local-only).
- **SC2 (egress allowlist):** SATISFIED in code/config. Scrubbed env points `HTTPS_PROXY/HTTP_PROXY` at the tinyproxy `livos-egress` default-deny allowlist (anthropic/googleapis/github/githubusercontent/npmjs); proxy conf+unit emitted byte-identically by both installers. Live `curl attacker.example` deny vs `api.anthropic.com` allow is the 256-05 UAT probe.
- **SC3 (env scrub):** SATISFIED. `buildScrubbedEnv` strips `LIV_API_KEY/DATABASE_URL/REDIS_URL/JWT_SECRET` (+ more) and is applied unconditionally in `shell.ts` (even on the bwrap-less fallback). Unit-tested.
- Reversibility ref per session over `LIV_AGENT_WORKSPACE`: SATISFIED (snapshotWorkspace + runner wiring, unit-tested incl. revert-to-pre).
- bubblewrap + proxy installed by both scripts: SATISFIED (`bash -n` clean, `bwrap` in both verify loops, egress region byte-identical).
- SC7 (autonomy/curated-app regression): no approval gate added; `permissionMode:'dontAsk'` untouched; bwrap fallback keeps dev boxes working. Live OpenDesign/OpenHands regression is a 256-05 deploy check.

Note: SC1/SC2/SC3 are demonstrated at the code/unit level here. The live synthetic-agent probes in the plan's `<verification>` require the Mini PC deploy, which is explicitly **256-05** (this plan is local code + tests only, per the execution rules).

## Self-Check: PASSED

- All 6 created files exist on disk (verified with `[ -f ]`).
- All 4 task commits present: `f00f89a2`, `8a031ab4`, `b34af13e`, `63636e2f` (verified via `git log`).
- All 3 test suites green (17 checks). `bash -n` clean on both installers. Sacred-SHA hook PASS on every commit.

## Next

Ready for **256-02** (WS-B credential egress proxy — depends_on 256-01 per the serialized installer-writer chain). Live agent probes (SC1/SC2/SC3 synthetic + SC7 regression) land with the Mini PC deploy in **256-05**.
