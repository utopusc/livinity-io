---
phase: 37-backend-factory-reset
plan: 03
type: execute
wave: 3
depends_on:
  - 37-01-bash-scripts-PLAN.md
  - 37-02-trpc-route-PLAN.md
files_modified:
  - livos/packages/livinityd/source/modules/system/factory-reset.ts
  - livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts
autonomous: true
requirements:
  - FR-BACKEND-01
  - FR-BACKEND-06

must_haves:
  truths:
    - "First-call cold-start deploys factory-reset.sh source to /opt/livos/data/factory-reset/reset.sh (mode 0755)"
    - "First-call cold-start deploys livos-install-wrap.sh source to /opt/livos/data/wrapper/livos-install-wrap.sh (mode 0755)"
    - "Subsequent calls skip the deploy if both runtime files already exist with mode 0755"
    - "Spawn happens via systemd-run --scope --collect (cgroup-escape pattern from reference_cgroup_escape.md)"
    - "Spawn is detached + child.unref() — route handler does not wait on the bash"
    - "Spawn passes argv: $1=--preserve-api-key|--no-preserve-api-key, $2=eventPath"
    - "Route handler returns within 200ms wall-clock (verified via integration test in Plan 04)"
    - "If systemd-run binary is missing OR EUID is not 0, route throws INTERNAL_SERVER_ERROR with diagnostic message"
  artifacts:
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.ts"
      provides: "deployRuntimeArtifacts() helper + spawnResetScope() helper + performFactoryReset wired through both"
      exports: ["deployRuntimeArtifacts", "spawnResetScope"]
    - path: "livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts"
      provides: "Tests for deployRuntimeArtifacts copy-on-missing logic + spawnResetScope argv shape (mocked)"
      contains: "describe.*deployRuntimeArtifacts|describe.*spawnResetScope|systemd-run"
  key_links:
    - from: "performFactoryReset"
      to: "deployRuntimeArtifacts (first-call path)"
      via: "called BEFORE spawnResetScope"
      pattern: "deployRuntimeArtifacts.*await"
    - from: "performFactoryReset"
      to: "spawnResetScope"
      via: "called AFTER stashApiKey"
      pattern: "spawnResetScope.*await"
    - from: "spawnResetScope"
      to: "child_process.spawn('systemd-run', ...)"
      via: "argv: --scope --collect --unit --quiet bash <reset.sh> <flag> <eventPath>"
      pattern: "spawn\\(.systemd-run.|spawn\\(\\s*'systemd-run'"
---

<objective>
Plug the cgroup-escape spawn (FR-BACKEND-06) into `performFactoryReset` and add the lazy first-call deployment of the bash artifacts to `/opt/livos/data/factory-reset/reset.sh` and `/opt/livos/data/wrapper/livos-install-wrap.sh`. After this plan, the route is functionally complete: an admin can call `system.factoryReset({preserveApiKey: true})` and the bash will run in a transient systemd scope that survives `systemctl stop livos` mid-flight.

Purpose: The cgroup-escape pattern is the trickiest part of the phase — `detached: true` alone is not enough (project memory `reference_cgroup_escape.md`). This plan isolates the spawn complexity so the bash-vs-tRPC concerns of Plans 01-02 are not muddied by it. The lazy deploy lives here too because deploy + spawn together form the "make the bash actually runnable" half of the route.

Output: `factory-reset.ts` gains `deployRuntimeArtifacts()` and `spawnResetScope()` exports; the spawn replaces the Plan 02 comment marker. Unit tests cover deploy idempotency (copy-on-missing) and spawn argv shape. The route end-to-end (in unit-test land, with mocks) returns within 200ms.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/37-backend-factory-reset/37-CONTEXT.md
@.planning/phases/37-backend-factory-reset/37-01-bash-scripts-PLAN.md
@.planning/phases/37-backend-factory-reset/37-01-SUMMARY.md
@.planning/phases/37-backend-factory-reset/37-02-trpc-route-PLAN.md
@.planning/phases/37-backend-factory-reset/37-02-SUMMARY.md
@livos/packages/livinityd/source/modules/system/factory-reset.ts
@livos/packages/livinityd/source/modules/system/update.ts

