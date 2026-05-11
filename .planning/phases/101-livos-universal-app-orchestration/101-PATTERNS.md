# Phase 101: LivOS Universal App Orchestration — Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 18 (16 source + 2 doc)
**Analogs found:** 16 / 16 mappable files (UAT walk doc, Wave 4, has no code analog)

> All file paths Windows-relative to `C:\Users\hello\Desktop\Projects\contabo\livinity-io\`.

---

## File Classification (Cross-Wave Summary)

| File | Wave | Role | Data Flow | Closest Analog | Match Quality | Has Test Neighbor? |
|------|------|------|-----------|----------------|---------------|--------------------|
| `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` | 1 | NEW · lifecycle/spawn | process-spawn + ready-poll | `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (`spawnVncForWindow`) | role-match (process spawn + stderr-tail + detached arg shape) | analog has `vnc-bridge.test.ts` (mocks `child_process.spawn` via factory) |
| `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` | 1 | NEW · external-protocol client wrapper | request-response (CDP commands) | `livos/packages/livinityd/source/modules/webapps/pipewire-portal.ts` (dbus client wrapper) | role-match (typed wrapper around 3rd-party protocol; `PortalUnavailable` error class) | `pipewire-portal.test.ts` (mock `requestWindowSession`) |
| `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` | 1 | NEW · utility/state | linear counter alloc/release | inline `VNC_PORT_COUNTER` in `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` lines 43–49 | exact (extract + extend with release()) | new file gets new `port-allocator.test.ts` |
| `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` | 1 | NEW · lifecycle/spawn | process-spawn + xdotool poll | `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (`spawn()` method lines 288-490) | exact (detached spawn + baseline-and-poll for new WID) | `window-manager.test.ts` (spawn-factory mock + FakeChild EventEmitter pattern) |
| `livos/packages/livinityd/source/index.ts` | 1 | MODIFIED · wire-up | constructor-injection | self (existing `streamManager`/`webappWindowManager` wire at lines 388-470) | exact | n/a (wire-up only) |
| `livos/packages/livinityd/source/modules/webapps/window-manager.ts` | 2 | REWRITE · orchestrator | process-spawn → CDP call | itself (current `--app=URL` argv path at lines 363-407 to be replaced) | self-rewrite | `window-manager.test.ts` (extend) |
| `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` | 2 | NEW · poller | xdotool poll → port bind | `livos/packages/livinityd/source/modules/webapps/window-discovery.ts` (`findNewWindowMatching` w/ baseline-diff) — combined with port-allocator from 101-02 | role-match (poll + diff against baseline Set<number>) | `window-discovery.test.ts` |
| `livos/packages/livinityd/source/modules/ai/agent-session.ts` | 2 | MODIFIED (FILE DOES NOT EXIST — treat as NEW or extend `agent-runs.ts`) · WebSocket envelope | request-response + relay | `livos/packages/livinityd/source/modules/ai/index.ts` `chatStream()` lines 717-780 (HTTP-SSE forward) **AND** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` lines 64-110 (body builder with `webappId` pass-through) | role-match (envelope-extension pattern) | `agent-runs.test.ts` |
| `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` | 2 | NEW · pure transform | string template | `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (template string with runtime substitutions) | role-match (verbatim string template pattern) | new `agent-prompt-builder.test.ts` |
| `livos/packages/ui/src/modules/dock/native-app-form.tsx` | 3 | NEW · form component | request-response (mutation) | `livos/packages/ui/src/modules/desktop/add-webapp-dialog.tsx` | role-match (Dialog + Input + trpc mutation + zod-style validation) | new unit test (jsdom + RTL) |
| `livos/packages/ui/src/modules/dock/native-app-icon.tsx` | 3 | NEW · icon component | event (click → launch) | `livos/packages/ui/src/modules/desktop/webapp-icon.tsx` | exact (wraps `<AppIcon>` + ContextMenu + AlertDialog) | new unit test |
| `livos/packages/livinityd/source/modules/webapps/teach-recorder.ts` | 3 | REWRITE (currently lives in UI as `livos/packages/ui/src/hooks/use-teach-recorder.ts`; CONTEXT places NEW file under livinityd OR repurpose UI hook) | event-driven | itself / `livos/packages/ui/src/hooks/use-teach-recorder.ts` (interval heartbeat at 1Hz → drop) | self-rewrite | `use-teach-recorder.unit.test.tsx` |
| `livos/packages/ui/src/modules/window/teach-popover.tsx` | 3 | NEW · popover/overlay | event-driven (anchor at click point) | `livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.tsx` (Sonner toast emitter — replace with Radix popover anchored at coords) | role-match | new unit test |
| `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts` | 3 | MODIFIED · v3 replay path | request-response (tool dispatch) | itself (v2 path lines 82-200 has lazy-translation shim already from D-100-10-I — extend for v3) | self-extend | `skill-replay-tool.test.ts` |
| `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` | 3 | MODIFIED · thinking dots placement | event-driven (animation) | itself (lines 452-457 already has single-pulse-dot; replace with 3 staggered dots) | self-extend | `webapp-floating-action-bar.test.tsx` |
| `livos/packages/ui/src/modules/window/webapp-chat-bottom-bar.tsx` | 3 | MODIFIED · idle pulse (DEPRECATED FILE per file's own header — actual chat input now lives inline in `webapp-floating-action-bar.tsx` `ChatInputBar`) | event-driven (CSS animation) | itself (line 90 — currently DEPRECATED stub) OR `webapp-floating-action-bar.tsx` `ChatInputBar` | divergent — see Risk note below | n/a (DEPRECATED) |
| `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` | 2 (Pillar F) | MODIFIED · pass-through extension | request-response | itself (existing `webappId` pass-through at lines 94-101 is the analog for new `activeWid + activeAppMeta` fields) | self-extend | (no dedicated unit test) |

### Cross-Wave No-Analog (UAT-walk)

| File | Role | Notes |
|------|------|-------|
| `.planning/phases/101-livos-universal-app-orchestration/UAT-CHECKLIST.md` | doc | Standard GSD UAT checklist — use `.planning/phases/100-multi-stream-window-redesign/UAT-CHECKLIST.md` as template |

---

## Wave 1 — Foundation (3 plans, parallel)

### `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` (NEW)

**Role:** lifecycle / process-spawn + readiness-poll. Spawns one Chrome with `--remote-debugging-port=9222` at livinityd boot and waits until `/json/version` returns 200.

**Closest analog:** `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (function `spawnVncForWindow`, lines 87-160).
**Why:** Both spawn a long-lived process via `node:child_process.spawn`, capture stderr-tail for diagnostics, and expose a `ChildProcess` to a higher-level lifecycle owner. vnc-bridge is the closest existing pattern for "spawn external binary, return handle, no idempotency on the spawner itself."

