/**
 * Phase 102-05 — tRPC routes apps.native.{list,get,create,delete,spawn}.
 *
 * Per-app-display orchestration (D-102-NATIVE-APP-PARITY):
 *   1. DisplayAllocator.allocate() returns :N (per-app dedicated Xvfb display)
 *   2. spawnXvfb({display, width: 1280, height: 720}) — readiness-polled
 *   3. spawnFluxbox({display}) — best-effort WM (Antigravity, VSCode need a WM)
 *   4. spawnNativeApp({cfg, display}) returns child with DISPLAY=:N env
 *   5. bind({display, portAllocator, startStreamFn, label})
 *      starts x11vnc -display :N at the allocated port
 *   6. Persist {displayN, port, streamId, xvfb, child} in activeNative map
 *      so close-lifecycle (102-08) can tear down.
 *
 * Phase 101-05 (WM_CLASS xdotool poll on shared :1) flow REPLACED. Each
 * native app owns its own Xvfb display, eliminating cross-app interference
 * and 1920x1080 coord drift on Luse screenshots.
 *
 * No master-profile seeding for native apps (D-102-MASTER-PROFILE-SEED is
 * WebApps-only). Native binaries manage their own state.
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — untouched.
 *
 * Threat model: T-101-02 (binary path validation) carried forward via
 * nativeAppConfigSchema re-parse at spawn time (defense in depth).
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'
import {execFile as _execFile, type ChildProcess} from 'node:child_process'
import {promisify} from 'node:util'

const execFileP = promisify(_execFile)

/**
 * Phase 259 — fullscreen a freshly-spawned native app so it FILLS the 1280x720
 * Xvfb. The stream captures the WHOLE display, so without this the app opens at
 * its default size with the fluxbox desktop visible around it (operator: "açılan
 * uygulamanın boyutu full screen olmalı"). Best-effort + fire-and-forget: the
 * top-level window maps asynchronously after spawn, so we poll xdotool for it,
 * then set EWMH fullscreen (fluxbox honors _NET_WM_STATE_FULLSCREEN) with a
 * size+move fallback. livinityd runs as the desktop user (bruce), so xdotool/wmctrl
 * run directly with DISPLAY=:N — no sudo needed.
 */
