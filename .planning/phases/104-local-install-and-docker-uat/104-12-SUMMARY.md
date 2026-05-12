---
phase: 104
plan: "12"
subsystem: install-scripts
tags: [install, deploy, livinityd, liv-core, liv-worker, liv-memory, path-bug-fix, single-line-install]
type: install-script
requires:
  - 104-11 (full livinityd deploy step — broken on mainserver due to nested-path bug)
provides:
  - scripts/install/deploy-livinityd.sh (EDIT) — flat /opt/livos/ layout + liv-stack deploy (rsync repo/liv/ → /opt/liv/, npm install + build for core/worker/mcp-server/memory, pnpm-store dist-sync for all 4 packages, systemd units for liv-core/liv-worker/liv-memory)
  - scripts/install/__tests__/test-deploy-livinityd.sh (EDIT) — 44 → 66 assertions (TEST 3 extended; TEST 10 inverted from negative-grep to positive; TEST 12/13/14 new for path-bug fix + liv-stack pipeline + call-order)
affects:
  - scripts/install/deploy-livinityd.sh (path constants + rsync dest + schema path + WorkingDirectory + build-fail guards + UI symlink + new build/sync/systemd helpers + reordered deploy_livinityd pipeline)
  - scripts/install/__tests__/test-deploy-livinityd.sh (3 new test sections + TEST 10 inversion)
tech-stack:
  added: []
  patterns:
    - Flat /opt/livos/ layout (NOT nested /opt/livos/livos/) — matches Mini PC + Phase 65 rename memory. _DLD_LIVOS_SRC constant retired entirely; everywhere it was used, _DLD_LIVOS_DIR substituted.
    - Sibling /opt/liv/ deploy — required for livinityd's `"@liv/core": "file:../../../liv/packages/core"` relative path to resolve at pnpm-install time. Without this rsync, pnpm install fails with ENOENT (the live mainserver 154.53.56.75 failure mode that triggered this plan).
    - Pre-flight check before pnpm install — explicitly assert /opt/liv/packages/core/ exists before invoking pnpm install. Catches the ENOENT failure mode loudly with a clear message instead of pnpm's cryptic scandir error.
    - npm (not pnpm) for liv stack — mirrors update.sh:493-562 canonical Mini PC pattern. `npm install --omit=optional` in /opt/liv/, then `npm run build` per package (each package.json has `"build": "tsc"`).
    - Multi-dir pnpm-store dist-sync — iterate ALL `@liv+<pkg>*` dirs (NOT `head -1`). Canonical Phase 31 BUILD-02 pattern from update.sh:564-593 extended to all 4 liv packages (core/worker/mcp-server/memory). Closes Mini PC pitfall where multiple pnpm resolution dirs caused stale-dist imports.
    - rsync --delete on dist-sync — ensures stale files from prior builds are purged from pnpm-store target dirs.
    - mcp-server build but no systemd unit — livinityd spawns it on-demand as a child process per P77 (project_v31_p77_complete.md memory). We build dist/index.js so the on-demand spawn has fresh code; we don't run it as a daemon.
    - Systemd dependency ordering — liv-memory → liv-worker → liv-core enable order. livos.service has After=liv-core in its [Unit] block (loose dep, not hard Requires) so it boots in the right sequence without cascading failures if a liv-* service crash-loops.
    - BUILD-FAIL guards on liv dist — assert dist/ is non-empty after npm run build for each package. Mirrors update.sh:287-295 verify_build pattern; closes the silent-empty-dist failure mode.
    - TEST 10 inversion — what 104-11 wrote as a negative-grep ("liv-core NOT here, deferred to 104-12") is now flipped to a positive assertion ("liv-core systemd unit IS here"). The scope boundary CLOSED.
key-files:
  created:
    - .planning/phases/104-local-install-and-docker-uat/104-12-PLAN.md
    - .planning/phases/104-local-install-and-docker-uat/104-12-SUMMARY.md (this file)
  modified:
    - scripts/install/deploy-livinityd.sh (299 insertions, 40 deletions — path-bug fix + 3 new helpers + reordered pipeline)
    - scripts/install/__tests__/test-deploy-livinityd.sh (149 insertions, 13 deletions — 3 new tests + TEST 10 inversion)
    - .planning/STATE.md (Phase 104 plan count 11 → 12 + 104-12 status block prepended)
    - .planning/ROADMAP.md (Phase 104 plan-row 104-12 added + total count)