**Imports + factory-injection pattern** (vnc-bridge.ts:21-44):
```typescript
import {spawn as nodeSpawn, type ChildProcess, type SpawnOptions} from 'node:child_process'

export type VncBridgeLogger = {
	info: (msg: string, ...args: unknown[]) => void
	warn: (msg: string, ...args: unknown[]) => void
	error: (msg: string, ...args: unknown[]) => void
	verbose?: (msg: string, ...args: unknown[]) => void
}

export type VncSpawnFactory = (
	cmd: string,
	args: string[],
	options?: SpawnOptions,
) => ChildProcess
```

**Stderr-tail diagnostic pattern** (vnc-bridge.ts:132-157):
```typescript
const stderrTail: string[] = []
proc.stderr?.on('data', (chunk: Buffer) => {
	const line = chunk.toString('utf-8').trim()
	if (!line) return
	opts.logger?.verbose?.(`x11vnc[${logTag}] stderr: ${line}`)
	stderrTail.push(line)
	if (stderrTail.length > 50) stderrTail.shift()
})

proc.on('exit', (code, signal) => {
	if (code !== 0 && code !== null) {
		const tailMsg = stderrTail.length > 0
			? `\n--- x11vnc stderr (last ${stderrTail.length}) ---\n${stderrTail.join('\n')}`
			: ' (no stderr captured)'
		opts.logger?.error(
			`x11vnc[${logTag}] crashed (code=${code} signal=${signal} argv=${JSON.stringify(args)})${tailMsg}`,
		)
	}
})
```
Copy this exact shape for Chrome's stderr-tail. The bootstrap then adds a readiness-poll loop (RESEARCH.md Pattern 2 lines 397-455) on top of the spawn. The `fetchFn` injection mirrors `spawnFactory` injection.

**Test pattern:** see `vnc-bridge.test.ts` + `window-manager.test.ts` lines 31-33 — `class FakeChild extends EventEmitter { unref = vi.fn() }` is the canonical fake-child shape.

---

### `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` (NEW)

**Role:** typed wrapper around the `chrome-remote-interface` 3rd-party library, exposing high-level `createWindowForUrl`, `minimizeWindow`, `closeTarget` methods.

**Closest analog:** `livos/packages/livinityd/source/modules/webapps/pipewire-portal.ts` (D-Bus portal wrapper).
**Why:** Both wrap a 3rd-party external-protocol client, expose typed result shapes (`WindowSessionResult`), and throw typed error classes (`PortalUnavailable`) on protocol failure. Same shape applies to CDP-connect-failure handling.

**Typed-error class pattern** (window-manager.ts:80-92):
```typescript
export class WebappCapExceededError extends Error {
	code = 'TOO_MANY_WEBAPPS'
	constructor(public limit: number) {
		super(`webapp cap exceeded (limit ${limit})`)
	}
}

export class WindowNotFoundError extends Error {
	code = 'WINDOW_NOT_FOUND'
	constructor(public url: string) {
		super(`no new window matching ${url} appeared within timeout`)
	}
}
```
Use this exact shape for `CdpDisconnectedError`, `CdpTimeoutError`, etc.

