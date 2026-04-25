# Phase 19 — Deferred Items

Out-of-scope issues discovered during execution that are NOT caused by Plan 19's changes.
These are pre-existing across the codebase and do not block this phase.

## Plan 19-02 (2026-04-24)

### Pre-existing TypeScript errors in livinityd

`pnpm --filter livinityd typecheck` reports ~338 errors in files unrelated to Plan 19-02:
- `source/modules/user/routes.ts` (12 errors): `ctx.user` possibly undefined
- `source/modules/user/user.ts` (3 errors): dot-prop typed-path mismatch
- `source/modules/widgets/routes.ts` (5 errors): `ctx.livinityd` / `ctx.apps` possibly undefined
- `source/modules/utilities/file-store.ts` (3 errors): Buffer/Uint8Array generic, void return
- ... and ~315 more across modules unrelated to docker/vuln scanning.

**Scope boundary applied:** Plan 19-02 only touches:
- `livos/packages/livinityd/source/modules/docker/vuln-scan.ts` (NEW)
- `livos/packages/livinityd/source/modules/docker/types.ts`
- `livos/packages/livinityd/source/modules/docker/routes.ts`
- `livos/packages/livinityd/source/modules/server/trpc/common.ts`
- `livos/packages/ui/src/hooks/use-images.ts`
- `livos/packages/ui/src/routes/server-control/index.tsx`

`grep -E "(vuln-scan|docker/routes|docker/types|trpc/common)"` against the typecheck output returns **0 errors** — the new and modified backend files are clean. Frontend `pnpm --filter ui build` is the gating signal for this plan.

These pre-existing errors should be addressed in a dedicated tech-debt phase; they do not affect runtime because livinityd executes via `tsx` (no compile step).
