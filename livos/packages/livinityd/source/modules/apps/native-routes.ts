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
import {getPool} from '../database/index.js'
import {scanHostApps as scanHostAppsImpl, type ScannedNativeApp} from './native-scanner.js'
import {validateAptPackages, APT_PACKAGE_RE, installFlathubApp} from './native-installer.js'
import {getDispatcher, buildInstallContext} from './v37-install-service.js'
import {
	nativeAppConfigSchema,
	NativeAppConfigStore,
} from './native-app-config.js'
import {spawnNativeApp} from './native-app-spawner.js'
import {bind, closeNativeApp, inferWmClass, type StreamStartFn} from './native-app-binder.js'
import {
	appDisplayAllocator,
	spawnXvfb,
	type XvfbHandle,
} from '../streaming/index.js'
import type {StreamManager} from '../streaming/stream-manager.js'

// Module-scope singletons

/**
 * DisplayAllocator for native-app spawns.
 *
 * CROSS-POOL FIX: this is now an ALIAS for the single process-global
 * `appDisplayAllocator` (streaming/display-allocator.ts), SHARED with the WebApp
 * window-manager. Both webapp and native spawns target the same X-server `:N`
 * namespace, so they must draw from ONE in-use Set — the old separate
 * `new DisplayAllocator()` (default [10,100)) overlapped the webapp range
 * [10,60) and handed out the same `:N`, so a native app would open inside a
 * WebApp's screen (and vice-versa). Range is [10,60), disjoint from MCP create
 * (>=60). Re-exported (same name) so the idle reaper + close paths in
 * livinityd/source/index.ts keep working unchanged.
 */
export const nativeDisplayAllocator = appDisplayAllocator

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

/**
 * SC-B (260.1) — close a NATIVE app by its X display (':N'), reusing the SAME
 * closeNativeApp teardown apps.native.close uses. Returns true if a native app
 * was found+closed, false if the display is not a native app (caller then falls
 * through to displayManager.kill for luse displays).
 *
 * Lets displays.close (computer-use/trpc-router.ts) tear native displays down
 * WITHOUT double-tearing the binary/Xvfb/port. It does NOT re-implement teardown
 * — it iterates the module-scope `activeNative` map for the entry whose
 * handle.display matches, then delegates to the existing closeNativeApp primitive
 * with the existing `nativeDisplayAllocator` + the stream manager's port
 * allocator (exactly as apps.native.close does). Does NOT change the :N allocator
 * (only passes it to closeNativeApp).
 */
export async function closeNativeAppByDisplay(
	display: string,
	deps: {
		streamManager: StreamManager
		logger?: {info(m: string): void; warn(m: string): void; error(m: string): void; verbose?(m: string): void}
	},
): Promise<boolean> {
	let nativeId: string | undefined
	for (const [id, handle] of activeNative) {
		if (handle.display === display) {
			nativeId = id
			break
		}
	}
	if (!nativeId) return false
	await closeNativeApp({
		id: nativeId,
		active: activeNative,
		displayAllocator: nativeDisplayAllocator,
		portAllocator: deps.streamManager.getPortAllocator(),
		streamManager: deps.streamManager,
		logger: deps.logger,
	})
	return true
}

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

function requireStore(ctx: {
	livinityd?: {nativeAppConfigStore?: NativeAppConfigStore | null; ai?: {redis?: unknown}}
}): NativeAppConfigStore {
	const store = ctx.livinityd?.nativeAppConfigStore
	if (store) return store
	// v44.52 resilience — the eager wiring in index.ts (this.nativeAppConfigStore,
	// set right after the boot Promise.all) can be ABSENT at request time if boot
	// degraded after :8080 was already bound (the documented post-await boot race
	// where a later init line throws but the Express listener is up, leaving fields
	// unset). At REQUEST time Redis has long since connected (ioredis auto-reconnect;
	// Docker apps prove it's live), so build the store on demand from the live redis.
	// NativeAppConfigStore is a thin stateless wrapper over the redis ref, so
	// constructing one per call is cheap and correct.
	const redis = ctx.livinityd?.ai?.redis
	if (redis) {
		return new NativeAppConfigStore(redis as ConstructorParameters<typeof NativeAppConfigStore>[0])
	}
	throw new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: 'Native app store not initialized (Redis unavailable?)',
	})
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