**Concrete CDP client surface** (RESEARCH.md Pattern 1 lines 295-394 — copy verbatim, it's already cited from `chrome-remote-interface` docs).

**Test mock pattern** (from RESEARCH.md line 1292): wrap `CDP()` call site behind a single factory `cdpFactory`; inject a mock client returning fake `Target.*` and `Browser.*` namespaces.

---

### `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` (NEW)

**Role:** utility/state — linear port allocator over `[15900, 16000)` with explicit `releasePort()`.

**Closest analog:** EXACT — extract the existing in-place `VNC_PORT_COUNTER` from `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` lines 43-49.

**Exact code to extract + extend** (stream-manager.ts:40-49):
```typescript
// Phase 99 — VNC rfbPort allocator. In-process counter; LivOS-private
// range [15900, 16100). Bind race covered by attachVncBridge's 3×100ms
// retry (Pitfall 4 mitigation in vnc-bridge.ts).
let VNC_PORT_COUNTER = 15900
function allocateVncPort(): number {
	const port = VNC_PORT_COUNTER
	VNC_PORT_COUNTER += 1
	if (VNC_PORT_COUNTER >= 16100) VNC_PORT_COUNTER = 15900
	return port
}
```

**Pattern adjustment:** wrap as a class for `releasePort()` symmetry per D-101-PORT-ALLOC, with `Set<number>` of in-use ports for the release path:
```typescript
export class PortAllocator {
	private next: number
	private inUse = new Set<number>()
	constructor(private readonly range: {min: number; max: number} = {min: 15900, max: 16000}) {
		this.next = range.min
	}
	allocate(): number { /* skip-while inUse.has(this.next), bump, wrap */ }
	release(port: number): void { this.inUse.delete(port) }
}
```
StreamManager (line 388 wire) becomes the sole consumer.

**Test pattern:** vitest pure-function — no mocks. Range exhaustion + wrap + double-release safety.

---

### `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` (NEW)

**Role:** spawn arbitrary Ubuntu binary detached with `DISPLAY=:1`, return `{pid, child}`. Window-discovery is delegated to `native-app-binder.ts` (Wave 2).

**Closest analog:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (`spawn()` method lines 363-407 — the detached-spawn block).
**Why:** Same `child_process.spawn` shape with `detached: true`, `stdio: 'ignore'`, then `child.unref()`. Same env-injection pattern (`{...process.env, DISPLAY: ':1'}`).

**Imports** (window-manager.ts:30-46):
```typescript
import {URL} from 'node:url'
import {randomUUID} from 'node:crypto'
import type {ChildProcess} from 'node:child_process'

import type {StreamManager} from '../streaming/stream-manager.js'
import {
	snapshotWindowIds,
	findNewWindowMatching,
	WEBAPPS_X11_ENV,
	type WindowInfo,
} from '../webapps/window-discovery.js'
```

**Detached-spawn pattern** (window-manager.ts:380-407):
```typescript
const chromeArgs = [
	'-n', '-u', chromeUser,
	`DISPLAY=${chromeDisplay}`,
	this.chromeBinary,
	`--user-data-dir=${chromeProfile}`,
	'--window-size=1280,720',
	`--app=${opts.url}`,
]
const chromeProc = this.spawnFactory('sudo', chromeArgs, {
	detached: true,
	stdio: 'ignore',
	env: {...process.env, ...WEBAPPS_X11_ENV, DISPLAY: chromeDisplay},
})
try { chromeProc.unref?.() } catch { /* noop */ }
```

**Baseline-and-poll for new WID** — pattern lives in `window-discovery.ts` (`snapshotWindowIds` + `findNewWindowMatching`). For native-app spawner the WID-poll is delegated to native-app-binder.ts. RESEARCH.md Pattern 4 lines 555-608 has the verbatim `xdotool search --class` poll with 5s deadline.

**Security note:** spawner must validate `binaryPath` is absolute, reject `LD_*`/`DYLD_*` env keys (RESEARCH.md §Security Domain lines 1379-1391). Use zod schema with `.refine()`.

**Test pattern:** `window-manager.test.ts` lines 31-33 + 99 — `FakeChild extends EventEmitter` + `spawn = vi.fn(() => new FakeChild())`.

---

### `livos/packages/livinityd/source/index.ts` (MODIFIED — wire-up)

**Role:** Construct + start the three new singletons (chromeCdpBootstrap, chromeCdpClient, portAllocator) and wire them into the existing `webappWindowManager` constructor.

**Self-analog: existing pattern at lines 388-470**:
```typescript
this.streamManager = new StreamManager({
	caps,
	spawn: x11Spawn,
	logger: streamingLogger,
})
streamingLogger.info(`StreamManager started (cap=${this.streamManager.getCap()})`)
// ...
const webappMcpConfigManager = new McpConfigManager(this.ai.redis)
const luseServerPath = process.env.LUSE_MCP_SERVER_PATH ?? DEFAULT_LUSE_MCP_SERVER_PATH
const displayAllocator = createDisplayAllocator()
this.webappWindowManager = new WebAppWindowManager({
	streamManager: this.streamManager,
	spawn: x11Spawn as unknown as ConstructorParameters<typeof WebAppWindowManager>[0]['spawn'],
	logger: webappLogger,
	mcpConfigManager: webappMcpConfigManager,
	luseServerPath,
	luseMcpEnv: process.env,
	displayAllocator,
})
this.webappWindowManager.startIdleCleanup()
```

**New additions (Phase 101):** between the StreamManager `info` log and the `webappMcpConfigManager` line, insert:
```typescript
// Phase 101-01 — Chrome CDP boot
this.chromeCdpClient = new ChromeCdpClient({logger: chromeCdpLogger})
const {pid: chromePid} = await bootstrapChrome({display: ':1', logger: chromeCdpLogger})
await this.chromeCdpClient.connect()
chromeCdpLogger.info(`Chrome CDP bootstrap complete (pid=${chromePid})`)

// Phase 101-02 — Port allocator
this.streamPortAllocator = new PortAllocator()
```
Then pass `chromeCdpClient` + `streamPortAllocator` into `WebAppWindowManager` constructor opts.

**Non-fatal-degrade pattern** (index.ts:474-482):
```typescript
} catch (err) {
	this.logger.error(
		'Failed to start streaming subsystem / WebAppWindowManager',
		err,
	)
}
```
Wrap Chrome CDP boot in the same try/catch — failure here should NOT kill livinityd boot (degenerate UX, not data-loss).

---

## Wave 2 — Wire-up (3 plans, parallel)

### `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (REWRITE — spawn() body)

**Role:** Replace the `--app=URL` argv path inside `spawn()` (lines 363-407) with a CDP call to the booted Chrome.

**Closest analog:** itself. The surrounding scaffolding (idempotency check, cascade-offset computation, MCP-config registration, broadcastActiveWid, stream-start, map insertion) at lines 288-490 stays unchanged. Only the spawn block itself changes.

**Today's spawn block (DELETE — lines 363-407):**
```typescript
const chromeUser = process.env.LIVOS_CHROME_USER ?? 'bruce'
const chromeProfile = process.env.LIVOS_CHROME_PROFILE ?? '/home/bruce/.config/livos-chrome'
const chromeArgs = [
	'-n', '-u', chromeUser,
	`DISPLAY=${chromeDisplay}`,
	this.chromeBinary,
	`--user-data-dir=${chromeProfile}`,
	'--window-size=1280,720',
	`--window-position=${cascadeWindowPosition}`,
	`--app=${opts.url}`,
]
const chromeProc = this.spawnFactory('sudo', chromeArgs, {
	detached: true, stdio: 'ignore',
	env: {...process.env, ...WEBAPPS_X11_ENV, DISPLAY: chromeDisplay},
})
try { chromeProc.unref?.() } catch { /* noop */ }

// Find new window matching hostname → page title (D-93-08)
const titleHints: string[] = []
try { titleHints.push(new URL(opts.url).hostname) } catch { /* */ }
if (opts.expectedTitle) titleHints.push(opts.expectedTitle)
const newWin = await this.discovery.findNewWindowMatching({
	titleHints, baselineWids, timeoutMs: this.titleTimeoutMs,
})
if (!newWin) throw new WindowNotFoundError(opts.url)
```

**Replacement (CDP-driven — D-101-CDP-SPAWN):**
```typescript
// Phase 101-04 — CDP-driven window creation. Replaces --app=URL argv path.
// Chrome process is already running (101-01 bootstrap); we send commands
// over CDP. WID extraction via Browser.getWindowForTarget eliminates the
// xdotool poll race (D-101-CDP-SPAWN).
const {targetId, windowId: cdpWindowId} = await this.chromeCdpClient.createWindowForUrl(opts.url, {
	width: 1280,
	height: 720,
	left: cascadeOffsetX,
	top: cascadeOffsetY,
})
// CDP windowId is browser-internal; we still need the X11 wid for x11vnc.
// Use Target.getTargets + Browser.getWindowForTarget cross-reference, then
// xdotool baseline-diff filtered by Chrome PID for the X11 wid.
const newWin = await this.discovery.findNewWindowMatching({
	titleHints: [new URL(opts.url).hostname],
	baselineWids,
	timeoutMs: this.titleTimeoutMs,
})
if (!newWin) throw new WindowNotFoundError(opts.url)
// Stash the targetId on the entry for clean close() via CDP later.
```

**Test extension:** `window-manager.test.ts` adds a mock `chromeCdpClient` (mirror of `streamManager` mock at lines 35-51) returning `{targetId: 'tgt-1', windowId: 1}`.

---

### `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` (NEW)

**Role:** Poll xdotool for a new window matching a native app's WM_CLASS, baseline-diff against a snapshot taken before spawn, return the new wid. Bind to a fresh stream port from `PortAllocator`.

**Closest analog:** `livos/packages/livinityd/source/modules/webapps/window-discovery.ts` (`findNewWindowMatching` baseline-diff).

**Verbatim pattern from RESEARCH.md Pattern 4 lines 555-608:**
```typescript
import {spawn} from 'node:child_process'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const execFileP = promisify(execFile)

export async function spawnNativeApp(cfg: NativeAppConfig, opts: {display: string; logger?: any}): Promise<{wid: number; pid: number}> {
	// 1. Baseline current window IDs on the display
	const baseline = await snapshotWindowIds(opts.display)
	// 2. Detached spawn (delegated to native-app-spawner.ts)
	// 3. Poll xdotool for a NEW window matching WM_CLASS hint, up to 5s
	const wmClass = cfg.wmClassHint ?? inferWmClass(cfg.binaryPath)
	const deadline = Date.now() + 5000
	while (Date.now() < deadline) {
		try {
			const {stdout} = await execFileP('xdotool', ['search', '--onlyvisible', '--class', wmClass], {env: {DISPLAY: opts.display}})
			const wids = stdout.trim().split('\n').filter(Boolean).map((s) => parseInt(s, 10))
			const newWid = wids.find((w) => !baseline.has(w))
			if (newWid !== undefined) return {wid: newWid, pid: child.pid!}
		} catch {
			// xdotool returns non-zero when no match — keep polling
		}
		await new Promise((r) => setTimeout(r, 100))
	}
	throw new Error('NATIVE_APP_WINDOW_NOT_FOUND')
}
```

**Test mock pattern:** inject `execFileFn` opt that returns `Promise<{stdout, stderr}>` (RESEARCH.md line 1293). Mirror `input-dispatcher.ts` style.

---

### `livos/packages/livinityd/source/modules/ai/agent-session.ts` (MODIFIED — but file does NOT exist)

**Critical note:** No file named `agent-session.ts` exists today in `livos/packages/livinityd/source/modules/ai/`. The actual chat-WebSocket envelope handler lives in TWO places:
1. `livos/packages/livinityd/source/modules/ai/index.ts` `chatStream()` lines 717-780 (HTTP-SSE forward to liv `/api/agent/stream`, builds the body with `{task, max_turns, conversationId, userPersonalization}`).
2. `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` lines 64-110 (the broker path, already has `webappId` pass-through as the exact pattern Phase 101 extends).

**Recommendation to planner:** treat the CONTEXT reference as "the body-builder for the per-WebApp agent path." The closest analog AND the file to actually modify is `agent-runner-factory.ts`. Optionally create a new helper `agent-session.ts` that extracts the envelope-extension logic.

**Exact analog code** (`agent-runner-factory.ts` lines 81-102 — pass-through pattern already proven for `webappId`):
```typescript
export async function* createSdkAgentRunnerForUser(opts: {
	livinityd: Livinityd
	userId: string
	task: string
	contextPrefix?: string
	systemPromptOverride?: string
	maxTurns?: number
	signal?: AbortSignal
	/**
	 * Phase 100-08-05 — scopes the agent loop's MCP tools to
	 * the matching `luse:webapp:<webappId>` MCP child.
	 */
	webappId?: string
}): AsyncGenerator<AgentEvent, AgentResult, void> {
	const body = {
		task,
		max_turns: maxTurns,
		conversationId: `broker-${userId}-${Date.now()}`,
		contextPrefix,
		systemPromptOverride,
		// Phase 100-08-05 — pass-through webappId for chat-surface tool scope.
		...(opts.webappId ? {webappId: opts.webappId} : {}),
	}
	// ... fetch + SSE parse loop unchanged
}
```

**Phase 101 extension:** add `activeWid?: number` and `activeAppMeta?: {appId, kind, url?, binary?, title}` to the opts; pass-through the same shape; receive them at the WS-start envelope on the UI side via `use-agent-socket.ts` lines 535-545 (already builds `payload` with optional fields exactly this way):
```typescript
const payload: Record<string, unknown> = {type: 'start', prompt}
if (currentSessionId) payload.sessionId = currentSessionId
if (model) payload.model = model
if (conversationIdRef.current) payload.conversationId = conversationIdRef.current
if (attachments?.length) payload.attachments = attachments
if (opts.webappId) payload.webappId = opts.webappId
// Phase 101-06 NEW:
// if (opts.activeWid) payload.activeWid = opts.activeWid
// if (opts.activeAppMeta) payload.activeAppMeta = opts.activeAppMeta
ws.send(JSON.stringify(payload))
```

**Security validation** (RESEARCH.md §Security line 1380): server-side validate that the `activeWid` belongs to a window OWNED by the requesting userId (cross-reference `window-manager.list({userId})`).

**Test pattern:** `agent-runs.test.ts` (existing). Mock the SSE forward + assert the body sent to liv contains `activeWid` + `activeAppMeta`.

---

### `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (NEW)

**Role:** Pure-function builder that produces an "Active Window Context" markdown snippet to inject into the agent system prompt.

**Closest analog:** `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (exported `LUSE_SYSTEM_PROMPT` template string with runtime substitutions).

**Pattern from luse-system-prompt.ts:44-47:**
```typescript
export const LUSE_SYSTEM_PROMPT: string = `
You are Liv, a highly-reliable AI engineer operating a virtual computer whose display measures 1280 x 960 pixels.

The current date is ${new Date().toLocaleDateString()}. The current time is ${new Date().toLocaleTimeString()}. The current timezone is ${Intl.DateTimeFormat().resolvedOptions().timeZone}.
...
`
```

**Phase 101 new builder (pure function, NOT a top-level template):**
```typescript
export function buildActiveWindowSnippet(input: {
	activeWid: number
	appMeta: {appId: string; kind: 'webapp' | 'native'; url?: string; binary?: string; title: string}
}): string {
	return `
## Active Window Context
You are operating in the context of the LivOS app: ${input.appMeta.title} (${input.appMeta.kind}).
Window ID: ${input.activeWid}
URL/Binary: ${input.appMeta.url ?? input.appMeta.binary ?? '(unknown)'}
Default LUSE_TARGET_WINDOW_ID for all your tool calls is ${input.activeWid} unless you override explicitly.
`.trim()
}
```

**Test pattern:** pure vitest — no mocks. Snapshot + edge cases (missing fields, special chars).

---

## Wave 3 — UI + Backend bridge (3 plans, parallel)

### `livos/packages/ui/src/modules/dock/native-app-form.tsx` (NEW)

**Role:** Form dialog for adding a new native app config — fields `{name, iconUrl, binaryPath, args[], env{}}`.

**Closest analog:** `livos/packages/ui/src/modules/desktop/add-webapp-dialog.tsx` (lines 1-110).
**Why:** Same `<Dialog>` + `<Input>` + tRPC mutation + zod-like local validation shape. Same `useDebounce` pattern can preview the inferred WM_CLASS from binaryPath.

**Imports** (add-webapp-dialog.tsx:17-29):
```typescript
import {useEffect, useMemo, useRef, useState} from 'react'
import {useDebounce} from 'react-use'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
```

**Validation pattern** (add-webapp-dialog.tsx:33-47):
```typescript
function validateUrl(raw: string): {ok: true; url: string} | {ok: false; reason: string} {
	const trimmed = raw.trim()
	if (!trimmed) return {ok: false, reason: ''}
	if (!URL_PROTO_RE.test(trimmed)) {
		return {ok: false, reason: 'URL must start with http:// or https://'}
	}
	try {
		const parsed = new URL(trimmed)
		if (!parsed.hostname) return {ok: false, reason: 'URL must include a hostname'}
		return {ok: true, url: trimmed}
	} catch {
		return {ok: false, reason: 'Could not parse URL'}
	}
}
```
Adapt for `binaryPath`: must be absolute (start with `/`), must not be `/bin/sh` or contain `;`, `&`, etc. Apply RESEARCH.md §Security checklist line 1388-1389.

**Mutation pattern** (add-webapp-dialog.tsx:60-62):
```typescript
const utils = trpcReact.useUtils()
const createMut = trpcReact.webapp.create.useMutation()
```
Replace with `trpcReact.apps.native.create.useMutation()`.

---

### `livos/packages/ui/src/modules/dock/native-app-icon.tsx` (NEW)

**Role:** Dock icon for a native app, click → spawn, right-click → Remove. Visually identical to WebAppIcon.

**Closest analog:** `livos/packages/ui/src/modules/desktop/webapp-icon.tsx` (entire 117-line file is the verbatim shape).
**Why:** Exact match — wraps `<AppIcon>` with `<ContextMenu>` + `<AlertDialog>` for Remove. Just swap launch hook + delete mutation.

**Full pattern** (webapp-icon.tsx:52-117):
```typescript
export function WebAppIcon({id, url, title, faviconUrl}: WebAppIconProps) {
	const launch = useLaunchWebApp()
	const utils = trpcReact.useUtils()
	const deleteMut = trpcReact.webapp.delete.useMutation()
	const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
	const label = title?.trim() || hostnameOrUrl(url)
	const iconSrc = faviconUrl || ''
	const handleClick = launch({id, url, title: label, iconUrl: iconSrc})
	const handleRemove = async () => {
		try {
			await deleteMut.mutateAsync({id})
			await utils.webapp.list.invalidate()
		} finally {
			setShowRemoveConfirm(false)
		}
	}
	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger className='group'>
					<AppIcon label={label} src={iconSrc} onClick={handleClick} state='ready' />
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem
						className={contextMenuClasses.item.rootDestructive}
						onSelect={() => setShowRemoveConfirm(true)}
					>
						Remove WebApp
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
				{/* ... AlertDialogContent identical shape ... */}
			</AlertDialog>
		</>
	)
}
```
Swap: `useLaunchWebApp` → `useLaunchNativeApp` (new hook), `trpcReact.webapp.delete` → `trpcReact.apps.native.delete`, `utils.webapp.list` → `utils.apps.native.list`. Label "Remove WebApp" → "Remove Native App".

---

### `livos/packages/livinityd/source/modules/webapps/teach-recorder.ts` (REWRITE)

**Critical note:** No file exists today at that exact path. The current recorder is the UI hook `livos/packages/ui/src/hooks/use-teach-recorder.ts` (531 lines, interval-driven). The CONTEXT places the new `teach-recorder.ts` in livinityd backend.

**Closest analog:** `livos/packages/ui/src/hooks/use-teach-recorder.ts` (the file to be repurposed/rewritten) + RESEARCH.md Pattern 3 lines 457-553 (the SelfClaude DOM-listener verbatim port).

**Pattern to DELETE — interval heartbeat** (use-teach-recorder.ts: per file docstring lines 6-19):
> "Starts a 1Hz heartbeat that emits {type:'wait', durationMs:1000}."

**Pattern to KEEP — discriminated-union event types** (use-teach-recorder.ts:36-101):
```typescript
export type ActionEventClick = {
	type: 'click'
	button: 'left' | 'middle' | 'right'
	coords: {x: number; y: number}
	ts: number
	screenshotRef: string
	screenshot_b64?: string
	viewport?: {w: number; h: number}
}
export type ActionEventKey = { /* ... */ }
export type ActionEvent = ActionEventClick | ActionEventKey | ActionEventWheel | ActionEventScroll | ActionEventWait
```
Phase 101 adds `version: 3` and a new `ActionStepWithInstruction = ActionEvent & {instruction: string; screenshot_before: string; screenshot_after: string}`.

**New rewrite pattern — DOM listener (RESEARCH.md Pattern 3 lines 510-530):**
```typescript
function pushClick(ev: MouseEvent) {
	if (!active) return
	const canvas = active.canvas
	const rect = canvas.getBoundingClientRect()
	if (!rect.width || !rect.height) return
	const scaleX = canvas.width / rect.width
	const scaleY = canvas.height / rect.height
	const x = Math.max(0, Math.min(canvas.width - 1, Math.round(ev.offsetX * scaleX)))
	const y = Math.max(0, Math.min(canvas.height - 1, Math.round(ev.offsetY * scaleY)))
	let button: 1 | 2 | 3
	if (ev.button === 0) button = 1
	else if (ev.button === 2) button = 3
	else button = 2
	active.events.push({type: 'click', button, x, y, ts: Date.now()})
	if (active.onAfterClick) {
		const cb = active.onAfterClick
		setTimeout(() => {
			try { cb({x, y, button}) } catch (e) { console.error('[teach-recorder] onAfterClick threw', e) }
		}, 100)
	}
}
```

**v2 backwards-compat** (already present in `skill-replay-tool.ts:82-200` via D-100-10-I lazy-translation shim) — same lazy-upgrade pattern for v3.

**Test pattern:** `use-teach-recorder.unit.test.tsx` (existing source-text invariants, no RTL per D-NO-NEW-DEPS).

---

### `livos/packages/ui/src/modules/window/teach-popover.tsx` (NEW)

**Role:** Radix popover anchored at click `(x, y)` with text input "Bu adımı ne için yapıyorsun?" + Save button.

**Closest analog:** `livos/packages/ui/src/modules/window/app-contents/webapp-teach-popup-host.tsx` (Sonner toast emitter). The Sonner pattern needs REPLACEMENT — Phase 101 wants a Radix popover anchored at click coords, not a top-right toast.

**Today's analog (REPLACE):** webapp-teach-popup-host.tsx:47-74 (Sonner toast fire-and-forget). Phase 101 needs persistent popover that blocks until user types + Save.

**Pattern from RESEARCH.md §4 Code Examples lines 1062-1083 (Radix popover anchored to arbitrary x,y):**
The RESEARCH file has the verbatim Radix popover code. Use `<Popover.Anchor>` with manual transform + `<Popover.Content>` for the input + Save button.

**Subscription model — events stream from backend WS** (mirrors webapp-teach-popup-host.tsx:25-30 props):
```typescript
export interface WebAppTeachPopupHostProps {
	isRecording: boolean
	events: readonly ActionEvent[]
	/** Monotonic counter — fires effect on each new event without deep-equality on `events`. */
	eventCount: number
}
```
Phase 101 extends with `pendingStep: {x, y, draftId} | null` and `onCommit(instruction: string): void`.

**Test pattern:** jsdom + RTL component test (already standard in this package per RESEARCH.md line 1297).

---

### `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts` (MODIFIED)

**Role:** Add v3 replay branch alongside the existing v1/v2 path.

**Self-analog: the lazy-translation shim already in place** (skill-replay-tool.ts:82-100 — D-100-10-I bytebot→luse tool-name translation):
```typescript
/**
 * Phase 100-10-02 — Backwards-compat shim for legacy bytebot tool names in
 * action_log records (D-100-10-I).
 * ...
 * Behavior:
 *   - skillVersion <= 2  → translate every event whose `tool` starts with
 *                          `mcp__bytebot__` to `mcp__luse__`.
 *   - skillVersion >  2  → pass through unchanged (post-rename writes already
 *                          use `mcp__luse__`; no double-translation).
 *   - events without a `tool` field are pass-through in both branches.
 */
