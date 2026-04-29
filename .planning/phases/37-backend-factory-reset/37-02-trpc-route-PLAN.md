---
phase: 37-backend-factory-reset
plan: 02
type: execute
wave: 2
depends_on:
  - 37-01-bash-scripts-PLAN.md
files_modified:
  - livos/packages/livinityd/source/modules/system/factory-reset.ts
  - livos/packages/livinityd/source/modules/system/routes.ts
  - livos/packages/livinityd/source/modules/server/trpc/common.ts
  - livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts
autonomous: true
requirements:
  - FR-BACKEND-01
  - FR-BACKEND-03

must_haves:
  truths:
    - "system.factoryReset({preserveApiKey: boolean}) tRPC mutation exists, validated by Zod"
    - "Route is adminProcedure — non-admin caller receives FORBIDDEN/UNAUTHORIZED"
    - "Route is registered in httpOnlyPaths in common.ts (mirror system.update precedent)"
    - "Route returns within 200ms (no synchronous wipe in the handler — spawn happens in Plan 03)"
    - "Route pre-flight rejects when an update is in-progress (D-RT-05)"
    - "Route pre-flight rejects when LIV_PLATFORM_API_KEY missing from /opt/livos/.env AND preserveApiKey=true (D-RT-05)"
    - "preserveApiKey=true triggers the API key stash to /tmp/livos-reset-apikey (mode 0600) BEFORE handing off to bash (D-KEY-01)"
    - "Route returns {accepted: true, eventPath: string, snapshotPath: string} on success"
    - "The legacy {password}-based factoryReset signature is REPLACED, not appended (only one factoryReset route exists)"
  artifacts:
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.ts"
      provides: "v29.2 factoryReset module: Zod input, pre-flight checks, API key stash, returns spawn metadata"
      exports: ["performFactoryReset", "preflightCheck", "stashApiKey"]
    - path: "livos/packages/livinityd/source/modules/system/routes.ts"
      provides: "factoryReset route swapped to adminProcedure + new input shape"
      contains: "factoryReset.*adminProcedure|preserveApiKey: z.boolean"
    - path: "livos/packages/livinityd/source/modules/server/trpc/common.ts"
      provides: "system.factoryReset added to httpOnlyPaths"
      contains: "'system.factoryReset'"
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts"
      provides: "Unit tests for Zod input, pre-flight checks, key stash"
      contains: "describe.*factoryReset|performFactoryReset|preserveApiKey"
  key_links:
    - from: "routes.ts factoryReset route"
      to: "factory-reset.ts performFactoryReset()"
      via: "import + call"
      pattern: "import.*performFactoryReset.*factory-reset"
    - from: "common.ts httpOnlyPaths"
      to: "client tRPC split-link routing"
      via: "string equality on 'system.factoryReset'"
      pattern: "'system\\.factoryReset'"
    - from: "factory-reset.ts stashApiKey"
      to: "/tmp/livos-reset-apikey filesystem"
      via: "fs.writeFile with mode 0600"
      pattern: "writeFile.*livos-reset-apikey|chmod.*0o600"
---

<objective>
Wire `system.factoryReset({preserveApiKey: boolean})` into the tRPC router. This plan REPLACES the legacy `factoryReset({password})` route — there is only one factoryReset route in the system at the end of this plan. The route handler does the fast pre-flight checks (≤50ms each), stashes the API key when preserveApiKey=true, and returns within 200ms. The handler does NOT spawn the bash yet — that's Plan 03's job. This plan establishes the surface area and gates so Plan 03 just plugs in the spawn helper.

Purpose: Get the tRPC plumbing right before mixing in the spawn complexity. Auth, input validation, httpOnlyPaths registration, and the API key stash are the boring-but-critical mechanics that benefit from being shipped in isolation, with unit tests, before the cgroup-escape spawn lands.