<interfaces>
<!-- Cgroup escape pattern verbatim from reference_cgroup_escape.md (already applied at update.sh line 14-30) -->

For a TS process invoking a self-restarting bash, the systemd-run wrapper looks like:

```typescript
import {spawn} from 'node:child_process'

const child = spawn(
  'systemd-run',
  [
    '--scope',
    '--collect',
    '--unit', `livos-factory-reset-${timestamp}`,
    '--quiet',
    'bash',
    '/opt/livos/data/factory-reset/reset.sh',
    preserveApiKey ? '--preserve-api-key' : '--no-preserve-api-key',
    eventPath,
  ],
  {
    detached: true,
    stdio: 'ignore',  // bash writes its own logs to event JSON; route handler does not buffer stdout
  },
)
child.unref()  // detach from event loop so route handler can return immediately
```

The `--scope` flag (transient unit, no service) ensures the bash runs in a separate cgroup from livos.service, so `systemctl stop livos` doesn't kill the bash. `--collect` auto-removes the unit on exit. `--quiet` suppresses systemd's "Running scope as unit ..." stderr.

<!-- Source paths and runtime targets -->

Source files (in repo, from Plan 01):
  livos/packages/livinityd/source/modules/system/factory-reset.sh
  livos/packages/livinityd/source/modules/system/livos-install-wrap.sh

Runtime targets (under /opt at Mini PC):
  /opt/livos/data/factory-reset/reset.sh
  /opt/livos/data/wrapper/livos-install-wrap.sh