```
Apply this exact shape for v3: `skillVersion === 3 → new path using step.action + step.instruction; skillVersion <= 2 → existing path with lazy translation`.

**Test pattern:** `skill-replay-tool.test.ts` (existing). Extend with v3 fixtures.

---

### `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` (MODIFIED — thinking dots)

**Role:** Replace single-pulse-dot with 3 staggered-pulse dots when `isStreaming && !lastAssistantMessage`.

**Self-analog: current single-dot pattern** (webapp-floating-action-bar.tsx:452-457):
```typescript
{agent.isStreaming && (agent.agentStatus?.phrase || agent.agentStatus?.currentTool) ? (
	<div className='text-caption-xs text-text-tertiary flex items-center gap-1.5'>
		<span className='inline-block w-1 h-1 rounded-full bg-text-tertiary animate-pulse' aria-hidden='true' />
		<span>{agent.agentStatus.phrase ?? `Using ${agent.agentStatus.currentTool}…`}</span>
	</div>
) : null}
```

**Replacement (D-101-CHAT-ANIMS pattern from CONTEXT lines 122-129):**
```tsx
<span className='inline-flex gap-1'>
	<span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:0ms]' />
	<span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:150ms]' />
	<span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:300ms]' />
</span>
```

**Gating logic** (CONTEXT line 122): `isStreaming && messages.length === lastSentCount` (user sent but no response token yet).

**Pillar F backend bridge (Hermes phrase relay)** — separate concern. Today the chat WS does NOT carry status_detail (file's own comment lines 540-543 confirm: "agent-session.ts doesn't relay runStore status_detail"). Plan 101-09 task 1 grep verify in liv-core RunStore per RESEARCH.md R7.

**Test pattern:** existing `webapp-floating-action-bar.test.tsx` (extend with snapshot test for 3-dot DOM).

---

### `livos/packages/ui/src/modules/window/webapp-chat-bottom-bar.tsx` (MODIFIED — idle pulse)

**Critical caveat:** This file is **DEPRECATED** per its own header comment (lines 1-13):
> "DEPRECATED 2026-05-10 (P100-09-08): persistent inline chat bar removed. The action bar (webapp-floating-action-bar.tsx) now transforms to a chat input row on Chat icon click..."

**Recommendation to planner:** Do NOT modify `webapp-chat-bottom-bar.tsx`. The actual chat input lives inline in `webapp-floating-action-bar.tsx` `ChatInputBar` component. Apply the idle-pulse animation to `ChatInputBar` instead.

**Idle pulse CSS pattern (D-101-CHAT-ANIMS from CONTEXT line 131):**
```css
@keyframes idleBreath {
	0%, 100% { opacity: 0.3; }
	50% { opacity: 0.8; }
}
.chat-input-idle {
	animation: idleBreath 4s ease-in-out infinite;
}
```
Apply to the input's border when `!isFocused && value === '' && !isStreaming`.

---

## Shared Patterns (Cross-Cutting)

### Authentication
**Source:** `livos/packages/livinityd/source/modules/server/trpc/trpc.js` (`privateProcedure`, `adminProcedure`)
**Apply to:** All new tRPC routes (`apps.native.{list,create,delete}`, `webapp.teach.*`, etc.)

**Pattern** (apps/routes.ts:3):
```typescript
import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'