async function fullscreenNativeWindow(
	pid: number,
	display: string,
	logger?: {info?(m: string): void; warn?(m: string): void},
): Promise<void> {
	const env = {...process.env, DISPLAY: display}

	// Find at least one visible top-level for this pid (poll up to ~6s).
	let wids: string[] = []
	for (let attempt = 0; attempt < 24; attempt++) {
		await new Promise((r) => setTimeout(r, 250))
		try {
			const {stdout} = await execFileP(
				'xdotool',
				['search', '--pid', String(pid), '--onlyvisible'],
				{env},
			)
			wids = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
		} catch {
			/* window not mapped yet — keep polling */
		}
		if (wids.length > 0) break
	}

	if (wids.length === 0) {
		logger?.warn?.(
			`native-app: no window found for pid=${pid} on ${display} to fullscreen (non-fatal)`,
		)
		return
	}

	// Pick the REAL main top-level among a pid's windows. Electron (VS Code) and Qt
	// (OBS) map several X windows (splash / IME / utility); blindly resizing all of
	// them does nothing useful and never focuses the one that matters. Prefer a
	// _NET_WM_WINDOW_TYPE_NORMAL window, then the largest by area.
	const pickMain = async (candidates: string[]): Promise<string | null> => {
		let best: {wid: string; area: number; normal: boolean} | null = null
		for (const wid of candidates) {
			let w = 0
			let h = 0
			try {
				const {stdout} = await execFileP(
					'xdotool',
					['getwindowgeometry', '--shell', wid],
					{env},
				)
				w = Number(stdout.match(/WIDTH=(\d+)/)?.[1] ?? 0)
				h = Number(stdout.match(/HEIGHT=(\d+)/)?.[1] ?? 0)
			} catch {
				/* geometry unavailable — treat as zero-area */
			}
			let normal = true
			try {
				const {stdout} = await execFileP(
					'xprop',
					['-id', wid, '_NET_WM_WINDOW_TYPE'],
					{env},
				)
				// Absent type => assume normal; otherwise require the NORMAL atom.
				normal =
					!/_NET_WM_WINDOW_TYPE\(/.test(stdout) ||
					stdout.includes('_NET_WM_WINDOW_TYPE_NORMAL')
			} catch {
				/* xprop unavailable — assume normal */
			}
			const area = w * h
			if (
				!best ||
				(normal && !best.normal) ||
				(normal === best.normal && area > best.area)
			) {
				best = {wid, area, normal}
			}
		}
		return best?.wid ?? null
	}

	// EWMH alone is unreliable for Electron/Qt under the deliberately-minimal fluxbox
	// WM — the app ignores an external client's _NET_WM_STATE request. F11 invokes the
	// app's OWN fullscreen handler (works for Chromium / VS Code), sent via the proven
	// activate-first xdotool pattern (see computer-use/native/input.ts:tryXdotoolKey —
	// `key --window` is dropped by Chrome's synthetic-event filter, so we activate+focus
	// then send a real key). F11 is a TOGGLE, so send it at most ONCE per window —
	// re-sending on a later pass would toggle fullscreen back OFF. OBS has no main-window
	// fullscreen key, so for it the maximize + geometry path (now correctly targeted) is
	// what fills the screen and a stray F11 is a harmless no-op.
	const f11Sent = new Set<string>()
	for (let pass = 0; pass < 4; pass++) {
		try {
			const {stdout} = await execFileP(
				'xdotool',
				['search', '--pid', String(pid), '--onlyvisible'],
				{env},
			)
			const current = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
			if (current.length > 0) wids = current
		} catch {
			/* keep the last known set */
		}

		const target = (await pickMain(wids)) ?? wids[0]
		if (target) {
			// Activate + focus so a REAL key event lands on the right window.
			await execFileP(
				'xdotool',
				['windowactivate', '--sync', target, 'windowfocus', '--sync', target],
				{env},
			).catch(() => {})
			await execFileP(
				'wmctrl',
				['-i', '-r', target, '-b', 'add,maximized_vert,maximized_horz'],
				{env},
			).catch(() => {})
			await execFileP('wmctrl', ['-i', '-r', target, '-b', 'add,fullscreen'], {env}).catch(
				() => {},
			)
			await execFileP('xdotool', ['windowsize', target, '1280', '720'], {env}).catch(() => {})
			await execFileP('xdotool', ['windowmove', target, '0', '0'], {env}).catch(() => {})
			if (!f11Sent.has(target)) {
				// F11 LAST (after geometry) on its first pass so it locks true app-internal
				// fullscreen; tracked so we never toggle it back off on a later pass.
				f11Sent.add(target)
				await execFileP(
					'xdotool',
					[
						'windowactivate',
						'--sync',
						target,
						'windowfocus',
						'--sync',
						target,
						'key',
						'--clearmodifiers',
						'F11',
					],
					{env},
				).catch(() => {})
			}
			logger?.info?.(
				`native-app: fullscreen pass ${pass + 1}/4 applied to wid=${target} on ${display}`,
			)
		}
		await new Promise((r) => setTimeout(r, 500))
	}
}

import {router, privateProcedure, adminProcedure} from '../server/trpc/trpc.js'
import {
	nativeAppConfigSchema,
	type NativeAppConfigStore,
} from './native-app-config.js'
import {spawnNativeApp} from './native-app-spawner.js'
import {bind, closeNativeApp, inferWmClass, type StreamStartFn} from './native-app-binder.js'
import {
	DisplayAllocator,
	spawnXvfb,
	type XvfbHandle,
} from '../streaming/index.js'
import type {StreamManager} from '../streaming/stream-manager.js'

// Module-scope singletons

/**
 * Shared DisplayAllocator for native-app spawns. Range [10, 100) (90 slots)
 * matches D-102-DISPLAY-ALLOCATOR. Module-scope rather than ctx-injected
 * because the allocator is a process-global resource — every spawn from
 * every user shares the same display-number pool. Wave 2 102-04 mirrors
 * this for the WebApp side.
 *
 * Phase 159 — exported for the idle reaper wire-up in
 * livinityd/source/index.ts. Reaper passes this allocator to
 * `closeNativeApp` so released display slots are freed back to the
 * shared pool.
 */
export const nativeDisplayAllocator = new DisplayAllocator()

/** Default Xvfb spawn factory. Tests override via _setXvfbSpawnFnForTest. */
let xvfbSpawnFn: typeof spawnXvfb = spawnXvfb

/**
 * Per-app lifecycle handles. Phase 102-08 (close lifecycle) will consume
 * this map to SIGTERM the binary, stop x11vnc, kill Xvfb, release allocator
 * slots, and remove map entries. Keyed by native-app UUID.
 */
export interface ActiveNativeApp {
	id: string
	displayN: number
	display: string
	port: number
	streamId: string
	wsUrl: string
	xvfb: XvfbHandle
	child: ChildProcess
	startedAt: number
}

// Phase 159 — exported for the idle reaper. Reaper walks .entries()
// every 30s, checks `now - startedAt >= idleMs`, calls
// `closeNativeApp({id, active: activeNative, ...})` for stale handles.
// The map is the same module-scope singleton used by the spawn/close
// tRPC routes — single source of truth for live native-app handles.
export const activeNative = new Map<string, ActiveNativeApp>()

// Test injection (do not use in production)

export function _setXvfbSpawnFnForTest(fn: typeof spawnXvfb): typeof spawnXvfb {
	const prev = xvfbSpawnFn
	xvfbSpawnFn = fn
	return prev
}

export function _snapshotActiveNativeForTest(): Map<string, ActiveNativeApp> {
	return new Map(activeNative)
}

export function _clearActiveNativeForTest(): void {
	activeNative.clear()
}

// Helpers

function requireStore(ctx: {livinityd?: {nativeAppConfigStore?: NativeAppConfigStore | null}}): NativeAppConfigStore {
	const store = ctx.livinityd?.nativeAppConfigStore
	if (!store) {
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Native app store not initialized (Redis unavailable?)',
		})
	}
	return store
}

