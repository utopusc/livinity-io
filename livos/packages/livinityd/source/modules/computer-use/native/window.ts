/**
 * Native window management + file read — port of Bytebot's bytebotd application/file handlers.
 *
 * Upstream reference (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *   File: packages/bytebotd/src/computer-use/computer-use.service.ts (application + read_file actions)
 *   Snapshot date: 2026-05-05
 *
 * Strategy: spawn-based wmctrl detection + activation; spawn-based application launch with
 * detached + unref pattern (replaces upstream nohup). Adaptations for Ubuntu 24.04 native
 * environment (gnome-terminal/nautilus/firefox vs upstream xfce/thunar/firefox-esr).
 *
 * Per .planning/phases/72-computer-use-agent-loop/72-CONTEXT.md D-NATIVE-04 + D-NATIVE-07.
 *
 * Apache 2.0 NOTICE: full license at .planning/licenses/bytebot-LICENSE.txt.
 */
import {exec as execCb, spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {promisify} from 'node:util'

const exec = promisify(execCb)

/**
 * Application names supported by the native port. Mirrors upstream Bytebot's
 * `ApplicationAction.application` enum (computer-use.service.ts), minus `1password`
 * which is not installed on Mini PC native (returns isError instead). See D-NATIVE-07.
 */
export type ApplicationName =
	| 'firefox'
	| 'thunderbird'
	| 'vscode'
	| 'terminal'
	| 'directory'
	| 'desktop'
	| '1password'

/**
 * APP_MAP — application key → command/class binding (D-NATIVE-07 verbatim).
 *
 * Adaptations from upstream Bytebot bytebotd container:
 *   - DROPPED `sudo -u user` wrapper (livinityd runs as root via user-namespace; D-NATIVE-09).
 *   - DROPPED `nohup` (replaced by `{detached:true, stdio:'ignore'}` + `child.unref()`).
 *   - `firefox` (NOT `firefox-esr` — Mini PC ships firefox via snap/apt).
 *   - `gnome-terminal` (NOT `xfce4-terminal`).
 *   - `nautilus` (NOT `thunar`).
 *   - `1password` is unsupported on Mini PC native — returns isError.
 *
 * Class names are best-effort and verified by 72-native-07 UAT against real `wmctrl -lx`.
 */
type AppEntry =
	| {command: string; className: string}
	| {special: 'desktop'}
	| {unsupported: true}

const APP_MAP: Record<ApplicationName, AppEntry> = {
	firefox: {command: 'firefox', className: 'firefox.Firefox'},
	thunderbird: {command: 'thunderbird', className: 'Mail.thunderbird'},
	vscode: {command: 'code', className: 'code.Code'},
	terminal: {
		command: 'gnome-terminal',
		className: 'gnome-terminal-server.Gnome-terminal',
	},
	directory: {command: 'nautilus', className: 'nautilus.Nautilus'},
	desktop: {special: 'desktop'},
	'1password': {unsupported: true},
}

/**
 * MIME_MAP — extension → MIME type lookup. Inline pure JS map to avoid taking
 * a runtime dep on `mime-types` from this leaf module (D-NO-NEW-DEPS / D-NATIVE-12).
 *
 * Fallback: 'application/octet-stream' for unknown extensions.
 */
const MIME_MAP: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
	'.txt': 'text/plain',
	'.json': 'application/json',
	'.html': 'text/html',
	'.htm': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.md': 'text/markdown',
	'.csv': 'text/csv',
	'.zip': 'application/zip',
	'.xml': 'application/xml',
	'.yaml': 'application/yaml',
	'.yml': 'application/yaml',
}

/**
 * Throws if not running on linux (D-NATIVE-14). Native primitives require an X
 * server + wmctrl + native binaries — these only exist on Linux.
 */
function ensureLinuxOrThrow(fn: string): void {
	if (process.platform !== 'linux') {
		throw new Error(
			`Native window primitive '${fn}' unavailable on platform: ${process.platform}. Luse computer-use requires Linux + X server (Mini PC).`,
		)
	}
}