Runtime mode: 0755 (executable by root + livinityd's user; world-readable for transparency in audit logs).

<!-- Resolution of source path at runtime -->

The TS process running on Mini PC has its source under /opt/livos/packages/livinityd/source/. The bash source therefore resolves to:

```typescript
import url from 'node:url'
import path from 'node:path'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// __dirname at runtime: /opt/livos/packages/livinityd/source/modules/system/
const SOURCE_RESET_SH = path.join(__dirname, 'factory-reset.sh')
const SOURCE_WRAPPER  = path.join(__dirname, 'livos-install-wrap.sh')
```

This works in tsx (livinityd runs source directly per MEMORY.md) without a build step.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add deployRuntimeArtifacts() helper to factory-reset.ts</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.ts</files>
  <read_first>
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (the v29.2 module from Plan 02 Task 1 — extend it; do NOT rewrite it)
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-CG-02 — first-call cold-start deploy is the chosen path for v29.2; Plan 03 implements it)
    - C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/MEMORY.md (Mini PC source layout: /opt/livos/packages/livinityd/source/modules/system/)
  </read_first>
  <action>
    Add the following helper to `livos/packages/livinityd/source/modules/system/factory-reset.ts` AFTER the existing `buildEventPath` function and BEFORE `performFactoryReset`.

    ### Imports (add to the top of the file)

    ```typescript
    import {fileURLToPath} from 'node:url'
    ```

    (The existing `import path from 'node:path'` and `import fs from 'node:fs/promises'` from Plan 02 cover the rest.)

    ### Module-level constants (add to the existing constants block)

    ```typescript
    export const RESET_SCRIPT_RUNTIME_DIR = '/opt/livos/data/factory-reset' as const
    export const WRAPPER_RUNTIME_DIR      = '/opt/livos/data/wrapper' as const
    // Source-tree paths (for first-call cold-start copy):
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    export const SOURCE_RESET_SH = path.join(__dirname, 'factory-reset.sh')
    export const SOURCE_WRAPPER  = path.join(__dirname, 'livos-install-wrap.sh')
    ```

    NOTE: `RESET_SCRIPT_RUNTIME_PATH` and `WRAPPER_RUNTIME_PATH` were already declared in Plan 02 Task 1; verify they exist and use them as the destination paths.

    ### deployRuntimeArtifacts helper

    ```typescript
    /**
     * Copies factory-reset.sh and livos-install-wrap.sh from the source tree
     * to /opt/livos/data/{factory-reset,wrapper}/ with mode 0755.
     *
     * Idempotent: if the destination file exists with mode 0755 AND its mtime
     * is newer than the source's mtime, the copy is skipped. Otherwise the
     * destination is overwritten. Both source files must exist; absence is a
     * thrown TRPCError INTERNAL_SERVER_ERROR (means dev/build broke).
     *
     * Per CONTEXT.md D-CG-02 (first-call cold-start deploy chosen for v29.2 —
     * source-tree shipping out of scope this milestone).
     */
    export async function deployRuntimeArtifacts(): Promise<void> {
      const pairs: Array<[string, string]> = [
        [SOURCE_RESET_SH, RESET_SCRIPT_RUNTIME_PATH],
        [SOURCE_WRAPPER,  WRAPPER_RUNTIME_PATH],
      ]

      for (const [src, dst] of pairs) {
        // Verify source exists.
        try {
          await fs.access(src, fs.constants.R_OK)
        } catch {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `factory-reset source missing in install: ${src}`,
          })
        }

        // Ensure destination directory exists.
        await fs.mkdir(path.dirname(dst), {recursive: true, mode: 0o755})

        // Check freshness: if destination exists AND mtime >= source mtime AND
        // mode includes executable bit, skip the copy. Otherwise overwrite.
        let needsCopy = true
        try {
          const [srcStat, dstStat] = await Promise.all([fs.stat(src), fs.stat(dst)])
          const dstMode = dstStat.mode & 0o777
          if (dstStat.mtimeMs >= srcStat.mtimeMs && (dstMode & 0o100) !== 0) {
            needsCopy = false
          }
        } catch {
          // Destination doesn't exist — first call.
        }

        if (needsCopy) {
          await fs.copyFile(src, dst)
          await fs.chmod(dst, 0o755)
        }
      }
    }
    ```

    ### Notes
    - The freshness heuristic prevents the route from rewriting `/opt/livos/data/factory-reset/reset.sh` on every call when the source hasn't changed. This makes the steady-state behavior a single `stat` per call (~ 1ms).
    - On Windows dev machines (where the test suite runs), `fs.access` and `fs.stat` work normally; the copy paths are LITERAL strings that won't resolve correctly on Windows but the unit tests mock `fs.*` so the deploy path is never exercised against a real /opt.
    - `0o755` (octal) is set explicitly via `fs.chmod` after copy to overwrite any restrictive mask the source file may have.
    - `TRPCError INTERNAL_SERVER_ERROR` is the right code for "dev/build broke and the source isn't shipping" — it's not a user error.

    Add this helper to the file. Do NOT remove or restructure existing exports.
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter livinityd exec tsc --noEmit` exits 0
    - `grep -c 'export.*deployRuntimeArtifacts' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c 'SOURCE_RESET_SH' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 2 (export + use)
    - `grep -c 'SOURCE_WRAPPER' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 2
    - `grep -c 'fs.copyFile' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c '0o755' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'fileURLToPath' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
  </acceptance_criteria>
  <done>
    deployRuntimeArtifacts() exported from factory-reset.ts; idempotent copy logic; typecheck passes; freshness skip uses mtime + executable-bit check.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add spawnResetScope() helper using systemd-run --scope --collect (cgroup-escape)</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.ts</files>
  <read_first>
    - C:/Users/hello/.claude/projects/C--Users-hello-Desktop-Projects-contabo-livinity-io/memory/reference_cgroup_escape.md (THE pattern reference — read fully)
    - .planning/phases/37-backend-factory-reset/37-CONTEXT.md (D-CG-01 — exact systemd-run invocation; D-RT-03 — 200ms return)
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (the freshly-extended module from Task 1)
  </read_first>
  <action>
    Add the spawn helper to `factory-reset.ts` AFTER `deployRuntimeArtifacts` and BEFORE `performFactoryReset`. Then update `performFactoryReset` to call both helpers.

    ### Imports (add to top)

    ```typescript
    import {spawn} from 'node:child_process'
    ```

    ### spawnResetScope helper

    ```typescript
    /**
     * Spawns the wipe+reinstall bash inside a transient systemd-run --scope --collect
     * unit so the bash survives `systemctl stop livos` mid-flight (cgroup-escape
     * pattern, project memory reference_cgroup_escape.md).
     *
     * Returns immediately after spawn (does NOT await the bash). The bash writes
     * progress to the JSON event row at eventPath; the UI polls that row.
     *
     * Per CONTEXT.md D-CG-01 (canonical invocation).
     *
     * Throws INTERNAL_SERVER_ERROR if `systemd-run` is unavailable on the host
     * (e.g., dev machine without systemd) or if EUID is not 0 (livinityd should
     * always run as root on Mini PC; this is a sanity check).
     */
    export async function spawnResetScope(args: {
      preserveApiKey: boolean
      eventPath: string
      timestamp: string
    }): Promise<void> {
      // Sanity: systemd-run must be on PATH. Try `which` via execa (already an
      // existing dependency in this codebase per package.json).
      // For unit-test mockability, isolate the existence check into a function.
      await assertSystemdRunAvailable()
      assertRootEuid()

      const unitName = `livos-factory-reset-${args.timestamp}`
      const child = spawn(
        'systemd-run',
        [
          '--scope',
          '--collect',
          '--unit', unitName,
          '--quiet',
          'bash',
          RESET_SCRIPT_RUNTIME_PATH,
          args.preserveApiKey ? '--preserve-api-key' : '--no-preserve-api-key',
          args.eventPath,
        ],
        {
          detached: true,
          stdio: 'ignore',
        },
      )
      child.unref()

      // We do NOT await child. The route handler returns immediately;
      // bash logs go to the JSON event row.
    }

    async function assertSystemdRunAvailable(): Promise<void> {
      // execa $`command -v systemd-run` returns non-zero exit if missing.
      // Use the same execa $ pattern as update.ts.
      const {execa} = await import('execa')
      try {
        await execa('command', ['-v', 'systemd-run'], {shell: '/bin/bash'})
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'systemd-run binary not found on host (factory reset requires systemd)',
        })
      }
    }

    function assertRootEuid(): void {
      const euid = typeof process.geteuid === 'function' ? process.geteuid() : -1
      if (euid !== 0) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `factory reset requires root (livinityd EUID is ${euid}); cannot proceed`,
        })
      }
    }
    ```

    ### Wire performFactoryReset to call both helpers

    Locate the existing `performFactoryReset` from Plan 02 Task 1. Replace the comment marker `=== Plan 03 inserts the systemd-run spawn + runtime artifact deployment HERE. ===` with the actual calls:

    ```typescript
    export async function performFactoryReset(
      _livinityd: Livinityd,
      input: FactoryResetInput,
    ): Promise<FactoryResetAccepted> {
      await preflightCheck(input)

      // Lazy-deploy the bash artifacts on first call (D-CG-02).
      await deployRuntimeArtifacts()

      if (input.preserveApiKey) {
        await stashApiKey()
      }

      const {timestamp, eventPath} = buildEventPath()

      // Detached spawn into a cgroup-escaped transient scope (D-CG-01).
      await spawnResetScope({
        preserveApiKey: input.preserveApiKey,
        eventPath,
        timestamp,
      })

      return {
        accepted: true,
        eventPath,
        snapshotPath: SNAPSHOT_SIDECAR_PATH,
      }
    }
    ```

    ### Notes
    - `assertSystemdRunAvailable` uses execa rather than node's built-in to match the codebase's existing dependency. The check runs ~10-20ms; well within the 200ms budget.
    - `assertRootEuid` is a CHEAP check (process.geteuid() is sync, sub-microsecond). It's a defense-in-depth complement to adminProcedure (which protects user identity); EUID check protects against deployment-environment misconfiguration.
    - Windows dev machines DO NOT have `process.geteuid` — the typeof check returns -1, and the test must mock this. (See Task 3.)
    - On Mini PC at runtime, livinityd runs as root (per MEMORY.md systemd unit), so geteuid() returns 0 cleanly.
    - We do NOT register a `child.on('error', ...)` handler — `unref()` + `stdio: 'ignore'` decouples the lifetime entirely. Any spawn failure surfaces synchronously via spawn() itself returning a child whose `pid` is undefined; in that case spawn() doesn't throw but `child.pid === undefined`. We could check `if (!child.pid) throw ...` but the path is already-failed (systemd-run check ran first), so omit for simplicity.
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd exec tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter livinityd exec tsc --noEmit` exits 0
    - `grep -c 'export.*spawnResetScope' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c "spawn\\('systemd-run'" livos/packages/livinityd/source/modules/system/factory-reset.ts` == 1
    - `grep -c "'--scope'" livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c "'--collect'" livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'detached: true' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'child.unref()' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'process.geteuid' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'await deployRuntimeArtifacts' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'await spawnResetScope' livos/packages/livinityd/source/modules/system/factory-reset.ts` >= 1
    - `grep -c 'Plan 03 inserts' livos/packages/livinityd/source/modules/system/factory-reset.ts` == 0 (the marker comment from Plan 02 is gone, replaced by the wired calls)
  </acceptance_criteria>
  <done>
    spawnResetScope() exported and wired into performFactoryReset; cgroup-escape pattern matches reference_cgroup_escape.md verbatim; pre-flight assertions for systemd-run + root EUID added; typecheck passes.
  </done>
</task>

<task type="auto">
  <name>Task 3: Extend factory-reset.unit.test.ts to cover deployRuntimeArtifacts + spawnResetScope</name>
  <files>livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts</files>
  <read_first>
    - livos/packages/livinityd/source/modules/system/factory-reset.unit.test.ts (the test file from Plan 02 Task 2)
    - livos/packages/livinityd/source/modules/system/factory-reset.ts (final shape from Tasks 1-2 of this plan)
    - livos/packages/livinityd/source/modules/system/update.unit.test.ts (test patterns for execa mocking)
  </read_first>
  <behavior>
    - deployRuntimeArtifacts copies both source files to runtime paths when both destinations are missing
    - deployRuntimeArtifacts skips the copy when destination mtime >= source mtime AND mode bit 0o100 is set
    - deployRuntimeArtifacts re-copies when destination mtime < source mtime
    - deployRuntimeArtifacts re-copies when destination mode lacks the executable bit
    - deployRuntimeArtifacts throws INTERNAL_SERVER_ERROR when source file is missing
    - deployRuntimeArtifacts mkdir-p's the runtime parent dirs (verified via fs.mkdir spy)
    - spawnResetScope rejects with INTERNAL_SERVER_ERROR when systemd-run is unavailable (assertSystemdRunAvailable mock throws)
    - spawnResetScope rejects with INTERNAL_SERVER_ERROR when EUID != 0 (process.geteuid mock returns 1000)
    - spawnResetScope passes correct argv shape to child_process.spawn: ['--scope', '--collect', '--unit', `livos-factory-reset-${ts}`, '--quiet', 'bash', RESET_SCRIPT_RUNTIME_PATH, '--preserve-api-key', eventPath]
    - spawnResetScope calls child.unref() to detach from event loop
    - performFactoryReset (full happy path with all mocks) returns within 200ms wall-clock and includes accepted: true + eventPath + snapshotPath
    - performFactoryReset on update-in-progress preflight rejection does NOT call spawn (verifies pre-flight gates the spawn)
  </behavior>
  <action>
    Extend `factory-reset.unit.test.ts` with new describe blocks. Mock `node:child_process` and the `execa` module.

    ### Add mocks at top

    ```typescript
    import * as childProcess from 'node:child_process'
    import {EventEmitter} from 'node:events'
    vi.mock('node:child_process')
    vi.mock('execa')
    ```

    ### Helper for fake child process

    ```typescript
    function fakeChild() {
      const ee = new EventEmitter() as any
      ee.unref = vi.fn()
      ee.pid = 42
      ee.stdout = null
      ee.stderr = null
      return ee
    }
    ```

    ### deployRuntimeArtifacts describe block

    ```typescript
    describe('deployRuntimeArtifacts (D-CG-02)', () => {
      beforeEach(() => {
        vi.mocked(fs.access).mockResolvedValue()
        vi.mocked(fs.mkdir).mockResolvedValue(undefined as any)
        vi.mocked(fs.copyFile).mockResolvedValue()
        vi.mocked(fs.chmod).mockResolvedValue()
      })
      afterEach(() => vi.restoreAllMocks())

      test('copies both files when destinations are missing', async () => {
        // stat: source ok, dest ENOENT
        vi.mocked(fs.stat).mockImplementation(async (p: any) => {
          if (String(p).startsWith('/opt/')) {
            const e: any = new Error('ENOENT'); e.code = 'ENOENT'; throw e
          }
          return {mtimeMs: 1000, mode: 0o644} as any
        })
        await deployRuntimeArtifacts()
        expect(fs.copyFile).toHaveBeenCalledTimes(2)
        expect(fs.chmod).toHaveBeenCalledWith(RESET_SCRIPT_RUNTIME_PATH, 0o755)
        expect(fs.chmod).toHaveBeenCalledWith(WRAPPER_RUNTIME_PATH, 0o755)
      })

      test('skips copy when destination is fresh + executable', async () => {
        vi.mocked(fs.stat).mockResolvedValue({mtimeMs: 9999, mode: 0o755} as any)
        await deployRuntimeArtifacts()
        expect(fs.copyFile).not.toHaveBeenCalled()
      })

      test('re-copies when destination is stale', async () => {
        vi.mocked(fs.stat).mockImplementation(async (p: any) => {
          // Source mtime 9999, dest mtime 1 → stale
          if (String(p).startsWith('/opt/')) return {mtimeMs: 1, mode: 0o755} as any
          return {mtimeMs: 9999, mode: 0o644} as any
        })
        await deployRuntimeArtifacts()
        expect(fs.copyFile).toHaveBeenCalledTimes(2)
      })

      test('re-copies when destination lacks executable bit', async () => {
        vi.mocked(fs.stat).mockImplementation(async (p: any) => {
          if (String(p).startsWith('/opt/')) return {mtimeMs: 9999, mode: 0o644} as any  // not executable
          return {mtimeMs: 1, mode: 0o644} as any
        })
        await deployRuntimeArtifacts()
        expect(fs.copyFile).toHaveBeenCalled()
      })

      test('throws INTERNAL_SERVER_ERROR when source missing', async () => {
        const enoent: any = new Error('ENOENT'); enoent.code = 'ENOENT'
        vi.mocked(fs.access).mockRejectedValue(enoent)
        await expect(deployRuntimeArtifacts()).rejects.toThrow(TRPCError)
      })

      test('mkdir -p creates parent directories', async () => {
        vi.mocked(fs.stat).mockResolvedValue({mtimeMs: 9999, mode: 0o755} as any)
        await deployRuntimeArtifacts()
        expect(fs.mkdir).toHaveBeenCalledWith('/opt/livos/data/factory-reset', expect.objectContaining({recursive: true}))
        expect(fs.mkdir).toHaveBeenCalledWith('/opt/livos/data/wrapper', expect.objectContaining({recursive: true}))
      })
    })
    ```

    ### spawnResetScope describe block

    ```typescript
    describe('spawnResetScope (D-CG-01)', () => {
      let originalGeteuid: any
      beforeEach(() => {
        originalGeteuid = process.geteuid
        ;(process as any).geteuid = () => 0
        // execa mock: 'command -v systemd-run' resolves successfully by default
        const execaMod = require('execa')
        execaMod.execa = vi.fn().mockResolvedValue({stdout: '/usr/bin/systemd-run'})
      })
      afterEach(() => {
        ;(process as any).geteuid = originalGeteuid
        vi.restoreAllMocks()
      })

      test('rejects when systemd-run not available', async () => {
        const execaMod = require('execa')
        execaMod.execa = vi.fn().mockRejectedValue(new Error('not found'))
        await expect(spawnResetScope({preserveApiKey: true, eventPath: '/x', timestamp: 'T'})).rejects.toThrow(TRPCError)
      })

      test('rejects when EUID != 0', async () => {
        ;(process as any).geteuid = () => 1000
        await expect(spawnResetScope({preserveApiKey: false, eventPath: '/x', timestamp: 'T'})).rejects.toThrow(TRPCError)
      })

      test('argv shape: --scope --collect --unit <name> --quiet bash <reset.sh> <flag> <eventPath>', async () => {
        const child = fakeChild()
        vi.mocked(childProcess.spawn).mockReturnValue(child)
        await spawnResetScope({preserveApiKey: true, eventPath: '/event.json', timestamp: '20260429T120000Z'})
        expect(childProcess.spawn).toHaveBeenCalledWith(
          'systemd-run',
          [
            '--scope',
            '--collect',
            '--unit', 'livos-factory-reset-20260429T120000Z',
            '--quiet',
            'bash',
            RESET_SCRIPT_RUNTIME_PATH,
            '--preserve-api-key',
            '/event.json',
          ],
          expect.objectContaining({detached: true, stdio: 'ignore'}),
        )
        expect(child.unref).toHaveBeenCalled()
      })

      test('preserveApiKey=false produces --no-preserve-api-key in argv', async () => {
        const child = fakeChild()
        vi.mocked(childProcess.spawn).mockReturnValue(child)
        await spawnResetScope({preserveApiKey: false, eventPath: '/e', timestamp: 'T'})
        const argvList = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
        expect(argvList).toContain('--no-preserve-api-key')
        expect(argvList).not.toContain('--preserve-api-key')
      })
    })
    ```

    ### Update existing performFactoryReset describe block

    Update the `performFactoryReset` tests from Plan 02 to mock the deploy + spawn:

    ```typescript
    describe('performFactoryReset (full happy path with spawn mocked)', () => {
      let livinityd: any
      beforeEach(() => {
        livinityd = new Livinityd({dataDirectory: '/tmp'})
        vi.mocked(fs.readdir).mockResolvedValue([] as any)
        vi.mocked(fs.access).mockResolvedValue()
        vi.mocked(fs.mkdir).mockResolvedValue(undefined as any)
        vi.mocked(fs.copyFile).mockResolvedValue()
        vi.mocked(fs.chmod).mockResolvedValue()
        vi.mocked(fs.stat).mockResolvedValue({mtimeMs: 9999, mode: 0o755} as any)
        vi.mocked(fs.writeFile).mockResolvedValue()
        ;(process as any).geteuid = () => 0
        const execaMod = require('execa')
        execaMod.execa = vi.fn().mockResolvedValue({stdout: '/usr/bin/systemd-run'})
        vi.mocked(childProcess.spawn).mockReturnValue(fakeChild())
      })
      afterEach(() => vi.restoreAllMocks())

      test('returns within 200ms', async () => {
        const t0 = Date.now()
        const result = await performFactoryReset(livinityd, {preserveApiKey: false})
        const elapsed = Date.now() - t0
        expect(elapsed).toBeLessThan(200)
        expect(result.accepted).toBe(true)
      })

      test('preflight rejection does NOT spawn', async () => {
        vi.mocked(fs.readdir).mockResolvedValue(['20260429T120000Z-update.json'] as any)
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({status: 'in-progress'}) as any)
        await expect(performFactoryReset(livinityd, {preserveApiKey: false})).rejects.toThrow(TRPCError)
        expect(childProcess.spawn).not.toHaveBeenCalled()
      })

      test('spawn argv preserveApiKey=true reaches systemd-run', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('LIV_PLATFORM_API_KEY=abc\n' as any)
        await performFactoryReset(livinityd, {preserveApiKey: true})
        const argv = vi.mocked(childProcess.spawn).mock.calls[0][1] as string[]
        expect(argv).toContain('--preserve-api-key')
      })
    })
    ```

    Adjust import lines so all required exports (`deployRuntimeArtifacts`, `spawnResetScope`, `RESET_SCRIPT_RUNTIME_PATH`, `WRAPPER_RUNTIME_PATH`) are imported from `./factory-reset.js`.
  </action>
  <verify>
    <automated>cd livos && pnpm --filter livinityd test -- factory-reset.unit.test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter livinityd test -- factory-reset.unit.test` exits 0
    - Total test count ≥ 22 (12 from Plan 02 + 6 deployRuntimeArtifacts + 4 spawnResetScope + 3 updated performFactoryReset)
    - The 200ms timing test passes consistently (run the test 3x in CI environment if it's flaky; if it is, raise the threshold to 500ms with a comment explaining)
    - No real filesystem or subprocess execution
  </acceptance_criteria>
  <done>
    Tests verify deploy idempotency, spawn argv shape, EUID gate, systemd-run availability gate, 200ms return, and preflight-gates-spawn invariant. All pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| livinityd → systemd-run | The TS process invokes systemd-run as root. systemd places the bash in a separate cgroup. |
| factory-reset.sh → tRPC handler | NONE — the bash runs in a detached scope with no IPC back. JSON event row is the only signal. |
| livinityd source tree → /opt/livos/data/{factory-reset,wrapper}/ | Lazy copy at first call. Source path is __dirname + filename, so a malicious source-tree compromise propagates to /opt — but at that point the host is already compromised. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-37-14 | Tampering | Modified factory-reset.sh in source tree gets copied to /opt | accept | If an attacker has source-tree write access, they own livinityd already. The lazy-copy is no worse than the existing tsx-runs-source pattern. |
| T-37-15 | DoS | systemd-run unavailable on host (e.g., container without systemd) | mitigate | assertSystemdRunAvailable preempts the spawn with a clear error message; route returns INTERNAL_SERVER_ERROR to UI. |
| T-37-16 | EoP | livinityd running as non-root tries to spawn systemd-run | mitigate | assertRootEuid gate prevents the spawn from proceeding. systemd-run --scope without root falls into user.slice (different semantics, would not survive systemctl stop livos). |
| T-37-17 | Information Disclosure | Process listing during reset shows --preserve-api-key + eventPath | accept | Both arguments are non-secret. The event JSON path is publicly readable (admin-only via tRPC). The flag value is a fixed string. |
| T-37-18 | DoS | Spawn fails silently and route handler returns success | mitigate | spawn() returns a child immediately; spawn errors typically appear as `child.pid === undefined` and ENOENT errors. (Currently we don't check; documented as residual risk. Plan 04's integration test verifies real spawn works.) |
</threat_model>

<verification>
## Plan-level checks

1. tsc --noEmit passes
2. All factory-reset.unit.test.ts cases pass (22+)
3. spawnResetScope's argv matches reference_cgroup_escape.md verbatim (--scope, --collect, --unit, --quiet, then bash + script + flag + eventPath)
4. performFactoryReset returns within 200ms on the mock-only happy path
5. preflightCheck rejection prevents spawn (verified by spawn.not.toHaveBeenCalled)
</verification>

<success_criteria>
- `pnpm --filter livinityd exec tsc --noEmit` exits 0
- `pnpm --filter livinityd test -- factory-reset.unit.test` exits 0
- All grep counts in acceptance_criteria are met
- No Server4 references
- spawnResetScope argv matches the cgroup-escape pattern verbatim
</success_criteria>

<output>
After completion, create `.planning/phases/37-backend-factory-reset/37-03-SUMMARY.md` documenting:
- The exact systemd-run argv emitted (verified by test snapshot)
- The deploy idempotency guarantees (mtime + executable-bit heuristic)
- The 200ms wall-clock measurement from the test (record the actual ms)
- A note that Plan 04 will run the integration test against Mini PC (opt-in, manual)
</output>
