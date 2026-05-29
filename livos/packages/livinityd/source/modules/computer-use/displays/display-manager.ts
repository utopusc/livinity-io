/**
 * Phase 248-01 — Luse display-manager factory.
 *
 * Owns the backend lifecycle for nested X servers (Xephyr visible default,
 * Xvfb headless opt-in). Composes 4 responsibilities:
 *
 *   1. Display-number allocation. Monotonic counter starting at :10
 *      (avoids system :0 / :1). Seed phase SCANs `luse:display:*` at
 *      construction time and bumps the counter past the highest existing
 *      :N so livinityd restarts don't reuse displays the previous boot
 *      owned.
 *
 *   2. Process spawn. `spawnFn` is DI'd; defaults to
 *      `(await import('node:child_process')).spawn`. Tests pass a vi.fn
 *      returning a {pid, kill}-shape stub — vitest never spawns real X.
 *
 *   3. Redis state. Per-display HSET at `luse:display:<display>` carries
 *      owner_session + mode + created_at + name + width + height +
 *      last_app_at (updated by attachApp). Per-display LIST at
 *      `luse:display:<display>:apps` carries running app pids.
 *
 *   4. Owner-scoped kill. D-V44-DISPLAY-OWNER-SCOPED enforced at the
 *      manager layer — MCP wrappers (248-02) + TTL GC (248-03) inherit
 *      the policy for free. kill() reads owner_session via HGETALL and
 *      refuses with {ok:false, error:'not-owner'} when the caller
 *      doesn't match. list() is global (any session can read).
 *
 * D-V44-SACRED: this module does NOT touch
 * `liv/packages/core/src/sdk-agent-runner.ts` (sacred blob SHA
 * f3538e1d811992b782a9bb057d1b7f0a0189f95f).
 */

import type {
	CreateDisplayInput,
	CreateDisplayResult,
	DisplayManager,
	DisplayManagerDeps,
	DisplayMode,
	DisplayRecord,
	DisplayRedisClient,
	IsOwnerInput,
	KillDisplayResult,
	ProcessKillFn,
	SpawnHandle,
} from './types.js'
import {
	DISPLAY_REDIS_SCAN_PATTERN,
	redisKeyForDisplay,
	redisKeyForDisplayApps,
} from './redis-keys.js'

const DEFAULT_WIDTH = 1920
const DEFAULT_HEIGHT = 1080
const DEFAULT_ALLOCATOR_START = 10

/**
 * Default real spawn — lazily imports node:child_process so the module
 * doesn't pull in spawn unless production runs without an injected fn.
 * The async wrapper boxes the import behind a sync-looking signature by
 * caching the resolved spawn after first invocation.
 */
let cachedRealSpawn:
	| ((cmd: string, args: readonly string[], opts?: object) => SpawnHandle)
	| null = null

async function getDefaultSpawnFn() {
	if (cachedRealSpawn) return cachedRealSpawn
	const cp = await import('node:child_process')
	cachedRealSpawn = ((cmd, args, opts) =>
		cp.spawn(cmd, [...args], opts ?? {}) as unknown as SpawnHandle) as typeof cachedRealSpawn
	return cachedRealSpawn!
}

function defaultProcessKill(): ProcessKillFn {
	return (pid: number, signal?: NodeJS.Signals | number) => {
		try {
			return process.kill(pid, signal)
		} catch {
			// ESRCH (no such process) is non-fatal — the app may have already
			// crashed. Other errors are silently ignored too because kill is
			// best-effort during display teardown.
			return false
		}
	}
}

function isoNow(nowFn: () => number): string {
	return new Date(nowFn()).toISOString()
}

