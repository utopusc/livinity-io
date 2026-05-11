# Phase 102: Per-App Display Pivot — Pattern Map

**Mapped:** 2026-05-11
**Parent map:** `.planning/phases/101-livos-universal-app-orchestration/101-PATTERNS.md` (70% reusable)
**Files analyzed:** 22 (19 source + 3 doc)
**Analogs found:** 21 / 21 mappable files (Wave 4 UAT doc has no code analog)

> All paths Windows-relative to `C:\Users\hello\Desktop\Projects\contabo\livinity-io\`.
> "Phase 101 already shipped" — every file flagged "MODIFIED — currently uses XYZ" already exists on disk because Phase 101 deployed 2026-05-10. Phase 102 rewrites/extends those files; no green-field clean room.

---

## Critical Discoveries (read before planning)

1. **`createDisplayAllocator` already exists** at `livos/packages/livinityd/source/modules/webapps/display-allocator.ts` (Phase 100-10-01, BASE=10, returns `string` display token like `':10'`). Phase 102 CONTEXT specifies a NEW file at `streaming/display-allocator.ts` returning `number`. **Decision needed (planner gate):** either (a) MOVE + REWRITE the existing file from `webapps/` to `streaming/` and flip return type `string → number`, OR (b) extend the existing file in place under `webapps/` (CONTEXT path overruled). The cleanest match to the `streaming/port-allocator.ts` companion pattern is option (a) — move + rewrite. The existing file's `allocate()`/`release()`/`inUse()` callers must be audited (`Grep "createDisplayAllocator"` returns wires in `livinityd/source/index.ts` + `webapps/window-manager.ts`).

2. **`webapps/xvfb-display.ts` already exists** (Phase 100-08-01) — spawns Xvfb under `sudo -n -u bruce` with `1920x1080x24`. Phase 102 wants a NEW `streaming/xvfb-spawner.ts` at `1280x720x24` with a readiness-poll (`xdpyinfo`). The existing file is the EXACT analog; Phase 102 either (a) creates a new file under `streaming/` that delegates to `xvfb-display.ts` with the new resolution + poll wrapper, or (b) extends `xvfb-display.ts` in place. CONTEXT says NEW + under `streaming/`; recommend (a).

3. **`fluxbox-wm.ts` already exists** under `webapps/`. Phase 102 may need to call it per-display (Risk #7 says fluxbox may be required for native apps). It's NOT in the CONTEXT file list, but Wave 1 may import it. The 500ms early-exit health check pattern there is directly reusable.

4. **`agent-prompt-builder.ts` already exists** (Phase 101-06 shipped). Phase 102's "Active Display Context" snippet is a NEW second exported function (or rename of `buildActiveWindowSnippet` → `buildActiveDisplaySnippet`). Pure-function module, self-extend.

5. **`agent-runner-factory.ts` already exists** with `activeWid + activeAppMeta` opts (Phase 101-06 shipped). Phase 102 swaps the env name from `LUSE_TARGET_WINDOW_ID` to `LUSE_TARGET_DISPLAY` and renames the opt fields `activeWid → activeDisplay`. Self-rewrite of the existing pass-through block.

6. **`computer-use/mcp/server.ts` already reads `LUSE_TARGET_WINDOW_ID`** (line 55) AND `LUSE_DISPLAY` (line 73). Phase 102 swaps the WID-read for a DISPLAY-read; `LUSE_DISPLAY` already exists so the plumbing is half done.

7. **`webapps/window-manager.ts` already accepts `displayAllocator` opt** (line 202) but does NOT call it (D-100-10-A reverted in Phase 100-10-08). Phase 102 RE-WIRES the spawn body to actually call `displayAllocator.allocate()` + `xvfbSpawner.start()` + `chromeProcessSpawner.start()` + `vncBridge.startDisplay()`. The plumbing is half-existing.

8. **`stream-manager.ts` already supports `VncWindowTarget = {wid} | {display}` discriminated union** (line 54). The `display` branch (`spawnVncForWindow({display, rfbPort})`) is already implemented in `vnc-bridge.ts:96-98`. Phase 102 doesn't need to TEACH stream-manager about displays — it just needs to feed `{display}` targets from window-manager's rewritten spawn body. **Wave 3 plan 102-09 is therefore lighter than CONTEXT implies — vnc-bridge "rewrite" is mostly default-path switch, not new code.**

9. **`apps/native-routes.ts` already exists** (Phase 101-03 shipped) with `adminProcedure` on mutations and `privateProcedure` on queries — the exact pattern Wave 3 plan 102-07 (master-login-routes.ts) copies verbatim.

10. **No master-chrome-login UI exists** — `livos/packages/ui/src/modules/settings/` directory does NOT exist (only `desktop/`, `dock/`, `auth/`, etc.). Plan 102-07 must either create the directory OR park the UI under `desktop/` near `add-webapp-dialog.tsx`. CONTEXT says under `settings/` — first file there.

---

## File Classification (Cross-Wave Summary)

| File | Wave | Role | Data Flow | Closest Analog | Match Quality | Has Test Neighbor? |
|------|------|------|-----------|----------------|---------------|--------------------|
| `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` | 1 | NEW · utility/state allocator | linear counter alloc/release (returns `number`) | `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` | **exact (verbatim companion)** | new `display-allocator.test.ts` |
| `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts` | 1 | NEW · lifecycle/spawn + ready-poll | process-spawn + `xdpyinfo` poll | `livos/packages/livinityd/source/modules/webapps/xvfb-display.ts` | **exact (extend with poll + new res)** | new `xvfb-spawner.test.ts` |
| `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts` | 1 | NEW · lifecycle/spawn | detached process-spawn with `DISPLAY=:N` | `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` (Phase 101-03) | **exact** | new `chrome-process-spawner.test.ts` |
| `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts` | 1 | NEW · file I/O (cp -r) | sync filesystem copy | none in-tree; closest pattern is `webapps/fluxbox-wm.ts:64-68` (`writeFileSync` idempotent) | role-match (sync fs op with logger) | new `profile-seeder.test.ts` |
| `livos/packages/livinityd/source/index.ts` | 1 | MODIFIED · wire-up | constructor-injection | self (existing wiring at 388-470 for StreamManager + WebAppWindowManager) | self-extend | n/a (wire-up only) |
| `livos/packages/livinityd/source/modules/webapps/window-manager.ts` | 2 | REWRITE · orchestrator (spawn body) | CDP call → orchestrate Xvfb + Chrome + x11vnc | itself (current 356-490 CDP spawn block — REPLACE) | self-rewrite | `window-manager.test.ts` extend |
| `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` | 2 | MODIFIED · swap binding strategy | xdotool WM_CLASS poll → DisplayAllocator + Xvfb-scoped wid lookup | itself (Phase 101-05 shipped) | self-modify | `native-app-binder.test.ts` |
| `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` | 2 | MODIFIED · pure transform | string template | itself (Phase 101-06 shipped — `buildActiveWindowSnippet`) | self-extend (add `buildActiveDisplaySnippet`) | `agent-prompt-builder.test.ts` |
| `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` | 2 | MODIFIED · pass-through extension | request-response body builder | itself (Phase 101-06 shipped — `activeWid` + `activeAppMeta`) | self-rewrite (rename `activeWid → activeDisplay`) | `agent-runner-factory.test.ts` |
| `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` | 2 | MODIFIED · env-read at boot | env-var read → defaults | itself (lines 55-66 read `LUSE_TARGET_WINDOW_ID`) | self-rewrite (swap to `LUSE_TARGET_DISPLAY`) | none direct; integration via `mcp/tools.test.ts` |
| `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` | 2 | MODIFIED · descriptor env block | env-injection at child-spawn | itself (lines 247-260 build `baseEnv` with `LUSE_TARGET_WINDOW_ID_ENV`) | self-rewrite | `luse-mcp-config.test.ts` |
| **(typo correction — luse-mcp-descriptor.ts does NOT exist)** | — | — | — | actual file is `luse-mcp-config.ts` above | — | — |
| `livos/packages/ui/src/modules/settings/master-chrome-login.tsx` | 3 | NEW · form/dialog component | request-response (mutation + status query) | `livos/packages/ui/src/modules/desktop/add-webapp-dialog.tsx` | role-match (Dialog + Button + trpc mutation) | new RTL test |
| `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts` | 3 | NEW · tRPC routes | admin-gated mutations + privateProcedure status | `livos/packages/livinityd/source/modules/apps/native-routes.ts` (Phase 101-03) | **exact** | new `master-login-routes.test.ts` |
| `livos/packages/livinityd/source/modules/webapps/window-manager.ts` close path | 3 | MODIFIED · lifecycle teardown | reverse-order cleanup | itself (current `close()` method) | self-extend | `window-manager.test.ts` extend |
| `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` close path | 3 | MODIFIED · lifecycle teardown | reverse-order cleanup | itself | self-extend | `native-app-binder.test.ts` extend |
| `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` | 3 | REWRITE (light) · default-path swap | spawn x11vnc with `-display :N` instead of `-id <wid>` | itself (lines 87-160 — `-display` branch ALREADY EXISTS at lines 96-98) | **self-rewrite, mostly default-path flip** | `vnc-bridge.test.ts` |
| `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` | 3 | MODIFIED · `VncDisplayTarget` variant | discriminated union (already scaffolded) | itself (lines 54, 215-283 — `{display}` branch ALREADY EXISTS) | self-extend (defaults flip) | `stream-manager.test.ts` |
| `.planning/phases/102-per-app-display-pivot/UAT-CHECKLIST.md` | 4 | doc | — | `.planning/phases/101-livos-universal-app-orchestration/UAT-CHECKLIST.md` | template | n/a |

---

## Wave 1 — Foundation (3 plans, parallel, file-disjoint)

### `livos/packages/livinityd/source/modules/streaming/display-allocator.ts` (NEW)

**Role:** utility/state — linear allocator over `[10, 100)` returning `number` display IDs. Companion to `streaming/port-allocator.ts`.

**Closest analog:** `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` — copy verbatim with three substitutions:
- `min: 15900 → 10`, `max: 16000 → 100`
- Field/class names `Port → Display`
- Error class `PortRangeExhaustedError → DisplayRangeExhaustedError`

**Pre-existing alternate file:** `webapps/display-allocator.ts` returns `string` like `':10'`. Phase 102 wants `number`. Recommend **delete-and-move** rather than two parallel allocators. Audit callers via `Grep "createDisplayAllocator"`.

**Verbatim port-allocator.ts:37-104 (just substitute names/range):**
```typescript
export class PortRangeExhaustedError extends Error {
	code = 'PORT_RANGE_EXHAUSTED'
	constructor(public range: {min: number; max: number}) {
		super(`port range [${range.min}, ${range.max}) is exhausted`)
		this.name = 'PortRangeExhaustedError'
	}
}