export const apps = router({
	list: privateProcedure.query(async ({ctx}) => { /* ctx.currentUser.id available */ }),
	create: adminProcedure
		.input(z.object({ /* zod schema */ }))
		.mutation(async ({ctx, input}) => { /* admin-only per RESEARCH §Security */ }),
})
```

### Error Handling
**Source:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts` lines 80-92 (typed Error subclasses with `code` field)
**Apply to:** All new domain modules (`ChromeCdpClient`, `NativeAppSpawner`, etc.)

**Pattern:** subclass `Error`, add a `code: string` field, throw early, let caller map to `TRPCError` at the route boundary.

### Validation
**Source:** zod inline schemas at the tRPC route boundary (apps/routes.ts:21, skills-router.ts:42-50)
**Apply to:** All new tRPC mutation inputs.

**Security extension for native-app routes (RESEARCH.md §Security lines 1386-1391):**
```typescript
const nativeAppConfigSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(64),
	binaryPath: z.string().regex(/^\/[a-zA-Z0-9_\-./]+$/, 'must be absolute path'),
	args: z.array(z.string()).max(32).optional(),
	env: z.record(z.string()).optional().refine(
		(env) => !env || !Object.keys(env).some((k) => /^(LD_|DYLD_)/.test(k)),
		{message: 'LD_* and DYLD_* env keys not allowed'},
	),
	wmClassHint: z.string().regex(/^[\w-]{1,64}$/).optional(),
})
```

