---
phase: 65-liv-rename-foundation-cleanup
plan: 04
subsystem: foundation
tags: [rename, deploy-scripts, update-sh, install-sh, github-workflows, mini-pc, server4-deletion]
requires:
  - 65-03 (delivered: source tree fully renamed @nexus/* → @liv/*, NEXUS_* → LIV_*, nexus: → liv: Redis prefixes; build gate clean across all @liv/* workspaces)
provides:
  - update.sh: zero stale /opt/nexus | @nexus/ | NEXUS_ refs; pnpm-store quirk glob @nexus+core* → @liv+core* applied; banner + log lines say "Liv"
  - livos/install.sh: zero NEXUS_* env refs (NEXUS_API_URL → LIV_API_URL); /opt/nexus → /opt/liv across 3 systemd units + 5 build/deploy paths; comment+log strings normalized to Liv
  - .github/workflows/deploy.yml: legacy Server4 git-pull+pm2 deploy DELETED per HARD RULE 2026-04-27; workflow stub + explanatory disabled-comment block remain
  - .github/workflows/update-sh-smoke.yml: nexus/** → liv/** path filter, all @nexus/* build verify steps → @liv/*, cache key + summary text updated
  - livos/setup.sh: NO EDITS NEEDED (already pre-renamed in earlier work — 65-03 sweep cleaned this; verified zero nexus|NEXUS_ refs)
  - Single atomic commit landed (65d584dc) — rollback = `git revert 65d584dc`
affects:
  - 65-05 (Mini PC migration script can author against fully-renamed update.sh + install.sh; can reference /opt/liv/ paths consistently)
  - 65-06 (active-doc rename has no remaining build/deploy script straggler refs to mention)
  - CI: next workflow_dispatch run of update-sh-smoke.yml will exercise new @liv/* build paths against the 65-02-renamed source tree

tech-stack:
  added: []
  patterns:
    - "HARD RULE D-NO-SERVER4 enforced via DELETION (not rename): legacy deploy.yml git-pull+pm2 flow targeting Server4 was replaced wholesale with a no-op workflow_dispatch stub plus an explanatory comment block. Mini PC deploy uses /opt/livos/update.sh; this workflow had no place in the rename target list."
    - "pnpm-store glob preservation: update.sh's `find ... -name '@nexus+core*'` quirk-workaround retargeted to `@liv+core*` so the multi-resolution-dir copy loop continues working post-rename. Memory note about the workaround still applies — just re-pointed at the new package name."
    - "Static-analysis-only verification: per plan must_haves DRY-RUN-SAFE invariant, no shell script was executed against any live target during this plan. Mini PC remains on the OLD /opt/nexus/-pathed update.sh until 65-05's user-walk cutover."

key-files:
  created: []
  modified:
    - update.sh (3 logical regions: constants, build, ownership/banner — ~25 line changes)
    - livos/install.sh (constants, .env template, setup_repository, build_project, 3 systemd unit blocks, kimi CLI path — ~30 line changes)
    - .github/workflows/deploy.yml (full rewrite: 70 lines → 27 lines disabled stub)
    - .github/workflows/update-sh-smoke.yml (path filter, cache step, 4 build+verify pairs, summary echo — ~15 line changes)

decisions:
  - "deploy.yml DELETION strategy (not rename): the legacy workflow used `git pull && pm2 restart livos nexus-core` against an unspecified `${{ secrets.SERVER_HOST }}` SSH target. Per memory HARD RULE 2026-04-27 (Server4 off-limits) and the plan brief's explicit `# Server4 deploy disabled per HARD RULE 2026-04-27` directive, the deploy logic was DELETED rather than rebranded to /opt/liv/. The remaining stub is `workflow_dispatch`-only with a single no-op step that prints why it's disabled — this prevents accidental re-trigger via push-to-master while preserving an audit trail for future maintainers."
  - "GitHub secret rename: deploy.yml does NOT reference `${{ secrets.NEXUS_API_KEY }}` (it uses `SERVER_HOST/USER/SSH_KEY` only, all of which are GitHub-side names unrelated to the Nexus brand). The plan's Task 3 checkpoint:human-action for `NEXUS_API_KEY → LIV_API_KEY` rename is therefore VACUOUS for this repo — no GitHub secret currently named NEXUS_* needs renaming. Checkpoint emitted as a defensive note in case a stale secret exists in the GitHub Actions secrets UI but is not referenced by any workflow."
  - "livos/setup.sh skipped: already clean (zero nexus|Nexus|NEXUS_|@nexus|/opt/nexus refs found via Grep). The rename of LIV_DIR=$LIVOS_DIR/packages/liv was done in 65-02 or 65-03; this plan only confirmed and skipped."
  - "Build gate scope clarification: plan specifies `pnpm --filter '@liv/core' build`, but liv/ uses npm workspaces (not pnpm). Substituted with `npm run build --workspace=packages/core` from liv/. tsc emitted no errors → build clean (D-09 satisfied)."
  - "pnpm install full-run had pre-existing Windows-specific postinstall failure in livos/packages/ui (mkdir -p + cp -r in @tabler/icons copy-script doesn't work in Windows shell). Verified pre-existing via git log on packages/ui/package.json (last touched in 71-02, not by 65-04). pnpm install --ignore-scripts confirms dependency resolution is clean. The Windows-quirk is invariant under shell/yaml edits and does not block the build gate."

metrics:
  duration: ~6 minutes
  completed: 2026-05-05
  tasks: 3 (Task 1: update.sh+install.sh+setup.sh edits, Task 2: workflow YAML edits + atomic commit, Task 3: human-action checkpoint emitted)
  commits: 1 (65d584dc — single atomic commit per plan must_have)
  files_modified: 4 (update.sh, livos/install.sh, .github/workflows/deploy.yml, .github/workflows/update-sh-smoke.yml)
---

# Phase 65 Plan 04: Build/Deploy Script Rename (update.sh + install.sh + GitHub Workflows) Summary

Mechanical rename of build/deploy script references from Nexus → Liv across `update.sh`, `livos/install.sh`, and `.github/workflows/{deploy,update-sh-smoke}.yml`, with HARD RULE D-NO-SERVER4 enforced via deletion of the legacy git-pull+pm2 deploy workflow. Sacred SHA `4f868d31...` preserved across all edits. Single atomic commit `65d584dc`.

## What Was Done

### 1. update.sh

| Change | Before | After |
|--------|--------|-------|
| Constant | `NEXUS_DIR="/opt/nexus"` | `LIV_DIR="/opt/liv"` |
| Step 3 banner | `# ── Step 3: Update Nexus source files ──` | `# ── Step 3: Update Liv source files ──` |
| step()/info()/ok() log lines | "Nexus", "nexus/", "Updating nexus/$pkg..." | "Liv", "liv/", "Updating liv/$pkg..." |
| TEMP_DIR source paths | `$TEMP_DIR/nexus/*` | `$TEMP_DIR/liv/*` |
| verify_build calls | `@nexus/core`, `@nexus/worker`, `@nexus/mcp-server` | `@liv/core`, `@liv/worker`, `@liv/mcp-server` |
| pnpm-store quirk glob | `@nexus+core*` | `@liv+core*` |
| pnpm-store target_parent | `${store_dir}node_modules/@nexus/core` | `${store_dir}node_modules/@liv/core` |
| chown ownership | `chown -R root:root "$NEXUS_DIR"` | `chown -R root:root "$LIV_DIR"` |
| Banner echo | "Nexus AI packages" | "Liv AI packages" |

**Total occurrences renamed:** All 35 (vs spec's 7+7+21 estimate; matched within margin).

**pnpm-store quirk preservation confirmed:** The find-glob workaround (memory note about update.sh pnpm-store quirk) is preserved — just retargeted to the new package name. The "if pnpm has multiple resolution dirs, manually copy" memory note still applies post-rename.

### 2. livos/install.sh

| Change | Before | After |
|--------|--------|-------|
| Constant | `NEXUS_DIR="/opt/nexus"` | `LIV_DIR="/opt/liv"` |
| .env template | `NEXUS_API_URL=...` | `LIV_API_URL=...` |
| setup_repository moves | `rm -rf /opt/nexus; mkdir -p /opt/nexus; cp -a "$temp_dir/nexus/."` | `rm -rf /opt/liv; mkdir -p /opt/liv; cp -a "$temp_dir/liv/."` |
| build_project local var | `local nexus_dir="/opt/nexus"` | `local liv_dir="/opt/liv"` |
| Build step labels | "Installing/Building Nexus dependencies/packages/core/..." | "Installing/Building Liv dependencies/packages/core/..." |
| Dist copy node_modules path | `@nexus/core/dist` | `@liv/core/dist` |
| pnpm-store find-glob | `@nexus+core*` | `@liv+core*` |
| .env symlink | `Nexus .env symlinked` | `Liv .env symlinked` |
| chown ownership | `chown -R livos:livos /opt/nexus` | `chown -R livos:livos /opt/liv` |
| systemd liv-core.service | `Description=Liv AI Core (Nexus AI daemon)` | `Description=Liv AI Core (Liv AI daemon)` |
| systemd liv-core WorkingDirectory | `/opt/nexus` | `/opt/liv` |
| systemd liv-memory WorkingDirectory | `/opt/nexus/packages/memory` | `/opt/liv/packages/memory` |
| systemd liv-memory ReadWritePaths | `... /opt/nexus /home/livos` | `... /opt/liv /home/livos` |
| systemd liv-worker WorkingDirectory | `/opt/nexus` | `/opt/liv` |
| systemd liv-worker ReadWritePaths | `... /opt/nexus /home/livos` | `... /opt/liv /home/livos` |
| Kimi CLI install path | `$NEXUS_DIR/scripts/install-kimi.sh` | `$LIV_DIR/scripts/install-kimi.sh` |

**Total occurrences renamed:** 26 (matches spec line 142 measurement exactly).

### 3. .github/workflows/deploy.yml

**DELETED (per HARD RULE D-NO-SERVER4 / 2026-04-27).** The legacy `appleboy/ssh-action`-based deploy targeting `${{ secrets.SERVER_HOST }}` with `git pull + pm2 restart livos nexus-core` was a Server4-style deployment flow that pre-dates the Mini PC `/opt/livos/update.sh` deploy mechanism. Per memory's hard rule "Server4 is NOT yours", the entire deploy logic was removed (NOT rebranded to /opt/liv/) and replaced with:

- A 12-line `#`-comment block explaining why the workflow is disabled (with a reference to MEMORY.md's HARD RULE 2026-04-27)
- A no-op `workflow_dispatch`-only stub that exits 0 with an explanatory echo

This prevents accidental push-to-master triggering the deploy and preserves audit-trail context for future maintainers. **Per spec line 143's "8 occurrences expected"**, all 8 were resolved by deletion rather than rename.

### 4. .github/workflows/update-sh-smoke.yml

| Change | Before | After |
|--------|--------|-------|
| PR path filter | `'nexus/**'` | `'liv/**'` |
| Cache step name | `Cache nexus node_modules` | `Cache liv node_modules` |
| Cache path | `nexus/node_modules` | `liv/node_modules` |
| Cache key | `nexus-nm-...` | `liv-nm-...` |
| Cache hashFiles arg | `'nexus/package-lock.json', 'nexus/packages/*/package-lock.json'` | `'liv/package-lock.json', 'liv/packages/*/package-lock.json'` |
| Build/verify steps (4 pairs) | `@nexus/{core,worker,mcp-server,memory}` + `nexus/packages/*/dist/index.js` paths | `@liv/{core,worker,mcp-server,memory}` + `liv/packages/*/dist/index.js` paths |
| Summary echo lines | `@nexus/...   : verified` | `@liv/...   : verified` |

### 5. livos/setup.sh

**No edits needed.** Grep verified zero matches of `nexus|Nexus|NEXUS_|@nexus|/opt/nexus`. The file already uses `LIV_DIR="$LIVOS_DIR/packages/liv"` (renamed in earlier 65-02/65-03 work). No-op.

## Server4 Deletion Summary

**Was a Server4-targeting block deleted?** YES.

**Source:** `.github/workflows/deploy.yml` (entire file pre-edit)

**Original content:**
```yaml
name: Deploy to Server
on: { push: { branches: [master] }, workflow_dispatch: {} }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: Livinity Server
    steps:
      - name: Deploy to Server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/livos && git fetch origin && git reset --hard origin/master
            cd livos && pnpm install --frozen-lockfile
            ... (build steps for /opt/livos/nexus/packages/core)
            cd /opt/livos/nexus/packages/core && npm install && npm run build
            if [ -d "/opt/nexus/app" ] && [ ! -L "/opt/nexus/app" ]; then
              rm -rf /opt/nexus/app
              ln -sf /opt/livos/nexus /opt/nexus/app
            fi
            pm2 restart livos nexus-core
```

**Why deleted instead of renamed:** Per HARD RULE 2026-04-27, Server4 is OFF-LIMITS. The workflow's `${{ secrets.SERVER_HOST }}` was historically pointed at the legacy server (Server4-style); rebranding the paths to `/opt/liv/` would tacitly re-enable Server4 deploy under a clean coat of paint. The HARD RULE explicitly forbids this. The Mini PC's deploy mechanism is `/opt/livos/update.sh` (NOT a CI workflow), so this CI deploy has no replacement — only the disabled stub.

**Comment marker:** `# Server4 deploy disabled per project HARD RULE 2026-04-27 — see MEMORY.md` is present at the top of the rewritten deploy.yml file.

## Verification

| Gate | Result |
|------|--------|
| `update.sh` grep `/opt/nexus\|@nexus\/\|NEXUS_` | 0 matches (clean) |
| `livos/install.sh` grep `NEXUS_[A-Z_]+` | 0 matches (clean) |
| `livos/install.sh` grep `/opt/nexus\|@nexus\|nexus\|Nexus` | 0 matches (clean) |
| `livos/setup.sh` grep `nexus\|NEXUS_` | 0 matches (already clean before plan) |
| `.github/workflows/update-sh-smoke.yml` grep `nexus\|@nexus\|NEXUS_\|/opt/nexus` | 0 matches (clean) |
| `.github/workflows/deploy.yml` grep stale refs (excluding disabled-comments) | 0 in live YAML; `/opt/nexus` mentioned only in disabled-comment block (allowed) |
| YAML validation (Python `yaml.safe_load`) | Both workflows parse-valid |
| ShellCheck on update.sh + install.sh | NOT RUN (shellcheck unavailable on Windows; documented per plan interfaces section) |
| Sacred SHA at start | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ |
| Sacred SHA after Task 1 commit-prep | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ |
| Sacred SHA after Task 2 commit | `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ |
| `npm run build --workspace=packages/core` from `liv/` (build gate D-09) | tsc clean, exit 0 |
| `pnpm install --frozen-lockfile --ignore-scripts` from `livos/` | Done in 1.6s, exit 0 |
| Server4 IP scan (`45.137.194.103`) across 5 plan-touched files | 0 matches in any file |
| Atomic commit | Single commit `65d584dc` covers all 4 files |
| Post-commit deletion check | No tracked-file deletions (deploy.yml is modified, not deleted) |

## Outstanding User Action — Task 3 Checkpoint (Non-Blocking)

**Status:** VACUOUS-but-emitted-defensively. The plan's checkpoint:human-action for `secrets.NEXUS_API_KEY → secrets.LIV_API_KEY` rename does not apply to this repo, because the deploy.yml workflow does not reference any `secrets.NEXUS_*` GitHub Actions secret. The workflow's referenced secrets (`SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`) are GitHub-side names unrelated to the Nexus brand.

However, per the plan's Task 3 directive, a defensive checkpoint note is emitted in case the user has a stale `NEXUS_API_KEY` secret in https://github.com/utopusc/livinity-io/settings/secrets/actions that pre-dates current workflow references and should be cleaned up.

**Recommended user action (optional, non-blocking):**
1. Visit https://github.com/utopusc/livinity-io/settings/secrets/actions
2. If a secret named `NEXUS_API_KEY` exists, rename it to `LIV_API_KEY` (or delete it if no workflow references it).
3. No urgency — the deploy.yml stub is `workflow_dispatch`-only and exits 0 with no secret usage.

**This checkpoint does NOT block 65-05 from starting.**

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with two clarifications documented under `decisions` rather than as deviations:

1. **deploy.yml: rewrite vs. rename.** The plan's Task 2 step 2 offered options (a) "keep secrets.NEXUS_API_KEY YAML reference" or (b) "rename + emit human-action checkpoint." Neither applied — deploy.yml had no NEXUS_* secret reference, and the workflow's entire deploy logic was Server4-flavored legacy. The HARD RULE deletion path was the cleanest fit.
2. **Build gate command.** Plan said `pnpm --filter '@liv/core' build`. Liv uses npm workspaces (not pnpm) per `liv/package.json` `workspaces: ["packages/*"]`. Substituted with `npm run build --workspace=packages/core` from `liv/` — same intent (build @liv/core, exit 0), correct invocation.

### Authentication Gates

None.

## TDD Gate Compliance

N/A — plan type is `execute` (not `tdd`).

## Rollback

```bash
git revert 65d584dc
```

**Side effects:** None on Mini PC. The plan was DRY-RUN-SAFE — no `update.sh` execution against any live target, no SSH session to Mini PC, no live deploy. Mini PC continues running its locally-deployed `/opt/livos/update.sh` (which still has /opt/nexus paths and is built from a pre-65-04 SHA). Reverting this commit only undoes the source-tree rename of these 4 files; Mini PC migration is 65-05's user-walk territory.

**GitHub secret note:** No GitHub secret was renamed in this plan, so rollback requires no inverse-secret-rename action.

## Self-Check: PASSED

- [x] Path `update.sh` exists and modified
- [x] Path `livos/install.sh` exists and modified
- [x] Path `.github/workflows/deploy.yml` exists and modified (rewritten)
- [x] Path `.github/workflows/update-sh-smoke.yml` exists and modified
- [x] Path `livos/setup.sh` exists, was checked, no edits required
- [x] Commit `65d584dc` exists in `git log --oneline`
- [x] Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved at end
- [x] Server4 disabled-comment marker present in new deploy.yml
- [x] @liv/core npm build clean