export class PortAllocator {
	private readonly min: number
	private readonly max: number
	private cursor: number
	private readonly inUse = new Set<number>()

	constructor(opts: PortAllocatorOpts = {}) {
		this.min = opts.min ?? 15900
		this.max = opts.max ?? 16000
		// ... integer + range validation
		this.cursor = this.min
	}

	allocate(): number {
		const capacity = this.max - this.min
		if (this.inUse.size >= capacity) throw new PortRangeExhaustedError({...})
		for (let attempts = 0; attempts < capacity; attempts++) {
			const candidate = this.cursor
			this.cursor += 1
			if (this.cursor >= this.max) this.cursor = this.min
			if (!this.inUse.has(candidate)) {
				this.inUse.add(candidate)
				return candidate
			}
		}
		throw new PortRangeExhaustedError({min: this.min, max: this.max})
	}

	release(port: number): void {
		if (!Number.isInteger(port)) return
		if (port < this.min || port >= this.max) return
		this.inUse.delete(port)
	}
}
```

**Test pattern:** `streaming/port-allocator.test.ts` — pure vitest, no mocks. Phase 102 mirrors row-for-row.

**Acceptance grep:** `grep -q "DisplayRangeExhaustedError" livos/packages/livinityd/source/modules/streaming/display-allocator.ts && grep -q "min: 10" livos/packages/livinityd/source/modules/streaming/display-allocator.ts`.

---

### `livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts` (NEW)

**Role:** lifecycle/spawn — spawn `Xvfb :N -screen 0 1280x720x24 -ac -nolisten tcp` as detached child, then **block on readiness poll** (`xdpyinfo -display :N` every 200ms, 5s deadline) before resolving. Companion module to `streaming/display-allocator.ts`.

**Closest analog:** `livos/packages/livinityd/source/modules/webapps/xvfb-display.ts` (Phase 100-08-01) — EXACT match for the spawn shape; Phase 102 adds the readiness poll on top.

**Imports + handle shape** (xvfb-display.ts:15-30):
```typescript
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'

export interface StartXvfbOpts {
	display?: string         // default ':1' → CHANGE to ':10' (allocator-driven)
	resolution?: string      // default '1920x1080x24' → CHANGE to '1280x720x24'
	user?: string            // default 'bruce'
	spawnFn?: typeof nodeSpawn
	logger?: {...}
}

