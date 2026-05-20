# Phase 166 — Deferred Items

Pre-existing issues discovered during execution; out-of-scope per SCOPE BOUNDARY (Rule: only auto-fix issues DIRECTLY caused by current task's changes).

## Pre-existing tsc errors on baseline master (399 total)

Discovered during Plan 166-01 acceptance gate. `pnpm --filter livinityd exec tsc --noEmit` returns 399 errors on baseline master (HEAD@9b820427 pre-166-01 changes). Same 399 errors after Phase 166 commits — **Phase 166 introduces zero new tsc errors**.

Representative samples:
- `source/modules/user/routes.ts` — 10× `ctx.user` is possibly 'undefined' (auth middleware typing gap)
- `source/modules/user/user.ts` — 3× store path narrowing (`user.accentColor`)
- `source/modules/utilities/file-store.ts` — 2× `boolean | void` not assignable to `boolean`
- `source/modules/webapps/pipewire-portal.test.ts` — Mock typing drift
- `source/modules/webapps/trpc-router.ts` — 9× logger missing `info`/`warn` (the logger shim returns only `log`/`verbose`/`error`)
- `source/modules/widgets/routes.ts` — 6× `ctx.livinityd` / `ctx.apps` possibly 'undefined'

**Decision:** Out of scope for Phase 166. Phase 166 acceptance criterion "tsc --noEmit clean for cc-pty/*.ts + livinityd/source/index.ts after placeholder insertion" is verified via filtered grep (`grep -E "(cc-pty|source/index\\.ts)"` returns empty across all 5 plans).

## Notes

- Per CLAUDE.md and execution_protocol: Phase 166 tests STUB `execSync` and `pty.spawn` so they run on Windows dev without tmux. Real tmux smoke test happens at Phase 170 on Mini PC.
- `node-pty` native module verified installed at `livos/packages/livinityd/node_modules/node-pty` (pnpm lockfile reference confirmed).