/**
 * Spawn `command` with `args`, detached + stdio:'ignore' + DISPLAY=':0' env, then
 * call `child.unref()` so the parent (livinityd) can exit independently.
 *
 * This is the Node.js-native replacement for upstream Bytebot's `nohup` shell prefix
 * (D-NATIVE-07 adaptation).
 */
function spawnAndForget(command: string, args: string[]): void {
	const child = spawn(command, args, {
		detached: true,
		stdio: 'ignore',
		env: {...process.env, DISPLAY: ':0'},
	})
	child.unref()
}

/**
 * Run `wmctrl -lx` and return its stdout. Errors propagate up.
 *
 * 2026-05-10 P100-10-03 — optional `display` parameter threads through as
 * a `DISPLAY=<value>` env override on the exec call so wmctrl talks to
 * the caller's per-WebApp Xvfb display (LUSE_DISPLAY) rather than the
 * default host display. W4 lock: backend stays on wmctrl (NOT xdotool
 * search) to preserve the 240+ existing tests' invariants.
 */
async function getWmctrlListOutput(display?: string): Promise<string> {
	if (display !== undefined) {
		const {stdout} = await exec('wmctrl -lx', {env: {...process.env, DISPLAY: display}})
		return stdout
	}
	const {stdout} = await exec('wmctrl -lx')
	return stdout
}

/**
 * 2026-05-10 P100-10-03 — Run `wmctrl -lG` and return its stdout.
 *
 * Unlike `wmctrl -lx` (which lists wm-class + title), the `-lG` flag emits
 * the per-window geometry tuple: `<wid_hex> <desktop> <x> <y> <w> <h>
 * <host> <title...>`. The agent needs this for click-coordinate planning
 * in window-relative space.
 *
 * W4 lock (D-100-10-C / 100-10-CONTEXT.md): we deliberately stay on
 * wmctrl rather than swapping to `xdotool search --onlyvisible --name .`
 * — the existing module is wmctrl-based; switching backends would
 * invalidate the existing 240+ tests' invariants.
 */
async function getWmctrlGeometryOutput(display: string): Promise<string> {
	const {stdout} = await exec('wmctrl -lG', {env: {...process.env, DISPLAY: display}})
	return stdout
}

/**
 * Parse a single `wmctrl -lG` output line into a window record with
 * geometry. Line format: `<wid_hex>  <desktop>  <x>  <y>  <w>  <h>
 * <host>  <title...>`. Returns null for malformed lines.
 */
function parseWmctrlGeometryLine(
	line: string,
): {id: string; geometry: {x: number; y: number; w: number; h: number}; title: string} | null {
	const parts = line.split(/\s+/)
	if (parts.length < 8) return null
	const [id, , xStr, yStr, wStr, hStr, , ...titleParts] = parts
	if (!id) return null
	const x = Number(xStr)
	const y = Number(yStr)
	const w = Number(wStr)
	const h = Number(hStr)
	if (![x, y, w, h].every((n) => Number.isFinite(n))) return null
	const title = titleParts.join(' ').trim()
	return {id, geometry: {x, y, w, h}, title}
}

/**
 * Parse a single `wmctrl -lx` output line into a window record.
 *
 * Line format: `<window-id>  <desktop>  <wm-class>  <hostname>  <title>`
 * Columns are whitespace-separated; the title may contain spaces and runs to EOL.
 *
 * Returns null for malformed lines (caller logs a warning). Minimum 5 fields needed.
 */
function parseWmctrlLine(line: string): {id: string; class: string; title: string} | null {
	const parts = line.split(/\s+/)
	if (parts.length < 5) return null
	const [id, , wmClass, , ...titleParts] = parts
	if (!id || !wmClass) return null
	const title = titleParts.join(' ').trim()
	return {id, class: wmClass, title}
}

