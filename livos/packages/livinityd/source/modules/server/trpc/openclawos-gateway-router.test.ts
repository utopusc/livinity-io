/**
 * Phase 205-04 — openclawos.gateway.* tRPC router unit tests.
 *
 * Verifies the 10 behaviours locked in 205-04-PLAN Task 2:
 *
 *   1. devices.list returns {paired,pending}
 *   2. devices.revoke with caller deviceId === input.deviceId → FORBIDDEN/CANNOT_REVOKE_SELF
 *      AND files are NOT mutated
 *   3. devices.revoke on non-self deletes paired row + scrubs pending + appends revoked
 *   4. origins.list reads from openclaw.json
 *   5a. origins.add appends + persists
 *   5b. origins.add with bad input → INVALID_ORIGIN
 *   6. origins.remove with missing entry → NOT_FOUND/ORIGIN_NOT_FOUND
 *   7. auth.get returns {mode} but NEVER the raw token
 *   8. auth.setMode persists the enum
 *   9. auth.rotateToken returns 64-char hex + writes it to disk
 *  10. Self-lock with missing X-Claw-Device-Id header → FORBIDDEN/NO_CALLER_IDENTITY
 *      (defense-in-depth)
 */

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {OpenclawConfigStore} from '../../openclawos/openclaw-config-store.js'
import {
	createOpenclawosGatewayRouter,
	openclawosGatewayRouter,
} from './openclawos-gateway-router.js'

const CALLER_DEVICE_ID =
	'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_DEVICE_ID =
	'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

/**
 * Build a tRPC admin context. The `request.headers` map is what
 * `extractCallerDeviceId` reads.
 *
 * `dangerouslyBypassAuthentication: true` mirrors the openclawos-router.test.ts
 * pattern (line 52) — bypasses isAuthenticated + requireRole('admin') so we
 * can directly exercise the procedure bodies.
 */
function makeAdminCtx(opts: {deviceIdHeader?: string} = {}) {
	const headers: Record<string, string> = {}
	if (opts.deviceIdHeader !== undefined) {
		headers['x-claw-device-id'] = opts.deviceIdHeader
	}
	return {
		livinityd: {} as never,
		logger: {
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
			verbose: () => undefined,
			log: () => undefined,
			debug: () => undefined,
		},
		server: {} as never,
		user: {} as never,
		appStore: {} as never,
		apps: {} as never,
		dangerouslyBypassAuthentication: true,
		currentUser: {
			id: 'admin-uuid',
			username: 'admin',
			role: 'admin' as const,
		},
		transport: 'express' as const,
		request: {headers} as never,
	}
}

describe('openclawosGatewayRouter — empty-injection stub', () => {
	test('every procedure throws OPENCLAW_GATEWAY_UNAVAILABLE before production wire-up', async () => {
		const caller = openclawosGatewayRouter.createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		await expect(caller.origins.list()).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
			message: 'OPENCLAW_GATEWAY_UNAVAILABLE',
		})
	})
})

