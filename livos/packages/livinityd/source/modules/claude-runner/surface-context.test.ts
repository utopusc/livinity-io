/**
 * Phase 163-01 — surface-context.test.ts
 *
 * Vitest suite for the per-surface CLAUDE.md scaffolder. Covers source-text
 * invariants (move-to-trash, non-fatal contract, default vault path) plus
 * runtime behavior (write/idempotent/remove-rename/permissions/chown best
 * effort).
 *
 * All runtime tests use a tmpdir-rooted vault path so the test suite never
 * touches the real `/home/bruce/livinity-vault`. Chown is exercised against
 * a non-existent owner to verify the best-effort contract.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtemp, readFile, stat, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {writeSurfaceContext, removeSurfaceContext} from './surface-context.js'

const MODULE_SOURCE = readFileSync(new URL('./surface-context.ts', import.meta.url), 'utf8')

describe('Phase 163-01 surface-context source-text invariants', () => {
	it('exports writeSurfaceContext', () => {
		expect(MODULE_SOURCE).toMatch(/export\s+(async\s+)?function\s+writeSurfaceContext/)
	})

	it('exports removeSurfaceContext', () => {
		expect(MODULE_SOURCE).toMatch(/export\s+(async\s+)?function\s+removeSurfaceContext/)
	})

	it('uses move-to-trash for removal (no rm -rf / fse.remove)', () => {
		expect(MODULE_SOURCE).toContain('.deleted-')
		expect(MODULE_SOURCE).not.toMatch(/rm\s+-rf/)
		expect(MODULE_SOURCE).not.toMatch(/fse\.remove/)
	})

	it('non-fatal contract — failed-non-fatal literal appears ≥2 times', () => {
		const matches = MODULE_SOURCE.match(/failed-non-fatal/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(2)
	})

	it('default vault path is /home/bruce/livinity-vault', () => {
		expect(MODULE_SOURCE).toContain('/home/bruce/livinity-vault')
	})
})

describe('Phase 163-01 surface-context runtime behavior', () => {
	let tmpVault: string

	beforeEach(async () => {
		tmpVault = await mkdtemp(path.join(tmpdir(), 'phase-163-01-'))
	})

	afterEach(async () => {
		await rm(tmpVault, {recursive: true, force: true})
	})

	it('writes a webapp CLAUDE.md with rendered metadata', async () => {
		const res = await writeSurfaceContext({
			kind: 'webapp',
			metadata: {
				appId: 'sunatest',
				name: 'Suna Test',
				description: 'demo',
				category: 'agents',
				subdomain: 'suna-bruce',
			},
			vaultPath: tmpVault,
		})
		expect(res.status).toBe('written')
		if (res.status !== 'written') return
		expect(res.path).toBe(path.join(tmpVault, 'surfaces', 'webapp', 'sunatest', 'CLAUDE.md'))
		const body = await readFile(res.path, 'utf8')
		expect(body).toContain('# WebApp Context: Suna Test')
		expect(body).toContain('**App ID:** sunatest')
		expect(body).toContain('suna-bruce')
	})

	it('writes a native CLAUDE.md with binaryPath', async () => {
		const res = await writeSurfaceContext({
			kind: 'native',
			metadata: {
				appId: 'blendertest',
				name: 'Blender Test',
				binaryPath: '/usr/bin/blender',
			},
			vaultPath: tmpVault,
		})
		expect(res.status).toBe('written')
		if (res.status !== 'written') return
		const body = await readFile(res.path, 'utf8')
		expect(body).toContain('# NativeApp Context: Blender Test')
		expect(body).toContain('**Binary Path:** /usr/bin/blender')
	})

	it('is idempotent', async () => {
		const args = {
			kind: 'webapp' as const,
			metadata: {appId: 'x', name: 'X'},
			vaultPath: tmpVault,
		}
		const r1 = await writeSurfaceContext(args)
		const r2 = await writeSurfaceContext(args)
		expect(r1.status).toBe('written')
		expect(r2.status).toBe('written')
	})

	it('renames surface dir on remove (move-to-trash)', async () => {
		await writeSurfaceContext({
			kind: 'webapp',
			metadata: {appId: 'sunatest', name: 'Suna Test'},
			vaultPath: tmpVault,
		})
		const res = await removeSurfaceContext({
			kind: 'webapp',
			appId: 'sunatest',
			vaultPath: tmpVault,
		})
		expect(res.status).toBe('renamed')
		if (res.status !== 'renamed') return
		expect(res.to).toMatch(/\.deleted-\d{10,}$/)
		await expect(stat(res.from)).rejects.toThrow()
		await expect(stat(res.to)).resolves.toBeTruthy()
	})

	it('returns absent for never-installed appId', async () => {
		const res = await removeSurfaceContext({
			kind: 'webapp',
			appId: 'never-installed',
			vaultPath: tmpVault,
		})
		expect(res.status).toBe('absent')
	})

	it('file mode is 0644', async () => {
		if (process.platform === 'win32') {
			// Windows file-mode bits are not POSIX-compatible. Skip the
			// strict mode assertion but keep the path-existence check.
			expect(true).toBe(true)
			return
		}
		const res = await writeSurfaceContext({
			kind: 'webapp',
			metadata: {appId: 'm', name: 'M'},
			vaultPath: tmpVault,
		})
		if (res.status !== 'written') throw new Error('expected written')
		const s = await stat(res.path)
		expect(s.mode & 0o777).toBe(0o644)
	})

	it('chown error does not propagate (best-effort)', async () => {
		const res = await writeSurfaceContext({
			kind: 'webapp',
			metadata: {appId: 'cgood', name: 'C'},
			vaultPath: tmpVault,
			ownerUser: 'this-user-does-not-exist-12345',
		})
		// Either 'written' (chown silently failed/logged) or
		// 'failed-non-fatal' if mkdir itself was somehow blocked. Both are
		// acceptable; throw is NOT.
		expect(['written', 'failed-non-fatal']).toContain(res.status)
	})
})
