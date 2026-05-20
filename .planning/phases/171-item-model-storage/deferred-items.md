# Phase 171 — Deferred Items (out-of-scope discoveries)

These pre-existing tsc errors were observed during Plan 171-01 execution
when running `tsc --noEmit` from `livos/packages/livinityd/`. They are
all in files UNRELATED to vault-items and are NOT caused by Plan 171-01
changes. Logged here per `<scope_boundary>` rule: only auto-fix issues
directly caused by the current task's changes. These survive into the
next phase — not Plan 171-01's responsibility.

Verification: `tsc --noEmit 2>&1 | grep vault-items | wc -l` returns 0,
proving vault-items module compiles clean.

## Pre-existing tsc errors (snapshot during 171-01)

- `source/modules/user/user.ts(169,26)` — TS2345 dot-prop path arg
- `source/modules/utilities/file-store.ts(100,3 + 107,3)` — TS2322 `boolean | void` vs `boolean`
- `source/modules/webapps/pipewire-portal.test.ts(79,4)` — TS2322 vi.fn mock typing
- `source/modules/webapps/trpc-router.ts(110,15 + 140,15 + 155,15 + 242,16 + 247,17 + 268,17 + 289,17 + 310,16 + 317,17)` — TS2339 `info`/`warn` missing on logger surface
- `source/modules/webapps/trpc-streams.test.ts(149,4)` — TS2578 unused `@ts-expect-error`
- `source/modules/widgets/routes.ts(23,28 + 45,11 + 49,10 + 75,10 + 104,84 + 107,24)` — TS18048 `ctx.livinityd` / `ctx.apps` possibly undefined

None block Plan 171-01 verification. Defer to a dedicated cleanup phase
(or treat as v38 prep — these surfaces touch user/widgets/webapps which
are NOT in the v38 critical path).
