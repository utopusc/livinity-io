// Phase 290 R3 (REQ3a) — freedesktop icon resolver tests.
// Phase 290 R4 (INV-3) — extended for the BROADENED resolver (non-hicolor
// themes + top-level icons/ + app-private dirs + theme discovery/Inherits).
//
// Covers: candidate ordering (user theme first, hicolor first, sizes desc,
// scalable, pixmaps), a hicolor HIT, a NON-hicolor theme HIT (Adwaita), an
// app-private-dir HIT, theme discovery (an installed theme not in the known
// list still gets searched), a MISS (no candidate exists → null), and the
// path-traversal property (a `..` name still resolves inside the icon roots —
// the candidate paths never escape; the HTTP route's name allowlist + realpath
// gate are the primary traversal boundary, this asserts the resolver is
// defense-in-depth).
import {describe, it, expect} from 'vitest'

import {freedesktopIconCandidates, resolveFreedesktopIcon} from './freedesktop-icon-resolver.js'

const HOME = '/home/tester'

describe('freedesktopIconCandidates', () => {
	it('searches the user base first, hicolor theme first, largest size → smallest, then pixmaps', () => {
		const cands = freedesktopIconCandidates('gimp', HOME)
		// User base dir comes before the system base dir.
		const userIdx = cands.indexOf(`${HOME}/.local/share/icons/hicolor/512x512/apps/gimp.png`)
		const sysIdx = cands.indexOf('/usr/share/icons/hicolor/512x512/apps/gimp.png')
		expect(userIdx).toBeGreaterThanOrEqual(0)
		expect(sysIdx).toBeGreaterThan(userIdx)
		// 512 before 256 (sizes descending) within the same theme.
		const big = cands.indexOf('/usr/share/icons/hicolor/512x512/apps/gimp.png')
		const small = cands.indexOf('/usr/share/icons/hicolor/256x256/apps/gimp.png')
		expect(small).toBeGreaterThan(big)
		// scalable .svg is searched (after the raster sizes for a given theme).
		expect(cands).toContain('/usr/share/icons/hicolor/scalable/apps/gimp.svg')
		// Flat pixmaps fallback is included.
		expect(cands).toContain('/usr/share/pixmaps/gimp.png')
		expect(cands).toContain('/usr/share/pixmaps/gimp.svg')
	})

	it('also searches non-hicolor themes, the top-level icons/ dir, and app-private dirs', () => {
		const cands = freedesktopIconCandidates('gimp', HOME)
		// A non-hicolor known theme (Adwaita) is searched under each base.
		expect(cands).toContain('/usr/share/icons/Adwaita/512x512/apps/gimp.png')
		expect(cands).toContain('/usr/share/icons/Adwaita/scalable/apps/gimp.svg')
		// Top-level flat icons/ dir.
		expect(cands).toContain('/usr/share/icons/gimp.png')
		// App-private dirs.
		expect(cands).toContain('/usr/share/gimp/gimp.png')
		expect(cands).toContain('/usr/share/gimp/icons/gimp.svg')
		// hicolor is still searched BEFORE the other themes (precedence preserved).
		const hicolorIdx = cands.indexOf('/usr/share/icons/hicolor/512x512/apps/gimp.png')
		const adwaitaIdx = cands.indexOf('/usr/share/icons/Adwaita/512x512/apps/gimp.png')
		expect(hicolorIdx).toBeGreaterThanOrEqual(0)
		expect(adwaitaIdx).toBeGreaterThan(hicolorIdx)
	})

	it('expands an explicitly-supplied discovered theme list (e.g. a settings-panel theme)', () => {
		const cands = freedesktopIconCandidates('xfce4-settings', HOME, ['hicolor', 'elementary-xfce'])
		expect(cands).toContain('/usr/share/icons/elementary-xfce/512x512/apps/xfce4-settings.png')
		expect(cands).toContain('/usr/share/icons/elementary-xfce/scalable/apps/xfce4-settings.svg')
		// hicolor still first.
		const hicolorIdx = cands.indexOf('/usr/share/icons/hicolor/512x512/apps/xfce4-settings.png')
		const otherIdx = cands.indexOf('/usr/share/icons/elementary-xfce/512x512/apps/xfce4-settings.png')
		expect(otherIdx).toBeGreaterThan(hicolorIdx)
	})

	it('a `..` segment in the name cannot escape the icon roots (stays joined under them)', () => {
		const cands = freedesktopIconCandidates('..', HOME)
		// Every candidate must still live under one of the known icon roots /
		// pixmaps — none point at /etc, /usr (above share), or the fs root.
		// path.posix.join collapses the `..` in the BASENAME position to an empty
		// segment, and the app-private dirs (which would put `..` in a directory
		// position) are skipped for a non-plain name.
		const okRoot = (p: string) =>
			p.startsWith('/usr/share/icons/') ||
			p.startsWith('/usr/local/share/icons/') ||
			p.startsWith(`${HOME}/.local/share/icons/`) ||
			p.startsWith('/usr/share/pixmaps')
		for (const c of cands) expect(okRoot(c)).toBe(true)
		// And specifically: NO candidate is `/usr` or `/usr/...png` (would mean an
		// app-private `..` segment escaped /usr/share).
		expect(cands.every((c) => !/^\/usr\/[^/]*\.(png|svg|xpm)$/.test(c))).toBe(true)
	})
})