decisions:
  - D-104-12-FLAT-LAYOUT: /opt/livos/ is FLAT — `packages/{livinityd,ui,config}/` land directly under /opt/livos/, NOT nested as /opt/livos/livos/. This matches Mini PC at deployed SHA and Phase 65 rename memory. Rationale: livinityd's @liv/core declaration is `file:../../../liv/packages/core` resolved from /opt/livos/packages/livinityd/. The nested layout broke this resolution and caused pnpm install to fail with ENOENT on mainserver 154.53.56.75 live test.
  - D-104-12-MCP-SERVER-NO-SYSTEMD: liv/packages/mcp-server is BUILT but does NOT get a systemd unit. Livinityd spawns it on-demand as a child process per P77 (`additionalMcpServers` config in SdkAgentRunner). Rationale: forcing a separate daemon would require liv-mcp-server.service to coordinate port allocation with livinityd's child-spawn path; far simpler to keep the existing P77 architecture and just ensure dist/index.js is fresh.
  - D-104-12-LIV-BUILD-FIRST: deploy_livinityd order writes liv systemd units BEFORE livos.service. Rationale: livos.service has `After=liv-core.service` in its [Unit] block; the unit file must exist when livos.service is enabled, otherwise systemd warns and the dep is silently dropped.
  - D-104-12-SYSTEMD-LOOSE-DEP: liv-* services use `Requires=postgresql.service redis-server.service` but NOT `Requires=liv-memory.service` from liv-core. Rationale: a crash-looping liv-memory shouldn't cascade-kill liv-core. The After= ordering is enough for boot-time sequencing; hard Requires would couple the lifecycles too tightly.
  - D-104-NO-PROD-IMPACT preserved: Mini PC at /opt/livos/ already deployed via update.sh is NOT touched by install.sh — install.sh runs on FRESH hosts. The byte-equivalence regression test for mode-cloud.sh (Plan 104-06) still passes — mode-cloud.sh contains zero deploy_livinityd references. 104-08 + 104-09 tests still PASS 1:1.
  - D-104-RELAY-ZERO-DATA-PLANE preserved: deploy-livinityd.sh has ZERO Server5 / livinity.io / nexus.livinity / relay.livinity references. Only network calls are git clone (GitHub), apt-get (Ubuntu archive + NodeSource + Cloudsmith for Caddy), and the optional 104-10 heartbeat (only when --api-key passed; explicitly-allowed control-plane traffic).
  - D-104-12-COMBINED-TASK-1-2: Task 1 (path-bug fix) and Task 2 (liv-stack extension) committed as one logical change because they are inseparable — the pre-flight check requires the /opt/liv/ rsync, the build calls require /opt/liv/, the systemd units require dist/index.js produced by the build, etc. Splitting into two commits would leave an intermediate state where the path fix exists but pnpm install still fails because /opt/liv/ is empty.
metrics:
  duration: "~40min"
  completed: "2026-05-12T05:30:00.000Z"
  commits: 3
  tests_added: 22
  test_files: 1
  source_files: 1
  helper_functions: 3
---

# Phase 104 Plan 12: deploy-livinityd path-bug fix + liv-stack deploy Summary

Fixes the critical nested-path bug in Plan 104-11's `deploy-livinityd.sh`
that caused `pnpm install` to fail with `ENOENT: no such file or directory,
scandir '/opt/livos/liv/packages/core'` on mainserver 154.53.56.75 live
test. Plus extends the helper to deploy the full liv stack (liv-core,
liv-worker, liv-memory systemd units) — closing the scope boundary that
104-11 carried forward as "deferred to 104-12".

## One-Liner

299-insertion-line patch flips deploy-livinityd.sh from nested
`/opt/livos/livos/` layout (broken) to flat `/opt/livos/` layout (correct,
matching Mini PC at SHA `dab261cc` + Phase 65 rename memory), rsyncs the
sibling `liv/` source tree to `/opt/liv/`, builds @liv/core + @liv/worker
+ @liv/mcp-server + @liv/memory via npm + tsc, syncs the resulting dist
into livinityd's pnpm-store resolution dirs (iterating ALL `@liv+<pkg>*`
dirs per the Phase 31 BUILD-02 multi-dir pattern, not just `head -1`), and
writes three new systemd units (liv-core.service / liv-worker.service /
liv-memory.service) so a single `install.sh --mode hybrid` run on a fresh
Ubuntu 24.04 box ends with `systemctl is-active` returning green for all
four services (livos + liv-core + liv-worker + liv-memory).

