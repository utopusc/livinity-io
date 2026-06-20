// Phase 290 R3 (REQ3a) — freedesktop icon-theme resolver.
//
// A `.desktop` Icon= key is usually a BARE theme name (`gimp`, not a path). The
// freedesktop Icon Theme spec resolves it to a real file by searching the
// hicolor theme directories (and the legacy flat /usr/share/pixmaps) for a
// matching basename with a known image extension. We search the user's
// ~/.local/share/icons first, then the system /usr/share/icons + pixmaps, at
// the largest available size down to 16px (plus `scalable` for SVGs).
//
// Pure resolver — it only `fs.stat`s candidate paths and returns the first that
// exists. The gated HTTP route (server/index.ts) realpath-asserts the result is
// under an allow-listed root BEFORE serving it; this module does NOT serve
// bytes and never re-execs anything.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'

import {getDesktopHome} from '../system/desktop-user.js'

// hicolor sizes searched largest → smallest. `scalable` (SVG) is searched after
// the fixed pixel sizes so a crisp raster wins when present, but an SVG is found
// when no raster exists.
const HICOLOR_SIZES = [512, 256, 128, 96, 64, 48, 32, 24, 16] as const

// Image extensions, in preference order (png/svg/xpm per the spec's common set).
const ICON_EXTENSIONS = ['.png', '.svg', '.xpm'] as const

/**
 * Build the ordered list of candidate absolute paths for a bare icon `name`,
 * given a desktop `home`. The order is: user hicolor (sized desc + scalable),
 * system hicolor (sized desc + scalable), then the flat pixmaps dir.
 *
 * Exported for unit tests (pure — no fs).
 */
export function freedesktopIconCandidates(name: string, home: string): string[] {
	const candidates: string[] = []

	const iconRoots = [
		// User theme dir first so a user override wins.
		path.posix.join(home, '.local', 'share', 'icons', 'hicolor'),
		'/usr/share/icons/hicolor',
		'/usr/local/share/icons/hicolor',
	]

	for (const root of iconRoots) {
		for (const size of HICOLOR_SIZES) {
			const dir = path.posix.join(root, `${size}x${size}`, 'apps')
			for (const ext of ICON_EXTENSIONS) {
				candidates.push(path.posix.join(dir, `${name}${ext}`))
			}
		}
		// scalable (.svg) lives in its own size bucket.
		const scalableDir = path.posix.join(root, 'scalable', 'apps')
		candidates.push(path.posix.join(scalableDir, `${name}.svg`))
	}

	// Legacy flat pixmaps dir (no theme structure).
	for (const ext of ICON_EXTENSIONS) {
		candidates.push(path.posix.join('/usr/share/pixmaps', `${name}${ext}`))
	}

	return candidates
}

/**
 * Resolve a bare freedesktop icon `name` to the first existing file on disk, or
 * `null` if none of the candidate theme paths exist. `home` defaults to the
 * desktop user's home (livinityd runs AS that user). The `stat` probe is
 * injectable for unit tests.
 */
export async function resolveFreedesktopIcon(
	name: string,
	home: string = getDesktopHome(),
	statFn: (p: string) => Promise<unknown> = (p) => fs.stat(p),
): Promise<string | null> {
	for (const candidate of freedesktopIconCandidates(name, home)) {
		try {
			await statFn(candidate)
			return candidate
		} catch {
			// Does not exist / unreadable — try the next candidate.
		}
	}
	return null
}