### Process Spawn
**Source:** `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` (`spawnVncForWindow`)
**Apply to:** `chrome-cdp/bootstrap.ts`, `apps/native-app-spawner.ts`

**Canonical pattern:**
- Accept `spawnFactory: VncSpawnFactory` opt (default `nodeSpawn`) — tests inject `FakeChild`
- Pin `stdio: ['ignore', 'ignore', 'pipe']` so stderr can be tailed
- Stderr-tail at 50 lines, dumped on non-zero exit
- `env: {...process.env, ...DOMAIN_X11_ENV, DISPLAY: ':1'}`

### Test Infrastructure
**Source:** `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` (lines 31-51 + 99-122)
**Apply to:** All new module tests in livinityd.

**Pattern primitives:**
1. `class FakeChild extends EventEmitter { unref = vi.fn() }` for `ChildProcess` mocks
2. Factory-mock builders: `makeStreamManager() → {streamManager, started, stopped}` returning a Pick of the real interface + assertion-friendly arrays
3. `const spawn = vi.fn(() => new FakeChild() as any)` for spawn-factory injection
4. `const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn()}`

### Redis Schema Convention
**Source:** existing namespace patterns `liv:apps:webapp:<id>`, `liv:config:*`, `liv:cap:*`
**Apply to:** Phase 101 introduces `liv:apps:native:<id>` namespace (D-101-NATIVE-APPS).