/**
 * Infer MIME type from a filename's extension. Lowercases ext before lookup.
 * Falls back to 'application/octet-stream' for unknown extensions.
 */
function inferMimeType(filename: string): string {
	const ext = path.extname(filename).toLowerCase()
	return MIME_MAP[ext] ?? 'application/octet-stream'
}

/**
 * openOrFocus — launch or focus an application by symbolic name.
 *
 * Behavior (D-NATIVE-07 / direct port of upstream `application` action handler):
 *   1. Validate `application` key is in APP_MAP. Otherwise → isError.
 *   2. Special case `desktop`: spawn `wmctrl -k on` (toggles show-desktop). Return.
 *   3. Special case `1password` (unsupported): return `{isError:true}` without spawning.
 *   4. Run `wmctrl -lx`, scan stdout for the app's class string.
 *      - If found → spawn `wmctrl -x -a <class>` to focus + activate (NO detach).
 *      - If not found → spawn the app's command with detached + DISPLAY=:0 + unref.
 *
 * Spawn args use array form exclusively — no shell injection surface (T-72N3-02 mitigated).
 *
 * @param application One of the keys in APP_MAP. Validated at runtime.
 * @returns `{isError: false}` on success, `{isError: true, message}` on failure.
 */
export async function openOrFocus(
	application: ApplicationName,
): Promise<{isError: boolean; message?: string}> {
	ensureLinuxOrThrow('openOrFocus')

	const entry = APP_MAP[application as ApplicationName]
	if (!entry) {
		return {
			isError: true,
			message: `unknown application: ${String(application)}`,
		}
	}

	if ('unsupported' in entry) {
		return {
			isError: true,
			message: `application not installed: ${application}`,
		}
	}

	if ('special' in entry && entry.special === 'desktop') {
		try {
			spawn('wmctrl', ['-k', 'on'], {
				detached: false,
				stdio: 'ignore',
				env: {...process.env, DISPLAY: ':0'},
			})
			return {isError: false}
		} catch (err) {
			return {
				isError: true,
				message: `failed to toggle desktop: ${(err as Error).message}`,
			}
		}
	}

	// Standard application path: detect → activate or launch.
	const {command, className} = entry as {command: string; className: string}
	let alreadyOpen = false
	try {
		const stdout = await getWmctrlListOutput()
		alreadyOpen = stdout.includes(className)
	} catch (err) {
		// wmctrl missing or DISPLAY unset — treat as not-open and try to launch.
		console.warn(
			`[native/window] wmctrl -lx failed; assuming ${application} is not running: ${(err as Error).message}`,
		)
	}

	try {
		if (alreadyOpen) {
			// Activate existing window. NOT detached — short-lived wmctrl call.
			spawn('wmctrl', ['-x', '-a', className], {
				detached: false,
				stdio: 'ignore',
				env: {...process.env, DISPLAY: ':0'},
			})
		} else {
			// Launch new instance, detach so livinityd can exit independently.
			spawnAndForget(command, [])
		}
		return {isError: false}
	} catch (err) {
		return {
			isError: true,
			message: `failed to ${alreadyOpen ? 'focus' : 'launch'} ${application}: ${(err as Error).message}`,
		}
	}
}

/**
 * listWindows — return all open windows.
 *
 * **Legacy (no-arg) call:** wraps `wmctrl -lx`, returns
 * `Array<{id, class, title}>`. Used by existing `openOrFocus` flows and
 * pre-P100-10-03 callers. Malformed lines are skipped with a
 * console.warn (T-72N3-03 — output is bounded by # of open windows,
 * low cardinality).
 *
 * **Display-scoped (P100-10-03) call:** when `opts.display` is set (or
 * defaults from `LUSE_DISPLAY` / `DISPLAY` env), wraps `wmctrl -lG`
 * with `DISPLAY=<display>` env override and returns
 * `Array<{id, class, title, geometry: {x,y,w,h}, display}>`. The
 * per-WebApp Luse MCP child reads `LUSE_DISPLAY` from env via the
 * default-fill in `mcp__luse__list_windows`. W4 lock — stays on wmctrl
 * (NOT xdotool search) per D-100-10-C / 100-10-CONTEXT.md.
 *
 * The two call-shapes are distinguished by whether `opts` is undefined
 * vs an explicit `{display?: string}` object. Calling `listWindows()`
 * with no args preserves the pre-P100-10-03 return shape; calling
 * `listWindows({})` or `listWindows({display: ':10'})` returns the
 * geometry-extended shape with `display` field populated.
 */
