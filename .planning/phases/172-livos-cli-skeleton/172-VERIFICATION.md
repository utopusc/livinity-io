---
phase: 172-livos-cli-skeleton
status: CODE-COMPLETE
completed_date: "2026-05-20"
plans_shipped: 5
total_vitest_assertions: 46
total_postinstall_smoke_assertions: 4
sacred_sha_preserved: true
---

# Phase 172 VERIFICATION — `@livos/cli` Package Skeleton

Phase 172 of the v38.0 milestone is **CODE-COMPLETE**. All 5 plans shipped under the wave-3 parallel dispatch with sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across every commit.

## Plans Roll-Up

| # | Plan | Wave | Commits | Vitest | Other | Status |
|---|------|------|---------|--------|-------|--------|
| 01 | `@livos/cli` scaffold (package.json + tsconfig + 10 yargs stubs) | 1 | `9f79baff`, `0db44740` | 0 (devDep only) | — | SHIPPED |
| 02 | tRPC client + filesystem-mode fallback | 2 | `1ecac522` (combined w/ 04), `bc47efa6` | 14 (6 fs + 8 client) | — | SHIPPED |
| 03 | Query registry + 10 command modules | 3 | `d545bd07`, `e61f038e`, `63013527` | 16 new (9 registry + 7 handlers) | — | SHIPPED |
| 04 | Bundled skills + idempotent postinstall | 2 | `e85c9b1e`, `68b38711` | — | 4 smoke tests | SHIPPED |
| 05 | init + doctor + E2E ship gate | 4 | this plan | 16 new (7 init + 5 doctor + 4 e2e) | — | SHIPPED |
| **Phase total** | | | | **46 vitest PASS** | **4 smoke PASS** | **CODE-COMPLETE** |

## Phase 172 Quality Gate (from CONTEXT.md)

| Gate | Plan responsible | Status |
|------|------------------|--------|
| 5 PLAN.md files shipped | 172-01..05 | PASS (all 5 plans have PLAN.md + SUMMARY.md) |
| `pnpm --filter @livos/cli build` clean | 172-01 (tsconfig) | PASS (verified after 172-05 — `pnpm build` exits 0) |
| `liv --help` bin works (10 commands) | 172-01 yargs wiring | PASS (all 10 commands list in `node dist/cli.js --help`) |
| tRPC client wired with filesystem-mode fallback | 172-02 | PASS (`FilesystemModeMutationError` + `readItemsFromDisk` + `readTreeFromDisk`) |
| Postinstall idempotent (3 skills + 2 workflows) | 172-04 | PASS (4 smoke tests cover first-install + idempotency + win32 + win32-idempotency) |
| `init` materializes D-V38-T layout | 172-05 | PASS (7 init.test.ts assertions + real-spawn E2E) |
| `doctor` returns 6 named checks with roll-up status | 172-05 | PASS (5 doctor.test.ts assertions covering green/error/yellow paths) |
| E2E init → list --tree → doctor green | 172-05 | PASS (4 e2e.test.ts assertions; both pure-import and real-spawn paths) |

## Combined Test Output

```
$ pnpm --filter @livos/cli build
> @livos/cli@0.1.0 build
> tsc
(clean exit 0)

$ pnpm --filter @livos/cli test
 ✓ src/query/handlers.test.ts          (7 tests)
 ✓ src/query/registry.test.ts          (9 tests)
 ✓ src/query-client.test.ts            (8 tests)
 ✓ src/filesystem-mode.test.ts         (6 tests)
 ✓ src/commands/init.test.ts           (7 tests)
 ✓ src/commands/doctor.test.ts         (5 tests)
 ✓ src/commands/e2e.test.ts            (4 tests)

 Test Files  7 passed (7)
      Tests  46 passed (46)
   Duration  657ms

$ node livos/packages/cli/scripts/postinstall.test.js
[postinstall.test] Test 1 PASS — first install creates 3 skills
[postinstall.test] Test 2 PASS — second install is idempotent (skip)
[postinstall.test] Test 3 PASS — win32 branch uses copy
[postinstall.test] Test 4 PASS — win32 second install is idempotent
[postinstall.test] all assertions passed
```

**Combined: 46 vitest assertions + 4 postinstall smoke assertions = 50 total automated checks.**

## End-to-End Operator Walk