// ─── v44.58 r8 — generic app-store catalog mapping (Flathub-backed) ──────────
//
// OPERATOR REFINEMENT: the UI presents this as a GENERIC "Browse apps" store —
// NO "Flathub" / "Flatpak" / "runtime" branding is surfaced to the user (the
// upstream provider is an implementation detail). Internally it is the Flathub
// v2 collection/search API (verified live 2026-06-20):
//   GET  /api/v2/collection/popular?page=N&per_page=M           → Meilisearch shape
//   GET  /api/v2/collection/category/<MainCategory>?page&per_page → Meilisearch shape
//   POST /api/v2/search  {query, page, hits_per_page}            → Meilisearch shape
// Every endpoint returns {hits:[…], page, totalPages, totalHits, hitsPerPage}
// where each hit is {app_id, name, summary, icon, …}. `icon` is a full https
// dl.flathub.org URL (or null) — it satisfies nativeAppConfigSchema.iconUrl so it
// PERSISTS on the installed tile. We map hits → the SHARED tRPC contract
// {appId, name, summary, iconUrl?}, filter app_id to the reverse-DNS charset so a
// malformed hit can't reach the installer, and compute hasMore = page<totalPages
// (with an hits.length===per_page fallback when totalPages is absent).

export interface FlathubApp {
	appId: string
	name: string
	summary: string
	iconUrl?: string
}

/** A page of catalog results in the PINNED contract shape. */
export interface FlathubPage {
	apps: FlathubApp[]
	hasMore: boolean
}

const FLATHUB_HIT_APP_ID_RE = /^[A-Za-z0-9._-]+$/

/** Per-page fetch size for every collection/search query (PINNED ~30). */
export const FLATHUB_PER_PAGE = 30

/**
 * The user-facing category labels (PINNED contract list) mapped to the
 * Flathub freedesktop MainCategory slug each one queries. The slugs were
 * verified live against /api/v2/collection/category/<slug> (all HTTP 200).
 * The LABELS are deliberately generic (no "Flatpak"/"Flathub" wording).
 */
export const FLATHUB_CATEGORIES: ReadonlyArray<{label: string; slug: string}> = [
	{label: 'Productivity', slug: 'Office'},
	{label: 'Graphics & Photography', slug: 'Graphics'},
	{label: 'Games', slug: 'Game'},
	{label: 'Developer Tools', slug: 'Development'},
	{label: 'Audio & Video', slug: 'AudioVideo'},
	{label: 'Communication & News', slug: 'Network'},
	{label: 'Utilities', slug: 'Utility'},
	{label: 'Education', slug: 'Education'},
	{label: 'Science & Engineering', slug: 'Science'},
	{label: 'System', slug: 'System'},
]

/** The ordered category LABELS — the static flathubCategories() payload. */
export function flathubCategoryLabels(): string[] {
	return FLATHUB_CATEGORIES.map((c) => c.label)
}

/**
 * Map a user-facing category LABEL (or its raw slug, case-insensitively) to the
 * Flathub MainCategory slug. Returns undefined for an unknown/empty value so the
 * caller can fall back to the POPULAR collection (never a 422 from a bad slug).
 */
export function flathubSlugForLabel(label: string | undefined): string | undefined {
	if (!label) return undefined
	const needle = label.trim().toLowerCase()
	if (!needle) return undefined
	for (const c of FLATHUB_CATEGORIES) {
		if (c.label.toLowerCase() === needle || c.slug.toLowerCase() === needle) return c.slug
	}
	return undefined
}

function mapFlathubHits(hits: unknown[] | undefined): FlathubApp[] {
	if (!Array.isArray(hits)) return []
	const out: FlathubApp[] = []
	for (const raw of hits) {
		const h = raw as {app_id?: unknown; name?: unknown; summary?: unknown; icon?: unknown}
		const appId = typeof h.app_id === 'string' ? h.app_id : ''
		if (!appId || !FLATHUB_HIT_APP_ID_RE.test(appId)) continue
		out.push({
			appId,
			name: typeof h.name === 'string' ? h.name : appId,
			summary: typeof h.summary === 'string' ? h.summary : '',
			iconUrl: typeof h.icon === 'string' && h.icon ? h.icon : undefined,
		})
	}
	return out
}

/**
 * Compute hasMore from a Meilisearch-shaped response. Prefer the authoritative
 * `page < totalPages` signal; when totalPages is absent/non-numeric fall back to
 * the "a full page came back ⇒ there is probably more" heuristic.
 */