**Symmetry with WebApp config** — use same key shape, same JSON value shape, same publish channel `liv:config:updated` on change (mirrors `McpConfigManager.saveAndPublish` pattern from `agent-runs.ts:54-58`).

---

## tRPC HTTP-Only Path Registration (Critical)

**Source:** `livos/packages/livinityd/source/modules/server/trpc/common.ts` (`httpOnlyPaths` Set)
**Apply to:** ALL new tRPC mutations in Phase 101 (per memory pitfall B-12 / X-04).

**Pattern (existing entries):**
- `webapp.create`, `webapp.delete`, `webapp.update`, `webapp.window.spawn`, etc. are all added to `httpOnlyPaths` because long-lived mutations hang if routed to a disconnected WS.

**Phase 101 new entries (must register):**
- `apps.native.list`, `apps.native.create`, `apps.native.delete`, `apps.native.spawn`
- `webapp.teach.saveSkill`, `webapp.teach.commitStep` (if v3 record is mutation-shaped)

---

## Files With Divergent Analog (Risk Notes)

### `livos/packages/ui/src/modules/window/webapp-chat-bottom-bar.tsx`
**Status:** DEPRECATED per file's own header. Modifying it does nothing because nothing renders it.
**Action:** Apply Phase 101 idle pulse to `ChatInputBar` inside `webapp-floating-action-bar.tsx` instead.

