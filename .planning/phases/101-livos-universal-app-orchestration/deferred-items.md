# Phase 101 — Deferred Items (Pre-existing Issues Out of Scope)

Discovered during Plan 101-00 execution (2026-05-10/11). These are pre-existing
failures NOT caused by Wave 0 changes. Per execute-plan scope boundary:

> Only auto-fix issues DIRECTLY caused by the current task's changes. Pre-existing
> warnings, linting errors, or failures in unrelated files are out of scope.

Wave 0 STUB FILES all run correctly as `it.skip(...)` placeholders. The 10
stubs are the deliverable; downstream waves fill them with real tests.

---

## livinityd — dbus integration test failures (pre-existing)

`pnpm --filter livinityd test:run` fails with `ENOENT /var/run/dbus/system_bus_socket`
on Windows for the following integration tests:

- `source/modules/apps/app-store.integration.test.ts`
- `source/modules/apps/apps.integration.test.ts`
- `source/modules/apps/app-repository.integration.test.ts`

**Root cause:** dbus is a Linux-only IPC system. These tests were written
to run on the Mini PC / CI Linux environment, not Windows dev shell. Pre-dates
Phase 101.

**Owner:** Whoever runs these in CI. Not Wave 0's responsibility.

---

## ui — jsdom env missing on legacy unit tests (pre-existing)

`pnpm --filter ui test:run` fails with `ReferenceError: localStorage is not defined`
in the following Phase 25/29-era test files that lack the
`// @vitest-environment jsdom` directive (or a global jsdom vitest config):

- `src/routes/docker/dashboard/use-tag-filter.unit.test.ts` (Phase 25-02)
- `src/routes/docker/palette/use-recent-searches.unit.test.ts` (Phase 29-01)
- 8 other UI tests in same category (21 total assertions failing on `localStorage`)

**Root cause:** A vitest config with `test.environment: 'jsdom'` was never created
for the ui package. Existing tests that need DOM use the per-file
`// @vitest-environment jsdom` comment. The 10 failing files predate this
convention and were never run via `pnpm test:run` (the script didn't exist
before Plan 101-00 added it as Wave 1+ infrastructure).

**Owner:** A future "ui test infra" plan should ship `livos/packages/ui/vitest.config.ts`
with `test.environment: 'jsdom'` as the default OR add the comment to each
failing file. Out of Wave 0 scope.

---

## Status

These pre-existing failures do NOT block Wave 0 deliverable: the 10 Wave 0
stub files all discover and run as `skipped` correctly. Wave 1+ TDD plans
can open the stubs and proceed with RED-phase tests as designed.

Per Plan 101-00 Task 2 acceptance criterion *"pnpm -r test:run exits 0 (all
skipped tests pass)"*: the intent (Wave 0 stubs pass as skipped) is satisfied.
The literal command exit code is non-zero due to **pre-existing** test failures
in unrelated files, not Wave 0 stubs.
