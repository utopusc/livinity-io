// Phase 290 R3 (REQ3a) — freedesktop icon resolver tests.
//
// Covers: candidate ordering (user theme first, sizes desc, scalable, pixmaps),
// a HIT (first existing candidate wins), a MISS (no candidate exists → null),
// and the path-traversal property (a `..` name still resolves inside the theme
// roots — the candidate paths never escape; the HTTP route's name allowlist is
// the primary traversal gate, this asserts the resolver is defense-in-depth).
import {describe, it, expect} from 'vitest'

import {freedesktopIconCandidates, resolveFreedesktopIcon} from './freedesktop-icon-resolver.js'

const HOME = '/home/tester'

describe('freedesktopIconCandidates', () => {
	it('searches the user theme first, then system, largest size → smallest, then pixmaps', () => {
		const cands = freedesktopIconCandidates('gimp', HOME)
		// User theme dir comes before the system theme dir.
		const userIdx = cands.indexOf(`${HOME}/.local/share/icons/hicolor/512x512/apps/gimp.png`)
		const sysIdx = cands.indexOf('/usr/share/icons/hicolor/512x512/apps/gimp.png')
		expect(userIdx).toBeGreaterThanOrEqual(0)
		expect(sysIdx).toBeGreaterThan(userIdx)
		// 512 before 256 (sizes descending).
		const big = cands.indexOf('/usr/share/icons/hicolor/512x512/apps/gimp.png')
		const small = cands.indexOf('/usr/share/icons/hicolor/256x256/apps/gimp.png')
		expect(small).toBeGreaterThan(big)
		// scalable .svg is searched (after the raster sizes for a given root).
		expect(cands).toContain('/usr/share/icons/hicolor/scalable/apps/gimp.svg')
		// Flat pixmaps fallback is included.
		expect(cands).toContain('/usr/share/pixmaps/gimp.png')
		expect(cands).toContain('/usr/share/pixmaps/gimp.svg')
	})

	it('a `..` segment in the name cannot escape the theme roots (stays joined under them)', () => {
		const cands = freedesktopIconCandidates('..', HOME)
		// Every candidate must still live under one of the known icon roots /
		// pixmaps — none point at /etc or the fs root. (path.posix.join collapses
		// the `..`, so the basename portion just disappears, never escaping above
		// the apps dir.)
		const okRoot = (p: string) =>
			p.startsWith('/usr/share/icons/hicolor/') ||
			p.startsWith('/usr/local/share/icons/hicolor/') ||
			p.startsWith(`${HOME}/.local/share/icons/hicolor/`) ||
			p.startsWith('/usr/share/pixmaps')
		for (const c of cands) expect(okRoot(c)).toBe(true)
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

	it('returns the first existing candidate (HIT)', async () => {
		// Only the 256px system raster exists → it should win over later (smaller)
		// sizes and over pixmaps.
		const existing = new Set(['/usr/share/icons/hicolor/256x256/apps/gimp.png'])
		const hit = await resolveFreedesktopIcon('gimp', HOME, fakeStat(existing))
		expect(hit).toBe('/usr/share/icons/hicolor/256x256/apps/gimp.png')
	})

	it('prefers the user theme over the system theme when both exist', async () => {
		const existing = new Set([
			`${HOME}/.local/share/icons/hicolor/128x128/apps/code.png`,
			'/usr/share/icons/hicolor/128x128/apps/code.png',
		])
		const hit = await resolveFreedesktopIcon('code', HOME, fakeStat(existing))
		expect(hit).toBe(`${HOME}/.local/share/icons/hicolor/128x128/apps/code.png`)
	})

	it('returns null when no candidate exists (MISS)', async () => {
		const hit = await resolveFreedesktopIcon('does-not-exist', HOME, fakeStat(new Set()))
		expect(hit).toBeNull()
	})
})