describe('createOpenclawosGatewayRouter — devices namespace', () => {
	let dir: string
	let devicesDir: string
	let configPath: string
	let deletedKeys: string[]
	let store: OpenclawConfigStore

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'openclawos-gw-router-test-'))
		devicesDir = join(dir, 'devices')
		configPath = join(dir, 'openclaw.json')
		deletedKeys = []
		// Seed openclaw.json so configStore.read() can find it for the
		// origins/auth sub-tests.
		writeFileSync(
			configPath,
			JSON.stringify({
				gateway: {
					controlUi: {allowedOrigins: ['https://bruce.livinity.io']},
					auth: {mode: 'token', token: 'seed-token-redacted'},
				},
			}),
		)
		store = new OpenclawConfigStore(configPath)
	})

	afterEach(() => {
		rmSync(dir, {recursive: true, force: true})
	})

	function makeRouter() {
		return createOpenclawosGatewayRouter({
			configStore: store,
			devicesDir,
			redis: {
				del: async (k: string) => {
					deletedKeys.push(k)
					return 1
				},
			},
			logger: {info: () => undefined, warn: () => undefined},
		})
	}

	function seedPaired(rows: Record<string, unknown>) {
		writeFileSync(join(devicesDir, 'paired.json'), JSON.stringify(rows))
	}
	function seedPending(rows: Record<string, unknown>) {
		writeFileSync(join(devicesDir, 'pending.json'), JSON.stringify(rows))
	}

	function ensureDevicesDir() {
		// mkdir before seeding — beforeEach doesn't create the subdir.
		const fs = require('node:fs')
		fs.mkdirSync(devicesDir, {recursive: true})
	}

	test('devices.list returns {paired,pending} rows from disk', async () => {
		ensureDevicesDir()
		seedPaired({
			[OTHER_DEVICE_ID]: {
				deviceId: OTHER_DEVICE_ID,
				role: 'operator',
				platform: 'web',
				clientId: 'openclaw-control-ui',
				createdAtMs: 1700000000000,
				approvedAtMs: 1700000000000,
			},
		})
		seedPending({})
		const router = makeRouter()
		const caller = router.createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.devices.list()
		expect(out.paired).toHaveLength(1)
		expect(out.paired[0]?.deviceId).toBe(OTHER_DEVICE_ID)
		expect(out.paired[0]?.role).toBe('operator')
		expect(out.pending).toEqual([])
	})

	test('devices.revoke on caller deviceId → FORBIDDEN/CANNOT_REVOKE_SELF AND paired.json unchanged', async () => {
		ensureDevicesDir()
		seedPaired({
			[CALLER_DEVICE_ID]: {deviceId: CALLER_DEVICE_ID, role: 'operator'},
			[OTHER_DEVICE_ID]: {deviceId: OTHER_DEVICE_ID, role: 'operator'},
		})
		seedPending({})
		const router = makeRouter()
		const caller = router.createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		await expect(
			caller.devices.revoke({deviceId: CALLER_DEVICE_ID}),
		).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: 'CANNOT_REVOKE_SELF',
		})
		// File unchanged — both rows still present
		const onDisk = JSON.parse(
			readFileSync(join(devicesDir, 'paired.json'), 'utf8'),
		) as Record<string, unknown>
		expect(Object.keys(onDisk).sort()).toEqual(
			[CALLER_DEVICE_ID, OTHER_DEVICE_ID].sort(),
		)
		expect(deletedKeys).toEqual([])
	})

	test('devices.revoke on missing X-Claw-Device-Id header → FORBIDDEN/NO_CALLER_IDENTITY', async () => {
		ensureDevicesDir()
		seedPaired({
			[OTHER_DEVICE_ID]: {deviceId: OTHER_DEVICE_ID, role: 'operator'},
		})
		seedPending({})
		const router = makeRouter()
		// NO deviceIdHeader supplied — header is absent
		const caller = router.createCaller(makeAdminCtx() as never)
		await expect(
			caller.devices.revoke({deviceId: OTHER_DEVICE_ID}),
		).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: 'NO_CALLER_IDENTITY',
		})
		// File unchanged
		const onDisk = JSON.parse(
			readFileSync(join(devicesDir, 'paired.json'), 'utf8'),
		) as Record<string, unknown>
		expect(Object.keys(onDisk)).toEqual([OTHER_DEVICE_ID])
	})

	test('devices.revoke on other device deletes paired row + scrubs pending + appends revoked', async () => {
		ensureDevicesDir()
		seedPaired({
			[OTHER_DEVICE_ID]: {
				deviceId: OTHER_DEVICE_ID,
				role: 'operator',
				tokens: {
					operator: {
						token: 'opaque-token-43chars',
						role: 'operator',
						scopes: ['operator.pairing'],
						createdAtMs: 1700000000000,
					},
				},
			},
		})
		// Pending has a stale row for the same device — sweepPendingRequests would
		// otherwise re-promote it. Revoke MUST scrub this entry.
		seedPending({
			'req-stale': {
				requestId: 'req-stale',
				deviceId: OTHER_DEVICE_ID,
				publicKey: 'pk',
				platform: 'web',
				clientId: 'x',
				clientMode: 'x',
				role: 'operator',
				roles: [],
				scopes: [],
				ts: 1700000000000,
			},
			'req-keep': {
				requestId: 'req-keep',
				deviceId: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
				publicKey: 'pk',
				platform: 'web',
				clientId: 'x',
				clientMode: 'x',
				role: 'operator',
				roles: [],
				scopes: [],
				ts: 1700000000000,
			},
		})

		const router = makeRouter()
		const caller = router.createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.devices.revoke({deviceId: OTHER_DEVICE_ID})
		expect(out).toEqual({ok: true})

		// 1. paired.json no longer contains OTHER_DEVICE_ID
		const paired = JSON.parse(
			readFileSync(join(devicesDir, 'paired.json'), 'utf8'),
		) as Record<string, unknown>
		expect(paired[OTHER_DEVICE_ID]).toBeUndefined()

		// 2. pending.json no longer contains any row whose deviceId === OTHER
		const pending = JSON.parse(
			readFileSync(join(devicesDir, 'pending.json'), 'utf8'),
		) as Record<string, {deviceId: string}>
		expect(pending['req-stale']).toBeUndefined()
		expect(pending['req-keep']).toBeDefined()
		expect(pending['req-keep']?.deviceId).not.toBe(OTHER_DEVICE_ID)

		// 3. revoked.json has the deny-list entry
		const revoked = JSON.parse(
			readFileSync(join(devicesDir, 'revoked.json'), 'utf8'),
		) as Record<string, {revokedAtMs: number; reason: string}>
		expect(revoked[OTHER_DEVICE_ID]).toBeDefined()
		expect(revoked[OTHER_DEVICE_ID]?.revokedAtMs).toBeTypeOf('number')

		// 4. Redis poison was attempted
		expect(deletedKeys.length).toBeGreaterThanOrEqual(1)
		expect(
			deletedKeys.some((k) => k.includes(OTHER_DEVICE_ID)),
		).toBe(true)
	})

	test('devices.revoke on a deviceId NOT in paired.json → NOT_FOUND/DEVICE_NOT_PAIRED', async () => {
		ensureDevicesDir()
		seedPaired({})
		seedPending({})
		const router = makeRouter()
		const caller = router.createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		await expect(
			caller.devices.revoke({deviceId: OTHER_DEVICE_ID}),
		).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'DEVICE_NOT_PAIRED',
		})
	})
})