function parseDisplayNumber(display: string): number | null {
	if (!display.startsWith(':')) return null
	const n = Number(display.slice(1))
	return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Build the spawn arguments for each mode. Kept tiny + pure so the test
 * harness can drift-lock argv shape via the spawnHarness.calls array.
 *
 *   xephyr: Xephyr :<N> -screen <W>x<H> -ac -noreset
 *   xvfb:   Xvfb   :<N> -screen 0 <W>x<H>x24 -ac -noreset
 */
function buildSpawnArgs(
	mode: DisplayMode,
	displayNum: number,
	width: number,
	height: number,
): {cmd: 'Xephyr' | 'Xvfb'; args: string[]} {
	const display = `:${displayNum}`
	if (mode === 'xvfb') {
		return {
			cmd: 'Xvfb',
			args: [display, '-screen', '0', `${width}x${height}x24`, '-ac', '-noreset'],
		}
	}
	return {
		cmd: 'Xephyr',
		args: [display, '-screen', `${width}x${height}`, '-ac', '-noreset'],
	}
}

async function scanAllDisplayKeys(
	redis: DisplayRedisClient,
): Promise<string[]> {
	const out: string[] = []
	let cursor = '0'
	let firstPass = true
	while (firstPass || cursor !== '0') {
		const [next, keys] = await redis.scan(
			cursor,
			'MATCH',
			DISPLAY_REDIS_SCAN_PATTERN,
			'COUNT',
			100,
		)
		for (const k of keys) out.push(k)
		cursor = next
		firstPass = false
		// Defensive: fake redis returns '0' immediately; real ioredis
		// converges via the cursor protocol.
	}
	return out
}

/**
 * Inspect a SCAN result set and find the highest existing display number.
 * Filters out `:apps` suffix keys (those are the LIST companions). Returns
 * `null` when there are no existing display hashes.
 */
function highestExistingDisplayNum(keys: string[]): number | null {
	let max: number | null = null
	for (const k of keys) {
		if (k.endsWith(':apps')) continue
		// Strip prefix → ':N'
		const tail = k.slice('luse:display:'.length)
		const n = parseDisplayNumber(tail)
		if (n !== null && (max === null || n > max)) {
			max = n
		}
	}
	return max
}

export function createDisplayManager(deps: DisplayManagerDeps): DisplayManager {
	const redis = deps.redis
	const nowFn = deps.nowFn ?? Date.now
	const allocatorStart = deps.allocatorStart ?? DEFAULT_ALLOCATOR_START
	const processKillFn = deps.processKillFn ?? defaultProcessKill()
	const logger = deps.logger ?? {info: () => {}, warn: () => {}}

	// In-memory handle map keyed by display string (e.g. ':10'). Populated by
	// create(); consumed by kill() so we can SIGTERM the X server process
	// without round-tripping through ps/pid lookup.
	const handles = new Map<string, SpawnHandle>()

	// Allocator state. Seeded from Redis on construction.
	let nextDisplayNum = allocatorStart

	const initialized: Promise<void> = (async () => {
		try {
			const keys = await scanAllDisplayKeys(redis)
			const existingMax = highestExistingDisplayNum(keys)
			if (existingMax !== null && existingMax + 1 > nextDisplayNum) {
				nextDisplayNum = existingMax + 1
				logger.info?.('display-manager: allocator seeded from Redis', {
					seeded_from: existingMax,
					next: nextDisplayNum,
				})
			}
		} catch (err) {
			logger.warn?.('display-manager: SCAN seed failed; using default start', {
				error: (err as Error).message,
				next: nextDisplayNum,
			})
		}
	})()

	async function ensureSpawnFn() {
		return deps.spawnFn ?? (await getDefaultSpawnFn())
	}

	function allocateNext(): string {
		const n = nextDisplayNum
		nextDisplayNum += 1
		return `:${n}`
	}

	async function create(
		input: CreateDisplayInput,
	): Promise<CreateDisplayResult> {
		await initialized
		const mode: DisplayMode = input.mode ?? 'xephyr' // D-V44-DISPLAY-XEPHYR-DEFAULT
		const width = input.width ?? DEFAULT_WIDTH
		const height = input.height ?? DEFAULT_HEIGHT
		const display = allocateNext()
		const displayNum = Number(display.slice(1))
		const name = input.name ?? `display-${displayNum}`
		const createdAt = isoNow(nowFn)

		const {cmd, args} = buildSpawnArgs(mode, displayNum, width, height)
		const spawnFn = await ensureSpawnFn()
		const handle = spawnFn(cmd, args, {
			stdio: 'ignore',
			detached: false,
		}) as SpawnHandle
		handles.set(display, handle)

		await redis.hset(redisKeyForDisplay(display), {
			owner_session: input.ownerSession,
			mode,
			created_at: createdAt,
			name,
			width: String(width),
			height: String(height),
		})

		logger.info('display-manager: created display', {
			display,
			mode,
			owner_session: input.ownerSession,
			pid: handle.pid,
		})

		return {
			display,
			name,
			pid: handle.pid ?? -1,
		}
	}

	async function list(): Promise<DisplayRecord[]> {
		const keys = await scanAllDisplayKeys(redis)
		const displayKeys = keys.filter((k) => !k.endsWith(':apps'))
		const out: DisplayRecord[] = []
		for (const key of displayKeys) {
			const hash = await redis.hgetall(key)
			if (!hash || Object.keys(hash).length === 0) continue
			const display = key.slice('luse:display:'.length)
			const appsRaw = await redis.lrange(
				redisKeyForDisplayApps(display),
				0,
				-1,
			)
			const running_apps = appsRaw
				.map((s) => Number(s))
				.filter((n) => Number.isFinite(n))
			out.push({
				display,
				name: hash.name ?? `display-${display.slice(1)}`,
				mode: ((hash.mode as DisplayMode | undefined) ?? 'xephyr'),
				created_at: hash.created_at ?? '',
				owner_session: hash.owner_session ?? '',
				width: Number(hash.width ?? DEFAULT_WIDTH),
				height: Number(hash.height ?? DEFAULT_HEIGHT),
				running_apps,
			})
		}
		return out
	}

	async function isOwner(input: IsOwnerInput): Promise<boolean> {
		const hash = await redis.hgetall(redisKeyForDisplay(input.display))
		if (!hash || Object.keys(hash).length === 0) return false
		return hash.owner_session === input.session
	}

	async function listAppsForDisplay(display: string): Promise<number[]> {
		const raw = await redis.lrange(redisKeyForDisplayApps(display), 0, -1)
		return raw.map((s) => Number(s)).filter((n) => Number.isFinite(n))
	}

	async function kill(input: {
		display: string
		callerSession: string
	}): Promise<KillDisplayResult> {
		const hash = await redis.hgetall(redisKeyForDisplay(input.display))
		if (!hash || Object.keys(hash).length === 0) {
			return {ok: false, error: 'not-found'}
		}
		// D-V44-DISPLAY-OWNER-SCOPED — kill is gated; list() is open.
		if (hash.owner_session !== input.callerSession) {
			logger.info('display-manager: kill refused (not owner)', {
				display: input.display,
				caller: input.callerSession,
				owner: hash.owner_session,
			})
			return {ok: false, error: 'not-owner'}
		}

		// SIGTERM every app pid (best-effort).
		const appPids = await listAppsForDisplay(input.display)
		for (const pid of appPids) {
			processKillFn(pid, 'SIGTERM')
		}

		// SIGTERM the X server via the in-memory spawn-handle (if known).
		const handle = handles.get(input.display)
		if (handle) {
			try {
				handle.kill('SIGTERM')
			} catch {
				// best-effort
			}
			handles.delete(input.display)
		}

		// DEL both Redis keys.
		await redis.del(
			redisKeyForDisplay(input.display),
			redisKeyForDisplayApps(input.display),
		)

		logger.info('display-manager: killed display', {
			display: input.display,
			killed_apps_count: appPids.length,
		})

		return {ok: true, killed_apps_count: appPids.length}
	}

	async function attachApp(input: {
		display: string
		pid: number
		app_name: string
	}): Promise<void> {
		await redis.rpush(redisKeyForDisplayApps(input.display), String(input.pid))
		await redis.hset(redisKeyForDisplay(input.display), {
			last_app_at: isoNow(nowFn),
		})
		logger.info('display-manager: app attached', {
			display: input.display,
			pid: input.pid,
			app_name: input.app_name,
		})
	}

	return {
		create,
		list,
		kill,
		attachApp,
		listAppsForDisplay,
		isOwner,
		initialized,
	}
}
