---
phase: 101
plan: 03
title: Native App Spawn Helper + Redis Schema + tRPC Routes
subsystem: livinityd / apps
type: execute
wave: 1
status: complete
tags: [native-apps, t-101-02, redis-schema, trpc-routes, security]
requirements: [D-101-NATIVE-APPS, D-101-SACRED]
dependency_graph:
  requires: [101-00 wave-0 scaffolding (Redis client, ioredis, vitest infra)]
  provides:
    - "nativeAppConfigSchema + NativeAppConfig type"
    - "NativeAppConfigStore (CRUD over liv:apps:native:<uuid>)"
    - "spawnNativeApp({cfg, display?, spawnFn?, logger?}) -> {pid, child}"
    - "NativeAppSpawnError typed error class"
    - "tRPC apps.native.{list,get,create,delete} router (admin-gated mutations)"
    - "livinityd.nativeAppConfigStore field (consumed by tRPC ctx)"
  affects:
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (4 new httpOnlyPaths)"
    - "livos/packages/livinityd/source/modules/server/trpc/index.ts (mergeRouters wiring)"
    - "livos/packages/livinityd/source/index.ts (Livinityd field + start() init)"
tech_stack:
  added: []
  patterns:
    - "Map-backed FakeRedis test pattern (mirrors seed-builtin-tools.test.ts)"
    - "FakeChild EventEmitter mock pattern (mirrors window-manager.test.ts:31-33)"
    - "Stderr-tail diagnostic on non-zero exit (vnc-bridge.ts:132-157 analog)"
    - "Typed-error-class pattern (window-manager.ts:80-92 analog)"
    - "tRPC mergeRouters with wrapper router({native: nativeAppsRouter}) — extends Phase 47 apps.* extension precedent"
    - "Defense-in-depth: schema re-parsed at spawn time + admin-gated mutations + LD_/DYLD_ env blocklist"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/apps/native-app-config.ts"
    - "livos/packages/livinityd/source/modules/apps/native-app-config.test.ts"
    - "livos/packages/livinityd/source/modules/apps/native-app-spawner.ts"
    - "livos/packages/livinityd/source/modules/apps/native-routes.ts"
  modified:
    - "livos/packages/livinityd/source/modules/apps/native-app-spawner.test.ts (Wave 0 stub → 13 real cases)"
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (4 httpOnlyPaths entries)"
    - "livos/packages/livinityd/source/modules/server/trpc/index.ts (mergeRouters extension)"
    - "livos/packages/livinityd/source/index.ts (NativeAppConfigStore field + start() init)"
decisions:
  - "Sub-namespace apps.native.* via t.mergeRouters(appsBase, healthRouter, router({native: nativeAppsRouter})). Mirrors Phase 47 healthRouter extension precedent rather than introducing a top-level namespace. Keeps the Pillar B dock CRUD adjacent to apps.* in the type-tree."
  - "NativeAppConfigStore typed against a narrow RedisLike interface (set/get/del/keys/publish) rather than ioredis Redis directly. Tests pass a Map-backed fake (matches seed-builtin-tools.ts convention). No runtime cost — Redis instance is structurally compatible."
  - "Spawner re-parses nativeAppConfigSchema at spawn time even though tRPC + Redis store both validate. Defense-in-depth pays for itself if a future code path (boot-time auto-launch, agent-driven spawn, etc.) bypasses tRPC."
  - "Plan referenced root.ts; actual file is server/trpc/index.ts — adapted naming, mergeRouters path is the canonical composition surface in this tree."
metrics:
  duration_minutes: ~45
  tasks_completed: 5
  tests_added: 27 (14 config + 13 spawner)
  commits: 4
  completed_at: "2026-05-11T00:25:00Z"
---

# Phase 101 Plan 03: Native App Spawn Foundation Summary

**One-liner:** Ship Pillar B foundation — Ubuntu native binaries spawn detached on DISPLAY=:1 via NativeAppSpawner, configs persist at Redis `liv:apps:native:<uuid>`, tRPC `apps.native.{list,get,create,delete}` routes admin-gated for mutations with full T-101-02 (binary injection / preload-library) mitigation at three layers.

## What Shipped

### 1. Schema + Redis Store (`native-app-config.ts`)

`nativeAppConfigSchema` (zod) enforces T-101-02 mitigations at the trust boundary:

- **binaryPath**: regex `^/[a-zA-Z0-9_\-./]+$` — must be absolute, no shell metacharacters
- **args**: each element regex-blocked against `; & | $ \` < > ( ) { } \` — no shell injection vectors
- **env**: `.refine()` rejects any key starting with `LD_` or `DYLD_` (LD_PRELOAD, DYLD_INSERT_LIBRARIES, LD_LIBRARY_PATH, LD_AUDIT, LD_BIND_NOW, DYLD_FORCE_FLAT_NAMESPACE, etc. — full preload-library family)
- **wmClassHint**: regex `^[\w-]{1,64}$` — narrow charset, capped length
- **name**: 1–64 chars; **iconUrl**: optional URL

`NativeAppConfigStore` exposes:

- `upsert(cfg)` — re-parses schema, writes `liv:apps:native:<uuid>`, publishes `{kind: 'native-app', id, op: 'upsert'}` on `liv:config:updated`
- `get(id)` — returns `NativeAppConfig | null`; corrupt entries return null (defense-in-depth)
- `list()` — scans `liv:apps:native:*`, skips corrupt entries silently
- `delete(id)` — idempotent; only publishes when something actually changed

### 2. NativeAppSpawner (`native-app-spawner.ts`)

`spawnNativeApp({cfg, display?, spawnFn?, logger?})` → `{pid, child}`

- **(a) Defense in depth**: re-parses `nativeAppConfigSchema` BEFORE handing off to `child_process.spawn`. Relative paths or `LD_*`/`DYLD_*` env keys throw `NativeAppSpawnError` and `spawnFn` is never called.
- **(b) Env composition**: `{...process.env, ...cfg.env, DISPLAY: display}` — DISPLAY ALWAYS wins last (cfg.env can never shadow it accidentally).
- **(c) Detached spawn**: `detached: true`, `stdio: ['ignore', 'ignore', 'pipe']`, then `child.unref()` so livinityd's event loop is not held open.
- **(d) Stderr tail**: last 50 lines captured; on non-zero exit, `logger.warn` fires with the tail dump (vnc-bridge.ts diagnostic pattern). Clean exits and signal-only terminations log at `info`/`verbose` levels — no false-positive warning spam.
- **Default DISPLAY=:1** — matches the singleton Xvfb stood up by livinityd.start() in 100-08-01.

Typed error class `NativeAppSpawnError` (code: `NATIVE_APP_SPAWN_FAILED`) mirrors `WindowNotFoundError` / `WebappCapExceededError` (window-manager.ts:80-92).

### 3. tRPC Routes (`native-routes.ts`)

| Route | Procedure | Notes |
| --- | --- | --- |
| `apps.native.list` | `privateProcedure.query` | Any logged-in user (dock-render) |
| `apps.native.get` | `privateProcedure.query` | UUID-validated; returns null on miss |
| `apps.native.create` | `adminProcedure.mutation` | `nativeAppConfigSchema` input; admin-only (T-101-02) |
| `apps.native.delete` | `adminProcedure.mutation` | Idempotent; UUID-validated |

Router merged into the existing `apps` namespace via `t.mergeRouters(appsBase, diagnosticsRoutes.appsHealthRouter, router({native: nativeAppsRouter}))` in `server/trpc/index.ts`. All four paths registered in `server/trpc/common.ts` `httpOnlyPaths` so they route through Express HTTP (matches the conventions for `apiKeys.*`, `agents.*`, `webapp.*`).

`requireStore()` helper throws clean `INTERNAL_SERVER_ERROR` if `ctx.livinityd.nativeAppConfigStore` is undefined (boot edge or Redis offline) — same pattern as `requirePool()` in agents-router.ts.

### 4. Livinityd Wire-up (`source/index.ts`)

- Added optional field `nativeAppConfigStore?: NativeAppConfigStore` on the Livinityd class.
- Instantiated in `start()` right after `ai.start()` completes (so `this.ai.redis` is connected). Construction is side-effect-free (just stashes the redis ref).
- Boot logs: `NativeAppConfigStore wired (liv:apps:native:* namespace)`.

## Redis Schema

```
liv:apps:native:<uuid>  →  JSON-encoded NativeAppConfig
                           {id, name, iconUrl?, binaryPath, args?, env?, wmClassHint?}

Channel: liv:config:updated  (same channel McpConfigManager publishes on)
  Upsert: {"kind":"native-app","id":"<uuid>","op":"upsert"}
  Delete: {"kind":"native-app","id":"<uuid>","op":"delete"}
```

Sample stored payload:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Antigravity IDE",
  "iconUrl": "https://example.com/antigravity.svg",
  "binaryPath": "/opt/antigravity/bin/antigravity",
  "args": ["--new-window"],
  "wmClassHint": "Antigravity"
}
```

## Test Counts

| File | Tests | Pass |
| --- | --- | --- |
| `apps/native-app-config.test.ts` | 14 | 14 |
| `apps/native-app-spawner.test.ts` | 13 | 13 |
| **Total** | **27** | **27** |

Test invocation:

```
pnpm --filter livinityd test:run apps/native-app-config.test.ts apps/native-app-spawner.test.ts -- --reporter=dot
```

## Commits (this plan)

| # | Hash | Subject |
| - | ---- | ------- |
| 1 | `15c86f90` | feat(101-03): native-app config schema + Redis CRUD (T-101-02 mitigation) |
| 2 | `184484f3` | feat(101-03): NativeAppSpawner — detached DISPLAY=:1 spawn with stderr tail |
| 3 | `877daeb8` | feat(101-03): tRPC apps.native.{list,get,create,delete} routes + HTTP-only wiring |
| 4 | `97f7ec81` | feat(101-03): wire NativeAppConfigStore into Livinityd class |

## Threat Model Coverage (T-101-02)

