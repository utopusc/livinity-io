// Phase 290 R2 (R7) — host native-app scanner.
//
// Parses freedesktop `*.desktop` files from the user's + system applications
// dirs so the Add Shortcut → Native tab can show "Installed on this device".
// Read-only — it never spawns anything.
//
// ⛔ B1 FIX (adversarial): the `Exec=` first token is realpath-resolved to a
// clean ABSOLUTE path, with `%U/%F/%i/%c/%k` field codes + `env` / `flatpak
// run` wrappers stripped FIRST. Entries whose binary does not resolve to an
// absolute path under the allow-list (/usr/bin, /usr/local/bin, /opt,
// ~/.local/bin) are DROPPED — so a tile click can only ever feed
// `apps.native.create` a binaryPath that passes nativeAppConfigSchema's
// ABSOLUTE_PATH_RE. Native icons are http/root-relative or a bare freedesktop
// name (the UI resolves them), NEVER a data-URL.

import {createHash} from 'node:crypto'
import {promises as fs, realpathSync} from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {getDesktopHome} from '../system/desktop-user.js'

// nativeAppConfigSchema.binaryPath uses /^\/[a-zA-Z0-9_\-./]+$/ — mirror it so a
// scanned binaryPath is GUARANTEED to pass the schema at create time.
const ABSOLUTE_PATH_RE = /^\/[a-zA-Z0-9_\-./]+$/

export type ScannedNativeApp = {
	/** Stable id = sha256(binaryPath) hex. */
	id: string
	/** Display name (.desktop Name=). */
	name: string
	/** Realpath-resolved absolute binary path (passes ABSOLUTE_PATH_RE). */
	binaryPath: string
	/** Raw .desktop Icon= value (bare name OR path OR url) — UI resolves it. */
	icon?: string
	/**
	 * Phase 290 R3 (REQ3c) — a ready-to-render icon URL derived from the raw
	 * `Icon=` value:
	 *   - http(s) URL          → passed through unchanged
	 *   - absolute path        → `/api/native/icon-file?path=<enc>` (gated proxy)
	 *   - bare freedesktop name → `/api/native/icon/<enc(name)>`     (gated proxy)
	 * The proxy routes (server/index.ts) realpath-gate the served file. Absent
	 * when the entry has no `Icon=`.
	 */
	iconUrl?: string
	/** Optional StartupWMClass hint. */
	wmClassHint?: string
	/** Source .desktop path (diagnostics). */
	desktopPath: string
}

/**
 * Phase 290 R3 (REQ3c) — map a raw `.desktop` `Icon=` value to a ready-to-render
 * icon URL. Pure; exported for unit tests.
 *   - http(s) URL          → unchanged
 *   - absolute path        → `/api/native/icon-file?path=<enc>`
 *   - bare freedesktop name → `/api/native/icon/<enc(name)>`
 */
export function iconValueToUrl(icon: string | undefined): string | undefined {
	if (!icon) return undefined
	const raw = icon.trim()
	if (!raw) return undefined
	if (/^https?:\/\//i.test(raw)) return raw
	if (raw.startsWith('/')) return `/api/native/icon-file?path=${encodeURIComponent(raw)}`
	return `/api/native/icon/${encodeURIComponent(raw)}`
}

// ── .desktop parsing (pure; exported for unit tests) ─────────────────────────

export type DesktopEntryFields = {
	type?: string
	name?: string
	exec?: string
	icon?: string
	noDisplay?: string
	hidden?: string
	startupWmClass?: string
}

/**
 * Parse the `[Desktop Entry]` group of a .desktop file. Only the first group is
 * read; action groups ([Desktop Action …]) are ignored. Keys are
 * case-sensitive per the spec but we lowercase for lookup robustness.
 */
export function parseDesktopEntry(content: string): DesktopEntryFields {
	const out: DesktopEntryFields = {}
	let inEntry = false
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trim()
		if (line.startsWith('#') || line === '') continue
		if (line.startsWith('[')) {
			inEntry = line === '[Desktop Entry]'
			continue
		}
		if (!inEntry) continue
		const eq = line.indexOf('=')
		if (eq < 0) continue
		// Strip locale suffixes like Name[de]= → name.
		const key = line.slice(0, eq).split('[')[0].trim().toLowerCase()
		const value = line.slice(eq + 1).trim()
		switch (key) {
			case 'type':
				out.type = value
				break
			case 'name':
				if (out.name === undefined) out.name = value
				break
			case 'exec':
				if (out.exec === undefined) out.exec = value
				break
			case 'icon':
				if (out.icon === undefined) out.icon = value
				break
			case 'nodisplay':
				out.noDisplay = value
				break
			case 'hidden':
				out.hidden = value
				break
			case 'startupwmclass':
				out.startupWmClass = value
				break
			default:
				break
		}
	}
	return out
}

