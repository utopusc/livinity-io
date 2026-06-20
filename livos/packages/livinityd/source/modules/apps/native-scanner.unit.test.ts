// Phase 290 R2 (R7) — native-scanner pure-function tests.
//
// Locks the B1 gates: Exec field-code / env / flatpak unwrapping, realpath +
// allow-list resolution, and the hidden/NoDisplay/Type drops. No filesystem
// (the realpath/exists probes are injected).
import {describe, it, expect} from 'vitest'

import {
	parseDesktopEntry,
	extractExecBinary,
	resolveBinaryPath,
	buildScannedApp,
	iconValueToUrl,
} from './native-scanner.js'

const HOME = '/home/tester'

// A realpath fake that "resolves" a known set of binaries and throws (ENOENT)
// for anything else.
function fakeRealpath(known: Record<string, string>): (p: string) => string {
	return (p: string) => {
		if (p in known) return known[p]
		throw new Error('ENOENT')
	}
}

describe('parseDesktopEntry', () => {
	it('reads the [Desktop Entry] group and ignores actions/comments/locales', () => {
		const f = parseDesktopEntry(
			[
				'# a comment',
				'[Desktop Entry]',
				'Type=Application',
				'Name=GIMP',
				'Name[de]=GIMP DE',
				'Exec=gimp %U',
				'Icon=gimp',
				'StartupWMClass=Gimp',
				'',
				'[Desktop Action new-window]',
				'Name=New Window',
				'Exec=gimp --new',
			].join('\n'),
		)
		expect(f.type).toBe('Application')
		expect(f.name).toBe('GIMP') // first Name wins, locale stripped
		expect(f.exec).toBe('gimp %U')
		expect(f.icon).toBe('gimp')
		expect(f.startupWmClass).toBe('Gimp')
	})
})

describe('extractExecBinary (B1 — field codes + wrapper unwrap)', () => {
	it('strips %U/%F/%i field codes and returns the bare binary', () => {
		expect(extractExecBinary('gimp %U')).toBe('gimp')
		expect(extractExecBinary('/usr/bin/code --unity-launch %F')).toBe('/usr/bin/code')
	})

	it('unwraps a leading env + VAR=val prefix', () => {
		expect(extractExecBinary('env LANG=C GDK_BACKEND=x11 inkscape %F')).toBe('inkscape')
		expect(extractExecBinary('/usr/bin/env FOO=bar blender')).toBe('blender')
	})

	it('drops flatpak / snap / sh -c wrappers (not plain binaries)', () => {
		expect(extractExecBinary('flatpak run org.gimp.GIMP')).toBeNull()
		expect(extractExecBinary('snap run spotify')).toBeNull()
		expect(extractExecBinary('sh -c "exec foo"')).toBeNull()
		expect(extractExecBinary('/bin/bash -c foo')).toBeNull()
	})

	it('returns null for an empty Exec', () => {
		expect(extractExecBinary('')).toBeNull()
		expect(extractExecBinary('   ')).toBeNull()
	})
})

describe('resolveBinaryPath (B1 — realpath + allow-list)', () => {
	const deps = {
		home: HOME,
		realpath: fakeRealpath({
			'/usr/bin/gimp': '/usr/bin/gimp',
			'/usr/bin/code': '/usr/bin/code',
			'/opt/brave': '/opt/brave/brave',
			[`${HOME}/.local/bin/mytool`]: `${HOME}/.local/bin/mytool`,
			'/usr/bin/evil; rm -rf': '/usr/bin/evil; rm -rf', // realpaths but has metachars
		}),
	}

	it('resolves a bare name against allow-listed bin dirs', () => {
		expect(resolveBinaryPath('gimp', deps)).toBe('/usr/bin/gimp')
		expect(resolveBinaryPath('mytool', deps)).toBe(`${HOME}/.local/bin/mytool`)
	})

	it('resolves an absolute path via realpath', () => {
		expect(resolveBinaryPath('/usr/bin/code', deps)).toBe('/usr/bin/code')
	})

	it('drops a name that does not resolve anywhere', () => {
		expect(resolveBinaryPath('does-not-exist', deps)).toBeNull()
	})

	it('drops a resolved path containing shell metachars (fails ABSOLUTE_PATH_RE)', () => {
		expect(resolveBinaryPath('/usr/bin/evil; rm -rf', deps)).toBeNull()
	})

	it('drops a relative-with-slash Exec', () => {
		expect(resolveBinaryPath('./foo', deps)).toBeNull()
	})

	it('drops null/empty token', () => {
		expect(resolveBinaryPath(null, deps)).toBeNull()
	})
})

