// Phase 262-02 (WS2) — regression lock for the native-installer's pure,
// fail-closed input validators (LIVOS-044 apt `-o` hook injection,
// LIVOS-045 mandatory checksums + https-only host allowlist + key
// fingerprint pin shape, LIVOS-055 per-hop download validation inputs).
//
// These exercise the EXPORTED validators directly — no network, no spawn.
// The injection strings mirror the SECURITY-RESEARCH-PASS-3.md exploit
// sketches verbatim so a future regression re-opens a named finding.
import {describe, it, expect, vi} from 'vitest'

import {
	APT_PACKAGE_RE,
	validateAptPackages,
	SHA256_RE,
	GPG_FINGERPRINT_RE,
	NATIVE_DOWNLOAD_HOST_ALLOWLIST,
	assertAllowedDownloadUrl,
	installLocalFlatpak,
	installLocalSnap,
	installFlathubApp,
	type InstallLocalAppDeps,
} from './native-installer.js'
import type {NativeAppConfig} from './native-app-config.js'

// ── Minimal stubs for the capability-check tests (no real apt/flatpak/snap). ──

const NOOP_LOGGER = {info() {}, warn() {}, error() {}}

// An InstallContext stub — only ctx.logger / ctx.redis / ctx.userId are touched
// in the capability early-return paths (redis/upsert never reached).
function makeCtx() {
	return {
		userId: 'admin',
		apiKey: '',
		redis: {set: async () => 'OK', get: async () => null} as never,
		pg: {} as never,
		logger: NOOP_LOGGER,
	} as never
}

// A NativeAppConfigStore stub whose upsert MUST NOT be reached in these tests.
function makeStore(onUpsert?: () => void) {
	return {
		upsert: async () => {
			onUpsert?.()
		},
	} as never
}

// Build an exec seam that records every (cmd, args) and returns a scripted result
// per the command name. The capability probe (`flatpak --version` / `snap version`)
// returns non-zero; ANY install command appearing in the log is the failure.
function recordingExec(results: Record<string, {code: number; stderr?: string; stdout?: string}>) {
	const calls: Array<{cmd: string; args: readonly string[]}> = []
	const exec: NonNullable<InstallLocalAppDeps['exec']> = async (cmd, args) => {
		calls.push({cmd, args})
		const r = results[cmd] ?? {code: 0}
		return {code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? ''}
	}
	return {calls, exec}
}

describe('validateAptPackages (LIVOS-044 — apt -o hook injection pre-spawn)', () => {
	it('rejects a bare option flag ["-o"]', () => {
		expect(validateAptPackages(['-o'])).toMatch(/invalid apt package name/)
	})

	it('rejects the DPkg::Pre-Invoke root-RCE hook payload', () => {
		expect(
			validateAptPackages(['DPkg::Pre-Invoke::=cp /bin/bash /tmp/.r']),
		).toMatch(/invalid apt package name/)
	})

	it('rejects the full exploit argv ["-o", "DPkg::Pre-Invoke::=x", "coreutils"] (first bad element wins)', () => {
		expect(validateAptPackages(['-o', 'DPkg::Pre-Invoke::=x', 'coreutils'])).toMatch(
			/invalid apt package name: "-o"/,
		)
	})

	it('rejects whitespace, version-pin syntax, and path traversal', () => {
		expect(validateAptPackages(['a b'])).toMatch(/invalid apt package name/)
		expect(validateAptPackages(['pkg=1.2'])).toMatch(/invalid apt package name/)
		expect(validateAptPackages(['../evil.deb'])).toMatch(/invalid apt package name/)
		expect(validateAptPackages(['/tmp/evil.deb'])).toMatch(/invalid apt package name/)
	})

	it('rejects the empty string element and the empty list', () => {
		expect(validateAptPackages([''])).toMatch(/invalid apt package name/)
		expect(validateAptPackages([])).toBe('aptPackages empty')
	})

	it('accepts real Debian package names (incl. +, digit-leading, mixed lists)', () => {
		expect(validateAptPackages(['brave-browser'])).toBeNull()
		expect(validateAptPackages(['libxss1', 'g++', 'signal-desktop'])).toBeNull()
		expect(validateAptPackages(['7zip'])).toBeNull()
	})

	it('APT_PACKAGE_RE structurally rejects leading -, /, =, whitespace, and :: option syntax', () => {
		for (const bad of ['-y', '/etc/passwd', '=x', ' pkg', 'APT::Update::Pre-Invoke']) {
			expect(APT_PACKAGE_RE.test(bad)).toBe(false)
		}
	})
})

