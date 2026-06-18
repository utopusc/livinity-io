## Pre-existing test failures (discovered during Plan 285-02, NOT introduced here)

When running `pnpm --filter ui test:run dock`, the `dock` substring matches `routes/docker/**` test files. 19 tests in 5 files fail with `ReferenceError: localStorage is not defined`:
- `src/routes/docker/dashboard/use-tag-filter.unit.test.ts`
- `src/routes/docker/palette/use-recent-searches.unit.test.ts`
- (+ 3 other docker unit test files)

Root cause: these `*.unit.test.ts` files call `localStorage.clear()` in `beforeEach` but run under a non-jsdom (node) vitest environment. Last touched in Phase 29-01 (commit 6949a23b) — pre-dates this plan, untouched by Plan 285-02. OUT OF SCOPE (SCOPE BOUNDARY rule). The desktop `dock.test.tsx` file edited by this plan passes (9/9).