// Wrapper binaries whose FIRST positional arg is the real program to launch. We
// strip the wrapper and (for flatpak/snap) bail — those aren't plain binaries.
const FIELD_CODE_RE = /%[a-zA-Z]/g

/**
 * Extract the candidate binary token from an `Exec=` line. Strips field codes
 * (%U %F %i …), then unwraps a leading `env [VAR=val …]` prefix. Returns the
 * first remaining token, or null if the Exec is empty / only a non-launchable
 * wrapper (flatpak/snap/sh -c …). Exported for unit tests.
 */
export function extractExecBinary(execLine: string): string | null {
	if (!execLine) return null
	// Drop field codes and split on whitespace (naive — sufficient for the
	// realpath allow-list gate; we never re-exec this string).
	const cleaned = execLine.replace(FIELD_CODE_RE, ' ').trim()
	if (!cleaned) return null
	let tokens = cleaned.split(/\s+/).filter(Boolean)
	if (tokens.length === 0) return null

	// Unwrap a leading `env` plus any VAR=val assignments.
	if (tokens[0] === 'env' || tokens[0] === '/usr/bin/env') {
		tokens = tokens.slice(1)
		while (tokens.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
			tokens = tokens.slice(1)
		}
	}
	if (tokens.length === 0) return null

	const first = tokens[0]
	// Non-launchable wrappers — drop entirely (B1): these are not plain binaries
	// nativeAppConfigSchema can spawn.
	if (
		first === 'flatpak' ||
		first === 'snap' ||
		first === 'sh' ||
		first === 'bash' ||
		first === '/bin/sh' ||
		first === '/bin/bash'
	) {
		return null
	}
	// Strip surrounding quotes if present.
	return first.replace(/^["']|["']$/g, '')
}

// These are always Linux/POSIX paths (the scanner targets the LivOS box), so use
// path.posix unconditionally — path.join would inject backslashes on a Windows
// dev/test host and break the allow-list / candidate matching.
const ALLOWED_PREFIXES = (home: string): string[] => [
	'/usr/bin/',
	'/usr/local/bin/',
	'/usr/sbin/',
	'/opt/',
	'/snap/bin/', // Snap wrapper binaries (a /snap/bin/<name> binaryPath validates)
	path.posix.join(home, '.local/bin') + '/',
	path.posix.join(home, '.local', 'share', 'applications') + '/', // unlikely binaries but harmless
]

/**
 * Resolve a binary token to a clean ABSOLUTE path under the allow-list, or null.
 *
 * - A bare name (`gimp`) is resolved against the allow-listed bin dirs.
 * - An absolute path is realpath-resolved (symlinks → real target).
 * - The result must match ABSOLUTE_PATH_RE AND sit under an allow-listed prefix.
 *
 * The `realpath`/`stat` probes are injectable for unit tests.
 */
export type ResolveDeps = {
	home?: string
	realpath?: (p: string) => string
	exists?: (p: string) => boolean
}

export function resolveBinaryPath(token: string | null, deps: ResolveDeps = {}): string | null {
	if (!token) return null
	const home = deps.home ?? getDesktopHome()
	const realpath = deps.realpath ?? ((p: string) => realpathSync(p))
	const allowed = ALLOWED_PREFIXES(home)

	// Candidate absolute paths to try.
	const candidates: string[] = []
	if (token.startsWith('/')) {
		candidates.push(token)
	} else if (token.includes('/')) {
		// Relative-with-slash Exec (rare, e.g. ./foo) — not in a known bin dir; drop.
		return null
	} else {
		// Bare name — try each allow-listed bin dir (POSIX joins — see above).
		candidates.push('/usr/bin/' + token)
		candidates.push('/usr/local/bin/' + token)
		candidates.push('/opt/' + token)
		candidates.push(path.posix.join(home, '.local/bin', token))
	}

	for (const cand of candidates) {
		let resolved: string
		try {
			resolved = realpath(cand)
		} catch {
			continue // does not exist / broken symlink
		}
		if (!resolved.startsWith('/')) continue
		if (!ABSOLUTE_PATH_RE.test(resolved)) continue // contains chars the schema rejects
		if (!allowed.some((pre) => resolved.startsWith(pre) || resolved === pre.slice(0, -1))) {
			continue
		}
		return resolved
	}
	return null
}

/**
 * Build a ScannedNativeApp from parsed .desktop fields + a source path, applying
 * ALL the B1 gates. Returns null when the entry is hidden / not an Application /
 * its Exec binary does not resolve to an allow-listed absolute path. Pure +
 * unit-testable (resolution probes injectable).
 */
export function buildScannedApp(
	fields: DesktopEntryFields,
	desktopPath: string,
	deps: ResolveDeps = {},
): ScannedNativeApp | null {
	if (fields.type && fields.type !== 'Application') return null
	if (fields.noDisplay && fields.noDisplay.toLowerCase() === 'true') return null
	if (fields.hidden && fields.hidden.toLowerCase() === 'true') return null
	const name = (fields.name ?? '').trim()
	if (!name) return null

	const token = extractExecBinary(fields.exec ?? '')
	const binaryPath = resolveBinaryPath(token, deps)
	if (!binaryPath) return null // B1 — drop wrapper/bare-unresolvable/out-of-allowlist

	const out: ScannedNativeApp = {
		id: createHash('sha256').update(binaryPath).digest('hex'),
		name: name.slice(0, 128),
		binaryPath,
		desktopPath,
	}
	if (fields.icon) {
		out.icon = fields.icon.slice(0, 512)
		const iconUrl = iconValueToUrl(out.icon)
		if (iconUrl) out.iconUrl = iconUrl
	}
	if (fields.startupWmClass && /^[\w-]{1,64}$/.test(fields.startupWmClass)) {
		out.wmClassHint = fields.startupWmClass
	}
	return out
}

// ── Filesystem scan ──────────────────────────────────────────────────────────

function applicationDirs(home: string): string[] {
	return [
		path.posix.join(home, '.local', 'share', 'applications'),
		'/usr/share/applications',
		'/usr/local/share/applications',
		'/var/lib/flatpak/exports/share/applications', // parsed but flatpak Execs are dropped
	]
}

/**
 * Scan the host for installed native apps. Best-effort: a missing/unreadable dir
 * is skipped. De-duplicates by binaryPath (a user-dir .desktop overriding a
 * system one resolves to the same binary → one tile). Read-only.
 */
export async function scanHostApps(deps: {home?: string} = {}): Promise<ScannedNativeApp[]> {
	const home = deps.home ?? getDesktopHome() ?? os.homedir()
	const dirs = applicationDirs(home)
	const byBinary = new Map<string, ScannedNativeApp>()

	for (const dir of dirs) {
		let entries: string[]
		try {
			entries = await fs.readdir(dir)
		} catch {
			continue // dir absent / unreadable — skip
		}
		for (const entry of entries) {
			if (!entry.endsWith('.desktop')) continue
			const full = path.posix.join(dir, entry)
			let content: string
			try {
				content = await fs.readFile(full, 'utf8')
			} catch {
				continue
			}
			const fields = parseDesktopEntry(content)
			let app: ScannedNativeApp | null
			try {
				app = buildScannedApp(fields, full, {home})
			} catch {
				app = null
			}
			if (app && !byBinary.has(app.binaryPath)) byBinary.set(app.binaryPath, app)
		}
	}

	return [...byBinary.values()].sort((a, b) => a.name.localeCompare(b.name))
}
