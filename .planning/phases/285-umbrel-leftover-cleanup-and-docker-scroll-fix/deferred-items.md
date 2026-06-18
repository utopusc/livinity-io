## Pre-existing test failures (discovered during Plan 285-02, NOT introduced here)

When running `pnpm --filter ui test:run dock`, the `dock` substring matches `routes/docker/**` test files. 19 tests in 5 files fail with `ReferenceError: localStorage is not defined`:
- `src/routes/docker/dashboard/use-tag-filter.unit.test.ts`
- `src/routes/docker/palette/use-recent-searches.unit.test.ts`
- (+ 3 other docker unit test files)

Root cause: these `*.unit.test.ts` files call `localStorage.clear()` in `beforeEach` but run under a non-jsdom (node) vitest environment. Last touched in Phase 29-01 (commit 6949a23b) — pre-dates this plan, untouched by Plan 285-02. OUT OF SCOPE (SCOPE BOUNDARY rule). The desktop `dock.test.tsx` file edited by this plan passes (9/9).

## WSL livos-itest deploy has a recursive symlink loop (discovered during Plan 285-04, NOT introduced here)

`wsl -d livos-itest -- pnpm --filter livinityd test startup-migrations.integration` aborts BEFORE any test runs with:
`Error: ELOOP: too many symbolic links encountered, watch '/opt/livos/packages/livinityd/ui/dist/dist/dist/.../dist/generated-tabler-icons/building-factory-2.svg'`

Root cause: the `livos-itest` distro's `/opt/livos` deploy has a self-referential `ui/dist/dist/dist/...` symlink loop; the vite/vitest FSWatcher crashes during startup (file watcher, not test collection). This is a stale-deploy/symlink defect in the WSL distro's `/opt/livos` checkout — NOT a code defect from Plan 285-04 and NOT a failure of any deleted/remaining test (vitest never reached test collection). OUT OF SCOPE (SCOPE BOUNDARY: pre-existing WSL-distro infra, not caused by this plan's edits). Plan 285-04 fell back to the CONTEXT/RESEARCH-sanctioned acceptance: livinityd `tsc --noEmit` clean (305 = baseline, 0 in `startup-migrations/index.ts`) + zero dangling reference to the removed `migrateBackThatMacUpPort`/`migrated-back-that-mac-up`/`Back That Mac Up`. To make the WSL run usable later, the distro deploy needs its recursive `ui/dist` symlink removed (e.g. re-rsync `/opt/livos` without the looped `dist/dist` link).
