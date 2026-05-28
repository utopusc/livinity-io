/**
 * Phase 245.1 — seed-payload-contract.test.ts
 *
 * Drift-lock against scripts/install/seeds/mcp-servers.json. The 5 Liv system
 * MCPs MUST ship with:
 *
 *   - enabled: true (operator declared mandatory in v43 UAT)
 *   - luse.env containing the 7-key env-thread (DISPLAY, XAUTHORITY,
 *     LUSE_REDIS_URL, LIVINITYD_API_URL, LIV_API_KEY, LUSE_USER_SLUG,
 *     LUSE_DOMAIN_ROOT) so the [luse-mcp] resolver doesn't fall back to
 *     APP_MAP in production (was emitting `env-thread incomplete` + redis=null
 *     pre-245.1).
 *   - liv-apps / liv-docker / liv-system / liv-vault carrying at least
 *     LIVINITYD_API_URL + LIV_API_KEY so they can authenticate back to
 *     livinityd's HTTP API.
 *
 * Non-system MCPs (sequential-thinking + the search/dev/files/productivity
 * /database/web set) intentionally remain enabled:false — operators opt in.
 */

import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

import {SYSTEM_MCP_NAMES} from '../redis-catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// __dirname = livos/packages/livinityd/source/modules/mcp-registrar/__tests__
// repo root = up 7 levels
const SEED_PATH = resolve(__dirname, '../../../../../../../scripts/install/seeds/mcp-servers.json')

interface SeedEntry {
	name: string
	transport: 'stdio' | 'http'
	command?: string
	args?: string[]
	url?: string
	env?: Record<string, string>
	enabled?: boolean
	category?: string
}

interface SeedFile {
	_meta?: unknown
	mcpServers: Record<string, SeedEntry>
}

function loadSeed(): SeedFile {
	const raw = readFileSync(SEED_PATH, 'utf8')
	return JSON.parse(raw) as SeedFile
}

describe('Phase 245.1 — mcp-servers.json contract', () => {
	test('all 5 system MCPs are present', () => {
		const seed = loadSeed()
		for (const name of SYSTEM_MCP_NAMES) {
			expect(seed.mcpServers[name], `missing system MCP: ${name}`).toBeDefined()
		}
	})

	test('all 5 system MCPs ship enabled:true', () => {
		const seed = loadSeed()
		for (const name of SYSTEM_MCP_NAMES) {
			expect(
				seed.mcpServers[name]?.enabled,
				`system MCP '${name}' must ship enabled:true (Phase 245.1 mandatory contract)`,
			).toBe(true)
		}
	})

	test('luse env-thread carries all 7 required keys (Phase 245.1)', () => {
		const seed = loadSeed()
		const luse = seed.mcpServers.luse
		expect(luse).toBeDefined()
		expect(luse?.env).toBeDefined()
		const envKeys = Object.keys(luse?.env ?? {}).sort()
		expect(envKeys).toEqual(
			[
				'DISPLAY',
				'LIVINITYD_API_URL',
				'LIV_API_KEY',
				'LUSE_DOMAIN_ROOT',
				'LUSE_REDIS_URL',
				'LUSE_USER_SLUG',
				'XAUTHORITY',
			],
		)
	})

	test('luse env uses install-time placeholders for host-specific values', () => {
		const seed = loadSeed()
		const env = seed.mcpServers.luse?.env ?? {}
		expect(env.LUSE_REDIS_URL).toBe('__LIVOS_REDIS_URL__')
		expect(env.LIV_API_KEY).toBe('__LIVOS_LIV_API_KEY__')
		expect(env.LUSE_USER_SLUG).toBe('__LIVOS_USER_SLUG__')
		expect(env.LUSE_DOMAIN_ROOT).toBe('__LIVOS_DOMAIN_ROOT__')
		// Static defaults — NOT placeholders, set in seed JSON literally.
		expect(env.LIVINITYD_API_URL).toBe('http://127.0.0.1:8080')
		expect(env.DISPLAY).toBe(':1')
		expect(env.XAUTHORITY).toBe('/run/user/1000/gdm/Xauthority')
	})

	test('4 local liv-* MCPs carry LIVINITYD_API_URL + LIV_API_KEY env', () => {
		const seed = loadSeed()
		for (const name of ['liv-apps', 'liv-docker', 'liv-system', 'liv-vault']) {
			const entry = seed.mcpServers[name]
			expect(entry, `missing ${name}`).toBeDefined()
			expect(entry?.env, `${name} must carry env block`).toBeDefined()
			expect(entry?.env?.LIVINITYD_API_URL).toBe('http://127.0.0.1:8080')
			expect(entry?.env?.LIV_API_KEY).toBe('__LIVOS_LIV_API_KEY__')
		}
	})

	test('non-system MCPs default enabled:false (operator opt-in)', () => {
		const seed = loadSeed()
		const systemSet = new Set<string>(SYSTEM_MCP_NAMES)
		// `sequential-thinking` is the only non-system MCP allowed to ship
		// enabled:true (productivity utility, no host-specific secret).
		const allowedEnabledNonSystem = new Set(['sequential-thinking'])
		for (const [name, entry] of Object.entries(seed.mcpServers)) {
			if (systemSet.has(name) || allowedEnabledNonSystem.has(name)) continue
			expect(
				entry.enabled,
				`non-system MCP '${name}' should default enabled:false (operator opts in)`,
			).toBeFalsy()
		}
	})
})