Output: `factory-reset.ts` rewritten as the v29.2 module (legacy `performReset()` may stay for now — it's reachable from `getResetStatus()` query, but the route no longer calls it). `routes.ts` swapped to the new factoryReset route signature. `common.ts` adds `'system.factoryReset'` to httpOnlyPaths. Unit tests cover Zod validation, pre-flight rejection paths, and the API key stash side-effect.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-backend-factory-reset/37-CONTEXT.md
@.planning/phases/37-backend-factory-reset/37-01-bash-scripts-PLAN.md
@.planning/phases/37-backend-factory-reset/37-01-SUMMARY.md
@livos/packages/livinityd/source/modules/system/routes.ts
@livos/packages/livinityd/source/modules/system/update.ts
@livos/packages/livinityd/source/modules/server/trpc/common.ts
@livos/packages/livinityd/source/modules/server/trpc/trpc.ts
@livos/packages/livinityd/source/modules/system/update.unit.test.ts

<interfaces>
<!-- Existing tRPC primitives in this codebase -->

From livos/packages/livinityd/source/modules/server/trpc/trpc.ts:
```typescript
export const adminProcedure = privateProcedure.use(requireRole('admin'))
// privateProcedure has ctx.user (currentUser); adminProcedure throws FORBIDDEN if role !== 'admin'
```

From livos/packages/livinityd/source/modules/server/trpc/common.ts:
```typescript
// Comma-separated string array. Mirror the system.update entry on line ~28-29:
//   'system.update',
//   'system.updateStatus',
// Add directly after them:
//   'system.factoryReset',
//   'system.getFactoryResetStatus',  // already exists as a separate query
```

From livos/packages/livinityd/source/modules/system/routes.ts (current — to be replaced):
```typescript
factoryReset: privateProcedure
  .input(z.object({password: z.string()}))
  .mutation(async ({ctx, input}) => {
    if (!(await ctx.user.validatePassword(input.password))) {
      throw new TRPCError({code: 'UNAUTHORIZED', message: 'Invalid password'})
    }
    systemStatus = 'resetting'
    // ... legacy performReset() flow
  })
```

The Phase 38 UI plan will update consumer (`livos/packages/ui/src/providers/global-system-state/reset.tsx`).
This plan does NOT touch UI code. The UI will remain temporarily broken at the route boundary until Phase 38; that's expected and explicitly out of scope per CONTEXT.md "## Phase Boundary".
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite factory-reset.ts as v29.2 module — Zod input, pre-flight checks, API key stash, helper exports</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.ts</files>
  <read_first>
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-RT-01 through D-RT-05 for route surface; D-KEY-01/02/03 for stash; D-INST-02 for path constants)
    - .planning/phases/37-backend-factory-reset/37-01-bash-scripts-PLAN.md (the argv contract this module's spawn helper will eventually invoke — Plan 03 wires it; this plan defines the metadata helpers)
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (the existing legacy file — we're rewriting it; KEEP the old `getResetStatus`/`resetStatus`/`setResetStatus`/`performReset` exports if any code outside `routes.ts` still imports them. Run `grep -rn "from.*factory-reset" livos/packages/livinityd/source/` to find consumers. Only `routes.ts` imports `performReset` and `getResetStatus`; `getResetStatus` is consumed by `getFactoryResetStatus` route in `routes.ts`. We KEEP `getResetStatus` for backward compat with the public query.)
    - livos/packages/livinityd/source/modules/system/update.ts (reference — pattern for module-level state, exports, and TS imports)
  </read_first>
  <action>
    Rewrite `livos/packages/livinityd/source/modules/system/factory-reset.ts` to expose the v29.2 lifecycle helpers WHILE preserving the legacy `getResetStatus` export so `system.getFactoryResetStatus` query (in routes.ts) keeps compiling. We will leave `performReset` exported as a stub-or-original for now; route handler will not call it.

    File structure (top-down):

    ### Imports
    ```typescript
    import fs from 'node:fs/promises'
    import path from 'node:path'
    import {TRPCError} from '@trpc/server'
    import {z} from 'zod'

    import type {ProgressStatus} from '../apps/schema.js'
    import type Livinityd from '../../index.js'
    ```

    ### Module-level constants (all paths LITERAL — never variable)
    ```typescript
    export const ENV_FILE_PATH = '/opt/livos/.env' as const
    export const APIKEY_TMP_PATH = '/tmp/livos-reset-apikey' as const
    export const UPDATE_HISTORY_DIR = '/opt/livos/data/update-history' as const
    export const SNAPSHOT_SIDECAR_PATH = '/tmp/livos-pre-reset.path' as const

    // Plan 03 fills in the deployment+spawn paths; this plan declares the runtime targets only.
    export const RESET_SCRIPT_RUNTIME_PATH = '/opt/livos/data/factory-reset/reset.sh' as const
    export const WRAPPER_RUNTIME_PATH = '/opt/livos/data/wrapper/livos-install-wrap.sh' as const
    ```

    ### Zod input schema
    ```typescript
    export const factoryResetInputSchema = z.object({
      preserveApiKey: z.boolean(),
    })

    export type FactoryResetInput = z.infer<typeof factoryResetInputSchema>
    ```

    ### Result type
    ```typescript
    export interface FactoryResetAccepted {
      accepted: true
      eventPath: string
      snapshotPath: string  // The path that *will* be written by the bash; sidecar at SNAPSHOT_SIDECAR_PATH points here.
    }
    ```

    ### Legacy state preservation (DO NOT DELETE — keeps `getFactoryResetStatus` query compiling)
    Keep the existing `resetStatus`, `setResetStatus`, `getResetStatus`, `resetResetStatus` exports verbatim from the legacy file. Add a JSDoc comment marking them as `@deprecated v29.2: replaced by JSON event row at /opt/livos/data/update-history/<ts>-factory-reset.json. UI should poll listUpdateHistory instead.`

    Keep the legacy `performReset` export as well — but with a JSDoc `@deprecated` flag and NO callers from the new route. (If any non-test code paths import it besides routes.ts, leave them unbroken.) The legacy implementation may stay in place; it is now unreachable from the tRPC surface but kept for one cycle.

    ### Pre-flight check (D-RT-05)
    ```typescript
    /**
     * Pre-flight checks that gate the spawn. Each check is fast (<50ms target).
     * Throws TRPCError BAD_REQUEST with a human-readable explanation on rejection.
     *
     * Checks:
     *   1. No update is currently in progress (any *-update.json with status:in-progress)
     *   2. If preserveApiKey=true: LIV_PLATFORM_API_KEY exists in /opt/livos/.env
     */
    export async function preflightCheck(input: FactoryResetInput): Promise<void> {
      // Check 1: update-in-progress
      try {
        const entries = await fs.readdir(UPDATE_HISTORY_DIR)
        for (const f of entries) {
          if (!f.endsWith('-update.json')) continue
          try {
            const raw = await fs.readFile(path.join(UPDATE_HISTORY_DIR, f), 'utf8')
            const parsed = JSON.parse(raw)
            if (parsed?.status === 'in-progress') {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'An update is currently in progress; cannot factory-reset',
              })
            }
          } catch (err) {
            if (err instanceof TRPCError) throw err
            // corrupt JSON — skip
          }
        }
      } catch (err: any) {
        if (err instanceof TRPCError) throw err
        if (err.code !== 'ENOENT') throw err
        // dir absent — no updates have ever run; allow reset
      }

      // Check 2: API key present in .env if preserveApiKey
      if (input.preserveApiKey) {
        let envContent = ''
        try {
          envContent = await fs.readFile(ENV_FILE_PATH, 'utf8')
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: '/opt/livos/.env not found — cannot preserve API key',
            })
          }
          throw err
        }
        const m = envContent.match(/^LIV_PLATFORM_API_KEY=(.*)$/m)
        const value = m ? m[1].replace(/^["']|["']$/g, '').trim() : ''
        if (!value) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'LIV_PLATFORM_API_KEY missing from /opt/livos/.env — cannot preserve API key',
          })
        }
      }
    }
    ```

    ### API key stash (D-KEY-01)
    ```typescript
    /**
     * Reads LIV_PLATFORM_API_KEY from /opt/livos/.env and writes it to
     * /tmp/livos-reset-apikey with mode 0600. Returns the path on success.
     *
     * Caller must have already passed preflightCheck (preserveApiKey=true).
     */
    export async function stashApiKey(): Promise<string> {
      const envContent = await fs.readFile(ENV_FILE_PATH, 'utf8')
      const m = envContent.match(/^LIV_PLATFORM_API_KEY=(.*)$/m)
      if (!m) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'LIV_PLATFORM_API_KEY not found in /opt/livos/.env',
        })
      }
      const value = m[1].replace(/^["']|["']$/g, '').trim()
      // Write atomically with mode 0600 (umask-safe).
      await fs.writeFile(APIKEY_TMP_PATH, value, {mode: 0o600})
      // Re-chmod defensively in case the file existed with looser permissions.
      await fs.chmod(APIKEY_TMP_PATH, 0o600)
      return APIKEY_TMP_PATH
    }
    ```

    ### Event metadata helper (precomputes the event path for the route handler)
    ```typescript
    /**
     * Computes the JSON event row path for this reset invocation.
     * Format matches Phase 33 OBS-01 (UTC ISO timestamp basic-format).
     */
    export function buildEventPath(): {timestamp: string; eventPath: string} {
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
      // e.g. 20260429T120030Z
      const eventPath = path.join(UPDATE_HISTORY_DIR, `${timestamp}-factory-reset.json`)
      return {timestamp, eventPath}
    }
    ```

    ### Route handler entry point (called by routes.ts; spawn helper added in Plan 03)
    ```typescript
    /**
     * Top-level entry point invoked by the tRPC route. Performs:
     *   1. preflightCheck (throws on rejection)
     *   2. stashApiKey if preserveApiKey
     *   3. (Plan 03 wires the spawn here)
     *   4. Returns FactoryResetAccepted with eventPath
     *
     * Plan 02 STUB: the spawn step is replaced with a TODO that Plan 03 fills in.
     * The function still computes the eventPath and returns it so the route surface
     * is stable — Plan 03's diff will replace only the TODO block.
     */
    export async function performFactoryReset(
      _livinityd: Livinityd,
      input: FactoryResetInput,
    ): Promise<FactoryResetAccepted> {
      await preflightCheck(input)

      if (input.preserveApiKey) {
        await stashApiKey()
      }

      const {eventPath} = buildEventPath()

      // === Plan 03 inserts the systemd-run spawn + runtime artifact deployment HERE. ===
      // Plan 02 returns the metadata without spawning. The route is therefore a no-op
      // wipe in v29.2-plan-02 builds — this is expected; Plan 03 ships the spawn.
      // To avoid shipping a half-broken route in main, callers MUST NOT deploy
      // Plan 02's binary to Mini PC without Plan 03 also landed.

      return {
        accepted: true,
        eventPath,
        snapshotPath: SNAPSHOT_SIDECAR_PATH,  // Sidecar — bash writes the actual tar path here.
      }
    }
    ```

    ### Keep the legacy exports

    At the bottom of the file, keep `resetStatus`/`setResetStatus`/`getResetStatus`/`resetResetStatus`/`performReset` from the original implementation, marked `@deprecated v29.2`. The route's `getFactoryResetStatus` query (in routes.ts) still calls `getResetStatus` — leave that intact.

    ### Final notes
    - Do NOT export Livinityd-typed default-state setters from the new code path.
    - Do NOT call `livinityd.stop()` or `reboot()` from this module — Plan 03's spawned bash handles service lifecycle, not the tRPC handler.
    - `path.join(UPDATE_HISTORY_DIR, ...)` — UPDATE_HISTORY_DIR is a Linux absolute path. On the dev machine (Windows), `path.join` will mangle separators if `path.posix.join` isn't used. For unit-test compatibility, use `path.posix.join` for any path that flows into bash argv. The route handler's `eventPath` is consumed by the bash, so use `path.posix.join` there.
    - Run `pnpm tsc --noEmit -p livos/packages/livinityd` after changes to verify type-correctness.
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter livinityd exec tsc --noEmit` exits 0 (typecheck passes)
    - `grep -c 'export.*performFactoryReset' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c 'export.*preflightCheck' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c 'export.*stashApiKey' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c 'export.*factoryResetInputSchema' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c 'export.*getResetStatus' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1 (legacy preserved for getFactoryResetStatus query)
    - `grep -c 'preserveApiKey: z.boolean' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c '0o600\|mode: 0o600' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'in-progress' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1 (preflight rejects update-in-progress)
    - `grep -c 'Server4\|45.137.194.103' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 0
  </acceptance_criteria>
  <done>
    factory-reset.ts rewritten with v29.2 helpers + Zod schema + legacy exports preserved; typechecks; no Server4 refs.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add unit tests for factory-reset.ts (Zod input, preflightCheck, stashApiKey)</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts</files>
  <read_first>
    - livos/packages/livinityd/source/modules/system/update.unit.test.ts (mirror the vitest + execa.$ + fs mocking pattern; vitest config is in livos/packages/livinityd/package.json line 16)
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (the freshly-written module from Task 1)
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-RT-05 — pre-flight rejection cases; D-KEY-01 — stash semantics)
  </read_first>
  <behavior>
    - factoryResetInputSchema parses {preserveApiKey: true} successfully
    - factoryResetInputSchema parses {preserveApiKey: false} successfully
    - factoryResetInputSchema rejects {preserveApiKey: "yes"} (must be boolean)
    - factoryResetInputSchema rejects {} (preserveApiKey required)
    - preflightCheck throws CONFLICT when an *-update.json with status:in-progress exists
    - preflightCheck throws BAD_REQUEST with /opt/livos/.env message when ENV_FILE_PATH is ENOENT AND preserveApiKey=true
    - preflightCheck throws BAD_REQUEST with LIV_PLATFORM_API_KEY message when .env exists but lacks the key AND preserveApiKey=true
    - preflightCheck succeeds when no in-progress updates AND preserveApiKey=false (no .env check)
    - preflightCheck succeeds when no in-progress updates AND preserveApiKey=true AND .env contains a non-empty LIV_PLATFORM_API_KEY
    - stashApiKey writes the key to /tmp/livos-reset-apikey with mode 0o600
    - stashApiKey throws BAD_REQUEST when LIV_PLATFORM_API_KEY missing from .env
    - performFactoryReset returns {accepted: true, eventPath, snapshotPath: '/tmp/livos-pre-reset.path'} on the happy path
    - performFactoryReset eventPath matches /update-history/\d{8}T\d{6}Z-factory-reset\.json/
    - buildEventPath returns timestamp matching ISO basic format YYYYMMDDTHHMMSSZ
  </behavior>
  <action>
    Create `livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts` with the test cases above.

    Use the same test infrastructure as `update.unit.test.ts`:
    - `vi.mock('node:fs/promises')` and `vi.mocked(fs.readFile)` / `vi.mocked(fs.readdir)` / `vi.mocked(fs.writeFile)` / `vi.mocked(fs.chmod)`
    - `Livinityd` constructor with `{dataDirectory: '/tmp'}` for the unused `_livinityd` arg
    - Test files use `import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'`
    - For TRPCError matching, use `expect(...).rejects.toThrow(TRPCError)` and check `.code` via the rejected error's `.code` property

    Sketch:

    ```typescript
    import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'
    import fs from 'node:fs/promises'
    import {TRPCError} from '@trpc/server'

    import {
      factoryResetInputSchema,
      preflightCheck,
      stashApiKey,
      performFactoryReset,
      buildEventPath,
      ENV_FILE_PATH,
      APIKEY_TMP_PATH,
      UPDATE_HISTORY_DIR,
    } from './factory-reset.js'
    import Livinityd from '../../index.js'

    vi.mock('node:fs/promises')

    describe('factoryResetInputSchema', () => {
      test('accepts preserveApiKey: true', () => {
        expect(factoryResetInputSchema.parse({preserveApiKey: true})).toEqual({preserveApiKey: true})
      })
      test('accepts preserveApiKey: false', () => {
        expect(factoryResetInputSchema.parse({preserveApiKey: false})).toEqual({preserveApiKey: false})
      })
      test('rejects non-boolean', () => {
        expect(() => factoryResetInputSchema.parse({preserveApiKey: 'yes'})).toThrow()
      })
      test('rejects missing field', () => {
        expect(() => factoryResetInputSchema.parse({})).toThrow()
      })
    })

    describe('preflightCheck (D-RT-05)', () => {
      beforeEach(() => {
        vi.mocked(fs.readdir).mockResolvedValue([] as any)
      })
      afterEach(() => vi.restoreAllMocks())

      test('throws CONFLICT when update-in-progress exists', async () => {
        vi.mocked(fs.readdir).mockResolvedValue(['20260429T120000Z-update.json'] as any)
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({status: 'in-progress'}) as any)
        await expect(preflightCheck({preserveApiKey: false})).rejects.toThrow(TRPCError)
        // Optionally: catch & assert err.code === 'CONFLICT'
      })

      test('throws BAD_REQUEST when .env missing and preserveApiKey=true', async () => {
        const enoent: any = new Error('ENOENT')
        enoent.code = 'ENOENT'
        vi.mocked(fs.readFile).mockRejectedValue(enoent)
        await expect(preflightCheck({preserveApiKey: true})).rejects.toThrow(TRPCError)
      })

      test('throws BAD_REQUEST when .env exists but no LIV_PLATFORM_API_KEY', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('OTHER_VAR=foo\n' as any)
        await expect(preflightCheck({preserveApiKey: true})).rejects.toThrow(TRPCError)
      })

      test('succeeds when no updates in progress AND preserveApiKey=false', async () => {
        await expect(preflightCheck({preserveApiKey: false})).resolves.toBeUndefined()
      })

      test('succeeds when no updates in progress AND .env has LIV_PLATFORM_API_KEY', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY=abc123\n' as any)
        await expect(preflightCheck({preserveApiKey: true})).resolves.toBeUndefined()
      })
    })

    describe('stashApiKey (D-KEY-01)', () => {
      afterEach(() => vi.restoreAllMocks())

      test('writes key to APIKEY_TMP_PATH with mode 0o600', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY="secret123"\n' as any)
        const writeSpy = vi.mocked(fs.writeFile).mockResolvedValue()
        const chmodSpy = vi.mocked(fs.chmod).mockResolvedValue()
        const path = await stashApiKey()
        expect(path).toBe(APIKEY_TMP_PATH)
        expect(writeSpy).toHaveBeenCalledWith(APIKEY_TMP_PATH, 'secret123', expect.objectContaining({mode: 0o600}))
        expect(chmodSpy).toHaveBeenCalledWith(APIKEY_TMP_PATH, 0o600)
      })

      test('throws when key missing', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('OTHER=x\n' as any)
        await expect(stashApiKey()).rejects.toThrow(TRPCError)
      })
    })

    describe('buildEventPath', () => {
      test('produces ISO basic format and update-history path', () => {
        const {timestamp, eventPath} = buildEventPath()
        expect(timestamp).toMatch(/^\d{8}T\d{6}Z$/)
        expect(eventPath).toMatch(/update-history\/\d{8}T\d{6}Z-factory-reset\.json$/)
      })
    })

    describe('performFactoryReset (Plan 02 stub — no spawn yet)', () => {
      let livinityd: any
      beforeEach(() => {
        livinityd = new Livinityd({dataDirectory: '/tmp'})
        vi.mocked(fs.readdir).mockResolvedValue([] as any)
      })
      afterEach(() => vi.restoreAllMocks())

      test('happy path returns {accepted, eventPath, snapshotPath}', async () => {
        const result = await performFactoryReset(livinityd, {preserveApiKey: false})
        expect(result.accepted).toBe(true)
        expect(result.eventPath).toMatch(/update-history\/\d{8}T\d{6}Z-factory-reset\.json$/)
        expect(result.snapshotPath).toBe('/tmp/livos-pre-reset.path')
      })

      test('preserveApiKey=true triggers stash + returns metadata', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY=k1\n' as any)
        vi.mocked(fs.writeFile).mockResolvedValue()
        vi.mocked(fs.chmod).mockResolvedValue()
        const result = await performFactoryReset(livinityd, {preserveApiKey: true})
        expect(result.accepted).toBe(true)
        expect(fs.writeFile).toHaveBeenCalledWith(APIKEY_TMP_PATH, 'k1', expect.objectContaining({mode: 0o600}))
      })
    })
    ```

    The tests must NOT spawn any subprocess, hit any network, or touch any real filesystem. All `fs.*` are mocked.
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd test -- factory-reset.unit.test</automated>
  </verify>
  <acceptance_criteria>
    - All test cases pass: `pnpm --filter livinityd test -- factory-reset.unit.test` exits 0
    - At least 12 test cases (4 schema + 5 preflight + 2 stash + 1 buildEventPath + 2 performFactoryReset)
    - No live filesystem access (every fs.* call is via vi.mocked)
    - No Server4 references in test file
  </acceptance_criteria>
  <done>
    Unit tests pass; coverage hits Zod schema, every preflight branch, stash happy + error paths, eventPath shape, and the stubbed performFactoryReset entrypoint.
  </done>
</task>

<task type="auto">
  <name>Task 3: Swap routes.ts factoryReset to v29.2 signature + add to httpOnlyPaths</name>
  <files>
    livos/packages/livinityd/source/modules/system/routes.ts,
    livos/packages/livinityd/source/modules/server/trpc/common.ts
  </files>
  <read_first>
    - livos/packages/livinityd/source/modules/system/routes.ts (line 279-307 — current factoryReset + getFactoryResetStatus)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (lines 27-43 — system.update + system.updateStatus + system.checkUpdate precedent for httpOnlyPaths additions)
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-RT-01 through D-RT-05 — route shape; D-RT-04 — adminProcedure)
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (the freshly-written exports from Task 1)
  </read_first>
  <action>
    ### Edit 1: routes.ts factoryReset route swap

    Locate the existing route at lines ~279-302 (`factoryReset: privateProcedure...{password}...`). REPLACE the entire block with:

    ```typescript
    // v29.2 factory reset — Phase 37
    // Replaces the legacy {password}-based reset. Input is preserveApiKey only;
    // RBAC is admin-only (D-RT-04). Pre-flight + stash happen synchronously here;
    // the actual wipe + reinstall runs in a detached systemd-run scope (Plan 03).
    factoryReset: adminProcedure
      .input(factoryResetInputSchema)
      .mutation(async ({ctx, input}) => {
        // Concurrency guard: do not allow two factory-resets to race.
        if (systemStatus === 'resetting' || systemStatus === 'updating') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cannot factory-reset while system is ${systemStatus}`,
          })
        }
        systemStatus = 'resetting'
        try {
          const result = await performFactoryReset(ctx.livinityd, input)
          // NOTE: systemStatus stays 'resetting' until the bash finishes
          // and the new livinityd boots. Plan 03 wires the spawn.
          // The bash writes the JSON event row that the UI polls.
          return result
        } catch (err) {
          systemStatus = 'running'
          throw err
        }
      }),
    ```

    Update the import at the top of `routes.ts` to add `performFactoryReset` and `factoryResetInputSchema`:

    ```typescript
    // Replace the existing line:
    //   import {performReset, getResetStatus} from './factory-reset.js'
    // With:
    import {
      performReset,            // legacy — kept for one cycle, no longer reachable from tRPC
      getResetStatus,          // legacy — used by getFactoryResetStatus query
      performFactoryReset,
      factoryResetInputSchema,
    } from './factory-reset.js'
    ```

    LEAVE `getFactoryResetStatus` query (the public query just below `factoryReset` in routes.ts) untouched — it calls `getResetStatus()` which is still exported.

    ### Edit 2: common.ts httpOnlyPaths

    In `livos/packages/livinityd/source/modules/server/trpc/common.ts`, locate the block at lines ~27-43 covering `system.update`, `system.updateStatus`, `system.checkUpdate`, `system.listUpdateHistory`, `system.readUpdateLog`. Add the new entries directly after `system.readUpdateLog`:

    ```typescript
    // Phase 37 FR-BACKEND-01 — system.factoryReset is a long-running mutation
    // that spawns a detached systemd-run scope. The route returns within 200ms
    // (Plan 02) but the network round-trip during teardown can take seconds.
    // HTTP avoids WS-disconnect hangs (precedent: system.update at line 27-29).
    'system.factoryReset',
    ```

    Do NOT add `'system.getFactoryResetStatus'` — it's a public query that's intentionally polled across reset cycles, but the existing comment on line 21-22 covers the same use-case for `system.status`. The query has no cookies/headers, so HTTP routing is not strictly required. (Future Phase 38 may want to add it; out of scope here.)

    ### Edit 3: verify httpOnlyPaths is `as const`

    Confirm the array still ends with `] as const` (it does, line 187 of current common.ts). The new entry must be added BEFORE that closing bracket.

    ### Final notes
    - Do NOT remove `performReset` import — `getFactoryResetStatus` query still relies on `getResetStatus` from the same module, and removing the unused `performReset` import is a cleanup that can wait for v29.3.
    - Do NOT delete the `getFactoryResetStatus` query (lines ~304-306). UI consumers and `reset.tsx` may still poll it; we don't break compatibility silently. Phase 38 will deprecate it cleanly.
    - Do NOT touch any other route. Only `factoryReset` (the mutation) changes signature.
    - Run `pnpm tsc --noEmit -p livos/packages/livinityd` after both edits.
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter livinityd exec tsc --noEmit` exits 0 (typecheck passes)
    - `grep -c 'factoryReset: adminProcedure' livos/packages/livinityd/source/modules/system/routes.ts` == 1
    - `grep -c 'factoryReset: privateProcedure' livos/packages/livinityd/source/modules/system/routes.ts` == 0 (legacy route removed)
    - `grep -c 'factoryResetInputSchema' livos/packages/livinityd/source/modules/system/routes.ts` == 1
    - `grep -c 'performFactoryReset' livos/packages/livinityd/source/modules/system/routes.ts` == 1
    - `grep -c "'system.factoryReset'" livos/packages/livinityd/source/modules/server/trpc/common.ts` == 1
    - `grep -c '} as const' livos/packages/livinityd/source/modules/server/trpc/common.ts` >= 1 (array still typed as const)
    - `grep -c 'getFactoryResetStatus' livos/packages/livinityd/source/modules/system/routes.ts` == 1 (legacy query preserved)
    - `grep -c 'Server4\|45.137.194.103' livos/packages/livinityd/source/modules/system/routes.ts livos/packages/livinityd/source/modules/server/trpc/common.ts` == 0
  </acceptance_criteria>
  <done>
    Route swapped to adminProcedure + Zod-validated preserveApiKey input + concurrency guard; httpOnlyPaths registers system.factoryReset; typecheck clean; legacy getFactoryResetStatus query preserved.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → tRPC HTTP | Untrusted user input crosses the tRPC mutation boundary. Zod validates `{preserveApiKey: boolean}`. |
