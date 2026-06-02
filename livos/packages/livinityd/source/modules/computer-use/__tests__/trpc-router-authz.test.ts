/**
 * Phase 254-06 Gap 2 (CR-01 Option A) — getVncUrl authorization matrix.
 *
 * Unit-tests the PURE extracted predicate `canAccessDisplay` (no full tRPC
 * caller harness needed — mirrors the config-router extract-and-test-a-pure-
 * function pattern in server/trpc/__tests__/config-router.test.ts).
 *
 * The matrix proves the admin bypass restores the single-tenant Mini PC
 * operator on MCP-created displays (owner_session='bruce' never equals the UI
 * UUID) WITHOUT loosening multi-user isolation: a non-admin caller is still
 * FORBIDDEN from a foreign non-empty owner_session, while shared (empty
 * owner_session) displays remain readable by anyone authenticated.
 */

import {describe, expect, test} from 'vitest'

import {canAccessDisplay} from '../trpc-router.js'

describe('canAccessDisplay — Phase 254-06 admin-bypass / owner / shared matrix', () => {
	test('empty owner_session (host/shared) → ANY authenticated caller is allowed', () => {
		expect(
			canAccessDisplay({ownerSession: '', callerSession: 'anyone', callerRole: 'guest'}),
		).toBe(true)
	})

	test('admin bypass → admin reaches an MCP-created display despite UUID-vs-"bruce" mismatch', () => {
		expect(
			canAccessDisplay({ownerSession: 'bruce', callerSession: 'some-uuid', callerRole: 'admin'}),
		).toBe(true)
	})

	test('owner match → non-admin can reach their OWN display', () => {
		expect(
			canAccessDisplay({ownerSession: 'bruce', callerSession: 'bruce', callerRole: 'member'}),
		).toBe(true)
	})

	test('non-admin, not owner, non-empty owner_session → FORBIDDEN', () => {
		expect(
			canAccessDisplay({ownerSession: 'bruce', callerSession: 'some-uuid', callerRole: 'member'}),
		).toBe(false)
	})

	test('guest is also FORBIDDEN for a foreign owned display', () => {
		expect(
			canAccessDisplay({ownerSession: 'bruce', callerSession: 'some-uuid', callerRole: 'guest'}),
		).toBe(false)
	})
})
