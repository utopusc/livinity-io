import {describe, it, expect, vi, beforeEach} from 'vitest'
import {CADDY_PKI_ROOT_CRT, CADDY_PKI_AUTHORITY_DIR} from './pki.js'

describe('pki.ts constants', () => {
	it('CADDY_PKI_AUTHORITY_DIR is the expected Caddy default', () => {
		expect(CADDY_PKI_AUTHORITY_DIR).toBe(
			'/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local',
		)
	})
	it('CADDY_PKI_ROOT_CRT ends in /root.crt under the authority dir', () => {
		expect(CADDY_PKI_ROOT_CRT.endsWith('root.crt')).toBe(true)
		// Use forward-slash normalization so the assertion stays POSIX-truthful
		// when path.join() inserts backslashes on Windows hosts. The deployed
		// target is Linux (Mini PC / Docker UAT) — production behavior is
		// strictly POSIX. (Rule 1 deviation: Windows test-runner compat.)
		const normalizedRoot = CADDY_PKI_ROOT_CRT.replace(/\\/g, '/')
		const normalizedDir = CADDY_PKI_AUTHORITY_DIR.replace(/\\/g, '/')
		expect(normalizedRoot.startsWith(normalizedDir)).toBe(true)
	})
})

describe('readRootCert', () => {
	beforeEach(() => {
		vi.resetModules()
	})

	it('returns PEM when default path exists', async () => {
		vi.doMock('node:fs/promises', () => ({
			readFile: vi
				.fn()
				.mockResolvedValue(
					'-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----\n',
				),
		}))
		const mod = await import('./pki.js')
		const pem = await mod.readRootCert()
		expect(pem).toMatch(/^-----BEGIN CERTIFICATE-----/)
	})

	it('throws a helpful error when both default and find() fail', async () => {
		vi.doMock('node:fs/promises', () => ({
			readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
		}))
		vi.doMock('node:child_process', () => ({
			exec: (
				_cmd: string,
				cb: (e: Error | null, r: {stdout: string; stderr: string}) => void,
			) => {
				cb(null, {stdout: '', stderr: ''})
			},
		}))
		const mod = await import('./pki.js')
		await expect(mod.readRootCert()).rejects.toThrow(/root\.crt not found/)
	})
})
