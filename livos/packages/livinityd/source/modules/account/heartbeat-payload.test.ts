import {describe, it, expect} from 'vitest'
import os from 'node:os'
import {
	buildHeartbeatPayload,
	detectPrimaryIPv4,
} from './heartbeat-payload.js'

describe('account/heartbeat-payload.ts — Phase 104 plan 104-10', () => {
	describe('buildHeartbeatPayload — shape contract', () => {
		it('returns all required fields with correct types', () => {
			const p = buildHeartbeatPayload({
				deviceId: '550e8400-e29b-41d4-a716-446655440000',
				mode: 'tunnel',
				version: '1.5.0',
			})
			expect(typeof p.device_id).toBe('string')
			expect(typeof p.hostname).toBe('string')
			expect(typeof p.mode).toBe('string')
			expect(typeof p.version).toBe('string')
			expect(typeof p.uptime).toBe('number')
			expect(typeof p.node_version).toBe('string')
			expect(p.ip === null || typeof p.ip === 'string').toBe(true)
		})

		it('echoes the deviceId / mode / version inputs verbatim', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee',
				mode: 'tunnel',
				version: '1.5.0',
			})
			expect(p.device_id).toBe('aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee')
			expect(p.mode).toBe('tunnel')
			expect(p.version).toBe('1.5.0')
		})

		it('defaults hostname to os.hostname()', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
			})
			expect(p.hostname).toBe(os.hostname())
		})

		it('honors hostname override (test injection)', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
				hostname: 'mini-pc.bruce.lan',
			})
			expect(p.hostname).toBe('mini-pc.bruce.lan')
		})

		it('honors uptime override', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
				uptime: 12345,
			})
			expect(p.uptime).toBe(12345)
		})

		it('uptime is non-negative integer when defaulted', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
			})
			expect(p.uptime).toBeGreaterThanOrEqual(0)
			expect(Number.isFinite(p.uptime)).toBe(true)
		})

		it('honors ip override (including explicit null)', () => {
			const p1 = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
				ip: '192.168.1.42',
			})
			expect(p1.ip).toBe('192.168.1.42')
			const p2 = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
				ip: null,
			})
			expect(p2.ip).toBeNull()
		})

		it('honors nodeVersion override', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
				nodeVersion: 'v22.0.0',
			})
			expect(p.node_version).toBe('v22.0.0')
		})

		it('defaults node_version to process.version', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
			})
			expect(p.node_version).toBe(process.version)
		})

		it('serializes to JSON cleanly (no circular refs or BigInt)', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'd',
				mode: 'tunnel',
				version: '1.5.0',
				hostname: 'mini',
				ip: '10.0.0.1',
				uptime: 100,
				nodeVersion: 'v22.0.0',
			})
			const json = JSON.stringify(p)
			const parsed = JSON.parse(json)
			expect(parsed).toEqual({
				device_id: 'd',
				hostname: 'mini',
				mode: 'tunnel',
				version: '1.5.0',
				ip: '10.0.0.1',
				uptime: 100,
				node_version: 'v22.0.0',
			})
		})

		it('payload stays under 1KB serialized (control-plane budget)', () => {
			const p = buildHeartbeatPayload({
				deviceId: 'aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee',
				mode: 'hybrid',
				version: '1.5.0',
				hostname: 'mini-pc.bruce.example.com.localdomain.long-name',
				ip: '192.168.255.255',
				uptime: 999_999_999,
				nodeVersion: 'v22.99.99-pre-release-build-something',
			})
			const serialized = JSON.stringify(p)
			// D-104-RELAY-ZERO-DATA-PLANE budget per heartbeat-sender.ts comment:
			// ~200 bytes. Even with pessimistic-length fields we stay <1KB.
			expect(serialized.length).toBeLessThan(1024)
		})
	})

	describe('detectPrimaryIPv4', () => {
		it('returns either null or a valid IPv4 string', () => {
			const ip = detectPrimaryIPv4()
			if (ip !== null) {
				// Match real IPv4 (0-255 octets) — relaxed enough for any platform.
				expect(ip).toMatch(
					/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/,
				)
			}
		})

		it('never returns a loopback / internal address', () => {
			const ip = detectPrimaryIPv4()
			if (ip !== null) {
				expect(ip).not.toBe('127.0.0.1')
				expect(ip).not.toMatch(/^127\./)
			}
		})
	})
})
