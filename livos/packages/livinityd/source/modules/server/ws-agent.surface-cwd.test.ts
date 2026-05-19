/**
 * Phase 163-02 — ws-agent.surface-cwd.test.ts
 *
 * Vitest suite for per-session surface vault path resolution.
 *
 * Covers:
 *   - Source-text invariants on ws-agent.ts (exported helpers, template
 *     literal shape, Phase 161/162-02/162-04 contract preservation)
 *   - Runtime invariants on the pure `resolveSessionVaultPath` resolver
 *   - Runtime invariants on the async `resolveSessionVaultPathWithFallback`
 *     wrapper exercised against a real tmpdir (so the suite never touches
 *     the production `/home/bruce/livinity-vault`)
 *
 * Phase 161 contract preserved: isComputerUseSession(convId) still returns
 * true for native:/webapp: prefixes — Haiku tier override still fires.
 * Phase 162-04 buildSessionKey + composite-key contract preserved.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {mkdtemp, mkdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {
	resolveSessionVaultPath,
	resolveSessionVaultPathWithFallback,
} from './ws-agent.js'

const WS_AGENT_SOURCE = readFileSync(
	new URL('./ws-agent.ts', import.meta.url),
	'utf8',
)

describe('Phase 163-02 ws-agent source-text invariants', () => {
	it('exports resolveSessionVaultPath', () => {
		expect(WS_AGENT_SOURCE).toMatch(/export\s+function\s+resolveSessionVaultPath/)
	})

	it('exports + uses resolveSessionVaultPathWithFallback', () => {
		const matches = WS_AGENT_SOURCE.match(/resolveSessionVaultPathWithFallback/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(2)
	})

	it('surfaces/${kind}/${id} template literal appears once', () => {
		const matches = WS_AGENT_SOURCE.match(/surfaces\/\$\{kind\}\/\$\{id\}/g) ?? []
		expect(matches.length).toBe(1)
	})

	it('does NOT introduce Phase 161 dated literal in ws-agent', () => {
		expect(WS_AGENT_SOURCE).not.toContain('claude-haiku-4-5-20251001')
	})

	it('preserves Phase 162-02 vaultModeConfig.defaultModel threading (Phase 165-02: now read from the per-connection const, not opts)', () => {
		// Phase 165-02 — opts.vaultModeConfig (boot-frozen) was renamed to
		// opts.resolveVaultModeConfig (per-connection getter). The threading of
		// .defaultModel into AgentSessionManager still happens, but now via
		// the per-connection local `vaultModeConfig` const.
		expect(WS_AGENT_SOURCE).toMatch(
			/vaultModeConfig\?\.defaultModel|vaultModeConfig\.defaultModel/,
		)
		// Old boot-frozen form must be GONE
		expect(WS_AGENT_SOURCE).not.toMatch(/opts\.vaultModeConfig\b/)
	})

	it('preserves Phase 162-04 raw.surface recompute branch', () => {
		expect(WS_AGENT_SOURCE).toContain('(raw as any).surface')
	})

	it('preserves Phase 162-04 buildSessionKey closure (≥3 occurrences)', () => {
		const matches = WS_AGENT_SOURCE.match(/buildSessionKey/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(3)
	})

	it('routes handleMessage/cleanup/injectSteer through managerFor — no bare sessionManager.* or defaultSessionManager.* delegation', () => {
		// All handler delegations must go through managerFor(sessionKey).
		// The bare identifier `sessionManager` followed by `.handleMessage` must NOT appear.
		// (`AgentSessionManager`, `buildSessionManager`, `defaultSessionManager`,
		// `perSessionManagers` are all allowed — they're not bare `sessionManager.`)
		expect(WS_AGENT_SOURCE).not.toMatch(/(?<![A-Za-z])sessionManager\.handleMessage/)
		expect(WS_AGENT_SOURCE).not.toMatch(/defaultSessionManager\.handleMessage/)
		expect(WS_AGENT_SOURCE).not.toMatch(/defaultSessionManager\.cleanup/)
		expect(WS_AGENT_SOURCE).not.toMatch(/defaultSessionManager\.injectSteer/)
	})
})

describe('Phase 163-02 resolveSessionVaultPath runtime', () => {
	it('webapp prefix → subsurface', () => {
		expect(resolveSessionVaultPath('webapp:suna:abc123', '/v')).toBe('/v/surfaces/webapp/suna')
	})

	it('native prefix → subsurface', () => {
		expect(resolveSessionVaultPath('native:blender:def456', '/v')).toBe('/v/surfaces/native/blender')
	})

	it('no prefix → base (Main Chat)', () => {
		expect(resolveSessionVaultPath('conv_xxxxx', '/v')).toBe('/v')
	})

	it('undefined → base', () => {
		expect(resolveSessionVaultPath(undefined, '/v')).toBe('/v')
	})

	it('empty string → base', () => {
		expect(resolveSessionVaultPath('', '/v')).toBe('/v')
	})

	it('webapp: with empty id → base', () => {
		expect(resolveSessionVaultPath('webapp:', '/v')).toBe('/v')
	})

	it('unknown prefix → base', () => {
		expect(resolveSessionVaultPath('unknown:xyz:abc', '/v')).toBe('/v')
	})
})

describe('Phase 163-02 resolveSessionVaultPathWithFallback runtime', () => {
	let tmp: string

	beforeEach(async () => {
		tmp = await mkdtemp(path.join(tmpdir(), 'phase-163-02-'))
	})

	afterEach(async () => {
		await rm(tmp, {recursive: true, force: true})
	})

	it('falls back to base when subsurface dir does not exist', async () => {
		const r = await resolveSessionVaultPathWithFallback('webapp:nonexistent:abc', tmp)
		expect(r).toBe(tmp)
	})

	it('returns subsurface when dir exists', async () => {
		// Use forward-slash form to match the resolver's `${base}/surfaces/${kind}/${id}`
		// output exactly. `fs.stat` accepts both separators on Windows, but the
		// equality assertion needs string-identical output.
		const surfaceDir = `${tmp}/surfaces/webapp/suna`
		await mkdir(surfaceDir, {recursive: true})
		const r = await resolveSessionVaultPathWithFallback('webapp:suna:abc', tmp)
		expect(r).toBe(surfaceDir)
	})

	it('Main Chat (no prefix) returns base without stat call', async () => {
		const r = await resolveSessionVaultPathWithFallback('conv_abc', tmp)
		expect(r).toBe(tmp)
	})
})