export interface XvfbHandle {
	pid: number
	display: string
	exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>
	stop(): Promise<void>
}
```

**Spawn argv pattern** (xvfb-display.ts:40-50):
```typescript
const args = [
	'-n', '-u', user,
	'Xvfb', display,
	'-screen', '0', resolution,
	'-nolisten', 'tcp',
	'-ac',
]
const child = spawnFn('sudo', args, {detached: true, stdio: 'ignore'}) as ChildProcess
```

**NEW for Phase 102 — readiness poll (`xdpyinfo`):**
```typescript
// Poll xdpyinfo -display :N until it returns 0, max 5s
const xdpyDeadline = Date.now() + 5000
while (Date.now() < xdpyDeadline) {
	try {
		await execFileP('xdpyinfo', ['-display', display], {env: {DISPLAY: display}})
		break // exit code 0 → display is up
	} catch {
		await new Promise((r) => setTimeout(r, 200))
	}
}
if (Date.now() >= xdpyDeadline) {
	throw new XvfbReadinessTimeoutError(display)
}
```

**Early-exit health check pattern** (copy from `fluxbox-wm.ts:107-125`, 500ms race — catches sudo NOPASSWD failures loudly):
```typescript
const earlyExitRace = new Promise<{code: number | null; signal: NodeJS.Signals | null} | null>(
	(resolve) => {
		const timer = setTimeout(() => resolve(null), 500)
		child.once('exit', (code, signal) => {
			clearTimeout(timer)
			resolve({code, signal})
		})
	},
)
```

**Test pattern:** `xvfb-display.test.ts` (existing). Extend with: (a) injected spawnFn + FakeChild; (b) injected `xdpyinfoFn: ExecFileFn` mock that returns success after N retries; (c) timeout case.

---

### `livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts` (NEW)

**Role:** lifecycle/spawn — spawn `google-chrome --user-data-dir=/tmp/livos-chrome-app-<uuid> --no-first-run --no-default-browser-check --start-fullscreen --app=<url>` with `DISPLAY=:N` env, detached, then return `{pid, child}`.

**Closest analog:** `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` (Phase 101-03 — verbatim shape). Just specialize the binary to chrome + add chrome-specific argv builder.

**Imports + factory injection** (native-app-spawner.ts:30-52):
```typescript
import {spawn as nodeSpawn, type ChildProcess, type SpawnOptions} from 'node:child_process'

export type ChromeSpawnFn = (
	cmd: string,
	args: string[],
	opts?: SpawnOptions,
) => ChildProcess
```

**Detached-spawn with stderr-tail** (native-app-spawner.ts:115-160):
```typescript
const child = spawnFn(chromeBinary, chromeArgs, {
	env: {...process.env, ...cfg.env, DISPLAY: display},
	detached: true,
	stdio: ['ignore', 'ignore', 'pipe'],
})

const stderrTail: string[] = []
child.stderr?.on('data', (chunk: Buffer) => {
	const line = chunk.toString('utf-8').trim()
	if (!line) return
	log?.verbose?.(`chrome[${appUuid}] stderr: ${line}`)
	stderrTail.push(line)
	while (stderrTail.length > STDERR_TAIL_LIMIT) stderrTail.shift()
})

