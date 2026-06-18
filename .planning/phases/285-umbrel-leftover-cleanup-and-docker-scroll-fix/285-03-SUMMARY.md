---
phase: 285-umbrel-leftover-cleanup-and-docker-scroll-fix
plan: 03
subsystem: install-scripts
status: complete (Task 1 shipped; Task 2 CANCELLED by operator — Option B, setup_docker_prerequisites is LIVE code, kept untouched)
tags: [install, shell, umbrel-cleanup, research-correction]
requires: []
provides:
  - "Install scripts free of Phase-276 Umbrel-removal documentation comments"
affects:
  - livos/install.sh
  - scripts/install/deploy-livinityd.sh
  - scripts/install/__tests__/test-deploy-livinityd.sh
tech-stack:
  added: []
  patterns: ["comment-only cleanup", "bash -n syntax gate"]
key-files:
  created: []
  modified:
    - livos/install.sh
    - scripts/install/deploy-livinityd.sh
    - scripts/install/__tests__/test-deploy-livinityd.sh
decisions:
  - "Task 1 (5 Umbrel comment ranges) executed + committed — independently safe, no behavior change."
  - "Task 2 (remove setup_docker_prerequisites) HALTED: the plan's RESEARCH §Open-Q3 premise ('data/app-data has zero consumers, SAFE to remove') is FACTUALLY WRONG. /opt/livos/data/app-data IS the live per-app data root (livinityd --data-directory /opt/livos/data → app.ts:74 ${dataDirectory}/app-data/${id}). Removing the helper deletes the install-time creation + 1000:1000 chown of the LIVE app data root."
metrics:
  duration: ~12m
  completed: 2026-06-18
  tasks-completed: 1
  tasks-total: 2
---

# Phase 285 Plan 03: Umbrel install-script comment cleanup + orphaned dir-prep removal — Summary

> **EXECUTION RESOLUTION (2026-06-18, orchestrator + operator):** Plan 03 is **COMPLETE**. Task 1 (Umbrel comment removal — the CORE of Item 4) shipped in `9b7ea7bb`. Task 2 (remove `setup_docker_prerequisites()`) is **CANCELLED, not failed**: the executor's drift-defense gate correctly caught that RESEARCH §Open-Q3 was **factually inverted** — `/opt/livos/data/app-data` IS the LIVE per-app data root (verified independently: `--data-directory /opt/livos/data` at install.sh:1503/deploy-livinityd.sh:1907 → `app.ts:74` `${dataDirectory}/app-data/${id}` + `apps.ts:273` boot chown + `factory-reset.sh:108`). **Operator chose Option B: leave `setup_docker_prerequisites()` UNTOUCHED** (the `data/tor` half is 1 harmless empty dir; the `data/app-data` half is load-bearing). CONTEXT.md Open-Q3 corrected. Item 4 is satisfied by the comment cleanup. This is a textbook avoided Phase-276 regression — the adversarial verification did exactly its job.

Removed the 5 Phase-276 Umbrel-removal documentation comment ranges from the 3 install scripts (Task 1, committed). HALTED Task 2 (removal of `setup_docker_prerequisites()`) at the plan's own drift-defense STOP gate: direct codebase evidence proves the RESEARCH §Open-Q3 "zero consumers / SAFE to remove" premise is wrong — `/opt/livos/data/app-data` is the LIVE per-app data root, not an orphan.

## What Was Completed (Task 1 — committed `9b7ea7bb`)

Deleted exactly the 5 comment-only ranges specified by the plan:

| File | Range deleted | Content |
|------|---------------|---------|
| `livos/install.sh` | was :408-411 | "docker-image pull/retag helper was REMOVED … upstream Umbrel image" 4-line block |
| `livos/install.sh` | was :1757-1758 | "Phase 276: the docker-image pull/retag step was removed … Umbrel tor service" 2-line block |
| `scripts/install/deploy-livinityd.sh` | was :771-775 | "── 4c. LivOS Docker images — REMOVED (Phase 276) ──" divider + 4 comment lines |
| `scripts/install/__tests__/test-deploy-livinityd.sh` | was :943-947 | "TESTS 39/40/41 … DELETED in Phase 276 … Umbrel" 5-line block |
| `scripts/install/__tests__/test-deploy-livinityd.sh` | was :985-986 | "Phase 276: the trailing docker_images anchor was dropped … Umbrel auth/tor images" 2-line block |

Preserved the functional (non-Umbrel) comment `# Pipeline order: streaming < google_chrome` (test-deploy was :984) per scope.

### Task 1 Verification Gates — ALL PASS

```
bash -n livos/install.sh                                   → OK
bash -n scripts/install/deploy-livinityd.sh                → OK
bash -n scripts/install/__tests__/test-deploy-livinityd.sh → OK

grep -c "docker-image pull/retag"  livos/install.sh                  → 0  (was 2)
grep -c "upstream Umbrel image"    livos/install.sh                  → 0  (was 2)
grep -c "LivOS Docker images — REMOVED" deploy-livinityd.sh          → 0  (was 1)
grep -ci "umbrel"                  test-deploy-livinityd.sh          → 0  (was 4)

LIVE-COMPAT UNCHANGED (byte-identical, not in diff):
grep -c "umbrel-app.yml"  apps/app.ts                               → 2  (baseline 2)
grep -c "UMBREL_ROOT"     apps/apps.ts                              → 1  (baseline 1)
grep -c "UMBREL_ROOT"     install-for-user-injection.test.ts        → 2  (baseline 2)
```

## Why Task 2 Was Halted (BLOCKER)

The plan's Task 2 contains an explicit drift-defense STOP gate:

> "If anything OTHER than the `setup_docker_prerequisites` body references `data/tor/data` or `$data_dir/app-data`, STOP and report — removal may not be safe."

