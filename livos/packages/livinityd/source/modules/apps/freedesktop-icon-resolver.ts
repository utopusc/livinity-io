// Phase 290 R3 (REQ3a) — freedesktop icon-theme resolver.
// Phase 290 R4 (INV-3) — BROADENED so non-hicolor themes + app-private dirs hit.
//
// A `.desktop` Icon= key is usually a BARE theme name (`gimp`, not a path). The
// freedesktop Icon Theme spec resolves it to a real file by searching the icon
// THEME directories (and the legacy flat /usr/share/pixmaps) for a matching
// basename with a known image extension.
//
// v44.53 shipped a resolver that searched ONLY the `hicolor` theme + flat
// pixmaps. On a real XFCE/GNOME desktop most app icons (and ALL the XFCE
// settings-panel icons) live in OTHER themes — Adwaita, Yaru, gnome, Humanity,
// breeze, elementary, Papirus — or in app-private dirs (`/usr/share/<app>/…`),
// so every lookup 404'd → the UI fell back to the generic placeholder for every
// scanned app. INV-3 widens the search (additive — hicolor + pixmaps still win
// first when present) to:
//   (a) icons/<theme>/<size>/apps for hicolor AND the other common themes,
//       discovered from the on-disk icons/ dir when cheap (else a fixed list);
//   (b) the top-level icons/ dir (some packages drop a flat <name>.png there);
//   (c) best-effort app-private dirs: /usr/share/<name>/<name>.{png,svg,xpm}
//       and /usr/share/<name>/icons/<name>.{png,svg,xpm}.
// We search the user's ~/.local/share/icons first, then /usr/share +
// /usr/local/share, at the largest available size down to 16px (plus `scalable`
// for SVGs). Optionally we follow a theme's index.theme `Inherits=` chain.
//
// Pure resolver — it only `fs.stat`s candidate paths (and, for theme discovery,
// best-effort `readdir`s the icons/ dirs) and returns the first file that
// exists. The gated HTTP route (native-icon-api.ts) realpath-asserts the result
// is under an allow-listed root (/usr/share, /usr/local/share, /opt,
// ~/.local/share) BEFORE serving it; EVERY candidate below stays under one of
// those roots, so the broadening adds NO new reachable path. This module does
// NOT serve bytes and never re-execs anything.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import {getDesktopHome} from '../system/desktop-user.js'

// Theme sizes searched largest → smallest. `scalable` (SVG) is searched after
// the fixed pixel sizes so a crisp raster wins when present, but an SVG is found
// when no raster exists.
const HICOLOR_SIZES = [512, 256, 128, 96, 64, 48, 32, 24, 16] as const

// Image extensions, in preference order (png/svg/xpm per the spec's common set).
const ICON_EXTENSIONS = ['.png', '.svg', '.xpm'] as const

// The `share` bases that hold an `icons/` theme dir AND app-private dirs. User
// dir first so a user override wins. These map 1:1 to the native-icon-api
// allow-list roots (~/.local/share, /usr/share, /usr/local/share).
function shareBases(home: string): string[] {
	return [
		path.posix.join(home, '.local', 'share'),
		'/usr/share',
		'/usr/local/share',
	]
}

// Themes searched, in order, when on-disk discovery is unavailable or as the
// floor set merged into whatever IS discovered. `hicolor` is the spec's
// fallback theme and stays FIRST so the prior v44.53 behaviour is preserved
// (a hicolor hit still wins). The rest are the common desktop themes whose
// `apps/` dirs hold real GIMP/VLC/Chrome + XFCE-settings icons.
const KNOWN_THEMES = [
	'hicolor',
	'Adwaita',
	'Yaru',
	'gnome',
	'Humanity',
	'Humanity-Dark',
	'breeze',
	'elementary',
	'Papirus',
	'Papirus-Dark',
	'Mint-Y',
	'ubuntu-mono-dark',
	'ubuntu-mono-light',
] as const

// Cap on how many themes we will expand into candidate paths, so a box with a
// huge icons/ dir can't explode the candidate list. hicolor is always kept.
const MAX_THEMES = 24

