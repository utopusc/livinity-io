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
			`Native window primitive '${fn}' unavailable on platform: ${process.platform}. Bytebot computer-use requires Linux + X server (Mini PC).`,
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
 */
async function getWmctrlListOutput(): Promise<string> {
	const {stdout} = await exec('wmctrl -lx')
	return stdout
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
 * listWindows — return all open windows as `{id, class, title}` records.
 *
 * Wraps `wmctrl -lx`. Malformed lines are skipped with a console.warn (T-72N3-03 — output
 * is bounded by # of open windows, low cardinality).
 */
export async function listWindows(): Promise<
	Array<{id: string; class: string; title: string}>
> {
	ensureLinuxOrThrow('listWindows')

	const stdout = await getWmctrlListOutput()
	const lines = stdout.split('\n').filter(line => line.trim().length > 0)
	const result: Array<{id: string; class: string; title: string}> = []
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