describe('assertAllowedDownloadUrl (LIVOS-045/055 — https-only host allowlist)', () => {
	it('rejects plaintext http:// even on an allowlisted host (downgrade/MITM)', () => {
		expect(assertAllowedDownloadUrl('http://github.com/x')).toMatch(/must be https/)
	})

	it('rejects a non-allowlisted host over https', () => {
		expect(assertAllowedDownloadUrl('https://attacker.tld/p.sh')).toMatch(
			/host not allowlisted: attacker\.tld/,
		)
	})

	it('rejects non-http(s) schemes (ftp)', () => {
		expect(assertAllowedDownloadUrl('ftp://github.com/x')).toMatch(/must be https/)
	})

	it('rejects unparseable input', () => {
		expect(assertAllowedDownloadUrl('not a url')).toMatch(/invalid download URL/)
	})

	it('accepts a GitHub release artifact URL', () => {
		expect(
			assertAllowedDownloadUrl('https://github.com/org/repo/releases/download/v1/x.deb'),
		).toBeNull()
	})

	it('accepts a catalog vendor host (Brave apt key)', () => {
		expect(
			assertAllowedDownloadUrl(
				'https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg',
			),
		).toBeNull()
	})

	it('matches hostnames case-insensitively (URL lowercases the authority)', () => {
		expect(assertAllowedDownloadUrl('https://GITHUB.com/org/repo')).toBeNull()
	})

	it('allowlist contains the GitHub release/redirect CDN hosts', () => {
		for (const host of [
			'github.com',
			'objects.githubusercontent.com',
			'release-assets.githubusercontent.com',
			'raw.githubusercontent.com',
		]) {
			expect(NATIVE_DOWNLOAD_HOST_ALLOWLIST.has(host)).toBe(true)
		}
	})
})

describe('SHA256_RE (LIVOS-045 — mandatory fail-closed checksum shape)', () => {
	const hex63 = 'a'.repeat(63)
	const hex64 = 'a'.repeat(64)
	const hex65 = 'a'.repeat(65)

	it('rejects empty, short, and off-by-one lengths', () => {
		expect(SHA256_RE.test('')).toBe(false)
		expect(SHA256_RE.test('abc')).toBe(false)
		expect(SHA256_RE.test(hex63)).toBe(false)
		expect(SHA256_RE.test(hex65)).toBe(false)
	})

	it('rejects 64 chars containing non-hex', () => {
		expect(SHA256_RE.test('z' + hex63)).toBe(false)
	})

	it('accepts a 64-hex digest in both cases', () => {
		expect(SHA256_RE.test(hex64)).toBe(true)
		expect(
			SHA256_RE.test('DEADBEEF'.repeat(8)), // 64 hex chars, uppercase
		).toBe(true)
	})
})

describe('GPG_FINGERPRINT_RE (LIVOS-045 — apt-repo key fingerprint pin shape)', () => {
	it('accepts a full 40-hex fingerprint (both cases)', () => {
		expect(GPG_FINGERPRINT_RE.test('d8b9f33a30fd773712a951a6464b6072ccab4e8a')).toBe(true)
		expect(GPG_FINGERPRINT_RE.test('D8B9F33A30FD773712A951A6464B6072CCAB4E8A')).toBe(true)
	})

	it('rejects short (long-key-ID) and non-hex values', () => {
		expect(GPG_FINGERPRINT_RE.test('464b6072ccab4e8a')).toBe(false) // 16-char key ID
		expect(GPG_FINGERPRINT_RE.test('g'.repeat(40))).toBe(false)
		expect(GPG_FINGERPRINT_RE.test('')).toBe(false)
	})
})

