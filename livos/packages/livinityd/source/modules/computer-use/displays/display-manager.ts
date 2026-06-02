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
	RegisterExistingInput,
	SpawnHandle,
} from './types.js'
import {
	DISPLAY_REDIS_SCAN_PATTERN,
	redisKeyForDisplay,
	redisKeyForDisplayApps,
} from './redis-keys.js'

// Default geometry for MCP `computer_create_display` (AI-created displays) when
// the caller omits width/height. Operator directive 2026-06-02: AI displays
// should be a stable 1280x720 (matches the `:1` host display), not 1080p — the
// agent kept creating 1920x1080 `:60` displays. Now unified at 720p with
// HOST_DISPLAY_* below (both 1280x720), so every LivOS display defaults to 720p.
export const DEFAULT_DISPLAY_WIDTH = 1280
export const DEFAULT_DISPLAY_HEIGHT = 720

// The boot `:1` HOST display (the branded LivOS shell + main desktop stream that
// livinityd's Xvfb owns). Pinned to a fixed 720p so `:1` is a stable, lightweight
// host surface regardless of the viewer. Now the SAME value as DEFAULT_DISPLAY_*
// above (both 1280x720) — every LivOS display defaults to 720p as of 2026-06-02.
// Kept as a distinct named constant for the host-display concept. Used by index.ts
// for BOTH the Xvfb `-screen` geometry AND the displays.list registration so the
// popover thumb + openWindow sizing match the real `:1` size.
export const HOST_DISPLAY_WIDTH = 1280
export const HOST_DISPLAY_HEIGHT = 720

const DEFAULT_ALLOCATOR_START = 10

/**
 * Default real spawn — lazily imports node:child_process so the module
 * doesn't pull in spawn unless production runs without an injected fn.
 * Cached on first call so subsequent create()s don't re-import.
 */
type RealSpawn = (
	cmd: string,
	args: readonly string[],
	opts?: object,
) => SpawnHandle
let cachedRealSpawn: RealSpawn | null = null