describe('resolveFreedesktopIcon', () => {
	// A stat fake that "exists" for a known set of paths, throws otherwise.
	function fakeStat(known: Set<string>): (p: string) => Promise<unknown> {
		return async (p: string) => {
			if (known.has(p)) return {}
			throw new Error('ENOENT')
		}
	}

	// fs seams bag whose readdir/readFile report no themes (forces the known-theme
	// floor) unless overridden.
	function seams(known: Set<string>, extra: Partial<{readdir: (p: string) => Promise<string[]>; readFile: (p: string) => Promise<string>}> = {}) {
		return {
			stat: fakeStat(known),
			readdir: extra.readdir ?? (async () => { throw new Error('ENOENT') }),
			readFile: extra.readFile ?? (async () => { throw new Error('ENOENT') }),
		}
	}

	it('returns the first existing candidate in hicolor (HIT)', async () => {
		// Only the 256px system hicolor raster exists → it should win over later
		// (smaller) sizes, other themes, and pixmaps.
		const existing = new Set(['/usr/share/icons/hicolor/256x256/apps/gimp.png'])
		const hit = await resolveFreedesktopIcon('gimp', HOME, seams(existing))
		expect(hit).toBe('/usr/share/icons/hicolor/256x256/apps/gimp.png')
	})

	it('finds an icon that lives ONLY in a non-hicolor theme (Adwaita) — INV-3 fix', async () => {
		// No hicolor / pixmaps icon exists; the app icon is only in Adwaita.
		const existing = new Set(['/usr/share/icons/Adwaita/256x256/apps/org.gnome.Settings.png'])
		const hit = await resolveFreedesktopIcon('org.gnome.Settings', HOME, seams(existing))
		expect(hit).toBe('/usr/share/icons/Adwaita/256x256/apps/org.gnome.Settings.png')
	})

	it('finds an icon in an app-private dir when no theme dir has it', async () => {
		const existing = new Set(['/usr/share/vlc/vlc.svg'])
		const hit = await resolveFreedesktopIcon('vlc', HOME, seams(existing))
		expect(hit).toBe('/usr/share/vlc/vlc.svg')
	})

	it('searches a theme DISCOVERED on disk that is not in the known-theme list', async () => {
		// readdir reports an installed theme (`elementary-xfce`) not hardcoded in
		// KNOWN_THEMES; its apps/ icon must be found.
		const existing = new Set(['/usr/share/icons/elementary-xfce/128x128/apps/xfce4-terminal.png'])
		const readdir = async (p: string) =>
			p === '/usr/share/icons' ? ['elementary-xfce', 'default'] : (() => { throw new Error('ENOENT') })()
		const hit = await resolveFreedesktopIcon('xfce4-terminal', HOME, seams(existing, {readdir}))
		expect(hit).toBe('/usr/share/icons/elementary-xfce/128x128/apps/xfce4-terminal.png')
	})

	it('follows a theme index.theme Inherits chain to a parent theme', async () => {
		// `Yaru` is discovered; its index.theme inherits a custom `Suru` parent that
		// is NOT in KNOWN_THEMES. The icon lives only in the parent.
		const existing = new Set(['/usr/share/icons/Suru/48x48/apps/firefox.png'])
		const readdir = async (p: string) =>
			p === '/usr/share/icons' ? ['Yaru'] : (() => { throw new Error('ENOENT') })()
		const readFile = async (p: string) =>
			p === '/usr/share/icons/Yaru/index.theme'
				? '[Icon Theme]\nName=Yaru\nInherits=Suru,hicolor\n'
				: (() => { throw new Error('ENOENT') })()
		const hit = await resolveFreedesktopIcon('firefox', HOME, seams(existing, {readdir, readFile}))
		expect(hit).toBe('/usr/share/icons/Suru/48x48/apps/firefox.png')
	})

	it('prefers the user base over the system base when both exist', async () => {
		const existing = new Set([
			`${HOME}/.local/share/icons/hicolor/128x128/apps/code.png`,
			'/usr/share/icons/hicolor/128x128/apps/code.png',
		])
		const hit = await resolveFreedesktopIcon('code', HOME, seams(existing))
		expect(hit).toBe(`${HOME}/.local/share/icons/hicolor/128x128/apps/code.png`)
	})

	it('returns null when no candidate exists (MISS)', async () => {
		const hit = await resolveFreedesktopIcon('does-not-exist', HOME, seams(new Set()))
		expect(hit).toBeNull()
	})

	it('still accepts a bare stat fn as the 3rd arg (back-compat signature)', async () => {
		const existing = new Set(['/usr/share/icons/hicolor/512x512/apps/gimp.png'])
		const hit = await resolveFreedesktopIcon('gimp', HOME, fakeStat(existing))
		expect(hit).toBe('/usr/share/icons/hicolor/512x512/apps/gimp.png')
	})
})