Running the gate's own consumer scan surfaced live consumers of the `data/`-prefixed `app-data` path, then a follow-up trace proved that path is the LIVE per-app data root:

1. **Production launch wiring:** Both launchers pass `--data-directory /opt/livos/data`
   (`install.sh:1503` and `deploy-livinityd.sh:1907`). So `livinityd.dataDirectory = /opt/livos/data`.
2. **Runtime per-app dir:** `app.ts:74` → `this.dataDirectory = ${livinityd.dataDirectory}/app-data/${this.id}`
   = **`/opt/livos/data/app-data/<appId>`** — the exact `data/`-prefixed dir `setup_docker_prerequisites()` creates and `chown -R 1000:1000`s at install time.
3. **Live consumers of `/opt/livos/data/app-data` (the "orphan"):**
   - `apps.ts:209/273/447/540/801/1635` — install / boot-time `chown -R 1000:1000 ${dataDirectory}/app-data` / list / start
   - `scripts/install/factory-reset.sh:108-114` — iterates `/opt/livos/data/app-data/*/` to `docker compose down -v` each installed app
   - `apps/compose-sanitizer.test.ts:7` — `APP_DATA_DIR = '/opt/livos/data/app-data/community-app'`
   - `apps/inject-local-ai-clis.test.ts:31` — `APP_DIR = '/data/app-data/open-design'`
   - `files/files.test.ts:29` — maps `/Apps` → `/data/app-data`

### The RESEARCH premise is inverted

RESEARCH §Open-Q3 ("DEFINITIVE ANSWER") and the CONTEXT both claim:
- ❌ orphaned = `$LIVOS_DIR/data/app-data` (zero consumers, SAFE to remove)
- ✅ live = top-level `$LIVOS_DIR/app-data/<appId>`

The evidence shows the labels are **swapped for `app-data`**:
- `/opt/livos/data/app-data` (the `data/`-prefixed one the helper creates) is the **LIVE** per-app data root used by livinityd at runtime.
- The top-level `$LIVOS_DIR/app-data` referenced in `install.sh:1105-1122` (backup-preserve) + the app-script chown patch at `install.sh:1880` (`${LIVINITY_ROOT}/app-data/${app}`) is a *different* / legacy path that does NOT match the production `--data-directory /opt/livos/data` layout.

Only the **`data/tor/data`** half of the helper is genuinely orphaned (tor_proxy was deleted in Phase 276; zero consumers confirmed). The **`data/app-data`** half is load-bearing.

### Impact of removing the helper anyway (do NOT proceed)

`setup_docker_prerequisites()` pre-creates `/opt/livos/data/app-data` with `1000:1000` ownership at install time, before livinityd's first boot. Deleting it removes the install-time guarantee that the live app-data root exists and is correctly owned. While livinityd self-heals per-app dirs (`fse.mkdirp` + per-app `chown` at apps.ts:447-450) and the boot-time `chown -R 1000:1000 ${dataDirectory}/app-data` (apps.ts:273) is wrapped in `.catch(() => {})`, removing the install-time creation/chown of the ROOT is a behavior change on the live app-data path — exactly the "removing X is harmless" assumption the CONTEXT explicitly warned against (the Phase-276 regression trap). This needs an operator/planner decision, not silent execution.

## Recommended Resolution Options (for the planner/operator)

- **Option A (surgical — recommended):** Remove ONLY the genuinely-orphaned `data/tor/data` lines (`mkdir -p "$data_dir/tor/data"` + `chown -R 1000:1000 "$data_dir/tor"`) and KEEP the `data/app-data` `mkdir`/`chown` (rename the helper to e.g. `setup_app_data_dir()` and update the comment/`ok` string). Preserves the live app-data-root creation.
- **Option B (keep as-is):** Leave `setup_docker_prerequisites()` untouched. The `data/tor` half creates one empty unused dir — harmless — and the `data/app-data` half is load-bearing. Lowest risk; minimal churn.
- **Option C (full removal — NOT recommended):** Only safe if a separate audit proves livinityd's per-app self-heal + the tolerant boot-time chown fully cover the absence of the install-time root creation/chown across fresh-install AND update paths. Requires Linux integration testing (the `livos-itest` WSL distro), not a Windows static check.

Do NOT proceed with full removal until the operator chooses. The RESEARCH §Open-Q3 finding must be corrected before re-planning Task 2.

## Files Modified

- `livos/install.sh` — 2 Umbrel comment blocks removed (Task 1). `setup_docker_prerequisites()` UNCHANGED (Task 2 halted).
- `scripts/install/deploy-livinityd.sh` — 1 Umbrel comment block removed (Task 1).
- `scripts/install/__tests__/test-deploy-livinityd.sh` — 2 Umbrel comment blocks removed (Task 1).

## Commits

- `9b7ea7bb` — `chore(285-03): remove Umbrel-removal documentation comments from install scripts` (Task 1)

## Deviations from Plan

**Task 2 NOT executed — halted at the plan's drift-defense STOP gate (Rule 4 — architectural/data-path decision).**
The plan instructed STOP-and-report if a non-`setup_docker_prerequisites` consumer of `data/app-data` exists; multiple do, and the path is the LIVE per-app data root. This contradicts RESEARCH §Open-Q3. No code was removed for Task 2.

## Known Stubs

None.

## Self-Check: PASSED

- `livos/install.sh` modified (Task 1 comments gone): FOUND
- `scripts/install/deploy-livinityd.sh` modified: FOUND
- `scripts/install/__tests__/test-deploy-livinityd.sh` modified: FOUND
- Commit `9b7ea7bb`: FOUND
- `bash -n` passes on all 3 scripts: PASS
- Live-compat counts unchanged (2/1/2): PASS