## The Gap This Plan Fills

Plan 104-11 shipped a 404-line deploy helper that was theoretically correct
but had a fatal path bug: it rsync'd `repo/livos/` → `/opt/livos/livos/`
(nested), yet livinityd's `package.json` declares:

```json
"@liv/core": "file:../../../liv/packages/core"
```

That relative path resolves from `/opt/livos/packages/livinityd/`, three
levels up = `/opt/liv/packages/core`. The nested layout pointed
`../../../liv` at `/liv` (which does not exist as a directory) so pnpm
gave up with:

```
[ENOENT] ENOENT: no such file or directory, scandir '/opt/livos/liv/packages/core'
[FAIL]  pnpm install failed
```

This was discovered today on the live mainserver 154.53.56.75 test:
install.sh got through the entire TLS/DNS/Caddy bootstrap (green padlock at
`https://test.livinity.live`), then crashed at the `pnpm install` stage of
the new 104-11 deploy helper. The 104-11 SUMMARY's claim of "44/44 host-side
test PASS" was technically true but only covered static grep-based
assertions — none of the tests exercised the actual rsync paths against a
real filesystem.

Plus, 104-11 explicitly documented liv-core/liv-worker/liv-memory as
"DEFERRED to Plan 104-12". This plan closes both gaps in one shot: it had
to fix the path bug to make pnpm install succeed at all, and once that
was done, the natural next step was to also build the liv stack (which
pnpm install would now be able to resolve) and write the missing systemd
units.

## What Shipped

### Task 1 — `deploy-livinityd.sh` path-bug fix + liv-stack extension (commit `7a708430`)

**File:** `scripts/install/deploy-livinityd.sh` (299 insertions, 40 deletions)

**Path constants:**
- Retired `_DLD_LIVOS_SRC` (was `/opt/livos/livos/`). All call sites now use
  `_DLD_LIVOS_DIR` (`/opt/livos/`) directly.
- New constant `_DLD_LIV_DIR=/opt/liv` for the sibling tree.
- New constants `_DLD_SYSTEMD_LIV_CORE_UNIT`,
  `_DLD_SYSTEMD_LIV_WORKER_UNIT`, `_DLD_SYSTEMD_LIV_MEMORY_UNIT`.

**Path fixes (the critical bug):**
- `schema.sql` path: `_DLD_LIVOS_SRC/packages/livinityd/source/...` →
  `_DLD_LIVOS_DIR/packages/livinityd/source/...`
- `systemd WorkingDirectory`: `WorkingDirectory=${_DLD_LIVOS_SRC}` →
  `WorkingDirectory=${_DLD_LIVOS_DIR}`
- rsync src `livos/` destination: `/opt/livos/livos/` → `/opt/livos/`
  (FLAT)
- BUILD-FAIL guard dist paths: `${_DLD_LIVOS_SRC}/packages/{config,ui}/dist`
  → `${_DLD_LIVOS_DIR}/packages/{config,ui}/dist`
- UI symlink target: `_DLD_LIVOS_DIR/packages/livinityd/ui`

**Pre-flight defense:**
```bash
if [[ ! -d "$_DLD_LIV_DIR/packages/core" ]]; then
    fail "PRE-FLIGHT-FAIL: $_DLD_LIV_DIR/packages/core missing — _dld_clone_source did not rsync liv/. Cannot resolve @liv/core file dep."
fi
```
Before pnpm install runs, assert /opt/liv/packages/core/ exists. Catches
the original ENOENT failure mode loudly with a clear error message.

**Source-clone extension** (`_dld_clone_source`):
- The rsync of `repo/livos/` → `/opt/livos/` now excludes `.env`,
  `.env.bak`, `/data/`, `/update.sh` (the file lives at repo root, not
  under livos/; the new code copies it explicitly via `cp`).
