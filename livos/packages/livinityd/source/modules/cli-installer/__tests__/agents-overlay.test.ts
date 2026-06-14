/**
 * Phase 269-03 Task 1 — agents-overlay.test.ts (RED → GREEN)
 *
 * Unit tests for the PURE join/filter module behind the auth-gated AionUi
 * agent list (WS3). The Express overlay route (Task 3) does the I/O (the
 * :3020 fetch + the Redis MGET) and calls `buildAgentsOverlay` with the
 * already-resolved AionUi list + auth map — so ALL the filtering logic is
 * unit-testable here with plain objects, no network, no Redis.
 *
 * The contract (RESEARCH §WS3 + the plan must_haves):
 *   - `BIN_TO_CLI_NAME` is the EXACT inversion of `CLI_BIN_NAMES` (single
 *     source of truth — never a hand-written second map).
 *   - "ready/authed" = AionUi `available && enabled` AND
 *     `authMap.get(cliName) !== 'failed'`. The POSITIVE 'ok' signal is weak
 *     (3600s TTL re-hides working agents — pitfall P-2) so key-ABSENCE must
 *     NOT mean unauthed.
 *   - aion-cli (binary_name 'aion') is ALWAYS kept (built-in Liv backend).
 *   - An agent whose binary_name is NOT in BIN_TO_CLI_NAME is kept unfiltered
 *     (a non-LivOS agent the operator added — assumption A3).
 *   - FAIL-OPEN: when authMap is null (Redis unavailable) the AionUi list is
 *     returned VERBATIM (pitfall P-3).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, expect, test} from 'vitest'

import {buildAgentsOverlay, BIN_TO_CLI_NAME, type AionuiAgent} from '../agents-overlay.js'
import {CLI_BIN_NAMES} from '../install-scripts.js'
import type {CliName} from '../types.js'

/** Minimal AionUi agent factory mirroring the /api/agents object shape. */
function agent(binaryName: string, over: Partial<AionuiAgent> = {}): AionuiAgent {
	return {
		backend: binaryName,
		agent_source_info: {binary_name: binaryName},
		available: true,
		enabled: true,
		...over,
	}
}

function binNames(agents: AionuiAgent[]): string[] {
	return agents.map((a) => a.agent_source_info?.binary_name ?? a.backend ?? '')
}

describe('BIN_TO_CLI_NAME — exact inversion of CLI_BIN_NAMES', () => {
	test('is the exact inverse (representative subset)', () => {
		expect(BIN_TO_CLI_NAME.claude).toBe('claude-code')
		expect(BIN_TO_CLI_NAME.copilot).toBe('github-copilot')
		expect(BIN_TO_CLI_NAME.qwen).toBe('qwen-code')
		expect(BIN_TO_CLI_NAME.auggie).toBe('augment')
		expect(BIN_TO_CLI_NAME.droid).toBe('factory-droid')
		expect(BIN_TO_CLI_NAME.kimi).toBe('kimi-cli')
		expect(BIN_TO_CLI_NAME.aion).toBe('aion-cli')
		expect(BIN_TO_CLI_NAME.vibe).toBe('mistral-vibe')
	})

	test('its size equals CLI_BIN_NAMES size (no collisions, complete inversion)', () => {
		expect(Object.keys(BIN_TO_CLI_NAME).length).toBe(Object.keys(CLI_BIN_NAMES).length)
	})

	test('round-trips every CLI_BIN_NAMES entry', () => {
		for (const [cli, bin] of Object.entries(CLI_BIN_NAMES)) {
			expect(BIN_TO_CLI_NAME[bin]).toBe(cli)
		}
	})
})

describe('buildAgentsOverlay — join + filter', () => {
	test("keeps an agent whose auth status is 'ok'", () => {
		const list = [agent('claude')]
		const authMap = new Map<CliName, string>([['claude-code', 'ok']])
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['claude'])
	})

	test('keeps an agent whose status key is ABSENT but AionUi says available && enabled (TTL gotcha P-2)', () => {
		// claude-code authed an hour ago — the 3600s key expired, so it is
		// absent from the map. Absence must NOT hide a working agent.
		const list = [agent('claude')]
		const authMap = new Map<CliName, string>() // empty but present (Redis up, key expired)
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['claude'])
	})

	test("filters an agent whose status is 'failed' (the reliable negative signal)", () => {
		const list = [agent('claude'), agent('gemini')]
		const authMap = new Map<CliName, string>([
			['claude-code', 'failed'],
			['gemini', 'ok'],
		])
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['gemini'])
	})

	test("filters an agent that AionUi marks unavailable even with no 'failed' status", () => {
		const list = [agent('gemini', {available: false}), agent('claude')]
		const authMap = new Map<CliName, string>()
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['claude'])
	})

	test("filters an agent that AionUi marks disabled", () => {
		const list = [agent('gemini', {enabled: false}), agent('claude')]
		const authMap = new Map<CliName, string>()
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['claude'])
	})

	test("ALWAYS keeps aion-cli (binary_name 'aion') regardless of auth", () => {
		// Even with a 'failed' status AND unavailable, aion is the built-in
		// Liv backend and must never vanish.
		const list = [agent('aion', {available: false, enabled: false})]
		const authMap = new Map<CliName, string>([['aion-cli', 'failed']])
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['aion'])
	})

	test('keeps an agent whose binary_name is NOT in BIN_TO_CLI_NAME unfiltered (non-LivOS agent — A3)', () => {
		// The operator added a foreign agent AionUi enumerates but LivOS does
		// not manage. We don't hide what we don't manage.
		const list = [agent('some-foreign-agent')]
		const authMap = new Map<CliName, string>()
		const out = buildAgentsOverlay(list, authMap)
		expect(binNames(out)).toEqual(['some-foreign-agent'])
	})

	test('FAIL-OPEN: returns the AionUi list VERBATIM when authMap is null (Redis unavailable — P-3)', () => {
		const list = [agent('claude', {available: false}), agent('gemini', {enabled: false})]
		const out = buildAgentsOverlay(list, null)
		// Even the unavailable/disabled ones are returned — fail-open is the
		// SAME object array, never a filtered subset.
		expect(out).toBe(list)
	})

	test("mode='badge' annotates instead of hiding (future picker pass) — still ships 'filter' by default", () => {
		const list = [agent('claude', {available: false})]
		const authMap = new Map<CliName, string>()
		// Default mode filters.
		expect(buildAgentsOverlay(list, authMap)).toHaveLength(0)
		// Explicit badge mode keeps the agent (the route ships 'filter').
		const badged = buildAgentsOverlay(list, authMap, 'badge')
		expect(badged).toHaveLength(1)
		expect((badged[0] as any).liv_not_authed).toBe(true)
	})
})