export type ListWindowsLegacy = {id: string; class: string; title: string}
export type ListWindowsExtended = {
	id: string
	class: string
	title: string
	geometry: {x: number; y: number; w: number; h: number}
	display: string
}

export function listWindows(): Promise<Array<ListWindowsLegacy>>
export function listWindows(opts: {display?: string}): Promise<Array<ListWindowsExtended>>
export async function listWindows(
	opts?: {display?: string},
): Promise<Array<ListWindowsLegacy> | Array<ListWindowsExtended>> {
	ensureLinuxOrThrow('listWindows')

	// Legacy no-arg path — preserved verbatim for back-compat callers
	// (openOrFocus + tests T6/T7).
	if (opts === undefined) {
		const stdout = await getWmctrlListOutput()
		const lines = stdout.split('\n').filter((line) => line.trim().length > 0)
		const result: Array<ListWindowsLegacy> = []
		for (const line of lines) {
			const parsed = parseWmctrlLine(line)
			if (parsed) {
				result.push(parsed)
			} else {
				console.warn(
					`[native/window] skipping malformed wmctrl -lx line: ${JSON.stringify(line)}`,
				)
			}
		}
		return result
	}

	// P100-10-03 display-scoped path. Resolution priority:
	//   1. opts.display (explicit)
	//   2. LUSE_DISPLAY env (per-WebApp Luse MCP child)
	//   3. DISPLAY env (process default)
	//   4. ':0' (host default)
	const display = opts.display ?? process.env.LUSE_DISPLAY ?? process.env.DISPLAY ?? ':0'

	// Issue TWO wmctrl commands in parallel so we can correlate geometry +
	// wm-class for each wid. -lG gives geometry but not class; -lx gives
	// class but not geometry. Both are bounded by window count.
	const [geomStdout, classStdout] = await Promise.all([
		getWmctrlGeometryOutput(display),
		getWmctrlListOutput(display),
	])

	// Build a wid → class lookup from -lx output.
	const classMap = new Map<string, string>()
	for (const line of classStdout.split('\n')) {
		if (line.trim().length === 0) continue
		const parsed = parseWmctrlLine(line)
		if (parsed) classMap.set(parsed.id, parsed.class)
	}

	const result: Array<ListWindowsExtended> = []
	for (const line of geomStdout.split('\n')) {
		if (line.trim().length === 0) continue
		const parsed = parseWmctrlGeometryLine(line)
		if (!parsed) {
			console.warn(
				`[native/window] skipping malformed wmctrl -lG line: ${JSON.stringify(line)}`,
			)
			continue
		}
		result.push({
			id: parsed.id,
			class: classMap.get(parsed.id) ?? '',
			title: parsed.title,
			geometry: parsed.geometry,
			display,
		})
	}
	return result
}

/**
 * readFileBase64 — read a file from disk and return base64-encoded contents +
 * inferred mime + size + basename.
 *
 * The MCP `read_file` tool handler wraps this — agent emits an arbitrary path
 * (T-72N3-01: information disclosure accepted; computer-use mode is intentionally
 * privileged on Mini PC per D-NATIVE-09). Future hardening: path allowlist.
 *
 * Note: NOT linux-gated — file reads work on any platform (the agent is Linux-only,
 * but unit tests + Windows dev env can exercise this primitive).
 */