// A "plain" icon basename safe to use AS A DIRECTORY SEGMENT for the
// app-private dirs (`<base>/<name>/…`). The native-icon-api bare-name regex
// already rejects `/`, but it ALLOWS `..` (two dots match the `.` class) — and
// `path.posix.join('/usr/share', '..')` would collapse to `/usr`, escaping the
// base. Only the app-private candidates use `name` as a path segment, so we gate
// THEM on this (the theme `apps/<name>.ext` candidates put `name` only in the
// basename, which path.posix.join leaves harmlessly empty for `..`). This keeps
// every candidate under an allow-listed root (defense-in-depth; the realpath
// gate in native-icon-api is still the primary boundary).
const PLAIN_NAME_SEGMENT_RE = /^[a-zA-Z0-9_+.-]+$/
function isPlainNameSegment(name: string): boolean {
	return PLAIN_NAME_SEGMENT_RE.test(name) && name !== '.' && name !== '..' && !name.includes('/')
}

/**
 * Order a discovered/known theme set so `hicolor` is always first (spec
 * fallback + preserves v44.53 precedence), then the rest in a stable order,
 * de-duplicated and capped.
 */
function orderThemes(themes: Iterable<string>): string[] {
	const seen = new Set<string>()
	const out: string[] = []
	const push = (t: string) => {
		if (t && !seen.has(t)) {
			seen.add(t)
			out.push(t)
		}
	}
	push('hicolor')
	// Keep the KNOWN_THEMES order for ones that ARE present, so the common
	// desktop themes come before less-common discovered ones.
	const present = new Set(themes)
	for (const t of KNOWN_THEMES) if (present.has(t)) push(t)
	for (const t of themes) push(t)
	return out.slice(0, MAX_THEMES)
}

/**
 * Push the sized `apps/` candidates (raster sizes desc + scalable svg) for a
 * single `root/<theme>` into `candidates`.
 */
function pushThemeCandidates(candidates: string[], themeRoot: string, name: string): void {
	for (const size of HICOLOR_SIZES) {
		const dir = path.posix.join(themeRoot, `${size}x${size}`, 'apps')
		for (const ext of ICON_EXTENSIONS) {
			candidates.push(path.posix.join(dir, `${name}${ext}`))
		}
	}
	// scalable (.svg) lives in its own size bucket.
	candidates.push(path.posix.join(themeRoot, 'scalable', 'apps', `${name}.svg`))
}

/**
 * Build the ordered list of candidate absolute paths for a bare icon `name`,
 * given a desktop `home` and the set of icon `themes` to expand (defaults to the
 * known-theme list when discovery is not supplied). Order, per base
 * (~/.local/share → /usr/share → /usr/local/share):
 *   1. each theme's sized apps/ (hicolor first; sizes desc; scalable svg);
 *   2. the top-level icons/ dir (flat <name>.{png,svg,xpm});
 *   3. app-private dirs (<base>/<name>/<name>.* and <base>/<name>/icons/<name>.*).
 * Then the legacy flat /usr/share/pixmaps fallback.
 *
 * Exported for unit tests (pure — no fs).
 */
export function freedesktopIconCandidates(
	name: string,
	home: string,
	themes: readonly string[] = KNOWN_THEMES,
): string[] {
	const candidates: string[] = []
	const orderedThemes = orderThemes(themes)

	for (const base of shareBases(home)) {
		const iconsDir = path.posix.join(base, 'icons')
		// (a) per-theme sized apps/ dirs.
		for (const theme of orderedThemes) {
			pushThemeCandidates(candidates, path.posix.join(iconsDir, theme), name)
		}
		// (b) top-level icons/ dir (some packages drop a flat icon here).
		for (const ext of ICON_EXTENSIONS) {
			candidates.push(path.posix.join(iconsDir, `${name}${ext}`))
		}
		// (c) app-private dirs (best effort): <base>/<name>/<name>.* and
		// <base>/<name>/icons/<name>.* — these stay UNDER <base>, so they remain
		// inside the native-icon-api allow-list. ONLY when `name` is a plain
		// segment (a `..`/`.` name would collapse out of <base>, so we skip it —
		// keeps the resolver's defense-in-depth no-escape property).
		if (isPlainNameSegment(name)) {
			const appDir = path.posix.join(base, name)
			for (const ext of ICON_EXTENSIONS) {
				candidates.push(path.posix.join(appDir, `${name}${ext}`))
			}
			for (const ext of ICON_EXTENSIONS) {
				candidates.push(path.posix.join(appDir, 'icons', `${name}${ext}`))
			}
		}
	}

	// Legacy flat pixmaps dir (no theme structure).
	for (const ext of ICON_EXTENSIONS) {
		candidates.push(path.posix.join('/usr/share/pixmaps', `${name}${ext}`))
	}

	return candidates
}