async function getDefaultSpawnFn(): Promise<RealSpawn> {
	if (cachedRealSpawn) return cachedRealSpawn
	const cp = await import('node:child_process')
	const real: RealSpawn = (cmd, args, opts) =>
		cp.spawn(cmd, [...args], (opts ?? {}) as object) as unknown as SpawnHandle
	cachedRealSpawn = real
	return real
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
		const width = input.width ?? DEFAULT_DISPLAY_WIDTH
		const height = input.height ?? DEFAULT_DISPLAY_HEIGHT
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

		// R3 (251-02 rec C): a missing X binary (Xephyr/Xvfb) makes node-pty/
		// child_process emit 'error' (ENOENT). Latch it synchronously so we fail
		// closed — do NOT HSET the display key, do NOT report a pid, return
		// isError:true.
		let spawnError: Error | null = null
		if (typeof handle.on === 'function') {
			handle.on('error', (err: Error) => {
				spawnError = err
			})
		}
		// Yield one microtask so a synchronous ENOENT 'error' is observed before
		// we commit state.
		await Promise.resolve()
		if (spawnError !== null) {
			logger.warn?.('display-manager: spawn failed — display not created', {
				display,
				mode,
				cmd,
				error: (spawnError as Error).message,
			})
			return {
				display,
				name,
				pid: -1,
				isError: true,
				error: `display spawn failed (${cmd}): ${(spawnError as Error).message}`,
			}
		}
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
			isError: false,
		}
	}

	/**
	 * Phase 254-05 (Gap 1) — RECORD an already-running display into Redis,
	 * matching the exact HSET shape create() writes, but WITHOUT spawning a new
	 * X server (the boot `startXvfb(':1')` already owns the running :1 server,
	 * so spawning a second Xvfb on :1 would collide). Used to adopt the boot
	 * host `:1` display so it appears in list() / resolves via getVncUrl.
	 *
	 * Idempotent: no-op when a record for input.display already exists —
	 * returns the EXISTING record untouched so a livinityd restart neither
	 * duplicates nor clobbers a user-renamed / re-owned display.
	 *
	 * Does NOT call allocateNext() / advance nextDisplayNum — registering :1
	 * (below allocatorStart) must not perturb the :10+ allocator.
	 */
	async function registerExisting(
		input: RegisterExistingInput,
	): Promise<DisplayRecord> {
		const key = redisKeyForDisplay(input.display)
		const existing = await redis.hgetall(key)
		if (existing && Object.keys(existing).length > 0) {
			// Identity is idempotent — name / owner_session / mode / created_at are
			// NEVER clobbered, so a user rename or re-own survives a restart.
			// BUT geometry is reconciled: the registry width/height MUST track the
			// actual running X server (the boot Xvfb -screen is authoritative), or
			// displays.list / popover thumbnails / openWindow would size a stale
			// resolution. This is what lets re-pinning `:1` (e.g. 1080p → 720p) take
			// effect on the next boot without manual Redis surgery.
			const desiredW = String(input.width)
			const desiredH = String(input.height)
			if (existing.width !== desiredW || existing.height !== desiredH) {
				await redis.hset(key, {width: desiredW, height: desiredH})
				logger.info('display-manager: registerExisting reconciled geometry', {
					display: input.display,
					from: `${existing.width}x${existing.height}`,
					to: `${desiredW}x${desiredH}`,
				})
				existing.width = desiredW
				existing.height = desiredH
			} else {
				logger.info('display-manager: registerExisting no-op (record exists)', {
					display: input.display,
				})
			}
			return {
				display: input.display,
				name: existing.name ?? input.name ?? `display-${input.display.slice(1)}`,
				mode: (existing.mode as DisplayMode | undefined) ?? input.mode,
				created_at: existing.created_at ?? '',
				owner_session: existing.owner_session ?? input.ownerSession,
				width: Number(existing.width ?? input.width),
				height: Number(existing.height ?? input.height),
				running_apps: [],
			}
		}
		const createdAt = isoNow(nowFn)
		const name = input.name ?? `display-${input.display.slice(1)}`
		// Same HSET shape as create() — but NO spawn call: the X server is
		// already running. owner_session='' (host/shared) for the :1 case.
		await redis.hset(key, {
			owner_session: input.ownerSession,
			mode: input.mode,
			created_at: createdAt,
			name,
			width: String(input.width),
			height: String(input.height),
		})
		logger.info('display-manager: registered existing display (no spawn)', {
			display: input.display,
			mode: input.mode,
			owner_session: input.ownerSession,
		})
		return {
			display: input.display,
			name,
			mode: input.mode,
			created_at: createdAt,
			owner_session: input.ownerSession,
			width: input.width,
			height: input.height,
			running_apps: [],
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
				width: Number(hash.width ?? DEFAULT_DISPLAY_WIDTH),
				height: Number(hash.height ?? DEFAULT_DISPLAY_HEIGHT),
				running_apps,
				// Phase 248-03 — surface last_app_at so the TTL GC can compute
				// staleness without re-HGETALLing each display.
				...(hash.last_app_at ? {last_app_at: hash.last_app_at} : {}),
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

	async function reapDeadDisplays(
		isAlive: (display: string) => Promise<boolean>,
	): Promise<string[]> {
		const records = await list()
		const reaped: string[] = []
		for (const rec of records) {
			// Never reap the host displays: `:0` (the GDM Ubuntu/GNOME desktop, may be
			// momentarily unreachable during a GNOME restart) and `:1` (livinityd's
			// internal Xvfb). Both are host/shared and always kept.
			if (rec.display === ':0' || rec.display === ':1') continue
			// Fail-safe: only reap on a DEFINITE dead probe. A probe that throws is
			// treated as alive so a transient glitch never deletes a live display.
			let alive = true
			try {
				alive = await isAlive(rec.display)
			} catch {
				alive = true
			}
			if (alive) continue
			// System reap (no owner gate — the X server is gone, so this is an
			// orphan, e.g. a webapp display left behind by a livinityd restart).
			const handle = handles.get(rec.display)
			if (handle) {
				try {
					handle.kill('SIGTERM')
				} catch {
					/* best-effort */
				}
				handles.delete(rec.display)
			}
			await redis.del(
				redisKeyForDisplay(rec.display),
				redisKeyForDisplayApps(rec.display),
			)
			reaped.push(rec.display)
			logger.info('display-manager: reaped dead orphan display', {
				display: rec.display,
				owner_session: rec.owner_session,
			})
		}
		return reaped
	}

	return {
		create,
		registerExisting,
		list,
		kill,
		reapDeadDisplays,
		attachApp,
		listAppsForDisplay,
		isOwner,
		initialized,
	}
}
