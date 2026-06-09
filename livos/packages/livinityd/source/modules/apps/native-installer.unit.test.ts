// Phase 262-02 (WS2) — regression lock for the native-installer's pure,
// fail-closed input validators (LIVOS-044 apt `-o` hook injection,
// LIVOS-045 mandatory checksums + https-only host allowlist + key
// fingerprint pin shape, LIVOS-055 per-hop download validation inputs).
//
// These exercise the EXPORTED validators directly — no network, no spawn.
// The injection strings mirror the SECURITY-RESEARCH-PASS-3.md exploit
// sketches verbatim so a future regression re-opens a named finding.
import {describe, it, expect} from 'vitest'

import {
	APT_PACKAGE_RE,
	validateAptPackages,
	SHA256_RE,
	GPG_FINGERPRINT_RE,
	NATIVE_DOWNLOAD_HOST_ALLOWLIST,
	assertAllowedDownloadUrl,
} from './native-installer.js'

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
