/**
 * Phase 248-01 — Display lifecycle types.
 *
 * Public type surface for the Luse display-manager. Mirrors the Phase 246
 * pty-sessions/types.ts shape: small focused interfaces, no impl bleed.
 *
 * D-V44-DISPLAY-XEPHYR-DEFAULT — mode defaults to 'xephyr' (visible).
 * D-V44-DISPLAY-OWNER-SCOPED   — kill() enforces caller === owner_session.
 */

import type {ChildProcess} from 'node:child_process'

export type DisplayMode = 'xephyr' | 'xvfb'

export interface DisplayRecord {
	/** X server display number, e.g. ':10' */
	display: string
	name: string
	mode: DisplayMode
	/** ISO timestamp (nowFn → new Date(...).toISOString()) */
	created_at: string
	owner_session: string
	width: number
	height: number
	/** PIDs of apps RPUSH'd into luse:display:<display>:apps */
	running_apps: number[]
	/**
	 * ISO timestamp of the most recent `attachApp` call for this display.
	 * Optional — absent when no app has ever been attached. The Phase 248-03
	 * TTL GC falls back to `created_at` when this field is undefined.
	 */
	last_app_at?: string
}

export interface CreateDisplayInput {
	mode?: DisplayMode
	name?: string
	width?: number
	height?: number
	ownerSession: string
}

export interface CreateDisplayResult {
	display: string
	name: string
	pid: number
	/** R3 (Phase 252-01): true when the X server spawn failed (e.g. ENOENT). */
	isError?: boolean
	/** Human-readable spawn failure message when isError is true. */
	error?: string
}

/**
 * Phase 254-05 (Gap 1) — input for `registerExisting`, which RECORDS an
 * already-running X server into Redis WITHOUT spawning a new one. Unlike
 * `create()` (which always spawns + allocates a fresh :N starting at :10),
 * this targets an explicit `display` (e.g. the boot `:1` host Xvfb launched
 * by startXvfb OUTSIDE the manager) so it appears in `list()` and resolves
 * via getVncUrl. `ownerSession: ''` = host/shared.
 */
export interface RegisterExistingInput {
	/** e.g. ':1' — an ALREADY-RUNNING X server (no spawn happens). */
	display: string
	width: number
	height: number
	/** 'xvfb' for the boot :1. */
	mode: DisplayMode
	/** Defaults to `display-<N>`. */
	name?: string
	/** '' for host/shared (the :1 case). */
	ownerSession: string
}

export type KillDisplayResult =
	| {ok: true; killed_apps_count: number}
	| {ok: false; error: 'not-owner' | 'not-found'}

export interface AttachAppInput {
	display: string
	pid: number
	app_name: string
}

export interface IsOwnerInput {
	display: string
	session: string
}

/**
 * Minimal ioredis surface used by the display-manager. Keeps the module
 * unit-testable with a Map-backed fake (see __tests__/display-manager.test.ts).
 */
export interface DisplayRedisClient {
	hset(key: string, fields: Record<string, string>): Promise<number>
	hgetall(key: string): Promise<Record<string, string>>
	rpush(key: string, value: string): Promise<number>
	lrange(key: string, start: number, stop: number): Promise<string[]>
	del(...keys: string[]): Promise<number>
	scan(
		cursor: string,
		matchKw: 'MATCH',
		pattern: string,
		countKw: 'COUNT',
		count: number,
	): Promise<[string, string[]]>
}

/**
 * Spawn-handle stub shape the manager stores in its in-memory map. Real
 * `child_process.spawn` returns a `ChildProcess`; we only need `pid` and
 * `kill(signal)` for the lifecycle.
 */
export interface SpawnHandle {
	pid: number | undefined
	kill(signal?: NodeJS.Signals | number): boolean
	/** R3 (Phase 252-01): attach an error listener to fail closed on ENOENT. */
	on?(event: 'error', listener: (err: Error) => void): void
}

export type DisplaySpawnFn = (
	command: string,
	args: readonly string[],
	options?: object,
) => SpawnHandle | ChildProcess

export type ProcessKillFn = (
	pid: number,
	signal?: NodeJS.Signals | number,
) => boolean

export interface DisplayManagerDeps {
	redis: DisplayRedisClient
	/** Defaults to `(await import('node:child_process')).spawn`. */
	spawnFn?: DisplaySpawnFn
	/** Defaults to `Date.now`. */
	nowFn?: () => number
	/** First display number allocated. Defaults to 10. */
	allocatorStart?: number
	/** Defaults to `process.kill` for app-pid SIGTERM in kill(). */
	processKillFn?: ProcessKillFn
	logger?: {
		info: (msg: string, ctx?: object) => void
		warn?: (msg: string, ctx?: object) => void
	}
}

export interface DisplayManager {
	create(input: CreateDisplayInput): Promise<CreateDisplayResult>
	/**
	 * Phase 254-05 (Gap 1) — RECORD an already-running display into Redis
	 * WITHOUT spawning a new X server. Identity (name / owner_session / mode /
	 * created_at) is idempotent — never clobbered, so a livinityd restart neither
	 * duplicates nor clobbers a user-renamed display. BUT geometry (width/height)
	 * is reconciled to the passed values, so re-pinning a display's resolution
	 * (e.g. `:1` 1080p → 720p) takes effect on the next boot. Does NOT touch the
	 * :N allocator.
	 */
	registerExisting(input: RegisterExistingInput): Promise<DisplayRecord>
	list(): Promise<DisplayRecord[]>
	kill(input: {
		display: string
		callerSession: string
	}): Promise<KillDisplayResult>
	/**
	 * Boot-time orphan reaper. Enumerates every display record and removes any
	 * whose X server is dead per the injected `isAlive` probe — EXCEPT the host
	 * `:1` boot display, which is never reaped. Fixes stale webapp displays left
	 * in the registry after a livinityd restart/crash: the in-memory window
	 * manager loses them but the persistent Redis records survive, so the
	 * Displays popover kept listing dead `:N` and spamming failed screenshots.
	 * A probe that THROWS is treated as alive (fail-safe — never reap on a
	 * transient glitch). Returns the reaped display ids.
	 */
	reapDeadDisplays(isAlive: (display: string) => Promise<boolean>): Promise<string[]>
	attachApp(input: AttachAppInput): Promise<void>
	listAppsForDisplay(display: string): Promise<number[]>
	isOwner(input: IsOwnerInput): Promise<boolean>
	/**
	 * Promise that resolves once the SCAN-based allocator seed has completed.
	 * Wave-2 callers should `await mgr.initialized` before issuing create()
	 * if they want strict :N continuity across livinityd restarts.
	 */
	readonly initialized: Promise<void>
}
