// Phase 331-03 (FIX-03) — jellyfin-preconfig unit tests.
//
// Locks the catalog-precedence guard (resolveJellyfinPermissions) that closes the
// 329-11 caveat #5: shouldPreferCatalog('jellyfin') is true, so a platform-DB
// catalog template can shadow the builtin manifest; without the guard a catalog
// manifest lacking `permissions` silently stripped the builtin GPU permission and
// the whole MEDIA-02 preconfig went inert. Also adds first-ever coverage for the
// 329-11 pure helpers (resolveJellyfinHwAccel / buildEncodingXml).

import {describe, expect, it} from 'vitest'

import {
	buildEncodingXml,
	resolveJellyfinHwAccel,
	resolveJellyfinPermissions,
} from './jellyfin-preconfig.js'

const BUILTIN_PERMS = ['GPU']

describe('resolveJellyfinPermissions — 331-03 catalog-precedence guard', () => {
	it('manifest WITH a GPU token passes through untouched (no shadow)', () => {
		const r = resolveJellyfinPermissions(['GPU'], BUILTIN_PERMS)
		expect(r).toEqual({permissions: ['GPU'], shadowFallback: false, explicitSkip: false})
	})

	it('manifest WITH GPU-NVIDIA also counts as a GPU token', () => {
		const r = resolveJellyfinPermissions(['GPU-NVIDIA'], BUILTIN_PERMS)
		expect(r).toEqual({permissions: ['GPU-NVIDIA'], shadowFallback: false, explicitSkip: false})
	})

	it('manifest with NO permissions field (catalog dropped it) falls back to the builtin — the still-seeds arm', () => {
		const r = resolveJellyfinPermissions(undefined, BUILTIN_PERMS)
		expect(r).toEqual({permissions: BUILTIN_PERMS, shadowFallback: true, explicitSkip: false})
	})

	it('missing manifest permissions + builtin also GPU-less → fallback is NOT flagged as a shadow', () => {
		const r = resolveJellyfinPermissions(undefined, [])
		expect(r).toEqual({permissions: [], shadowFallback: false, explicitSkip: false})
		const r2 = resolveJellyfinPermissions(undefined, undefined)
		expect(r2).toEqual({permissions: undefined, shadowFallback: false, explicitSkip: false})
	})

	it('manifest with an EXPLICIT non-GPU permissions list is respected but flagged for the notice — the never-silent arm', () => {
		const r = resolveJellyfinPermissions(['SOMETHING-ELSE'], BUILTIN_PERMS)
		expect(r).toEqual({permissions: ['SOMETHING-ELSE'], shadowFallback: false, explicitSkip: true})
	})

	it('explicit EMPTY permissions list is an explicit skip too (not a fallback)', () => {
		const r = resolveJellyfinPermissions([], BUILTIN_PERMS)
		expect(r).toEqual({permissions: [], shadowFallback: false, explicitSkip: true})
	})

	it('explicit non-GPU list with a GPU-less builtin flags nothing (nothing was shadowed)', () => {
		const r = resolveJellyfinPermissions(['X'], undefined)
		expect(r).toEqual({permissions: ['X'], shadowFallback: false, explicitSkip: false})
	})
})

describe('resolveJellyfinHwAccel — 329-11 branch precedence (first coverage)', () => {
	const base = {
		wantsGpu: true,
		hostHasNvidia: false,
		nvidiaToolkitInstalled: false,
		hostVendorAmd: false,
		hostWsl2: false,
		deviceHasGpu: false,
	}
	it('no GPU wanted → null', () => {
		expect(resolveJellyfinHwAccel({...base, wantsGpu: false, hostHasNvidia: true, nvidiaToolkitInstalled: true})).toBe(
			null,
		)
	})
	it('NVIDIA + toolkit → nvenc (highest precedence)', () => {
		expect(
			resolveJellyfinHwAccel({...base, hostHasNvidia: true, nvidiaToolkitInstalled: true, deviceHasGpu: true}),
		).toBe('nvenc')
	})
	it('bare-metal AMD → vaapi; WSL2-AMD does NOT take the AMD branch', () => {
		expect(resolveJellyfinHwAccel({...base, hostVendorAmd: true})).toBe('vaapi')
		expect(resolveJellyfinHwAccel({...base, hostVendorAmd: true, hostWsl2: true})).toBe(null)
	})
	it('generic /dev/dri passthrough → vaapi; nothing resolved → null', () => {
		expect(resolveJellyfinHwAccel({...base, deviceHasGpu: true})).toBe('vaapi')
		expect(resolveJellyfinHwAccel(base)).toBe(null)
	})
})

describe('buildEncodingXml — 329-11 minimal-delta body (first coverage)', () => {
	it('nvenc body has the branch + hw-encoding flags and NO VaapiDevice', () => {
		const xml = buildEncodingXml('nvenc')
		expect(xml).toContain('<HardwareAccelerationType>nvenc</HardwareAccelerationType>')
		expect(xml).toContain('<EnableHardwareEncoding>true</EnableHardwareEncoding>')
		expect(xml).not.toContain('VaapiDevice')
	})
	it('vaapi body carries the render-node VaapiDevice', () => {
		const xml = buildEncodingXml('vaapi')
		expect(xml).toContain('<HardwareAccelerationType>vaapi</HardwareAccelerationType>')
		expect(xml).toContain('<VaapiDevice>/dev/dri/renderD128</VaapiDevice>')
	})
})