describe('installLocalFlatpak — capability check (flatpak not installed)', () => {
	it('returns ok:false WITHOUT installing when `flatpak --version` is non-zero', async () => {
		const upsert = vi.fn()
		const {calls, exec} = recordingExec({flatpak: {code: 127, stderr: 'command not found'}})
		const res = await installLocalFlatpak(
			'/tmp/x.flatpak',
			makeCtx(),
			makeStore(upsert),
			{name: 'X'},
			{exec},
		)
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/Flatpak runtime is not installed/i)
		// Only the `flatpak --version` probe ran — no `flatpak install`, no upsert.
		expect(calls).toHaveLength(1)
		expect(calls[0]).toEqual({cmd: 'flatpak', args: ['--version']})
		expect(calls.some((c) => c.args.includes('install'))).toBe(false)
		expect(upsert).not.toHaveBeenCalled()
	})

	it('returns ok:false when the flatpak probe throws (binary absent)', async () => {
		const upsert = vi.fn()
		const exec: NonNullable<InstallLocalAppDeps['exec']> = async () => {
			throw new Error('ENOENT')
		}
		const res = await installLocalFlatpak('/tmp/x.flatpak', makeCtx(), makeStore(upsert), {}, {exec})
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/Flatpak runtime is not installed/i)
		expect(upsert).not.toHaveBeenCalled()
	})
})

describe('installLocalSnap — capability check (snapd not available)', () => {
	it('returns ok:false WITHOUT installing when `snap version` is non-zero', async () => {
		const upsert = vi.fn()
		const {calls, exec} = recordingExec({snap: {code: 1, stderr: 'cannot communicate with server'}})
		const res = await installLocalSnap(
			'/tmp/x.snap',
			makeCtx(),
			makeStore(upsert),
			{name: 'X'},
			{exec},
		)
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/snapd .* not available|not available\/functional/i)
		// Only the `snap version` probe ran — no `snap install`, no sudo, no upsert.
		expect(calls).toHaveLength(1)
		expect(calls[0]).toEqual({cmd: 'snap', args: ['version']})
		expect(calls.some((c) => c.cmd === 'sudo')).toBe(false)
		expect(upsert).not.toHaveBeenCalled()
	})

	it('returns ok:false when the snap probe throws (binary absent)', async () => {
		const upsert = vi.fn()
		const exec: NonNullable<InstallLocalAppDeps['exec']> = async () => {
			throw new Error('ENOENT')
		}
		const res = await installLocalSnap('/tmp/x.snap', makeCtx(), makeStore(upsert), {}, {exec})
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/snapd|not available/i)
		expect(upsert).not.toHaveBeenCalled()
	})
})