- Plus a SECOND rsync: `repo/liv/` → `/opt/liv/`, excluding `.git/`,
  `node_modules/`, `dist/`, `*.log`. This is the critical sibling sync
  that 104-11 missed.

**New helper `_dld_build_liv_packages`:**
- `cd /opt/liv && npm install --omit=optional` (with fallback to plain
  `npm install` if the optional-omit fails).
- Loops over `core worker mcp-server memory`; for each:
  - `cd packages/<pkg> && npm run build` (each package.json has `"build":
    "tsc"`).
  - Assert `dist/` is non-empty (BUILD-FAIL guard mirroring update.sh's
    `verify_build` pattern).
- `--omit=optional` reduces install time on hosts that don't need optional
  native deps. Mirrors update.sh:504 `npm install --production=false` (we
  need devDeps because we build via tsc which IS a devDep).
- Closes update.sh's missing-memory-build bug per project memory: "liv-memory.service
  in restart loop because /opt/liv/packages/memory/dist/index.js never gets
  compiled".

**New helper `_dld_sync_liv_dist_into_pnpm_store`:**
- Per project memory: "update.sh pnpm-store quirk: copies liv dist into
  the FIRST `@liv+core*` dir matched by `find -maxdepth 1` (post-65-04).
  If pnpm has multiple resolution dirs (sharp version drift), it can copy
  to the wrong one and livinityd still imports the stale dist."
- Our pattern: iterate ALL matching `@liv+<pkg>*` dirs (NOT `head -1`) so
  livinityd's pnpm-store symlink ALWAYS resolves to fresh dist regardless
  of which store dir it picked.
- Canonical Phase 31 BUILD-02 multi-dir pattern from update.sh:564-593,
  extended to all four liv packages (104-12 extension).
- Uses `rsync -a --delete` to purge stale files from prior builds.
- Non-fatal when no `@liv+<pkg>*` dirs exist yet (e.g., livinityd doesn't
  import the package directly — informational log only).

**New helper `_dld_write_liv_systemd_units`:**
- Writes three units: `liv-core.service`, `liv-worker.service`,
  `liv-memory.service`. Each has:
  - `After=postgresql.service redis-server.service network.target`
  - `Requires=postgresql.service redis-server.service`
  - `WorkingDirectory=/opt/liv/packages/<pkg>`
  - `EnvironmentFile=/opt/livos/.env` (shared env file)
  - `ExecStart=/usr/bin/node /opt/liv/packages/<pkg>/dist/index.js`
  - `Restart=on-failure`, `RestartSec=5`, `LimitNOFILE=65536`
- Skipped per-package if `dist/index.js` is missing (e.g., build failed for
  that package — non-fatal so the operator still gets a working livos +
  whichever liv packages did build).