| Layer | Mitigation | File |
| --- | --- | --- |
| 1 — tRPC route boundary | `nativeAppConfigSchema` as procedure input on `apps.native.create` | `native-routes.ts` |
| 2 — Persistence boundary | `NativeAppConfigStore.upsert` re-parses before SET | `native-app-config.ts` |
| 3 — Spawn boundary | `spawnNativeApp` re-parses before `child_process.spawn` | `native-app-spawner.ts` |
| 4 — RBAC | `adminProcedure` on create/delete | `native-routes.ts` |
| 5 — DISPLAY pin | `{...process.env, ...cfg.env, DISPLAY}` — DISPLAY wins last | `native-app-spawner.ts` |

T-101-02b (Redis tampering outside tRPC) — **accept** per plan threat register; same risk surface as existing `liv:apps:webapp:*`.

## Sacred SHA Verification

| Point | Hash | Match |
| --- | --- | --- |
| Pre-execution | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 1 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 2 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 3 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post Task 4 | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | ✓ |
| Post final commit | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | (verified below in self-check) |

Plan 101-03 does NOT touch the `liv/` tree — only `livos/` files. Constraint preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] esbuild comment-block syntax conflict (Task 1)**

- **Found during:** Task 1 GREEN run.
- **Issue:** Initial doc comment used `LD_*/DYLD_*` inside a `/** ... */` block. The `*/` mid-comment closed the comment early and esbuild parsed `because` as an identifier.
- **Fix:** Rewrote the comment to spell out `LD_ and DYLD_ prefix` instead of using glob-shape `LD_*/DYLD_*` inline. Pure cosmetic.
- **Commit:** `15c86f90` (rolled into Task 1 commit before final test pass).

**2. [Rule 1 — Bug] vi.fn typing for spawnFn args (Task 2)**

- **Found during:** Task 3 typecheck after wiring routes.
- **Issue:** `vi.fn(() => child as any)` produced a `Mock<() => ChildProcess>` with no parameters, so `spawnFn.mock.calls[0][0]` (positional binaryPath) tripped TS2493 "tuple has no element at index 0".
- **Fix:** Changed `vi.fn(() => child as any)` to `vi.fn((..._args: any[]) => child as any)` across all 13 spawn-test cases. Function semantics unchanged — only the type signature widens to accept rest args. All 13 tests still PASS.
- **Commit:** `877daeb8` (bundled with Task 3 since it's a typecheck unblocker).

**3. [Naming] Plan referenced `root.ts`; canonical file is `index.ts`**

- **Found during:** Task 3 read-first phase.
- **Issue:** Plan's `<read_first>` and `<action>` reference `livos/packages/livinityd/source/modules/server/trpc/root.ts`. The actual file at that location is `index.ts` (re-exporting `AppRouter` from itself via `common.ts`).
- **Resolution:** Edited `server/trpc/index.ts` (the real root composition file). All grep acceptance criteria still pass on the actual path.

### Architectural Changes

None. Plan executed exactly as designed.

## Known Stubs / Carryovers

None. All 5 tasks landed full functionality + tests. The Wave 0 placeholder `it.skip` in `native-app-spawner.test.ts` was replaced with 13 real cases.

The XDOTOOL WM_CLASS poll → port-allocator binding lives in Plan 101-05 (Wave 2) — explicitly out of scope here per `<objective>`. The stub `native-app-binder.test.ts` (still `it.skip`) belongs to that plan and was untouched.

## Self-Check: PASSED

### Files Created

- `livos/packages/livinityd/source/modules/apps/native-app-config.ts` — FOUND
- `livos/packages/livinityd/source/modules/apps/native-app-config.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` — FOUND
- `livos/packages/livinityd/source/modules/apps/native-routes.ts` — FOUND
- `.planning/phases/101-livos-universal-app-orchestration/101-03-SUMMARY.md` — being written now

### Commits

- `15c86f90` — FOUND
- `184484f3` — FOUND
- `877daeb8` — FOUND
- `97f7ec81` — FOUND

### Grep Acceptance

- `grep -q "liv:apps:native" native-app-config.ts` — PASS (multiple matches)
- `grep -q "LD_" native-app-config.ts` — PASS (PRELOAD_ENV_RE + docs)
- `grep -q "absolute path" native-app-config.ts` — PASS
- `grep -q "detached: true" native-app-spawner.ts` — PASS
- `grep -q "DISPLAY" native-app-spawner.ts` — PASS
- `grep -q "nativeAppConfigSchema.parse" native-app-spawner.ts` — PASS
- `grep -q 'apps\.native' common.ts` — PASS (4 entries)
- `grep -q 'nativeAppsRouter' trpc/index.ts` — PASS
- `grep -q 'adminProcedure' native-routes.ts` — PASS (create + delete)
- `grep -q 'NativeAppConfigStore' source/index.ts` — PASS

### Test Suite

- `apps/native-app-config.test.ts` — 14 pass
- `apps/native-app-spawner.test.ts` — 13 pass
- **27 / 27 PASS**

### Sacred SHA (verified post-execution; will re-verify at HEAD after SUMMARY commit)

- Pre: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Current: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Match: ✓
