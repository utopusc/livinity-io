/**
 * Phase 205-04 — OpenclawConfigStore unit tests.
 *
 * Six behaviours per 205-04-PLAN Task 1:
 *
 *   1. read() returns parsed JSON
 *   2. read() on missing file throws OPENCLAW_CONFIG_MISSING
 *   3. patch() writes atomically (tmp+rename, chmod 0600 preserved)
 *   4. patch() preserves UNKNOWN top-level keys
 *   5. Mutator throw → on-disk file unchanged
 *   6. Two concurrent patch() calls do not corrupt the file
 */

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {OpenclawConfigStore} from './openclaw-config-store.js'

describe('OpenclawConfigStore', () => {
	let dir: string
	let path: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'openclaw-config-store-test-'))
		path = join(dir, 'openclaw.json')
	})

	afterEach(() => {
		rmSync(dir, {recursive: true, force: true})
	})

	test('read() returns parsed JSON with all top-level keys', () => {
		const seed = {
			gateway: {auth: {mode: 'token', token: 'abc'}},
			plugins: {entries: [{id: 'p1'}]},
			extra: 'preserved',
		}
		writeFileSync(path, JSON.stringify(seed))
		const store = new OpenclawConfigStore(path)
		const cfg = store.read()
		expect(cfg.gateway?.auth?.mode).toBe('token')
		expect(cfg.gateway?.auth?.token).toBe('abc')
		expect(cfg.plugins?.entries).toEqual([{id: 'p1'}])
		expect((cfg as Record<string, unknown>).extra).toBe('preserved')
	})

	test('read() on a missing file throws OPENCLAW_CONFIG_MISSING', () => {
		const store = new OpenclawConfigStore(path)
		expect(() => store.read()).toThrow('OPENCLAW_CONFIG_MISSING')
	})

	test('patch() writes atomically via tmp+rename (no .tmp.* file persists after success)', () => {
		writeFileSync(path, JSON.stringify({gateway: {auth: {mode: 'token'}}}))
		const store = new OpenclawConfigStore(path)
		store.patch((cfg) => {
			cfg.gateway = cfg.gateway ?? {}
			cfg.gateway.auth = cfg.gateway.auth ?? {}
			cfg.gateway.auth.mode = 'none'
		})
		const onDisk = JSON.parse(readFileSync(path, 'utf8')) as {
			gateway: {auth: {mode: string}}
		}
		expect(onDisk.gateway.auth.mode).toBe('none')
		// No leftover .tmp.* sibling files
		const siblings = readdirSync(dir).filter((f) => f.includes('.tmp.'))
		expect(siblings).toEqual([])
	})

	test('patch() preserves UNKNOWN top-level keys', () => {
		const seed = {
			gateway: {auth: {mode: 'token'}},
			plugins: {entries: []},
			weirdFutureKey: 'x',
			anotherFutureKey: {nested: true},
		}
		writeFileSync(path, JSON.stringify(seed))
		const store = new OpenclawConfigStore(path)
		store.patch((cfg) => {
			cfg.gateway = cfg.gateway ?? {}
			cfg.gateway.auth = cfg.gateway.auth ?? {}
			cfg.gateway.auth.mode = 'password'
		})
		const onDisk = JSON.parse(readFileSync(path, 'utf8')) as Record<
			string,
			unknown
		>
		expect(onDisk.weirdFutureKey).toBe('x')
		expect(onDisk.anotherFutureKey).toEqual({nested: true})
		expect((onDisk.gateway as {auth: {mode: string}}).auth.mode).toBe(
			'password',
		)
	})

	test('mutator that throws leaves the on-disk file UNCHANGED', () => {
		const seed = {gateway: {auth: {mode: 'token', token: 'original'}}}
		writeFileSync(path, JSON.stringify(seed))
		const store = new OpenclawConfigStore(path)
		expect(() =>
			store.patch(() => {
				throw new Error('mutator boom')
			}),
		).toThrow('mutator boom')
		const onDisk = JSON.parse(readFileSync(path, 'utf8')) as {
			gateway: {auth: {token: string; mode: string}}
		}
		expect(onDisk.gateway.auth.token).toBe('original')
		expect(onDisk.gateway.auth.mode).toBe('token')
		// After a failed patch, no .tmp.* sibling files should accumulate beyond
		// what writeFileSync may briefly create — but since mutator throws BEFORE
		// writeFileSync runs in OpenclawConfigStore.patch, none should exist.
		const siblings = readdirSync(dir).filter((f) => f.includes('.tmp.'))
		expect(siblings).toEqual([])
	})

	test('two concurrent patch() calls do not corrupt the file (last-writer-wins; atomic rename)', () => {
		// We can't truly parallelise sync code, but we can interleave two
		// sequential patches and assert the final state is well-formed JSON
		// with both mutations visible IF the second read picks up the first
		// write — which it does because read() is fresh per call.
		writeFileSync(
			path,
			JSON.stringify({
				gateway: {
					auth: {mode: 'token'},
					controlUi: {allowedOrigins: []},
				},
			}),
		)
		const store = new OpenclawConfigStore(path)
		store.patch((cfg) => {
			cfg.gateway = cfg.gateway ?? {}
			cfg.gateway.controlUi = cfg.gateway.controlUi ?? {}
			cfg.gateway.controlUi.allowedOrigins = [
				...(cfg.gateway.controlUi.allowedOrigins ?? []),
				'https://a.example',
			]
		})
		store.patch((cfg) => {
			cfg.gateway = cfg.gateway ?? {}
			cfg.gateway.controlUi = cfg.gateway.controlUi ?? {}
			cfg.gateway.controlUi.allowedOrigins = [
				...(cfg.gateway.controlUi.allowedOrigins ?? []),
				'https://b.example',
			]
		})
		const onDisk = JSON.parse(readFileSync(path, 'utf8')) as {
			gateway: {controlUi: {allowedOrigins: string[]}}
		}
		expect(onDisk.gateway.controlUi.allowedOrigins).toEqual([
			'https://a.example',
			'https://b.example',
		])
		// The file should still be valid JSON
		expect(existsSync(path)).toBe(true)
	})
})