describe('installFlathubApp (v44.57 — Flathub store install)', () => {
	// A store stub that CAPTURES the upserted config so we can assert the tile shape.
	function makeCapturingStore() {
		const ref: {value?: NativeAppConfig} = {}
		const store = {
			upsert: async (cfg: NativeAppConfig) => {
				ref.value = cfg
			},
		} as never
		return {store, captured: ref}
	}

	// An exec seam that returns 0 for the `flatpak --version` capability probe and a
	// SCRIPTED result for the `flatpak install …` step (recordingExec keys by cmd
	// only, so it can't distinguish the two `flatpak` invocations).
	function flatpakExec(install: {code: number; stderr?: string}) {
		const calls: Array<{cmd: string; args: readonly string[]}> = []
		const exec: NonNullable<InstallLocalAppDeps['exec']> = async (cmd, args) => {
			calls.push({cmd, args})
			if (cmd === 'flatpak' && args[0] === '--version') return {code: 0, stdout: '', stderr: ''}
			if (cmd === 'flatpak' && args[0] === 'install')
				return {code: install.code, stdout: '', stderr: install.stderr ?? ''}
			return {code: 0, stdout: '', stderr: ''}
		}
		return {calls, exec}
	}

	it('rejects an invalid app-id WITHOUT calling exec ("../x", "-foo", "a b")', async () => {
		for (const bad of ['../x', '-foo', 'a b', '', '/etc/passwd']) {
			const upsert = vi.fn()
			const exec = vi.fn()
			const res = await installFlathubApp(
				bad,
				makeCtx(),
				makeStore(upsert),
				{name: 'X'},
				{exec: exec as never},
			)
			expect(res.ok).toBe(false)
			expect(res.message).toMatch(/invalid flatpak app id/i)
			// No spawn, no upsert — validation happens BEFORE the capability probe.
			expect(exec).not.toHaveBeenCalled()
			expect(upsert).not.toHaveBeenCalled()
		}
	})

	it('returns ok:false WITHOUT installing when flatpak is missing (probe non-zero)', async () => {
		const upsert = vi.fn()
		const {calls, exec} = recordingExec({flatpak: {code: 127, stderr: 'command not found'}})
		const res = await installFlathubApp(
			'org.gimp.GIMP',
			makeCtx(),
			makeStore(upsert),
			{name: 'GIMP'},
			{exec},
		)
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/Flatpak runtime is not installed/i)
		// Only the `flatpak --version` probe ran — NO `flatpak install`, no upsert.
		expect(calls).toHaveLength(1)
		expect(calls[0]).toEqual({cmd: 'flatpak', args: ['--version']})
		expect(calls.some((c) => c.args.includes('install'))).toBe(false)
		expect(upsert).not.toHaveBeenCalled()
	})

	it('surfaces the "flathub remote not set up yet" message on the known stderr', async () => {
		const {exec} = flatpakExec({code: 1, stderr: 'error: Remote "flathub" not found'})
		const res = await installFlathubApp('org.gimp.GIMP', makeCtx(), makeStore(), {}, {exec})
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/flathub is still being set up/i)
	})

	it('returns a clean failure (incl. stderr) on a non-zero install with an unknown error', async () => {
		const {exec} = flatpakExec({code: 1, stderr: 'error: app org.gimp.GIMP not found in remote'})
		const res = await installFlathubApp('org.gimp.GIMP', makeCtx(), makeStore(), {}, {exec})
		expect(res.ok).toBe(false)
		expect(res.message).toMatch(/Installing the Flathub app failed/i)
		expect(res.message).toMatch(/not found in remote/)
	})

	it('success path: builds a /usr/bin/flatpak run <appId> tile with the https iconUrl PERSISTED', async () => {
		const {store, captured} = makeCapturingStore()
		const {calls, exec} = flatpakExec({code: 0})
		const ICON = 'https://dl.flathub.org/media/org/gimp/GIMP/icon.png'
		const res = await installFlathubApp(
			'org.gimp.GIMP',
			makeCtx(),
			store,
			{name: 'GIMP', iconUrl: ICON},
			{exec},
		)
		expect(res.ok).toBe(true)
		expect(res.name).toBe('GIMP')
		expect(res.nativeConfigId).toBeTruthy()

		// The install command is `flatpak install --user --noninteractive --assumeyes flathub <appId>`.
		const installCall = calls.find((c) => c.args.includes('install'))
		expect(installCall).toEqual({
			cmd: 'flatpak',
			args: ['install', '--user', '--noninteractive', '--assumeyes', 'flathub', 'org.gimp.GIMP'],
		})

		// The persisted tile launches via /usr/bin/flatpak run <appId> and KEEPS the https icon.
		const cfg = captured.value!
		expect(cfg).toBeTruthy()
		expect(cfg.binaryPath).toBe('/usr/bin/flatpak')
		expect(cfg.args).toEqual(['run', 'org.gimp.GIMP'])
		expect(cfg.iconUrl).toBe(ICON)
		expect(cfg.name).toBe('GIMP')
		// dotted app-ids omit the wmClassHint (would fail the wmClass regex).
		expect(cfg.wmClassHint).toBeUndefined()
	})
})