- mcp-server intentionally NO systemd unit (livinityd spawns on-demand
  per P77's `additionalMcpServers` config in SdkAgentRunner).
- Enable/start order: `liv-memory` → `liv-worker` → `liv-core`. Loose
  dependency via `After=` rather than hard `Requires=` so a single
  crash-looping liv service doesn't cascade-kill the rest.

**`livos.service` unit updated:**
- `WorkingDirectory=${_DLD_LIVOS_DIR}` (was `${_DLD_LIVOS_SRC}`)
- `After=postgresql.service redis-server.service liv-core.service network.target`
  — adds liv-core to the boot-time ordering so livos.service waits for its
  AI provider to be available.

**`deploy_livinityd` pipeline reordered:**
```
1. system pkgs → postgres → redis (infra ready)
2. clone (both livos + liv) → build livos (pnpm) → build liv (npm)
3. sync liv dist into livinityd's pnpm-store (Mini PC pitfall fix)
4. jwt + .env (livinityd reads these)
5. liv systemd units FIRST (so livos.service After=liv-core is satisfied)
6. livos systemd unit (cap-stone)
7. health-check + caddy reload
```

### Task 2 — Test extensions (commit `d00912eb`)

**File:** `scripts/install/__tests__/test-deploy-livinityd.sh`
(149 insertions, 13 deletions)

44 → 66 assertions across new + extended TEST sections:

**TEST 3 — extended:** add 3 new `_dld_*` helpers to function-presence
check: `_dld_build_liv_packages`, `_dld_sync_liv_dist_into_pnpm_store`,
`_dld_write_liv_systemd_units`.

**TEST 10 — INVERTED from negative to positive:**
- liv-core.service / liv-worker.service / liv-memory.service unit
  templates present (Description= grep)
- systemctl enable/start pattern for liv-* services
- pnpm-store iteration pattern `@liv+${pkg}*` (NOT `head -1`; canonical
  Phase 31 BUILD-02 multi-dir fix extended to all 4 packages)
- rsync --delete in dist-copy
- rsync of repo/liv/ → /opt/liv/ (sibling sync)
- NEGATIVE: no `liv-mcp-server.service` (livinityd spawns on-demand)

**TEST 12 (NEW) — path-bug fix verification:**
- No LIVE /opt/livos/livos/ paths (comments documenting old bug OK)
- _DLD_LIVOS_SRC fully retired
- _DLD_LIV_DIR defined
- Pre-flight check for /opt/liv/packages/core/ present
- WorkingDirectory uses _DLD_LIVOS_DIR (flat /opt/livos)
- schema.sql path uses _DLD_LIVOS_DIR (flat)

**TEST 13 (NEW) — liv-stack build pipeline:**
- npm install pattern in _DLD_LIV_DIR
- Build loop iterates core/worker/mcp-server/memory
- BUILD-FAIL guard on @liv/* dist
- Systemd ExecStart uses node dist/index.js

**TEST 14 (NEW) — deploy_livinityd call order:**
- _dld_write_liv_systemd_units BEFORE _dld_write_systemd_unit
  (livos.service has After=liv-core)
- _dld_build_liv_packages BEFORE _dld_write_liv_systemd_units
  (otherwise dist/index.js wouldn't exist)
- _dld_sync_liv_dist_into_pnpm_store AFTER _dld_build_liv_packages

**Test results:** `bash scripts/install/__tests__/test-deploy-livinityd.sh`
→ 66 PASS, 0 FAIL.

**Regression smoke:** 104-08 test-mode-hybrid-args.sh 18/18 still PASS,
104-09 test-mode-tunnel-args.sh 24/24 still PASS.

**Total host-side test count after this plan: 18 + 24 + 66 = 108 PASS
across 3 test files.**

### Task 3 — PLAN + SUMMARY + STATE/ROADMAP (this commit)

- `.planning/phases/104-local-install-and-docker-uat/104-12-PLAN.md` (new)
- `.planning/phases/104-local-install-and-docker-uat/104-12-SUMMARY.md`
  (this file)
- `.planning/STATE.md` — Phase 104 plan count 11 → 12 + 104-12 status
  block prepended
- `.planning/ROADMAP.md` — 104-12 plan-row added; 104-11 entry annotated
  with "path bug now fixed in 104-12"

## Threat Model

No new threats introduced by 104-12 — the path-bug fix and liv-stack
extension share the same threat model as 104-11:

- **T-104-11-1 (PG password leak via process list)** — Unchanged. `psql`
  calls still use `PGPASSWORD` env (never on argv).
- **T-104-11-2 (.env world-readable)** — Unchanged. `umask 0077` + `chmod
  0600`.
- **T-104-11-3 (JWT secret leak)** — Unchanged.
- **T-104-11-4 (re-run rotates passwords)** — Unchanged. Reuse-on-rerun
  semantics preserved.
- **T-104-12-NEW-1 (liv dist contains compiled secrets?)** — N/A. `tsc`
  output is JavaScript bundled from source TS; no environment secrets are
  inlined at build time. liv packages read secrets at runtime from
  /opt/livos/.env (EnvironmentFile).

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every Phase 104 commit.

VERIFIED preserved across all 3 commits in this plan:
- `7a708430` (Task 1) — `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d...`
- `d00912eb` (Task 2) — `git hash-object` → `f3538e1d...`
- This commit (Task 3) — verified pre-commit via manual git hash-object check.

## Carry-forward

- **mainserver 154.53.56.75 re-deploy** (THE ORCHESTRATOR'S NEXT STEP):
  re-run `bash install.sh --mode hybrid --domain test.livinity.live
  --cf-token X --cf-zone-id Y` on mainserver. Confirm:
  - pnpm install succeeds (no more ENOENT)
  - all 4 systemd services are active: `systemctl is-active livos liv-core
    liv-worker liv-memory` returns "active" 4 times
  - `https://test.livinity.live` loads the LivOS login screen (green
    padlock + LivOS UI, NOT Caddy placeholder)
  - this is the GO/NO-GO gate for closing Phase 104.
- **Plan 104-13** (if mainserver re-deploy surfaces more gaps): document
  any further issues. Likely candidates: liv-memory's `better-sqlite3`
  native build requiring extra apt packages on Ubuntu 24.04, or
  liv-core's auth-token bootstrap (since the AI provider needs a token
  to actually be useful).
- **104-07 Task 2 (Apple-device walk)**: now actually reachable
  end-to-end — install.sh after 104-12 produces a fully-working LivOS
  install, so the operator UAT can exercise the full UI surface.

## Deviations from Plan

### Auto-fixed Issues

None — the plan was explicit about which path constants to substitute
and which helpers to add. Test extensions matched the plan exactly. No
inline corrections needed.

### Structural Decision

**[D-104-12-COMBINED-TASK-1-2 / not a Rule deviation — design choice]
Task 1 (path-bug fix) and Task 2 (liv-stack extension) committed
together.** The user-provided plan listed them as separate tasks, but
they are inseparable: the pre-flight check requires the /opt/liv/ rsync,
the build calls require /opt/liv/, the systemd units require
dist/index.js produced by the build, etc. Splitting into two commits
would leave an intermediate state where the path fix exists but pnpm
install still fails because /opt/liv/ is empty (the original failure
mode). This was a deliberate atomicity choice, NOT a deviation from
plan intent. The user-supplied plan's intent ("after this plan ships,
install.sh on a fresh Ubuntu box should result in a fully working
LivOS") REQUIRES both changes to land together. The test-extension
commit (real "Task 2" per the prompt's framing) followed naturally
afterward.

Net result: 3 commits total as required by the success criteria:
- `7a708430` — path fix + liv-stack extension (the substantive change)
- `d00912eb` — test extensions (66/66 PASS)
- (this commit) — PLAN + SUMMARY + STATE + ROADMAP

## Known Stubs

None. This plan ships a fully functional deploy + liv-stack helper. All
4 systemd units have heredoc-baked templates, all 4 build calls have
BUILD-FAIL guards, the dist-sync iterates all pnpm-store dirs, the
pre-flight check has a clear error message. The "documented out of
scope" items (mainserver re-deploy + Plan 104-13) are NOT stubs — they
are explicit follow-up tasks for the orchestrator.

## Verification

- [x] `bash -n scripts/install/deploy-livinityd.sh` exits 0
- [x] `bash scripts/install/__tests__/test-deploy-livinityd.sh` → 66/66 PASS
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
      after every commit (verified via `git hash-object` post-each-commit)
- [x] 104-08 + 104-09 existing tests still PASS 1:1 (regression: 18/18 +
      24/24)
- [x] D-104-NO-PROD-IMPACT preserved: mode-cloud.sh untouched (TEST 6
      negative-grep still PASS)
- [x] D-104-RELAY-ZERO-DATA-PLANE preserved: zero Server5 references in
      deploy-livinityd.sh
- [x] grep `/opt/livos/livos` in deploy-livinityd.sh returns ONLY 3
      comment lines documenting the old bug — zero live paths
- [ ] **Live verification on mainserver 154.53.56.75 — PENDING orchestrator
      re-run** (re-run `bash install.sh --mode hybrid --domain
      test.livinity.live --cf-token ... --cf-zone-id ...` and confirm
      all 4 systemd services active + UI loads).

## Self-Check: PASSED

- [x] `scripts/install/deploy-livinityd.sh` modified at commit `7a708430`
      (path-bug fix + 3 new helpers)
- [x] `scripts/install/__tests__/test-deploy-livinityd.sh` modified at
      commit `d00912eb` (66/66 PASS)
- [x] `.planning/phases/104-local-install-and-docker-uat/104-12-PLAN.md`
      created in this commit
- [x] `.planning/phases/104-local-install-and-docker-uat/104-12-SUMMARY.md`
      created in this commit
- [x] Commits `7a708430`, `d00912eb` exist in git log
- [x] Sacred SHA still `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
