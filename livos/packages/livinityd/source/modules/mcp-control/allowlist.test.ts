/**
 * Phase 346-02 (MCP-01) — frozen procedure allowlist tests.
 *
 * The allowlist is THE chokepoint (D-346-4): a procedure not on it is refused at
 * the MCP layer BEFORE any /trpc call. These tests pin the EXACT 10-procedure
 * safe surface (D-346-3, plan-check BLOCKER 2), the tool→procedure consistency,
 * the fail-closed guard, the frozen-at-runtime guarantee, and — critically — the
 * structural ABSENCE of the destructive/step-up tier (D-346-8).
 */

import {describe, expect, test} from 'vitest'

import {
	MCP_ALLOWLISTED_PROCEDURES,
	MCP_PROCEDURE_ALLOWLIST,
	MCP_PROCEDURE_NOT_ALLOWLISTED,
	TOOL_PROCEDURE_MAP,
	assertAllowlistedProcedure,
} from './allowlist.js'

// The exact safe surface (D-346-3 / plan-check BLOCKER 2 — system_* is THREE).
const EXPECTED_PROCEDURES = [
	'apps.list',
	'apps.state',
	'apps.start',
	'apps.stop',
	'apps.restart',
	'apps.logs',
	'system.cpuUsage',
	'system.memoryUsage',
	'system.diskUsage',
	'scheduler.listJobs',
]

// The tier that MUST be structurally absent (D-346-8). These fail closed anyway
// (no step-up mint from a loopback ctx) but must ALSO never be listed.
const DESTRUCTIVE_TIER = [
	'apps.uninstall',
	'user.deleteUser',
	'system.luksFormat',
	'appMigration.importBundle',
]

describe('mcp-control allowlist (Phase 346-02)', () => {
	test('MCP_PROCEDURE_ALLOWLIST contains EXACTLY the 10 safe procedures', () => {
		expect(MCP_PROCEDURE_ALLOWLIST.size).toBe(10)
		for (const proc of EXPECTED_PROCEDURES) {
			expect(MCP_PROCEDURE_ALLOWLIST.has(proc)).toBe(true)
		}
		// no extras beyond the expected set
		for (const proc of MCP_ALLOWLISTED_PROCEDURES) {
			expect(EXPECTED_PROCEDURES).toContain(proc)
		}
	})

	test('TOOL_PROCEDURE_MAP maps all 10 tools 1:1 to allowlisted procedures', () => {
		expect(Object.keys(TOOL_PROCEDURE_MAP)).toHaveLength(10)
		expect(TOOL_PROCEDURE_MAP.apps_list).toBe('apps.list')
		expect(TOOL_PROCEDURE_MAP.app_state).toBe('apps.state')
		expect(TOOL_PROCEDURE_MAP.app_start).toBe('apps.start')
		expect(TOOL_PROCEDURE_MAP.app_stop).toBe('apps.stop')
		expect(TOOL_PROCEDURE_MAP.app_restart).toBe('apps.restart')
		expect(TOOL_PROCEDURE_MAP.app_logs).toBe('apps.logs')
		expect(TOOL_PROCEDURE_MAP.system_cpu).toBe('system.cpuUsage')
		expect(TOOL_PROCEDURE_MAP.system_memory).toBe('system.memoryUsage')
		expect(TOOL_PROCEDURE_MAP.system_disk).toBe('system.diskUsage')
		expect(TOOL_PROCEDURE_MAP.scheduler_list).toBe('scheduler.listJobs')
	})

	test('every TOOL_PROCEDURE_MAP value is a member of the allowlist (consistency)', () => {
		for (const proc of Object.values(TOOL_PROCEDURE_MAP)) {
			expect(MCP_PROCEDURE_ALLOWLIST.has(proc)).toBe(true)
		}
	})

	test('assertAllowlistedProcedure passes for an allowlisted procedure', () => {
		expect(() => assertAllowlistedProcedure('apps.list')).not.toThrow()
		expect(() => assertAllowlistedProcedure('scheduler.listJobs')).not.toThrow()
	})

	test('assertAllowlistedProcedure throws fail-closed for a non-listed procedure', () => {
		expect(() => assertAllowlistedProcedure('apps.uninstall')).toThrow(
			`${MCP_PROCEDURE_NOT_ALLOWLISTED}: apps.uninstall`,
		)
		expect(() => assertAllowlistedProcedure('totally.madeUp')).toThrow(
			MCP_PROCEDURE_NOT_ALLOWLISTED,
		)
		// empty / garbage input also fails closed
		expect(() => assertAllowlistedProcedure('')).toThrow(MCP_PROCEDURE_NOT_ALLOWLISTED)
	})

	test('the 4 destructive/step-up procedures are ABSENT from the allowlist (D-346-8)', () => {
		for (const proc of DESTRUCTIVE_TIER) {
			expect(MCP_PROCEDURE_ALLOWLIST.has(proc)).toBe(false)
			expect(() => assertAllowlistedProcedure(proc)).toThrow(
				MCP_PROCEDURE_NOT_ALLOWLISTED,
			)
		}
	})

	test('the backing procedure tuple is frozen (cannot be mutated at runtime)', () => {
		expect(Object.isFrozen(MCP_ALLOWLISTED_PROCEDURES)).toBe(true)
		expect(Object.isFrozen(TOOL_PROCEDURE_MAP)).toBe(true)
		// a mutation attempt must not extend the surface
		expect(() => {
			// @ts-expect-error — deliberately probing runtime immutability
			MCP_ALLOWLISTED_PROCEDURES.push('apps.uninstall')
		}).toThrow()
		expect(MCP_ALLOWLISTED_PROCEDURES).toHaveLength(10)
	})
})