export function flathubHasMore(
	json: {page?: unknown; totalPages?: unknown},
	hitsLen: number,
	perPage: number,
	requestedPage: number,
): boolean {
	const totalPages = typeof json.totalPages === 'number' ? json.totalPages : undefined
	const page = typeof json.page === 'number' ? json.page : requestedPage
	if (totalPages !== undefined) return page < totalPages
	return hitsLen >= perPage
}

/** Clamp an incoming page to a sane 1-based integer. */
export function flathubClampPage(page: number | undefined): number {
	if (typeof page !== 'number' || !Number.isFinite(page)) return 1
	const p = Math.floor(page)
	return p < 1 ? 1 : p
}

/**
 * Fetch one page of a Flathub COLLECTION (popular or category) and map it to the
 * pinned {apps, hasMore} contract. Best-effort: a 5s-timeout, never-throw GET —
 * returns {apps:[],hasMore:false} on ANY failure (timeout / non-200 / parse).
 * `slug` undefined ⇒ the popular collection; set ⇒ /category/<slug>.
 */
async function fetchFlathubCollection(slug: string | undefined, page: number): Promise<FlathubPage> {
	const p = flathubClampPage(page)
	const path = slug ? `category/${encodeURIComponent(slug)}` : 'popular'
	const url = `https://flathub.org/api/v2/collection/${path}?page=${p}&per_page=${FLATHUB_PER_PAGE}`
	try {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 5000)
		let json: {hits?: unknown[]; page?: unknown; totalPages?: unknown}
		try {
			const res = await fetch(url, {signal: controller.signal})
			if (!res.ok) throw new Error(`flathub collection HTTP ${res.status}`)
			json = (await res.json()) as typeof json
		} finally {
			clearTimeout(timer)
		}
		const apps = mapFlathubHits(json.hits)
		return {apps, hasMore: flathubHasMore(json, apps.length, FLATHUB_PER_PAGE, p)}
	} catch {
		return {apps: [], hasMore: false}
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

	// ─── Phase 290 R2 (R7) — host native-app scan + apt install ──────────────
	//
	// scanHostApps: read-only list of installed host apps parsed from .desktop
	// files (B1 — realpath'd, allow-listed binaryPath). Clicking a result in the
	// Native tab calls apps.native.create with this binaryPath (passes
	// nativeAppConfigSchema). The whole Native tab is admin-gated in the UI (M4)
	// because create/installFromHost are admin mutations.
	scanHostApps: privateProcedure.query(async (): Promise<ScannedNativeApp[]> => {
		return scanHostAppsImpl()
	}),

	// installFromHost: install a host app from a single apt package. H1 — synthesize
	// a minimal native manifest and hand it to the SAME InstallDispatcher /
	// NativeInstaller.install() the store uses (which runs #aptInstall + writes the
	// .desktop + upserts the config). We do NOT also configStore.upsert separately
	// (no double-create — install()'s tail does it). Admin-gated (privileged sudo apt).
	installFromHost: adminProcedure
		.input(
			z.object({
				pkg: z.string().min(1).max(128),
				name: z.string().min(1).max(128),
				binaryPath: z
					.string()
					.regex(/^\/[a-zA-Z0-9_\-./]+$/, 'binaryPath must be an absolute path')
					.optional(),
				iconUrl: z.string().max(2048).optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			// Validate the package name BEFORE any spawn (LIVOS-044 charset — no
			// `-o` hook injection through the apt NOPASSWD wildcard).
			const pkgErr = validateAptPackages([input.pkg])
			if (pkgErr) {
				throw new TRPCError({code: 'BAD_REQUEST', message: pkgErr})
			}
			const d = getDispatcher()
			if (!d) {
				throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'install dispatcher not initialised'})
			}
			const pool = getPool()
			if (!pool) {
				throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'PostgreSQL pool unavailable'})
			}
			// Default the launch binary to /usr/bin/<pkg> (apt installs land there);
			// the caller may override with a known absolute path (APT_PACKAGE_RE
			// already guarantees pkg is safe for a path segment).
			const binaryPath =
				input.binaryPath ?? (APT_PACKAGE_RE.test(input.pkg) ? `/usr/bin/${input.pkg}` : '')
			if (!binaryPath) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'could not derive a binary path'})
			}
			// H1 — synthesized native manifest (NativeInstaller.parseManifest shape).
			const manifest = {
				install: {primary: 'apt' as const, aptPackages: [input.pkg]},
				launch: {binaryPath},
				desktopEntry: {name: input.name, icon: input.iconUrl},
			}
			const redis = ctx.livinityd?.ai?.redis
			if (!redis) {
				throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'redis unavailable'})
			}
			const userId = ctx.currentUser?.id ?? 'admin'
			const installCtx = buildInstallContext({
				userId,
				redis,
				pg: pool,
				logger: {
					info: (m: string) => ctx.logger?.log?.(m),
					warn: (m: string) => ctx.logger?.error?.(m),
					error: (m: string, extra?: unknown) =>
						ctx.logger?.error?.(m, extra as Error | undefined),
				},
			})
			const outcome = await d.install(
				{
					id: input.pkg,
					name: input.name,
					section: 'native',
					category: 'native',
					manifest,
					iconUrl: input.iconUrl,
				},
				installCtx,
				() => {},
			)
			return outcome
		}),

	// ─── v44.58 r8 — generic APP STORE catalog (Add Shortcut → "Browse apps") ──
	//
	// A browsable+searchable catalog backed by the Flathub v2 API (an internal
	// implementation detail — the UI surfaces NO "Flathub"/"Flatpak" branding).
	// flathubCategories feeds the category dropdown; flathubBrowse feeds the grid
	// (popular when no category, else that category collection; paginated);
	// flathubSearch feeds the search grid (paginated). installFlathub installs via
	// `flatpak install --user … flathub <appId>` (NO sudo — the unprivileged daemon
	// user) and persists a tile whose iconUrl is the https catalog URL (so it
	// PERSISTS). All admin-gated (the Native tab is M4 admin-gated in the UI;
	// installs are mutations).
	//
	// flathubCategories/flathubBrowse/flathubSearch are best-effort, NEVER-throw
	// QUERIES (an upstream outage must not break the dialog) — the browse/search
	// queries return {apps:[], hasMore:false} on any failure. Mapping is shared:
	// {appId, name, summary, iconUrl?} with the app_id filtered to the reverse-DNS
	// charset. Only the FIRST page of popular is Redis-cached (key
	// liv:flathub:popular:p1, 6h) — category/other pages are fetched live.

	// flathubCategories — STATIC, no network. Returns the ordered user-facing
	// category labels (each maps internally to a Flathub MainCategory slug).
	flathubCategories: adminProcedure.query(async (): Promise<string[]> => {
		return flathubCategoryLabels()
	}),

	// flathubBrowse — paginated grid. No/empty category ⇒ the POPULAR collection
	// (page 1 Redis-cached 6h); a known category label/slug ⇒ that category
	// collection (live). Returns {apps, hasMore} per the pinned contract.
	flathubBrowse: adminProcedure
		.input(
			z.object({
				category: z.string().max(64).optional(),
				page: z.number().int().min(1).max(1000).optional(),
			}),
		)
		.query(async ({ctx, input}): Promise<FlathubPage> => {
			const page = flathubClampPage(input.page)
			const slug = flathubSlugForLabel(input.category)

			// Popular page 1 is cached (the hot default the dialog opens on). Any
			// other page/category is fetched live (never cached). An unknown category
			// label → slug undefined → falls back to popular (never a 422).
			const isCachedPopular = !slug && page === 1
			if (isCachedPopular) {
				const cacheKey = 'liv:flathub:popular:p1'
				const r = ctx.livinityd?.ai?.redis as
					| {get(k: string): Promise<string | null>; set(...a: unknown[]): Promise<unknown>}
					| undefined
				const result = await fetchFlathubCollection(undefined, 1)
				// Only cache a SUCCESSFUL fetch (don't poison the cache with an empty
				// outage result). On a failed fetch, serve a previously-cached page.
				if (result.apps.length > 0) {
					try {
						await r?.set(cacheKey, JSON.stringify(result), 'EX', 21600)
					} catch {
						/* cache write best-effort */
					}
					return result
				}
				try {
					const cached = await r?.get(cacheKey)
					if (cached) return JSON.parse(cached) as FlathubPage
				} catch {
					/* cache read best-effort */
				}
				return result // {apps:[], hasMore:false}
			}

			return fetchFlathubCollection(slug, page)
		}),

	// flathubSearch — paginated full-catalog search. Returns {apps, hasMore} (the
	// totalPages signal drives "load more"). 5s timeout, never throws.
	flathubSearch: adminProcedure
		.input(
			z.object({
				query: z.string().min(1).max(128),
				page: z.number().int().min(1).max(1000).optional(),
			}),
		)
		.query(async ({input}): Promise<FlathubPage> => {
			const page = flathubClampPage(input.page)
			try {
				const controller = new AbortController()
				const timer = setTimeout(() => controller.abort(), 5000)
				let json: {hits?: unknown[]; page?: unknown; totalPages?: unknown}
				try {
					const res = await fetch('https://flathub.org/api/v2/search', {
						method: 'POST',
						headers: {'Content-Type': 'application/json'},
						body: JSON.stringify({
							query: input.query,
							hits_per_page: FLATHUB_PER_PAGE,
							page,
						}),
						signal: controller.signal,
					})
					if (!res.ok) throw new Error(`flathub search HTTP ${res.status}`)
					json = (await res.json()) as typeof json
				} finally {
					clearTimeout(timer)
				}
				const apps = mapFlathubHits(json.hits)
				return {apps, hasMore: flathubHasMore(json, apps.length, FLATHUB_PER_PAGE, page)}
			} catch {
				return {apps: [], hasMore: false}
			}
		}),

	installFlathub: adminProcedure
		.input(
			z.object({
				appId: z
					.string()
					.min(1)
					.max(255)
					.regex(/^[A-Za-z0-9._][A-Za-z0-9._-]*$/),
				name: z.string().min(1).max(64).optional(),
				iconUrl: z.string().max(2048).optional(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			const store = requireStore(ctx)
			const pool = getPool()
			if (!pool) {
				throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'PostgreSQL pool unavailable'})
			}
			const redis = ctx.livinityd?.ai?.redis
			if (!redis) {
				throw new TRPCError({code: 'SERVICE_UNAVAILABLE', message: 'redis unavailable'})
			}
			const userId = ctx.currentUser?.id ?? 'admin'
			const installCtx = buildInstallContext({
				userId,
				redis,
				pg: pool,
				logger: {
					info: (m: string) => ctx.logger?.log?.(m),
					warn: (m: string) => ctx.logger?.error?.(m),
					error: (m: string, extra?: unknown) =>
						ctx.logger?.error?.(m, extra as Error | undefined),
				},
			})
			const r = await installFlathubApp(input.appId, installCtx, store, {
				name: input.name,
				iconUrl: input.iconUrl,
			})
			if (!r.ok) {
				throw new TRPCError({code: 'BAD_REQUEST', message: r.message ?? 'install failed'})
			}
			return r
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

			// [SC2 — Phase 260-02] Capture the display BEFORE closeNativeApp runs:
			// closeNativeApp deletes the activeNative handle (the only place the
			// `:N` is known), so we must read it first to remove the matching
			// displayManager registry record after teardown.
			const closingDisplay = activeNative.get(input.id)?.display

			await closeNativeApp({
				id: input.id,
				active: activeNative,
				displayAllocator: nativeDisplayAllocator,
				portAllocator: sm.getPortAllocator(),
				streamManager: sm,
				logger: adaptLogger,
			})

			// [SC2 — Phase 260-02] Explicitly remove the native display's Redis
			// record so it disappears from the Displays popover IMMEDIATELY on
			// close (RESEARCH Open Q4 prefers explicit del over waiting for the
			// TTL/orphan GC — which is kept as a backstop). kill() with
			// callerSession:'' passes the owner gate because native displays are
			// registered with ownerSession:'' (host/shared). There is no
			// displayManager-owned X handle and no attached apps for a native
			// display, so kill() only DELs the two Redis keys — it never touches
			// the native binary/Xvfb (closeNativeApp already tore those down) or
			// the nativeDisplayAllocator. Guarded + try/catch so removal can NEVER
			// crash close (preserves Phase 259 stability).
			if (closingDisplay && ctx.livinityd?.displayManager) {
				try {
					await ctx.livinityd.displayManager.kill({
						display: closingDisplay,
						callerSession: '',
					})
				} catch (delErr) {
					adaptLogger?.warn(
						'apps.native.close: displayManager.kill failed for ' +
							closingDisplay +
							' (continuing — TTL/orphan GC will reap it): ' +
							(delErr instanceof Error ? delErr.message : String(delErr)),
					)
				}
			}

			return {ok: true as const}
		}),
})

export type NativeAppsRouter = typeof nativeAppsRouter