child.on('exit', (code, signal) => {
	if (code !== 0 && code !== null) {
		const tail = stderrTail.length > 0
			? `\n--- chrome[${appUuid}] stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
			: ''
		log?.warn(`chrome[${appUuid}] exited code=${code} signal=${signal}${tail}`)
	}
})

try { child.unref?.() } catch { /* noop */ }
```

**NEW chrome argv builder** (Phase 102-specific):
```typescript
function buildChromeArgs(input: {url: string; userDataDir: string}): string[] {
	return [
		`--user-data-dir=${input.userDataDir}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--start-fullscreen',
		`--app=${input.url}`,
	]
}
```

**Default chrome binary:** `'google-chrome'` (match existing `webapps/window-manager.ts:161` `chromeBinary?: string` default).

**Test pattern:** mirror `native-app-spawner.test.ts` — FakeChild + spawnFn injection. Add argv assertion (`expect(spawnFn).toHaveBeenCalledWith('google-chrome', expect.arrayContaining(['--start-fullscreen', '--app=...']), ...)`).

---

### `livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts` (NEW)

**Role:** synchronous file-I/O — `cp -r /opt/livos/data/chrome-master /tmp/livos-chrome-app-<uuid>` (idempotent: target removed-then-copied; ~10MB; ~200ms). Returns `{path: string}`.

**Closest analog:** No exact in-tree analog for `cp -r`. Closest patterns:
- `webapps/fluxbox-wm.ts:64-68` — `writeFileSync` idempotent overwrite with `try/catch + logger.warn`
- `node:fs/promises.cp` is the Node 16.7+ async recursive-copy API

**Proposed pattern (composed from Node API + fluxbox-wm.ts:64-68 logger style):**
```typescript
import {cp, rm, access} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

const MASTER_PROFILE_DIR = process.env.LIVOS_CHROME_MASTER_DIR ?? '/opt/livos/data/chrome-master'
const APP_PROFILE_PREFIX = '/tmp/livos-chrome-app-'

export class MasterProfileMissingError extends Error {
	code = 'MASTER_PROFILE_MISSING'
	constructor(public dir: string) {
		super(`master Chrome profile not found at ${dir} — run Master Login first`)
		this.name = 'MasterProfileMissingError'
	}
}

export interface SeedOpts {
	uuid?: string                                          // default randomUUID()
	masterDir?: string                                     // default MASTER_PROFILE_DIR
	cpFn?: (src: string, dst: string, opts: {recursive: boolean}) => Promise<void>  // injection
	logger?: {info(m: string): void; warn(m: string): void; error(m: string): void}
}

export async function seedProfile(opts: SeedOpts = {}): Promise<{path: string; uuid: string}> {
	const uuid = opts.uuid ?? randomUUID()
	const master = opts.masterDir ?? MASTER_PROFILE_DIR
	const target = `${APP_PROFILE_PREFIX}${uuid}`
	const cpFn = opts.cpFn ?? cp

	// Verify master exists (loud failure mode — Risk #4)
	try {
		await access(master)
	} catch {
		throw new MasterProfileMissingError(master)
	}

	// Idempotent: rm -rf target first (defensive against stale temp dirs)
	await rm(target, {recursive: true, force: true})

	const t0 = Date.now()
	await cpFn(master, target, {recursive: true})
	opts.logger?.info(`profile-seeder: seeded ${target} from ${master} in ${Date.now() - t0}ms`)
	return {path: target, uuid}
}

export async function unseedProfile(uuid: string): Promise<void> {
	await rm(`${APP_PROFILE_PREFIX}${uuid}`, {recursive: true, force: true})
}
```

**Security note (carry from 101-03 T-101-02 pattern):** validate `uuid` is a real UUID v4 (regex) before joining into a path. The native-app-config schema uses `z.string().uuid()` — copy that.

**Test pattern:** vitest pure-function with `cpFn` injection — no real fs work. Snapshot the call args + assert error class on missing master.

**Acceptance grep:** `grep -q "MasterProfileMissingError" livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts && grep -q "/tmp/livos-chrome-app-" livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts`.

---

### `livos/packages/livinityd/source/index.ts` (MODIFIED — Wave 1 wire-up)

**Role:** Boot-time wire — construct `DisplayAllocator`, ensure `/opt/livos/data/chrome-master/` exists (idempotent `mkdir -p`), pass DisplayAllocator + ProfileSeeder + XvfbSpawner + ChromeProcessSpawner into `WebAppWindowManager` constructor.

**Self-analog: existing wire-up at lines 388-470** (verbatim from 101-PATTERNS.md):
```typescript
this.streamManager = new StreamManager({caps, spawn: x11Spawn, logger: streamingLogger})
// ... existing ...
this.webappWindowManager = new WebAppWindowManager({
	streamManager: this.streamManager,
	spawn: x11Spawn,
	logger: webappLogger,
	mcpConfigManager: webappMcpConfigManager,
	luseServerPath,
	luseMcpEnv: process.env,
	displayAllocator,                  // ← currently from webapps/display-allocator.ts; SWAP after 102-01 ships
	chromeCdpClient: this.chromeCdpClient,
})
```

**Phase 102 additions:** after StreamManager init, before `WebAppWindowManager` ctor:
```typescript
// Phase 102-01 — display + xvfb allocators
const displayAllocator = new DisplayAllocator()  // replaces createDisplayAllocator() (102-01 file rename)

// Phase 102-03 — master profile directory must exist before profile-seeder fires.
// Idempotent mkdir -p; no-op if already there. Failure to create logs warn but
// does NOT crash livinityd — Master Login UI's preflight check (102-07) will
// surface the issue to the user.
await mkdir('/opt/livos/data/chrome-master', {recursive: true}).catch((err) => {
	this.logger.error('failed to create /opt/livos/data/chrome-master', err)
})
```

**Non-fatal-degrade pattern** (existing in index.ts:474-482) — wrap new boot steps in same try/catch.

---

## Wave 2 — Wire-up (3 plans, parallel, file-disjoint)

### `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (REWRITE — spawn body)

**Role:** REPLACE the CDP-driven spawn body (current lines 432-450, Phase 101-04) with per-app-display orchestration:
1. `displayAllocator.allocate()` → `N: number`
2. `xvfbSpawner.start({display: ':N', resolution: '1280x720x24'})` → wait readiness
3. `profileSeeder.seed({uuid: webappId})` → `userDataDir: '/tmp/livos-chrome-app-<uuid>'`
4. `chromeProcessSpawner.start({url, userDataDir, display: ':N'})` → `{pid}`
5. `portAllocator.allocate()` → `port: number`
6. `streamManager.startStream({mode: 'vnc-window', target: {display: ':N'}, userId})` → `{streamId, wsUrl}`
7. Stash `{display, userDataDir, chromePid, port, ...}` in `ActiveWebApp` map entry; return `{webappId, streamId, wsUrl, display, port}`.

**Closest analog:** itself. The surrounding scaffolding (idempotency check at 357-371, per-user cap at 374-377, MCP-config registration, broadcastActiveWid, map insertion at the end) stays unchanged.

**Today's CDP-driven block to DELETE** (window-manager.ts:432-490 — from `// Phase 101-04 — CDP-driven window creation` down through the `findNewWindowByPid` call + map insertion):
```typescript
const chromePid = await this.chromeCdpClient.getChromePid()
const baselineWidsForPid = await this.discovery.listWindowIdsForPid(chromePid)
const {targetId, windowId: cdpWindowId} =
	await this.chromeCdpClient.createWindowForUrl(opts.url, {
		width: 1280,
		height: 720,
		left: cascadeOffsetX,
		top: cascadeOffsetY,
	})
// ... rest of CDP flow
```

**Phase 102 replacement (per CONTEXT D-102-PER-APP-CHROME + D-102-X11VNC-WHOLE-DISPLAY):**
```typescript
// Phase 102-04 — Per-app display orchestration.
// CDP path replaced by per-app Xvfb + per-app Chrome process (D-102-PER-APP-XVFB).
// Display isolation eliminates window-overlap (Issue 2 from 102-CONTEXT) and lets
// x11vnc capture the whole 1280x720 canvas (no WID drift, no 1920x1080 coord skew).

const displayN = this.displayAllocator.allocate()              // number
const displayStr = `:${displayN}`

const xvfb = await this.xvfbSpawner.start({display: displayStr, resolution: '1280x720x24'})
const profile = await this.profileSeeder.seed({uuid: opts.webappId})
const chrome = await this.chromeProcessSpawner.start({
	url: opts.url,
	userDataDir: profile.path,
	display: displayStr,
})
const {streamId, wsUrl} = this.streamManager.startStream({
	userId: opts.userId,
	mode: 'vnc-window',
	target: {display: displayStr},     // ← stream-manager.ts:54 already supports this
})

const entry: ActiveWebApp = {
	webappId: opts.webappId,
	userId: opts.userId,
	wid: 0,                            // wid no longer tracked — display is the unit
	mode: 'vnc-window',
	streamId,
	wsUrl,
	portalSession: null,
	geometryTracker: null,
	url: opts.url,
	display: displayStr,
	// Phase 102 new fields:
	displayN,
	chromePid: chrome.pid,
	profilePath: profile.path,
	xvfbHandle: xvfb,
}
this.active.set(opts.webappId, entry)

return {webappId: opts.webappId, windowId: 0, streamId, wsUrl}
```

**Important:** `ActiveWebApp` type at lines 232-254 needs new fields: `displayN, chromePid, profilePath, xvfbHandle`. The `wid` and `targetId` fields become unused (keep for compat with idle-cleanup poller until 102-08 removes them).

**Test extension:** `window-manager.test.ts` — mock `xvfbSpawner.start`, `profileSeeder.seed`, `chromeProcessSpawner.start` (each returning FakeChild + handle). Assert sequence: allocate → xvfb → seed → chrome → stream.

---

### `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` (MODIFIED — display swap)

**Role:** Phase 101-05's flow was: spawn binary on shared `:1` → poll xdotool by WM_CLASS → bind wid to port. Phase 102 changes to: allocate `:N` → start Xvfb on `:N` → spawn binary with `DISPLAY=:N` → bind `:N` to port (no WM_CLASS poll — display IS the binding).

**Closest analog:** itself (Phase 101-05 shipped).

**Today's poll-based bind algorithm** (native-app-binder.ts:178-211):
```typescript
const baseline = await snapshotWindowIds(display, execFn)
let wid: number | undefined
while (Date.now() < deadline) {
	const {stdout} = await execFn('xdotool', ['search', '--onlyvisible', '--class', opts.wmClass], {env})
	const cand = candidates.find((w) => !baseline.has(w))
	if (cand !== undefined) { wid = cand; break }
	await new Promise((r) => setTimeout(r, poll))
}
if (wid === undefined) throw new NativeAppWindowNotFoundError(opts.wmClass)
const port = opts.portAllocator.allocate()
const {streamId, wsUrl} = await opts.startStreamFn({wid, port, label: opts.label})
```

**Phase 102 replacement (D-102-NATIVE-APP-PARITY):**
```typescript
// Phase 102-05 — display-scoped bind.
// WM_CLASS poll dropped. Each native app gets its own Xvfb :N (allocated upstream
// by routes.ts), so the stream target is whole-display capture.
// startStreamFn receives {display: ':N'} instead of {wid}.
const port = opts.portAllocator.allocate()
try {
	const {streamId, wsUrl} = await opts.startStreamFn({
		display: opts.display,    // already passed in BindOpts (was used for env)
		port,
		label: opts.label,
	})
	return {display: opts.display, port, streamId, wsUrl}
} catch (err) {
	opts.portAllocator.release(port)
	throw err
}
```

**`StreamStartFn` interface change** (native-app-binder.ts:59-64):
```typescript
// BEFORE:
export interface StreamStartFn {
	(opts: {wid: number; port: number; label?: string}): Promise<{streamId: string; wsUrl: string}>
}
// AFTER:
export interface StreamStartFn {
	(opts: {display: string; port: number; label?: string}): Promise<{streamId: string; wsUrl: string}>
}
```

**Caller in `apps/native-routes.ts:87-95`** (`makeStartStreamFn`) — update target shape:
```typescript
// BEFORE: target: {wid}
// AFTER:  target: {display: opts.display}
```

**Inferred analog from stream-manager.ts:54** — `VncWindowTarget = {wid} | {display}` is already a discriminated union; no stream-manager change needed.

**Test pattern:** `native-app-binder.test.ts` (existing). Drop WM_CLASS poll fixtures; add display-string fixture.

---

### `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (MODIFIED — add display-context fn)

**Role:** Add `buildActiveDisplaySnippet({activeDisplay, appMeta})` exported function alongside the existing `buildActiveWindowSnippet`. Either DEPRECATE the existing window-based variant or keep both (recommend: keep both, mark window variant `@deprecated` for v33+ compat).

**Closest analog:** itself. The sanitize-and-template pattern is verbatim.

**Today's exported function** (agent-prompt-builder.ts:121-134):
```typescript
export function buildActiveWindowSnippet(input: ActiveWindowContext): string {
	if (typeof input.activeWid !== 'number' || !Number.isInteger(input.activeWid)) return ''
	const safe = sanitizeActiveAppMeta(input.appMeta)
	const target = safe.url ?? safe.binary ?? '(unknown)'
	return [
		'## Active Window Context',
		`You are operating in the context of the LivOS app: ${safe.title} (${safe.kind}).`,
		`Window ID: ${input.activeWid}`,
		`URL/Binary: ${target}`,
		`Default LUSE_TARGET_WINDOW_ID for all your tool calls is ${input.activeWid} unless you override explicitly.`,
	].join('\n')
}
```

**Phase 102 new function:**
```typescript
export interface ActiveDisplayContext {
	activeDisplay: string        // ':10', ':11', ...
	appMeta: ActiveAppMeta
}

// Validate display strings match `:<integer>` shape — denies arbitrary attacker-controlled
// strings from being interpolated into the prompt (T-101-03 carry-forward).
const DISPLAY_RE = /^:\d{1,3}$/

export function buildActiveDisplaySnippet(input: ActiveDisplayContext): string {
	if (typeof input.activeDisplay !== 'string' || !DISPLAY_RE.test(input.activeDisplay)) return ''
	const safe = sanitizeActiveAppMeta(input.appMeta)
	const target = safe.url ?? safe.binary ?? '(unknown)'
	return [
		'## Active Display Context',
		`You are operating in the context of the LivOS app: ${safe.title} (${safe.kind}).`,
		`Active X11 display: ${input.activeDisplay} (resolution 1280x720)`,
		`URL/Binary: ${target}`,
		`All your Luse tool calls (screenshot, click, key) are implicitly scoped to ${input.activeDisplay} via LUSE_TARGET_DISPLAY. Coordinate space is 1280x720 native — no offset, no scaling.`,
	].join('\n')
}
```

**Test pattern:** `agent-prompt-builder.test.ts` extend with display-context fixtures + regex denial cases.

---

### `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` (MODIFIED — rename activeWid → activeDisplay)

**Role:** Phase 101-06 added `activeWid?: number` + `activeAppMeta?: ActiveAppMeta` opts to `createSdkAgentRunnerForUser`. Phase 102 swaps `activeWid` for `activeDisplay: string`. Snippet builder call switches from `buildActiveWindowSnippet` to `buildActiveDisplaySnippet`.

**Closest analog:** itself (Phase 101-06 shipped).

**Today's code** (agent-runner-factory.ts:117-164):
```typescript
activeWid?: number
activeAppMeta?: ActiveAppMeta
// ...
let injectedContextPrefix = contextPrefix
if (opts.activeWid !== undefined && opts.activeAppMeta) {
	const snippet = buildActiveWindowSnippet({
		activeWid: opts.activeWid,
		appMeta: opts.activeAppMeta,
	})
	if (snippet) {
		injectedContextPrefix = injectedContextPrefix
			? `${injectedContextPrefix}\n\n${snippet}`
			: snippet
	}
}
```

**Phase 102 replacement:**
```typescript
activeDisplay?: string       // ':10', ':11', ...
activeAppMeta?: ActiveAppMeta
// ...
let injectedContextPrefix = contextPrefix
if (typeof opts.activeDisplay === 'string' && opts.activeAppMeta) {
	const snippet = buildActiveDisplaySnippet({
		activeDisplay: opts.activeDisplay,
		appMeta: opts.activeAppMeta,
	})
	if (snippet) {
		injectedContextPrefix = injectedContextPrefix
			? `${injectedContextPrefix}\n\n${snippet}`
			: snippet
	}
}
```

**Test pattern:** `agent-runner-factory.test.ts` (existing). Replace `activeWid` fixtures with `activeDisplay`.

**Upstream caller:** the WS chat envelope handler that calls this factory (`ai/index.ts` chatStream + frontend `use-agent-socket.ts` payload builder) also gets the rename. Wave 2 plan 102-06 must include those caller edits or chain them to a follow-up plan.

---

### `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (MODIFIED — env-var swap)

**Role:** Currently reads `LUSE_TARGET_WINDOW_ID` (line 55) AND `LUSE_DISPLAY` (line 73) at boot. Phase 102 drops the `LUSE_TARGET_WINDOW_ID` read (windowId-default no longer makes sense — display is the unit), keeps `LUSE_DISPLAY` (already present), and renames the canonical env to `LUSE_TARGET_DISPLAY` (alias to `LUSE_DISPLAY` for back-compat).

**Closest analog:** itself.

**Today's window-id read block** (mcp/server.ts:55-66) — DELETE or repurpose:
```typescript
const targetWindowEnv = process.env.LUSE_TARGET_WINDOW_ID
let defaultWindowId: number | undefined
if (typeof targetWindowEnv === 'string' && targetWindowEnv.length > 0) {
	const parsed = Number(targetWindowEnv)
	if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0) {
		defaultWindowId = parsed
	} else {
		process.stderr.write(`[luse-mcp] warning: LUSE_TARGET_WINDOW_ID=...\n`)
	}
}
```

**Today's display read block** (mcp/server.ts:73) — KEEP, extend with new env name:
```typescript
// Phase 102-06 — LUSE_TARGET_DISPLAY (canonical) ▶ LUSE_DISPLAY (alias) ▶ DISPLAY
const defaultDisplay =
	process.env.LUSE_TARGET_DISPLAY ??
	process.env.LUSE_DISPLAY ??
	process.env.DISPLAY
```

**Test pattern:** `mcp/tools.test.ts` (existing — covers env-driven defaults indirectly).

---

### `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.ts` (MODIFIED — descriptor env)

**Role:** Phase 102 CONTEXT calls this file `luse-mcp-descriptor.ts` (TYPO — actual name is `luse-mcp-config.ts`). Sets `LUSE_TARGET_WINDOW_ID` in the spawned child's env block (line 250). Phase 102 swaps to `LUSE_TARGET_DISPLAY`.

**Closest analog:** itself.

**Today's descriptor + env block** (luse-mcp-config.ts:109, 247-260):
```typescript
export const LUSE_TARGET_WINDOW_ID_ENV = 'LUSE_TARGET_WINDOW_ID'

export interface PerWebAppMcpDescriptor {
	instanceKey: string
	windowId: number
	display?: string
}

// In buildLuseConfig():
const baseEnv: Record<string, string> = descriptor
	? {
			DISPLAY: descriptor.display ?? ':1',
			[LUSE_TARGET_WINDOW_ID_ENV]: String(descriptor.windowId),
			LUSE_REDIS_URL: luseRedisUrl,
		}
	: { ... host variant ... }
```

**Phase 102 replacement (rename + drop windowId):**
```typescript
export const LUSE_TARGET_DISPLAY_ENV = 'LUSE_TARGET_DISPLAY'

export interface PerWebAppMcpDescriptor {
	instanceKey: string
	display: string            // ':10', ':11', ... (required; was optional default ':1')
	// windowId DROPPED — no longer meaningful under per-app-display
}

const baseEnv: Record<string, string> = descriptor
	? {
			DISPLAY: descriptor.display,
			[LUSE_TARGET_DISPLAY_ENV]: descriptor.display,
			LUSE_REDIS_URL: luseRedisUrl,
		}
	: { ... host variant unchanged ... }
```

**Caller in `webapps/window-manager.ts` (currently builds descriptor with `windowId: newWin.wid`)** must switch to `display: displayStr` from the Wave-2 spawn rewrite.

**Test pattern:** `luse-mcp-config.test.ts` + `luse-mcp-config.window.test.ts` (existing) — replace windowId fixtures with display-string fixtures.

---

## Wave 3 — UI + Lifecycle (3 plans, parallel, file-disjoint)

### `livos/packages/ui/src/modules/settings/master-chrome-login.tsx` (NEW)

**Role:** Settings UI affordance — "Chrome Master Login" Dialog with: (a) status query (`chromeMaster.status` shows whether `/opt/livos/data/chrome-master/Default/Cookies` exists), (b) "Open Master Chrome" button (triggers `chromeMaster.startLogin` mutation → spawns chrome on `:0`), (c) "Reset Master Profile" button (with AlertDialog confirm).

**Directory:** `livos/packages/ui/src/modules/settings/` does NOT exist yet (only `desktop/`, `dock/`, `auth/`, etc.). **Planner must `mkdir`** this directory OR park the file under `desktop/master-chrome-login.tsx`. CONTEXT specifies `settings/` — create the directory.

**Closest analog:** `livos/packages/ui/src/modules/desktop/add-webapp-dialog.tsx` (form Dialog with trpc mutation) + `livos/packages/ui/src/modules/desktop/share-app-dialog.tsx` (status + action buttons). Both are sibling patterns under `desktop/`.

**Imports pattern** (add-webapp-dialog.tsx:17-29 — already in 101-PATTERNS):
```typescript
import {useEffect, useMemo, useRef, useState} from 'react'
import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, ...} from '@/shadcn-components/ui/alert-dialog'
import {trpcReact} from '@/trpc/trpc'
```

**Mutation pattern** (mirror add-webapp-dialog.tsx:60-62):
```typescript
const utils = trpcReact.useUtils()
const startMut = trpcReact.chromeMaster.startLogin.useMutation()
const resetMut = trpcReact.chromeMaster.reset.useMutation()
const status = trpcReact.chromeMaster.status.useQuery()
```

**Body skeleton** (composed from add-webapp-dialog + share-app-dialog):
```tsx
<Dialog open={open} onOpenChange={setOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Chrome Master Login</DialogTitle>
		</DialogHeader>
		<div className='space-y-4'>
			<p className='text-text-secondary text-sm'>
				Log into Google once. All apps will inherit this login.
			</p>
			<div>
				<span className='text-caption-xs text-text-tertiary'>Status: </span>
				{status.data?.hasCookies ? 'Logged in' : 'Not logged in'}
			</div>
		</div>
		<DialogFooter>
			<Button onClick={() => startMut.mutate()}>Open Master Chrome</Button>
			<Button variant='destructive' onClick={() => setShowResetConfirm(true)}>
				Reset Master Profile
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
{/* AlertDialog for Reset Confirm — mirror webapp-icon.tsx remove flow */}
```

**Test pattern:** jsdom + RTL component test (per the package's existing test convention referenced in 101-PATTERNS metadata).

---

### `livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts` (NEW)

**Role:** tRPC routes `chromeMaster.startLogin` (admin mutation) + `chromeMaster.status` (private query) + `chromeMaster.reset` (admin mutation). Spawns master Chrome on user's `:0` display with `--user-data-dir=/opt/livos/data/chrome-master/`.

**Closest analog:** `livos/packages/livinityd/source/modules/apps/native-routes.ts` (Phase 101-03 — EXACT same pattern, see lines 1-293 above).

**Router skeleton (verbatim adapt from native-routes.ts:116-165 — same `adminProcedure`/`privateProcedure` mix + `requireStore` pattern):**
```typescript
import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {spawn} from 'node:child_process'
import {access, rm} from 'node:fs/promises'

const MASTER_DIR = '/opt/livos/data/chrome-master'

export const chromeMasterRouter = router({
	/**
	 * chromeMaster.status — does the master profile have logged-in cookies?
	 * Reads /opt/livos/data/chrome-master/Default/Cookies presence; does NOT
	 * decrypt or inspect contents.
	 */
	status: privateProcedure.query(async () => {
		try {
			await access(`${MASTER_DIR}/Default/Cookies`)
			return {hasCookies: true, dir: MASTER_DIR}
		} catch {
			return {hasCookies: false, dir: MASTER_DIR}
		}
	}),

	/**
	 * chromeMaster.startLogin — spawn master Chrome on user's :0 display.
	 * Admin-only because the spawned process runs under the bruce service user
	 * and can access privileged Chrome user-data-dir.
	 *
	 * Returns {pid} so the UI can poll/wait. Chrome window appears on the
	 * physical screen; user logs in + closes normally.
	 */
	startLogin: adminProcedure.mutation(async ({ctx}) => {
		const userId = ctx.currentUser?.id
		if (!userId) throw new TRPCError({code: 'UNAUTHORIZED'})

		const args = [
			'-n', '-u', 'bruce',
			'DISPLAY=:0',
			'/usr/bin/google-chrome',
			`--user-data-dir=${MASTER_DIR}`,
			'--no-first-run',
			'--no-default-browser-check',
			'https://accounts.google.com',
		]
		const child = spawn('sudo', args, {detached: true, stdio: 'ignore'})
		child.unref?.()
		if (!child.pid) {
			throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: 'Chrome failed to start'})
		}
		ctx.logger?.log(`chromeMaster.startLogin: spawned pid=${child.pid}`)
		return {pid: child.pid}
	}),

	/**
	 * chromeMaster.reset — wipe /opt/livos/data/chrome-master/ entirely.
	 * Admin-only. Caller UI must confirm via AlertDialog before invoking.
	 */
	reset: adminProcedure.mutation(async ({ctx}) => {
		await rm(MASTER_DIR, {recursive: true, force: true})
		ctx.logger?.log('chromeMaster.reset: master profile dir cleared')
		return {ok: true}
	}),
})
```

**tRPC httpOnlyPaths registration** (per 101-PATTERNS § "tRPC HTTP-Only Path Registration"): add `chromeMaster.startLogin`, `chromeMaster.reset`, `chromeMaster.status` to `server/trpc/common.ts` `httpOnlyPaths` Set. Pattern memory says: long-lived mutations hang on disconnected WS.

**Test pattern:** mirror `native-routes` integration tests — mock `child_process.spawn` + `fs/promises.access`, assert spawn argv + admin gate.

---

### `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (REWRITE — light, default-path flip)

**Role:** The `-display :N` branch ALREADY EXISTS at vnc-bridge.ts:96-98 (Phase 100-10-01 scaffolding). Phase 102 flips the default path so calling sites that previously passed `{wid}` now pass `{display}`. The vnc-bridge module itself needs no functional change — it already supports both modes.

**Closest analog:** itself. The branch is at lines 96-103 (re-pasted from earlier read):
```typescript
const captureFlags: string[] =
	opts.display !== undefined
		? ['-display', opts.display]
		: ['-id', '0x' + (opts.wid ?? 0).toString(16)]
if (opts.display === undefined && (opts.wid === undefined || opts.wid <= 0)) {
	throw new Error(
		`vnc-bridge.spawnVncForWindow: must provide either {display} or {wid>0}...`,
	)
}
```

**Phase 102 changes:** (mostly comment + docstring updates)
- File header: drop "REVERTED in 100-10-08" language; mark `-display` branch as canonical
- Update `SpawnVncOpts` comments — `wid` becomes the DEPRECATED legacy path, `display` becomes canonical
- The `WEBAPPS_X11_ENV` import (line 24) — `WEBAPPS_X11_ENV.DISPLAY` defaults to `:1`; Phase 102 callers always pass `display` explicitly so the fallback never fires in the new path. Comment refresh only.

**Optional:** add a new helper `spawnVncForDisplay(display, rfbPort)` as a sugar wrapper that hides the legacy `wid` opt entirely — cleaner API surface for Phase 102 callers.

**Test pattern:** `vnc-bridge.test.ts` (existing). Most cases already exist; flip defaults in fixture data.

---

### `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` (MODIFIED — VncDisplayTarget defaults)

**Role:** `VncWindowTarget = {wid} | {display}` discriminated union already exists at line 54 (Phase 100-10-04). The `{display}` branch is fully implemented (lines 215-283). Phase 102 just flips defaults — when callers ask for `vnc-window` mode, the natural target is `{display}` now.

**Closest analog:** itself.

**No structural changes needed.** Wave 3 plan 102-09 (per CONTEXT line 179 "stream-manager.ts — VncDisplayTarget type variant — already partially scaffolded by Phase 100-10-08") is essentially a comment-update + doc plan. The actual work is in `window-manager.ts` (102-04) and `native-app-binder.ts` (102-05) caller switches.

**Optional:** rename `VncWindowTarget` → `VncStreamTarget` for accuracy (still backwards compatible — same shape).

---

### `livos/packages/livinityd/source/modules/webapps/window-manager.ts` close path (MODIFIED — Wave 3, 102-08)

**Role:** D-102-CLOSE-LIFECYCLE 8-step teardown:
1. Chrome SIGTERM → 2s grace → SIGKILL
2. x11vnc SIGTERM (via `streamManager.stopStream(streamId)`)
3. Xvfb SIGTERM (via `xvfbHandle.stop()`)
4. `rm -rf /tmp/livos-chrome-app-<uuid>` (via `profileSeeder.unseedProfile(uuid)`)
5. `displayAllocator.release(N)`
6. `portAllocator.release(port)` — already handled by `streamManager.stopStream` per stream-manager.ts:411
7. Remove stream window from UI (existing publish-channel emit)
8. `this.active.delete(webappId)`

**Closest analog:** itself. The current `close()` method (find via Grep "close({webappId" in window-manager.ts) already does the streamManager.stopStream + map delete; Phase 102 adds steps 1, 3, 4, 5.

**Pattern reference:** `streaming/stream-manager.ts:386-421` (vnc cascade SIGTERM with 500ms grace → resolve). Apply same pattern for Chrome and Xvfb.

**Idempotency:** every release/kill wrapped in try/catch (so re-running on already-cleaned state is no-op per D-102-CLOSE-LIFECYCLE line "all steps idempotent").

**Test pattern:** `window-manager.test.ts` extend — assert SIGTERM sequence + map cleanup.

---

### `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` close path (MODIFIED — Wave 3, 102-08)

**Role:** Native app close lifecycle (parallel to window-manager close — same 8 steps minus profile-seed cleanup since native apps don't seed):
1. Binary SIGTERM → 2s grace → SIGKILL
2. x11vnc via stream stop
3. Xvfb via `xvfbHandle.stop()`
4. (no profile cleanup)
5. `displayAllocator.release(N)`
6. `portAllocator.release(port)` (auto via stream stop)
7. Stream window removal
8. Map delete (if binder maintains one — currently routes.ts spawn returns + does NOT track)

**Closest analog:** itself + the close path being added in 102-08 to window-manager.ts. Same SIGTERM pattern.

**Caller surface:** A NEW tRPC route `apps.native.close({id})` may be needed (currently `native-routes.ts` only has spawn, no close). Add to 102-08 scope OR park for Phase 103.

**Test pattern:** `native-app-binder.test.ts` extend.

---

## Shared Patterns (Cross-Cutting, Phase 102-specific)

### Process-spawn (Xvfb, Chrome, x11vnc, native binary)

**Canonical pattern** (already used by all of `xvfb-display.ts`, `fluxbox-wm.ts`, `vnc-bridge.ts`, `native-app-spawner.ts`):

```typescript
import {spawn as nodeSpawn, type ChildProcess, type SpawnOptions} from 'node:child_process'

export type SpawnFn = (cmd: string, args: string[], opts?: SpawnOptions) => ChildProcess

const child = (opts.spawnFn ?? nodeSpawn)(cmd, args, {
	env: {...process.env, ...domainEnv, DISPLAY: display},
	detached: true,
	stdio: ['ignore', 'ignore', 'pipe'],     // pipe stderr only
})

// Stderr tail (rolling 50 lines)
const stderrTail: string[] = []
child.stderr?.on('data', (chunk: Buffer) => {
	const line = chunk.toString('utf-8').trim()
	if (!line) return
	logger?.verbose?.(`...tag... stderr: ${line}`)
	stderrTail.push(line)
	while (stderrTail.length > 50) stderrTail.shift()
})

// Non-zero exit dump
child.on('exit', (code, signal) => {
	if (code !== 0 && code !== null) {
		const tail = stderrTail.length > 0 ? `\n${stderrTail.join('\n')}` : ''
		logger?.warn(`...tag... exited code=${code} signal=${signal}${tail}`)
	}
})

try { child.unref?.() } catch { /* noop */ }
```

### Authentication (tRPC routes)

Same as Phase 101 — `adminProcedure` for mutations, `privateProcedure` for queries.

```typescript
import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
```

### Typed Errors

Subclass `Error` with `code: string`. Phase 102 introduces:
- `DisplayRangeExhaustedError` (102-01)
- `XvfbReadinessTimeoutError` (102-01)
- `MasterProfileMissingError` (102-03)
- `ChromeProcessSpawnError` (102-02) — mirror `NativeAppSpawnError`

### Validation (zod)

For `master-login-routes.ts` (none required for `startLogin`/`reset` — no input). For master profile UUID parse: `z.string().uuid()` (mirror `apps/native-routes.ts` deleteInput).

### Test Infrastructure

Same as Phase 101 (`window-manager.test.ts` primitives — `FakeChild`, factory-mock builders, `spawn = vi.fn(...)`, logger mock).

### tRPC httpOnlyPaths registration

**MUST register** (per memory pitfall):
- `chromeMaster.startLogin`
- `chromeMaster.reset`
- `chromeMaster.status` (technically a query, but include for safety)

In `livos/packages/livinityd/source/modules/server/trpc/common.ts`.

---

## Risk Notes for Planner

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Two DisplayAllocator files (existing `webapps/` + new `streaming/`) | Plan 102-01 task 1: rename existing, plan 102-04 task 1: switch import paths in window-manager.ts + livinityd/source/index.ts |
| R2 | CONTEXT typo `luse-mcp-descriptor.ts` (actual: `luse-mcp-config.ts`) | Update CONTEXT or plan 102-06 to reference correct path |
| R3 | `agent-session.ts` does NOT exist (CONTEXT mentions it implicitly via 101-PATTERNS) | Use `agent-runner-factory.ts` as the actual file (carry from 101-PATTERNS § "Files With Divergent Analog") |
| R4 | `settings/` UI directory does not exist | Plan 102-07 creates it; otherwise park under `desktop/` |
| R5 | window-manager.ts close path currently does NOT kill Xvfb (D-100-10-08 reverted that work) | Plan 102-08 must re-add Xvfb-stop + display-release calls |
| R6 | Chrome `--user-data-dir` lock contention if same uuid is seeded twice (re-open without close) | Plan 102-04 idempotency check at top of spawn already handles this; profile-seeder.ts `rm -rf` before `cp -r` is the second-line defense |
| R7 | Mini PC Xvfb concurrent-launch race | xvfb-spawner.ts readiness poll (xdpyinfo) is the gate; chrome-process-spawner waits on xvfb-spawner before firing |
| R8 | `LUSE_TARGET_WINDOW_ID` env still referenced by host-display Luse instance (non-WebApp path) | Keep `LUSE_TARGET_WINDOW_ID` read in mcp/server.ts as legacy fallback for host-display Luse; only the per-WebApp descriptor changes |
| R9 | `cp -r /opt/livos/data/chrome-master` writes performed under livinityd's PID (not bruce) — chrome may refuse to read profile owned by wrong UID | Plan 102-03 either chowns target to bruce OR runs the cp under `sudo -u bruce`. Verify with live UAT row 7 |

---

## No Analog Found

(none — all 21 mappable Phase 102 files have at least a role-match analog in the existing tree, mostly self-extends because Phase 101 already shipped)

---

## Metadata

**Analog search scope:**
- `livos/packages/livinityd/source/modules/{streaming,webapps,apps,ai,computer-use,livinity-broker,server/trpc,chrome-cdp}/`
- `livos/packages/ui/src/modules/{desktop,dock,settings}/`

**Files scanned:** ~30 source files (Read + Grep)

**Key cross-references:**
- `port-allocator.ts` (verbatim companion for `display-allocator.ts`)
- `xvfb-display.ts` (verbatim companion for `xvfb-spawner.ts`)
- `native-app-spawner.ts` (verbatim companion for `chrome-process-spawner.ts`)
- `native-routes.ts` (verbatim companion for `master-login-routes.ts`)
- `window-manager.ts` (self-rewrite — current 775-line CDP-driven file is the file 102-04 modifies in place)
- `vnc-bridge.ts` (already supports `-display :N`; just flip defaults)
- `stream-manager.ts` (already supports `{display}` target; just flip defaults)
- `agent-prompt-builder.ts` (self-extend with new `buildActiveDisplaySnippet`)
- `agent-runner-factory.ts` (self-rewrite — rename `activeWid` → `activeDisplay`)
- `mcp/server.ts` (self-rewrite — drop `LUSE_TARGET_WINDOW_ID` read for per-WebApp path, keep `LUSE_TARGET_DISPLAY`)
- `luse-mcp-config.ts` (self-rewrite — descriptor env-block swap)

**Pattern extraction date:** 2026-05-11