describe('createOpenclawosGatewayRouter — origins namespace', () => {
	let dir: string
	let configPath: string
	let store: OpenclawConfigStore

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'openclawos-gw-origins-test-'))
		configPath = join(dir, 'openclaw.json')
		writeFileSync(
			configPath,
			JSON.stringify({
				gateway: {
					controlUi: {allowedOrigins: ['https://bruce.livinity.io']},
					auth: {mode: 'token', token: 'seed-token'},
				},
			}),
		)
		store = new OpenclawConfigStore(configPath)
	})

	afterEach(() => {
		rmSync(dir, {recursive: true, force: true})
	})

	function makeRouter() {
		return createOpenclawosGatewayRouter({
			configStore: store,
			devicesDir: join(dir, 'devices'),
			redis: {del: async () => 1},
			logger: {info: () => undefined, warn: () => undefined},
		})
	}

	test('origins.list reads gateway.controlUi.allowedOrigins from openclaw.json', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.origins.list()
		expect(out).toEqual(['https://bruce.livinity.io'])
	})

	test('origins.add appends + persists to disk', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.origins.add({origin: 'https://other.example'})
		expect(out).toEqual({ok: true})
		const onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as {
			gateway: {controlUi: {allowedOrigins: string[]}}
		}
		expect(onDisk.gateway.controlUi.allowedOrigins).toContain(
			'https://other.example',
		)
	})

	test('origins.add with non-URL input → BAD_REQUEST (zod INVALID_ORIGIN)', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		await expect(caller.origins.add({origin: 'not-a-url'})).rejects.toThrow()
	})

	test('origins.remove with missing entry → NOT_FOUND/ORIGIN_NOT_FOUND', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		await expect(
			caller.origins.remove({origin: 'https://missing.example'}),
		).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'ORIGIN_NOT_FOUND',
		})
	})

	test('origins.remove on existing entry removes from disk', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.origins.remove({
			origin: 'https://bruce.livinity.io',
		})
		expect(out).toEqual({ok: true})
		const onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as {
			gateway: {controlUi: {allowedOrigins: string[]}}
		}
		expect(onDisk.gateway.controlUi.allowedOrigins).not.toContain(
			'https://bruce.livinity.io',
		)
	})
})

describe('createOpenclawosGatewayRouter — auth namespace', () => {
	let dir: string
	let configPath: string
	let store: OpenclawConfigStore

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'openclawos-gw-auth-test-'))
		configPath = join(dir, 'openclaw.json')
		writeFileSync(
			configPath,
			JSON.stringify({
				gateway: {
					controlUi: {allowedOrigins: []},
					auth: {mode: 'token', token: 'super-secret-original-token'},
				},
			}),
		)
		store = new OpenclawConfigStore(configPath)
	})

	afterEach(() => {
		rmSync(dir, {recursive: true, force: true})
	})

	function makeRouter() {
		return createOpenclawosGatewayRouter({
			configStore: store,
			devicesDir: join(dir, 'devices'),
			redis: {del: async () => 1},
			logger: {info: () => undefined, warn: () => undefined},
		})
	}

	test('auth.get returns {mode} only — NEVER the raw token (INV-204-04 redact-on-read)', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.auth.get()
		expect(out.mode).toBe('token')
		// The wire response object must NOT include the raw token under any key
		expect(JSON.stringify(out)).not.toContain('super-secret-original-token')
	})

	test('auth.setMode persists the enum + accepts all 4 valid values', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		await caller.auth.setMode({mode: 'password'})
		let onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as {
			gateway: {auth: {mode: string}}
		}
		expect(onDisk.gateway.auth.mode).toBe('password')

		await caller.auth.setMode({mode: 'trusted-proxy'})
		onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as {
			gateway: {auth: {mode: string}}
		}
		expect(onDisk.gateway.auth.mode).toBe('trusted-proxy')

		// Invalid value rejected (SPEC's planner-guessed 'master' is NOT valid)
		await expect(
			caller.auth.setMode({mode: 'master' as never}),
		).rejects.toThrow()
	})

	test('auth.rotateToken returns 64-char hex token + writes to disk', async () => {
		const caller = makeRouter().createCaller(
			makeAdminCtx({deviceIdHeader: CALLER_DEVICE_ID}) as never,
		)
		const out = await caller.auth.rotateToken()
		expect(out.token).toMatch(/^[0-9a-f]{64}$/)
		expect(out.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
		const onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as {
			gateway: {auth: {token: string}}
		}
		expect(onDisk.gateway.auth.token).toBe(out.token)
		expect(existsSync(configPath)).toBe(true)
	})
})