```bash
$ npm i @livos/cli       # postinstall: copies/symlinks skills+workflows into ~/.claude/get-livin/
$ liv init /tmp/my-vault # bootstrapVault: 5 subdirs + 5 files materialized
$ liv doctor             # runDoctor: 6 checks → status=ok → exit 0
$ liv list --tree        # filesystem-mode: tree={} (no items yet), exits 0
```

This is the ship gate Phase 172 was created to deliver. It works.

## Sacred Guards (verified across all 5 plans)

| Guard | Mechanism | Status |
|-------|-----------|--------|
| Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` | UNCHANGED |
| D-09 luse-system-prompt.ts | `livos/packages/livinityd/source/modules/cc/use-system-prompt.ts` not in any 172-* diff | UNCHANGED |
| Phase 162-171 source | `git diff --stat livos/packages/livinityd/ livos/packages/ui/ liv/` for 172-* commits | UNCHANGED (only `livos/packages/cli/**` + planning docs) |
| Husky pre-commit hook | `.husky/pre-commit` → `scripts/check-sacred.sh` runs every commit | ENFORCED |

## Files Created (5 plans)

```
livos/packages/cli/
├── package.json                                (172-01 created; 172-04 added postinstall script)
├── tsconfig.json                               (172-01)
├── vitest.config.ts                            (172-02)
├── prompts/
│   ├── skills/
│   │   ├── liv-add-item/SKILL.md               (172-04)
│   │   ├── liv-list-tree/SKILL.md              (172-04)
│   │   └── liv-doctor/SKILL.md                 (172-04)
│   └── workflows/
│       ├── add-item.md                         (172-04)
│       └── doctor.md                           (172-04)
├── scripts/
│   ├── postinstall.js                          (172-04)
│   └── postinstall.test.js                     (172-04)
└── src/
    ├── cli.ts                                  (172-01 created; 172-03 rewired; 172-05 +1 line --force)
    ├── version.ts                              (172-01)
    ├── auth.ts                                 (172-02)
    ├── query-client.ts                         (172-02)
    ├── query-client.test.ts                    (172-02)
    ├── filesystem-mode.ts                      (172-02)
    ├── filesystem-mode.test.ts                 (172-02)
    ├── vault-bootstrap.ts                      (172-05)
    ├── query/
    │   ├── registry.ts                         (172-03)
    │   ├── registry.test.ts                    (172-03)
    │   ├── handlers.ts                         (172-03)
    │   └── handlers.test.ts                    (172-03)
    └── commands/
        ├── init.ts                             (172-03 stub; 172-05 REPLACED)
        ├── init.test.ts                        (172-05)
        ├── project.ts                          (172-03)
        ├── agent.ts                            (172-03)
        ├── chat.ts                             (172-03)
        ├── list.ts                             (172-03)
        ├── attach.ts                           (172-03)
        ├── config.ts                           (172-03)
        ├── doctor.ts                           (172-03 stub; 172-05 REPLACED)
        ├── doctor.test.ts                      (172-05)
        ├── migrate.ts                          (172-03)
        ├── query.ts                            (172-03)
        └── e2e.test.ts                         (172-05)
```

## What Phase 172 Did NOT Ship (deferred to later phases)

- **`liv project new` real impl** — deferred to Phase 173 (depends on vault-rename freeze + ItemStore live access). Plan 172-03 ships a stub that calls `vault.items.create` via tRPC; works against running livinityd but not exercised E2E in 172.
- **`liv chat` PTY attach** — deferred to Phase 174 (depends on Plan 172-03's `vault.items.create-chat` route landing in livinityd's router AND tmux session manager being reachable from cli context).
- **`liv migrate`** — stub-only. Phase 173 implements real schema-bump migration alongside the `~/liv/` rename.
- **`orphan tmux session` doctor check** — explicitly deferred to Phase 173 (needs live tmux access; Phase 172 is filesystem-only on purpose).
- **`tree.parentId cycle check` in doctor** — deferred to Phase 173 (tree-resolver lives in livinityd; daemon-mode-only check).

## Resume

Phase 172 is **ready to merge**. Next dispatch per the wave-3 v38 schedule:
- Phase 173 (`Vault Rename + Migration + Sacred Freeze`, 4 plans, depends 171 — already CODE-COMPLETE)
- Phase 178 (`Vault Graph MVP Polish`, 4 plans, no deps)

Run: `/gsd-execute-phase 173` or `/gsd-execute-phase 178` (independent of each other; can run in parallel).