/**
 * Cheaply discover the icon themes actually present on disk by reading each
 * base's `icons/` dir. Best-effort: any base that can't be read is skipped. The
 * caller merges this with the known-theme floor set. `readdirFn` is injectable
 * for unit tests.
 */
async function discoverThemes(
	home: string,
	readdirFn: (p: string) => Promise<string[]>,
): Promise<string[]> {
	const found = new Set<string>()
	for (const base of shareBases(home)) {
		const iconsDir = path.posix.join(base, 'icons')
		let entries: string[]
		try {
			entries = await readdirFn(iconsDir)
		} catch {
			continue // no icons/ dir under this base — skip.
		}
		for (const entry of entries) {
			// Skip the spec's non-theme dirs and anything path-ish.
			if (!entry || entry === 'default' || entry.includes('/') || entry.startsWith('.')) continue
			found.add(entry)
		}
	}
	return [...found]
}

/**
 * Best-effort: read a theme's `index.theme` and return its `Inherits=` parents
 * (comma-separated). Used to follow the inheritance chain so e.g. an app that
 * only ships an icon in a parent theme is still found. Returns [] on any error.
 * Only reads ONE index.theme (the first base that has the theme) — cheap.
 */
async function readThemeInherits(
	home: string,
	theme: string,
	readFileFn: (p: string) => Promise<string>,
): Promise<string[]> {
	for (const base of shareBases(home)) {
		const indexPath = path.posix.join(base, 'icons', theme, 'index.theme')
		let text: string
		try {
			text = await readFileFn(indexPath)
		} catch {
			continue
		}
		// Grab the first `Inherits=` line (ini-style; first match is the [Icon Theme] one).
		const match = text.match(/^\s*Inherits\s*=\s*(.+)$/m)
		if (!match) return []
		return match[1]
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0 && !s.includes('/') && !s.startsWith('.'))
	}
	return []
}

/**
 * Injectable fs seams for {@link resolveFreedesktopIcon}. Production passes
 * nothing → real fs.stat/readdir/readFile. Tests inject fakes.
 */
export interface ResolveIconFs {
	stat?: (p: string) => Promise<unknown>
	readdir?: (p: string) => Promise<string[]>
	readFile?: (p: string) => Promise<string>
}

/**
 * Resolve a bare freedesktop icon `name` to the first existing file on disk, or
 * `null` if none of the candidate theme paths exist. `home` defaults to the
 * desktop user's home (livinityd runs AS that user).
 *
 * Steps: (1) cheaply discover present themes by reading each base's icons/ dir;
 * (2) follow each present theme's index.theme Inherits chain (best-effort);
 * (3) build the broadened candidate list and return the first fs.stat hit.
 *
 * The 3rd arg accepts either a bare `stat` fn (back-compat with the v44.53
 * signature) or a {@link ResolveIconFs} bag of seams.
 */
export async function resolveFreedesktopIcon(
	name: string,
	home: string = getDesktopHome(),
	fsSeams: ((p: string) => Promise<unknown>) | ResolveIconFs = {},
): Promise<string | null> {
	// Back-compat: a bare function is the old `statFn` positional arg.
	const seams: ResolveIconFs =
		typeof fsSeams === 'function' ? {stat: fsSeams} : fsSeams
	const statFn = seams.stat ?? ((p: string) => fs.stat(p))
	const readdirFn = seams.readdir ?? ((p: string) => fs.readdir(p))
	const readFileFn = seams.readFile ?? ((p: string) => fs.readFile(p, 'utf8'))

	// (1) discover themes present on disk (best-effort; merged with known floor).
	let themes: string[]
	try {
		themes = await discoverThemes(home, readdirFn)
	} catch {
		themes = []
	}
	// Merge discovered + known floor so a missing/empty icons/ dir still searches
	// the common themes.
	const themeSet = new Set<string>([...KNOWN_THEMES, ...themes])

	// (2) follow Inherits chains for the present themes (one level — cheap; the
	// parents are usually in KNOWN_THEMES anyway). Skip if no themes discovered.
	for (const theme of themes) {
		try {
			for (const parent of await readThemeInherits(home, theme, readFileFn)) {
				themeSet.add(parent)
			}
		} catch {
			// Ignore — Inherits is advisory.
		}
	}

	// (3) probe candidates; first fs.stat hit wins (largest-size + hicolor first).
	for (const candidate of freedesktopIconCandidates(name, home, [...themeSet])) {
		try {
			await statFn(candidate)
			return candidate
		} catch {
			// Does not exist / unreadable — try the next candidate.
		}
	}
	return null
}