### `livos/packages/livinityd/source/modules/ai/agent-session.ts`
**Status:** File does NOT exist. CONTEXT references it by name but the actual chat WS body-builder is split between `ai/index.ts:717-780` and `livinity-broker/agent-runner-factory.ts:64-110`.
**Action:** Plan 101-06 should clarify: either create new `agent-session.ts` to centralize the envelope-extension OR extend `agent-runner-factory.ts` in place. Recommend extend-in-place for minimal diff.

### `livos/packages/livinityd/source/modules/webapps/teach-recorder.ts`
**Status:** File does NOT exist at the livinityd backend path. Current recorder is the UI hook `livos/packages/ui/src/hooks/use-teach-recorder.ts`.
**Action:** Plan 101-08 should clarify: either move recorder to backend (then UI sends DOM events via WS) OR rewrite UI hook in place to remove the interval heartbeat. RESEARCH.md Pattern 3 line 553 says explicitly: "This is a UI-tier component. Backend gets the completed `ActionLogV3` via tRPC mutation."

---

## No Analog Found

(none — all 16 mappable files have at least a role-match analog in the existing tree)

---

## Metadata

**Analog search scope:**
- `livos/packages/livinityd/source/modules/{webapps,streaming,apps,ai,computer-use,server/trpc,livinity-broker}/`
- `livos/packages/ui/src/{modules/{desktop,window/app-contents},hooks}/`

**Files scanned:** ~40 source files (Read + Grep)
**Key cross-references:**
- `window-manager.ts` (775 lines, primary spawn analog)
- `vnc-bridge.ts` (336 lines, primary process-spawn-with-stderr-tail analog)
- `stream-manager.ts` (521 lines, port-counter source)
- `agent-runs.ts` (537 lines, MCP-config-manager pattern)
- `agent-runner-factory.ts` (185 lines, webappId pass-through analog)
- `use-agent-socket.ts` (chat WS envelope at lines 535-545)
- `use-teach-recorder.ts` (531 lines, current interval-based recorder)
- `webapp-floating-action-bar.tsx` (583 lines, chat UI state machine)
- `add-webapp-dialog.tsx` (308 lines, form dialog analog)
- `webapp-icon.tsx` (117 lines, dock icon analog)

**Pattern extraction date:** 2026-05-10
