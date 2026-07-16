import {describe, test, expect} from 'vitest'

import {
	CLOUD_BACKENDS,
	isValidRemoteName,
	assertValidRemoteName,
	cloudMountPath,
	renderRcloneConfigSection,
	buildAuthorizeInstructions,
} from './cloud-storage.js'

// Phase 324-05 (FILES-03, D-12/D-13/D-14) — OFFLINE unit coverage for the PURE
// cloud-storage helpers (remote-name charset guard + mount-path derivation +
// rclone.conf section rendering). The live rclone install / FUSE mount / OAuth
// authorize round-trip stays STRICT HUMAN-UAT (324-HUMAN-UAT.md) — there is no
// live box on the Windows dev host.

describe('isValidRemoteName() — the %I / wrapper charset guard (T-324-16)', () => {
	test('accepts a safe lowercase-alnum-dash-underscore remote name', () => {
		expect(isValidRemoteName('mydrive')).toBe(true)
		expect(isValidRemoteName('work_drive-2')).toBe(true)
	})

	test('rejects an empty name', () => {
		expect(isValidRemoteName('')).toBe(false)
	})

	test('rejects path separators, spaces, and shell/systemd metachars', () => {
		for (const bad of [
			'../etc',
			'a/b',
			'a b',
			'a;rm -rf',
			'a$(id)',
			'a`id`',
			'UPPER',
			'a.b',
			'a@b',
			'a\nb',
			'drive%40',
		]) {
			expect(isValidRemoteName(bad)).toBe(false)
		}
	})

	test('assertValidRemoteName throws [invalid-remote-name] on a bad name', () => {
		expect(() => assertValidRemoteName('a/b')).toThrow('[invalid-remote-name]')
		expect(() => assertValidRemoteName('mydrive')).not.toThrow()
	})
})

describe('cloudMountPath() — /Cloud base dir (D-12)', () => {
	test('mounts a remote under the writable /Cloud base directory', () => {
		expect(cloudMountPath('mydrive')).toBe('/Cloud/mydrive')
	})

	test('rejects an injection remote name before building the path', () => {
		expect(() => cloudMountPath('../escape')).toThrow('[invalid-remote-name]')
	})
})

describe('renderRcloneConfigSection() — on-demand rclone.conf regen (samba applyShares idiom)', () => {
	test('renders a valid backend section with the token line', () => {
		const section = renderRcloneConfigSection({
			remote: 'mydrive',
			backend: 'drive',
			token: '{"access_token":"x","token_type":"Bearer"}',
		})
		expect(section).toContain('[mydrive]')
		expect(section).toContain('type = drive')
		expect(section).toContain('token = {"access_token":"x","token_type":"Bearer"}')
		expect(section.endsWith('\n')).toBe(true)
	})

	test('supports the own-client_id escape hatch', () => {
		const section = renderRcloneConfigSection({
			remote: 'mydrive',
			backend: 'drive',
			token: '{"access_token":"x"}',
			clientId: 'my-client.apps.googleusercontent.com',
			clientSecret: 'shh',
		})
		expect(section).toContain('client_id = my-client.apps.googleusercontent.com')
		expect(section).toContain('client_secret = shh')
	})

	test('rejects a disallowed backend', () => {
		expect(() =>
			renderRcloneConfigSection({remote: 'mydrive', backend: 'ftp' as any, token: '{}'}),
		).toThrow('[invalid-backend]')
	})

	test('rejects a token / client value carrying a newline (config-section injection)', () => {
		expect(() =>
			renderRcloneConfigSection({remote: 'mydrive', backend: 'drive', token: '{}\n[evil]\ntype = local'}),
		).toThrow('[invalid-cloud-config-value]')
		expect(() =>
			renderRcloneConfigSection({remote: 'mydrive', backend: 'drive', token: '{}', clientId: 'a\nb'}),
		).toThrow('[invalid-cloud-config-value]')
	})

	test('rejects an injection remote name', () => {
		expect(() =>
			renderRcloneConfigSection({remote: 'a/b', backend: 'drive', token: '{}'}),
		).toThrow('[invalid-remote-name]')
	})
})

describe('buildAuthorizeInstructions() — the D-13 two-machine copy-paste wizard', () => {
	test('surfaces the guaranteed two-machine `rclone authorize` fallback for a backend', () => {
		const text = buildAuthorizeInstructions('drive')
		expect(text).toContain('rclone authorize')
		expect(text).toContain('drive')
		// The whole point of D-13: a machine WITH a browser runs authorize, the token
		// is pasted back — so the instructions must mention a browser + copy/paste.
		expect(text.toLowerCase()).toContain('browser')
		expect(text.toLowerCase()).toContain('paste')
	})

	test('rejects a backend outside the wrapper allowlist', () => {
		expect(() => buildAuthorizeInstructions('ftp' as any)).toThrow('[invalid-backend]')
	})
})

describe('CLOUD_BACKENDS allowlist', () => {
	test('is exactly {drive, dropbox, onedrive} — the 324-03 wrapper allowlist', () => {
		expect([...CLOUD_BACKENDS].sort()).toEqual(['drive', 'dropbox', 'onedrive'])
	})
})