| tRPC handler → /opt/livos/.env | Reading the .env file requires root or livinityd's process owner. The handler runs as the livinityd user; reading .env is allowed. |
| tRPC handler → /tmp/livos-reset-apikey | Writing the apikey temp file requires write access to /tmp (always world-writable). Mode 0600 + livinityd ownership protects content. |
| adminProcedure → role check | `requireRole('admin')` middleware validates role from the JWT/session. Non-admin → FORBIDDEN. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-37-09 | Spoofing | Non-admin user calls factoryReset | mitigate | adminProcedure middleware (D-RT-04). Plan 03 ALSO checks at the systemd-run boundary (root-only). Defense in depth. |
| T-37-10 | Tampering | Bogus input shape (e.g., extra fields, wrong types) | mitigate | Zod schema strict-parses the input; unknown fields rejected by default with `.strict()` (verify Zod default behavior or add explicitly). |
| T-37-11 | Information Disclosure | Error messages leak server paths | accept | Pre-flight errors mention /opt/livos/.env in the message. Acceptable: only admins can call this route, and the path is well-known anyway. |
| T-37-12 | Denial of Service | Two concurrent resets racing | mitigate | systemStatus === 'resetting' guard at route entry; second call gets CONFLICT. |
| T-37-13 | Information Disclosure | API key written to /tmp visible to other root processes | accept | /tmp is locally accessible to root; the cleanup trap (Plan 01) and short-lived nature (deleted after install.sh exit) bound exposure. |
</threat_model>