describe('buildScannedApp (full B1 gate)', () => {
	const deps = {
		home: HOME,
		realpath: fakeRealpath({'/usr/bin/gimp': '/usr/bin/gimp'}),
	}

	it('builds a tile for a valid Application entry', () => {
		const app = buildScannedApp(
			{type: 'Application', name: 'GIMP', exec: 'gimp %U', icon: 'gimp', startupWmClass: 'Gimp'},
			'/usr/share/applications/gimp.desktop',
			deps,
		)
		expect(app).not.toBeNull()
		expect(app!.name).toBe('GIMP')
		expect(app!.binaryPath).toBe('/usr/bin/gimp')
		expect(app!.icon).toBe('gimp')
		expect(app!.wmClassHint).toBe('Gimp')
		expect(app!.id).toMatch(/^[0-9a-f]{64}$/)
	})

	it('drops NoDisplay=true, Hidden=true, and non-Application types', () => {
		expect(
			buildScannedApp({type: 'Application', name: 'X', exec: 'gimp', noDisplay: 'true'}, 'a', deps),
		).toBeNull()
		expect(
			buildScannedApp({type: 'Application', name: 'X', exec: 'gimp', hidden: 'true'}, 'a', deps),
		).toBeNull()
		expect(buildScannedApp({type: 'Link', name: 'X', exec: 'gimp'}, 'a', deps)).toBeNull()
	})

	it('drops an entry whose Exec is a flatpak wrapper (B1)', () => {
		expect(
			buildScannedApp({type: 'Application', name: 'GIMP', exec: 'flatpak run org.gimp.GIMP'}, 'a', deps),
		).toBeNull()
	})

	it('drops an entry with no resolvable binary', () => {
		expect(
			buildScannedApp({type: 'Application', name: 'Ghost', exec: 'ghost-binary'}, 'a', deps),
		).toBeNull()
	})

	it('drops an entry with no Name', () => {
		expect(buildScannedApp({type: 'Application', exec: 'gimp'}, 'a', deps)).toBeNull()
	})

	it('populates iconUrl from a bare Icon= (REQ3c — gated proxy)', () => {
		const app = buildScannedApp(
			{type: 'Application', name: 'GIMP', exec: 'gimp %U', icon: 'gimp'},
			'/usr/share/applications/gimp.desktop',
			deps,
		)
		expect(app!.iconUrl).toBe('/api/native/icon/gimp')
	})

	it('omits iconUrl when there is no Icon= key', () => {
		const app = buildScannedApp(
			{type: 'Application', name: 'GIMP', exec: 'gimp %U'},
			'/usr/share/applications/gimp.desktop',
			deps,
		)
		expect(app!.iconUrl).toBeUndefined()
	})
})

describe('iconValueToUrl (REQ3c — Icon= → render URL)', () => {
	it('maps a bare freedesktop name to the gated icon route', () => {
		expect(iconValueToUrl('gimp')).toBe('/api/native/icon/gimp')
	})

	it('maps an absolute path to the gated icon-file route', () => {
		expect(iconValueToUrl('/opt/foo/icon.png')).toBe(
			'/api/native/icon-file?path=' + encodeURIComponent('/opt/foo/icon.png'),
		)
	})

	it('passes http(s) URLs through unchanged', () => {
		expect(iconValueToUrl('https://cdn.example.com/x.svg')).toBe('https://cdn.example.com/x.svg')
		expect(iconValueToUrl('http://example.com/y.png')).toBe('http://example.com/y.png')
	})

	it('returns undefined for empty / absent', () => {
		expect(iconValueToUrl(undefined)).toBeUndefined()
		expect(iconValueToUrl('')).toBeUndefined()
		expect(iconValueToUrl('   ')).toBeUndefined()
	})
})