function requireStreamManager(ctx: {livinityd?: {streamManager?: StreamManager | null}}): StreamManager {
	const sm = ctx.livinityd?.streamManager
	if (!sm) {
		throw new TRPCError({
			code: 'SERVICE_UNAVAILABLE',
			message: 'StreamManager not initialised (Pillar B streaming unavailable)',
		})
	}
	return sm
}

/**
 * Build the startStreamFn adapter that the native-app-binder uses. Pins
 * mode to vnc-window and target to {display} (D-102-X11VNC-WHOLE-DISPLAY).
 */
function makeStartStreamFn(sm: StreamManager, userId: string): StreamStartFn {
	return async ({display}) => {
		return sm.startStream({
			userId,
			mode: 'vnc-window',
			target: {display},
		})
	}
}

// Input schemas

const getInput = z.object({id: z.string().uuid()})
const deleteInput = z.object({id: z.string().uuid()})
const spawnInput = z.object({id: z.string().uuid()})
const closeInput = z.object({id: z.string().uuid()})

// Router (CRUD)

export const nativeAppsRouter = router({
	list: privateProcedure.query(async ({ctx}) => {
		const store = requireStore(ctx)
		return store.list()
	}),

	get: privateProcedure
		.input(getInput)
		.query(async ({ctx, input}) => {
			const store = requireStore(ctx)
			return store.get(input.id)
		}),

	create: adminProcedure
		.input(nativeAppConfigSchema)
		.mutation(async ({ctx, input}) => {
			const store = requireStore(ctx)
			await store.upsert(input)
			return {id: input.id}
		}),

	delete: adminProcedure
		.input(deleteInput)
		.mutation(async ({ctx, input}) => {
			const store = requireStore(ctx)
			const deleted = await store.delete(input.id)
			return {deleted}
		}),

	/**
	 * apps.native.spawn — Phase 102 per-app-display orchestration.
	 *
	 *   1. DisplayAllocator.allocate() returns :N
	 *   2. spawnXvfb({display, 1280x720}) (readiness-polled)
	 *   3. spawnFluxbox({display}) (best-effort)
	 *   4. spawnNativeApp({cfg, display}) — binary inherits DISPLAY=:N
	 *   5. bind({display, portAllocator, startStreamFn}) — starts x11vnc + stream
	 *   6. Persist handle in activeNative for 102-08 close lifecycle.
	 *
	 * On failure between (1) and (5): tear down Xvfb + release display slot
	 * before rethrowing. The binary (if (4) succeeded) is intentionally
	 * LEFT RUNNING so the user can debug — matches Phase 101-05.
	 */
	spawn: privateProcedure
		.input(spawnInput)
		.mutation(async ({ctx, input}) => {
			const store = requireStore(ctx)
			const sm = requireStreamManager(ctx)
			const cfg = await store.get(input.id)
			if (!cfg) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'native app config ' + input.id + ' not found',
				})
			}

			const userId = ctx.currentUser?.id
			if (!userId) {
				throw new TRPCError({
					code: 'UNAUTHORIZED',
					message: 'native-app spawn requires an authenticated user',
				})
			}

			// Phase 157 round 5 — idempotency. If the binary is already
			// alive in activeNative, return the existing handle instead
			// of allocating another display/stream slot. Without this,
			// every click leaks a stream (cap 10) and burns a display
			// number (range [10,100)).
			const existing = activeNative.get(input.id)
			if (existing) {
				ctx.logger?.log?.(
					'apps.native.spawn: reusing active handle for ' +
						cfg.name +
						' (display=' +
						existing.display +
						' port=' +
						existing.port +
						')',
				)
				return {
					id: existing.id,
					pid: existing.child.pid ?? 0,
					display: existing.display,
					displayN: existing.displayN,
					port: existing.port,
					streamId: existing.streamId,
					wsUrl: existing.wsUrl,
				}
			}

			const logger = ctx.logger
			const adaptLogger = logger
				? {
						info: (m: string) => logger.log(m),
						warn: (m: string) => logger.error(m),
						error: (m: string) => logger.error(m),
						verbose: (m: string) => logger.verbose(m),
					}
				: undefined

			// 1. Allocate display.
			const displayN = nativeDisplayAllocator.allocate()
			const display = ':' + displayN
			let xvfb: XvfbHandle | null = null
			let child: ChildProcess | null = null
			try {
				// 2. Spawn Xvfb on :N (1280x720x24), readiness-polled.
				xvfb = await xvfbSpawnFn({
					display,
					width: 1280,
					height: 720,
					logger: adaptLogger,
				})

				// 3. Best-effort fluxbox on :N.
				try {
					const fluxMod = await import('../webapps/fluxbox-wm.js')
					await fluxMod.startFluxbox({display, logger: adaptLogger})
				} catch (err) {
					adaptLogger?.warn('fluxbox spawn on ' + display + ' failed (non-fatal): ' + (err instanceof Error ? err.message : String(err)))
				}

				// 4. Spawn the native binary with DISPLAY=:N.
				let spawnedPid: number
				try {
					const spawnResult = await spawnNativeApp({cfg, display, logger: adaptLogger})
					spawnedPid = spawnResult.pid
					child = spawnResult.child
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err)
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'native-app spawn failed: ' + msg,
					})
				}

				// 4.5 — Phase 259: fullscreen the app window so it fills the 1280x720
				// Xvfb (fire-and-forget; the window maps asynchronously after spawn).
				void fullscreenNativeWindow(spawnedPid, display, adaptLogger)

				// 5. Bind display to stream port via new display-based binder.
				const startStreamFn = makeStartStreamFn(sm, userId)
				const bound = await bind({
					display,
					portAllocator: sm.getPortAllocator(),
					startStreamFn,
					logger: adaptLogger,
					label: cfg.name,
				})

				// 6. Persist active-app handle for 102-08 close lifecycle.
				const handle: ActiveNativeApp = {
					id: cfg.id,
					displayN,
					display,
					port: bound.port,
					streamId: bound.streamId,
					wsUrl: bound.wsUrl,
					xvfb,
					child,
					startedAt: Date.now(),
				}
				activeNative.set(cfg.id, handle)

				// [SC2 — Phase 260-02] Surface this native :N in the Displays popover.
				// Native apps allocate from their OWN nativeDisplayAllocator + the
				// in-memory activeNative Map and write ZERO Redis records, so
				// displays.list (which SCANs the Redis-backed displayManager) never
				// sees them. registerExisting (display-manager.ts) is the idempotent,
				// no-second-X-server, no-allocator-advance adopt path built for the
				// boot `:1` case — it ONLY writes the Redis registry, so it does NOT
				// touch nativeDisplayAllocator or the x11vnc transport (hard
				// constraint). ownerSession:'' = host/shared (same as boot `:1`) so
				// canAccessDisplay lets the operator reach it. Guarded + try/catch so
				// a registry failure can NEVER abort the native spawn (Phase 259
				// stability).
				if (ctx.livinityd?.displayManager) {
					try {
						await ctx.livinityd.displayManager.registerExisting({
							display,
							mode: 'xvfb',
							width: 1280,
							height: 720,
							ownerSession: '',
							name: cfg.name,
						})
					} catch (regErr) {
						adaptLogger?.warn(
							'apps.native.spawn: displayManager.registerExisting failed for ' +
								display +
								' (continuing — display will not appear in popover): ' +
								(regErr instanceof Error ? regErr.message : String(regErr)),
						)
					}
				}

				logger?.log(
					'apps.native.spawn: ' + cfg.name + ' pid=' + spawnedPid + ' display=' + display + ' port=' + bound.port + ' streamId=' + bound.streamId,
				)
				const wmClassMeta = cfg.wmClassHint ?? inferWmClass(cfg.binaryPath)
				adaptLogger?.verbose?.('apps.native.spawn: wmClass metadata=' + wmClassMeta + ' (informational only)')

				return {
					id: cfg.id,
					pid: spawnedPid,
					display,
					displayN,
					port: bound.port,
					streamId: bound.streamId,
					wsUrl: bound.wsUrl,
				}
			} catch (err) {
				if (xvfb) {
					try {
						await xvfb.stop()
					} catch (stopErr) {
						adaptLogger?.warn('apps.native.spawn cleanup: xvfb.stop() failed: ' + (stopErr instanceof Error ? stopErr.message : String(stopErr)))
					}
				}
				nativeDisplayAllocator.release(displayN)
				void child

				if (err instanceof TRPCError) throw err
				const msg = err instanceof Error ? err.message : String(err)
				logger?.error('apps.native.spawn: orchestration failed for ' + cfg.name + ': ' + msg)
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'native-app orchestration failed: ' + msg,
				})
			}
		}),

	/**
	 * apps.native.close — Phase 102-08 D-102-CLOSE-LIFECYCLE.
	 *
	 * Adminprocedure gate (T-101-02 carry — adminProcedure on every mutation
	 * that can spawn or shut down a binary process). Input validates as
	 * `z.string().uuid()` before lookup.
	 *
	 * Returns `{ok: true}` whether the id was active or not — close is
	 * idempotent. The `closeNativeApp` primitive in native-app-binder.ts
	 * owns the ordered teardown (SIGTERM child → grace → SIGKILL → stopStream
	 * → xvfb.stop → display.release → port.release → active.delete).
	 */
	// Phase 157 round 5 — close is privateProcedure (was admin) so the
	// NativeAppStreamWindow unmount cleanup hook works for regular users.
	// Operation is idempotent and only affects the caller's own native
	// app instance (lookup is keyed by app UUID).
	close: privateProcedure
		.input(closeInput)
		.mutation(async ({ctx, input}) => {
			const sm = requireStreamManager(ctx)
			const logger = ctx.logger
			const adaptLogger = logger
				? {
						info: (m: string) => logger.log(m),
						warn: (m: string) => logger.error(m),
						error: (m: string) => logger.error(m),
						verbose: (m: string) => logger.verbose(m),
					}
				: undefined

			await closeNativeApp({
				id: input.id,
				active: activeNative,
				displayAllocator: nativeDisplayAllocator,
				portAllocator: sm.getPortAllocator(),
				streamManager: sm,
				logger: adaptLogger,
			})

			return {ok: true as const}
		}),
})

export type NativeAppsRouter = typeof nativeAppsRouter