<verification>
## Plan-level checks

1. `system.factoryReset({preserveApiKey: boolean})` is the SOLE factoryReset route (no duplicate)
2. Unit tests pass with `pnpm --filter livinityd test -- factory-reset.unit.test`
3. tsc --noEmit passes
4. `system.factoryReset` is in httpOnlyPaths
5. Calling the route with preserveApiKey=true requires LIV_PLATFORM_API_KEY in .env (preflight rejection otherwise)
6. Calling the route during an in-progress update returns CONFLICT
7. Calling the route as non-admin returns FORBIDDEN (adminProcedure)
</verification>

<success_criteria>
- `pnpm --filter livinityd exec tsc --noEmit` exits 0
- `pnpm --filter livinityd test -- factory-reset.unit.test` exits 0 with all assertions passing
- `grep` counts in acceptance_criteria are met
- No Server4 references anywhere
- Legacy `getFactoryResetStatus` query and `getResetStatus`/`performReset` exports preserved
</success_criteria>

<output>
After completion, create `.planning/phases/37-backend-factory-reset/37-02-SUMMARY.md` documenting:
- The exact diff applied to routes.ts (signature swap)
- The httpOnlyPaths line added
- The new exports surface in factory-reset.ts (with their JSDoc summaries)
- The vitest run output (test counts)
- A note that Plan 03 will replace the comment marker `=== Plan 03 inserts the systemd-run spawn ===` in performFactoryReset with the actual spawn invocation
</output>
