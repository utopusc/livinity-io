/**
 * Phase 203 Hot-fix F3 — autoApproveDevice unit tests.
 *
 * Covers:
 *   1. Invalid deviceId (non-hex / empty) → 'invalid-input', no file writes
 *   2. No matching pending request → 'no-pending', no file writes
 *   3. Already paired → 'already-paired', no file writes (idempotent)
 *   4. Happy path: pending entry promoted to paired with operator token,
 *      removed from pending
 *   5. Missing files (fresh install) → 'no-pending', no crash
 *   6. Scopes default to admin/read/write when pending entry has empty scopes
 */

import {afterEach, beforeEach, describe, expect, test} from 'vitest'
import {mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {autoApproveDevice} from './device-auto-approver.js'

const HEX_DEVICE_A = 'a'.repeat(64)
const HEX_DEVICE_B = 'b'.repeat(64)

describe('autoApproveDevice', () => {
	let dir: string
	let pairedPath: string
	let pendingPath: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'openclaw-auto-approver-test-'))
		pairedPath = join(dir, 'paired.json')
		pendingPath = join(dir, 'pending.json')
	})

	afterEach(() => {
		rmSync(dir, {recursive: true, force: true})
	})

	function writePending(entries: Record<string, unknown>) {
		writeFileSync(pendingPath, JSON.stringify(entries))
	}
	function writePaired(entries: Record<string, unknown>) {
		writeFileSync(pairedPath, JSON.stringify(entries))
	}
	function readPaired(): Record<string, unknown> {
		return JSON.parse(readFileSync(pairedPath, 'utf8'))
	}
	function readPending(): Record<string, unknown> {
		return JSON.parse(readFileSync(pendingPath, 'utf8'))
	}

	test('returns invalid-input for non-hex deviceId', () => {
		const result = autoApproveDevice('not-hex!!!', {devicesDir: dir})
		expect(result.status).toBe('invalid-input')
		expect(existsSync(pairedPath)).toBe(false)
	})

	test('returns invalid-input for empty string', () => {
		const result = autoApproveDevice('', {devicesDir: dir})
		expect(result.status).toBe('invalid-input')
	})

	test('returns invalid-input for non-string', () => {
		const result = autoApproveDevice(undefined, {devicesDir: dir})
		expect(result.status).toBe('invalid-input')
	})

	test('returns no-pending when files do not exist', () => {
		const result = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(result.status).toBe('no-pending')
		expect(result.deviceId).toBe(HEX_DEVICE_A)
	})

	test('returns no-pending when no matching deviceId', () => {
		writePending({
			'req-1': {
				requestId: 'req-1',
				deviceId: HEX_DEVICE_B,
				publicKey: 'pk-b',
				platform: 'web',
				clientId: 'openclaw-control-ui',
				clientMode: 'ui',
				role: 'operator',
				roles: ['operator'],
				scopes: ['operator.admin'],
				ts: 1000,
			},
		})
		const result = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(result.status).toBe('no-pending')
	})

	test('returns already-paired when device already in paired.json', () => {
		writePaired({
			[HEX_DEVICE_A]: {deviceId: HEX_DEVICE_A, scopes: ['operator.admin']},
		})
		writePending({
			'req-1': {
				requestId: 'req-1',
				deviceId: HEX_DEVICE_A,
				publicKey: 'pk-a',
				platform: 'web',
				clientId: 'openclaw-control-ui',
				clientMode: 'ui',
				role: 'operator',
				roles: ['operator'],
				scopes: ['operator.admin'],
				ts: 1000,
			},
		})
		const result = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(result.status).toBe('already-paired')
		// pending must NOT be cleaned up (caller may have racing state we
		// shouldn't touch when we didn't take action).
		expect(readPending()['req-1']).toBeDefined()
	})

	test('promotes pending entry to paired with operator token', () => {
		writePending({
			'98be1834-3c9a-481a-a1e0-70cf8f0397e0': {
				requestId: '98be1834-3c9a-481a-a1e0-70cf8f0397e0',
				deviceId: HEX_DEVICE_A,
				publicKey: 'vcp8qzpFB3j-iMmFHirc0Yi3rdjPMsgWPxV-9JV-Z3c',
				platform: 'web',
				clientId: 'openclaw-control-ui',
				clientMode: 'ui',
				role: 'operator',
				roles: ['operator'],
				scopes: ['operator.read', 'operator.write', 'operator.admin'],
				silent: false,
				isRepair: false,
				ts: 1779604452379,
			},
		})

		const result = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(result.status).toBe('promoted')
		expect(result.deviceId).toBe(HEX_DEVICE_A)
		expect(result.requestId).toBe('98be1834-3c9a-481a-a1e0-70cf8f0397e0')

		const paired = readPaired() as Record<string, {
			deviceId: string
			publicKey: string
			scopes: string[]
			approvedScopes: string[]
			tokens: {operator: {token: string; scopes: string[]; createdAtMs: number}}
			createdAtMs: number
			approvedAtMs: number
		}>
		expect(paired[HEX_DEVICE_A]).toBeDefined()
		expect(paired[HEX_DEVICE_A]!.deviceId).toBe(HEX_DEVICE_A)
		expect(paired[HEX_DEVICE_A]!.publicKey).toBe('vcp8qzpFB3j-iMmFHirc0Yi3rdjPMsgWPxV-9JV-Z3c')
		expect(paired[HEX_DEVICE_A]!.scopes).toEqual([
			'operator.read',
			'operator.write',
			'operator.admin',
		])
		expect(paired[HEX_DEVICE_A]!.approvedScopes).toEqual(paired[HEX_DEVICE_A]!.scopes)
		// Token must be base64url, 32 bytes → 43 chars (no padding)
		const token = paired[HEX_DEVICE_A]!.tokens.operator.token
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(paired[HEX_DEVICE_A]!.tokens.operator.scopes).toEqual(paired[HEX_DEVICE_A]!.scopes)
		expect(typeof paired[HEX_DEVICE_A]!.createdAtMs).toBe('number')
		expect(typeof paired[HEX_DEVICE_A]!.approvedAtMs).toBe('number')

		const pending = readPending()
		expect(pending['98be1834-3c9a-481a-a1e0-70cf8f0397e0']).toBeUndefined()
	})

	test('defaults scopes when pending entry has empty/missing scopes', () => {
		writePending({
			'req-1': {
				requestId: 'req-1',
				deviceId: HEX_DEVICE_A,
				publicKey: 'pk-a',
				platform: 'web',
				clientId: 'openclaw-control-ui',
				clientMode: 'ui',
				role: 'operator',
				roles: ['operator'],
				scopes: [],
				ts: 1000,
			},
		})
		const result = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(result.status).toBe('promoted')
		const paired = readPaired() as Record<string, {scopes: string[]}>
		expect(paired[HEX_DEVICE_A]!.scopes).toContain('operator.admin')
		expect(paired[HEX_DEVICE_A]!.scopes).toContain('operator.read')
		expect(paired[HEX_DEVICE_A]!.scopes).toContain('operator.write')
	})

	test('idempotent across two calls', () => {
		writePending({
			'req-1': {
				requestId: 'req-1',
				deviceId: HEX_DEVICE_A,
				publicKey: 'pk-a',
				platform: 'web',
				clientId: 'openclaw-control-ui',
				clientMode: 'ui',
				role: 'operator',
				roles: ['operator'],
				scopes: ['operator.admin'],
				ts: 1000,
			},
		})
		const first = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(first.status).toBe('promoted')
		const second = autoApproveDevice(HEX_DEVICE_A, {devicesDir: dir})
		expect(second.status).toBe('already-paired')
	})
})