export async function readFileBase64(filePath: string): Promise<{
	base64: string
	filename: string
	size: number
	mimeType: string
}> {
	const buffer = await readFile(filePath)
	const filename = path.basename(filePath)
	return {
		base64: buffer.toString('base64'),
		filename,
		size: buffer.length,
		mimeType: inferMimeType(filename),
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 160-03 — LivOS app catalog resolver
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by computer_application handler BEFORE classic APP_MAP. Queries
// WebApps + Native apps in parallel, returns first case-insensitive name
// match. Null if not found → caller falls through to APP_MAP (Bytebot
// binary spawn path).
//
// The handler in mcp/tools.ts owns the dispatch wire (stderr IPC line
// "open_livos_app kind=... appId=... route=..."). This module ships the
// pure resolver function + types; livinityd wires the default resolver
// at runtime by passing the trpc-backed listWebApps + listNativeApps
// closures along with the authenticated user's slug + domain root.

/** Shape returned by the LivOS app resolver on a successful name match. */
export interface LivosAppMatch {
	kind: 'webapp' | 'native'
	appId: string
	/** Route for windowManager.openWindow — WebApp gets a URL, native gets `/native/<id>`. */
	route: string
	title: string
	icon: string
}

/** Resolver function type. Returns null when no LivOS app matches `name`. */
export type LivosAppResolver = (name: string) => Promise<LivosAppMatch | null>

/**
 * Default resolver that queries livinityd trpc procedures. Dependency-injected
 * so test harnesses can substitute mocks for listWebApps / listNativeApps
 * without needing a real DB pool.
 *
 * URL pattern is the operator-blessed DASH form: `<app>-<user>.<root>`
 * (e.g. `n8n-bruce.livinity.io`). NEVER the dot form `<app>.<user>.<root>`.
 * The Plan 160-02 overlay teaches the agent the same convention so the
 * computer-use loop's URL hint stays consistent with the resolver output.
 *
 * Match policy: case-insensitive equality on the app's display name (falls
 * back to subdomain/id when name is absent). WebApps tried before Native to
 * match the common agent intent — "open n8n" usually means the browser app
 * since most LivOS apps are web-based.
 */
export async function defaultLivosAppResolver(
	name: string,
	deps: {
		listWebApps: () => Promise<Array<{id: string; subdomain?: string; name?: string}>>
		listNativeApps: () => Promise<Array<{id: string; name?: string; iconUrl?: string}>>
		userSlug: string
		domainRoot: string
		proto?: 'http' | 'https'
	},
): Promise<LivosAppMatch | null> {
	const needle = name.toLowerCase().trim()
	if (needle.length === 0) return null
	const proto = deps.proto ?? 'https'

	const [webapps, natives] = await Promise.all([
		deps.listWebApps().catch(() => []),
		deps.listNativeApps().catch(() => []),
	])

	// Match WebApp first (more likely the user intent for browser-based apps).
	for (const wa of webapps) {
		const candidate = (wa.name ?? wa.subdomain ?? wa.id).toLowerCase()
		if (candidate === needle) {
			// Phase 160-03 — domain pattern is <app>-<user>.<root> (DASH separator).
			// NEVER the dot form <app>.<user>.<root>. Test invariant locks this.
			const sub = wa.subdomain ?? wa.id
			const url = `${proto}://${sub}-${deps.userSlug}.${deps.domainRoot}/`
			return {
				kind: 'webapp',
				appId: wa.id,
				route: url,
				title: wa.name ?? sub,
				icon: '',
			}
		}
	}

	// Then Native apps — convention is `/native/<id>` route.
	for (const na of natives) {
		const candidate = (na.name ?? na.id).toLowerCase()
		if (candidate === needle) {
			return {
				kind: 'native',
				appId: na.id,
				route: `/native/${na.id}`,
				title: na.name ?? na.id,
				icon: na.iconUrl ?? '',
			}
		}
	}

	return null
}
