// Phase 85 V32-AGENT-03 — locked 5-agent system seed catalog (v32 milestone).
// Mirrors the agent-templates.ts seed style. Idempotent INSERT...ON CONFLICT
// (id) DO NOTHING runner. Invoked from initDatabase() after schema apply.
//
// All 5 seeds use stable, hand-authored UUIDs (NOT gen_random_uuid()) so that
// downstream consumers (Wave 2 P85-UI tRPC routes, future migrations,
// "Reset to Default" features) can reference them by id literal.
//
// Seeds are static compile-time literals — code review is the integrity gate.
// Parameterized $1..$N placeholders prevent SQL injection regardless.
// Seed runner failure does NOT block livinityd boot — caller (initDatabase)
// wraps in try/catch and logs warning.

import type pg from 'pg'

export type ConfiguredMcpSeed = {
	name: string
	enabledTools: string[]
}

export type AgentpressToolsSeed = Record<string, boolean>

export type AgentSeed = {
	id: string // stable UUID — DO NOT regenerate
	name: string
	description: string
	systemPrompt: string
	modelTier: 'haiku' | 'sonnet' | 'opus'
	configuredMcps: ConfiguredMcpSeed[]
	agentpressTools: AgentpressToolsSeed
	avatar: string
	avatarColor: string
	tags: string[]
}

// =============================================================================
// 5 LOCKED V32 SEEDS — order matters; downstream tests assert this exact list.
// =============================================================================

export const AGENT_SEEDS: AgentSeed[] = [
	{
		id: '11111111-1111-4111-8111-111111111111',
		name: '🤖 Liv Default',
		description:
			'General-purpose AI assistant with full tool access. Best for everyday tasks, research, and exploration.',
		systemPrompt:
			"You are Liv, a helpful AI assistant running on the user's home server. You have access to terminal, files, web search, browser tools, and MCP servers. Be concise, accurate, and proactive.",
		modelTier: 'sonnet',
		configuredMcps: [],
		agentpressTools: {
			terminal: true,
			files: true,
			web_search: true,
			web_scrape: true,
			browser_devtools: true,
			git: true,
			computer_use: false,
			csv_preview: false,
		},
		avatar: '🤖',
		avatarColor: '#3b82f6',
		tags: ['general', 'assistant'],
	},
	{
		id: '22222222-2222-4222-8222-222222222222',
		name: '🔬 Researcher',
		description: 'Web research specialist. Searches, scrapes, summarizes, and cites sources.',
		systemPrompt:
			'You are a research specialist. Always cite sources with URLs. When asked to research a topic, use web_search broadly first, then web_scrape on the most relevant results. Synthesize findings into structured reports with citations.',
		modelTier: 'sonnet',
		configuredMcps: [],
		agentpressTools: {
			web_search: true,
			web_scrape: true,
			browser_devtools: true,
			files: true,
			terminal: false,
			git: false,
			computer_use: false,
			csv_preview: false,
		},
		avatar: '🔬',
		avatarColor: '#10b981',
		tags: ['research', 'web'],
	},
	{
		id: '33333333-3333-4333-8333-333333333333',
		name: '💻 Coder',
		description: 'Software engineering specialist. Writes, reviews, refactors, and ships code.',
		systemPrompt:
			"You are a senior software engineer. Read existing code before making changes. Follow the project's conventions. Run tests before marking work complete. Use git for version control. Prefer editing existing files over creating new ones.",
		modelTier: 'opus',
		configuredMcps: [],
		agentpressTools: {
			terminal: true,
			files: true,
			browser_devtools: true,
			git: true,
			web_search: true,
			web_scrape: false,
			computer_use: false,
			csv_preview: false,
		},
		avatar: '💻',
		avatarColor: '#8b5cf6',
		tags: ['coding', 'engineering'],
	},
	{
		id: '44444444-4444-4444-8444-444444444444',
		name: '🖥️ Computer Operator',
		description:
			'Operates the desktop directly via screenshots and mouse/keyboard control. Best for GUI automation.',
		systemPrompt:
			"You operate the user's desktop via the bytebot MCP. Take screenshots first to see the current state. Click coordinates explicitly. Verify each action by taking another screenshot. Be deliberate — each click is consequential.",
		modelTier: 'sonnet',
		configuredMcps: [
			{
				name: 'bytebot',
				enabledTools: ['screenshot', 'click', 'type', 'key', 'scroll'],
			},
		],
		agentpressTools: {
			computer_use: true,
			files: true,
			terminal: false,
			web_search: false,
			web_scrape: false,
			browser_devtools: false,
			git: false,
			csv_preview: false,
		},
		avatar: '🖥️',
		avatarColor: '#f59e0b',
		tags: ['gui', 'automation', 'computer-use'],
	},
	{
		id: '55555555-5555-4555-8555-555555555555',
		name: '📊 Data Analyst',
		description:
			'Loads CSVs, runs analysis, generates visualizations and summary statistics.',
		systemPrompt:
			'You analyze data. Always inspect schema and head/tail of datasets first. Compute summary statistics. Generate clear, labeled visualizations when helpful. Explain findings in plain language with key numbers highlighted.',
		modelTier: 'sonnet',
		configuredMcps: [],
		agentpressTools: {
			files: true,
			csv_preview: true,
			terminal: true,
			web_search: false,
			web_scrape: false,
			browser_devtools: false,
			git: false,
			computer_use: false,
		},
		avatar: '📊',
		avatarColor: '#ec4899',
		tags: ['data', 'analysis'],
	},
]

// =============================================================================
// SHAPE VALIDATION (fail-fast on import — catches typos at boot, not runtime)
// =============================================================================

const _LOCKED_IDS = [
	'11111111-1111-4111-8111-111111111111',
	'22222222-2222-4222-8222-222222222222',
	'33333333-3333-4333-8333-333333333333',
	'44444444-4444-4444-8444-444444444444',
	'55555555-5555-4555-8555-555555555555',
] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

;(function validateSeedsAtImport(): void {
	if (AGENT_SEEDS.length !== 5) {
		throw new Error(
			`agents seed count drift: expected 5 (V32-AGENT-03), got ${AGENT_SEEDS.length}`,
		)
	}
	for (let i = 0; i < AGENT_SEEDS.length; i++) {
		const seed = AGENT_SEEDS[i]
		if (seed.id !== _LOCKED_IDS[i]) {
			throw new Error(
				`agents seed id at index ${i}: expected ${_LOCKED_IDS[i]}, got ${seed.id}`,
			)
		}
		if (!UUID_RE.test(seed.id)) {
			throw new Error(`agents seed ${seed.name}: id "${seed.id}" not a UUID`)
		}
		if (seed.name.length === 0) {
			throw new Error(`agents seed at index ${i}: empty name`)
		}
		if (seed.description.length === 0 || seed.description.length > 240) {
			throw new Error(
				`agents seed ${seed.name}: description length ${seed.description.length} out of range [1, 240]`,
			)
		}
		if (seed.systemPrompt.length < 20) {
			throw new Error(`agents seed ${seed.name}: systemPrompt too short`)
		}
		if (!['haiku', 'sonnet', 'opus'].includes(seed.modelTier)) {
			throw new Error(`agents seed ${seed.name}: invalid modelTier "${seed.modelTier}"`)
		}
		if (seed.tags.length === 0) {
			throw new Error(`agents seed ${seed.name}: tags array is empty`)
		}
	}
})()

// =============================================================================
// IDEMPOTENT INSERT RUNNER
// =============================================================================

/**
 * Idempotent INSERT...ON CONFLICT (id) DO NOTHING for every seed.
 * Returns counts of fresh inserts vs already-present skips.
 *
 * Throws on query failure — the caller (initDatabase) is responsible for
 * wrapping in try/catch so seed failure does not block livinityd boot.
 *
 * Concurrent-safe: ON CONFLICT (id) DO NOTHING handles racing inserts from
 * multiple livinityd instances cleanly.
 *
 * All seeds insert with user_id=NULL (system-wide, not user-scoped),
 * is_public=TRUE, is_default=FALSE, marketplace_published_at=NOW().
 */
export async function seedAgents(
	pool: pg.Pool,
): Promise<{inserted: number; skipped: number}> {
	let inserted = 0
	let skipped = 0
	for (const seed of AGENT_SEEDS) {
		const result = await pool.query(
			`INSERT INTO agents (
				id, user_id, name, description, system_prompt, model_tier,
				configured_mcps, agentpress_tools, avatar, avatar_color,
				is_default, is_public, marketplace_published_at, tags
			 ) VALUES (
				$1, NULL, $2, $3, $4, $5,
				$6::jsonb, $7::jsonb, $8, $9,
				FALSE, TRUE, NOW(), $10
			 )
			 ON CONFLICT (id) DO NOTHING`,
			[
				seed.id,
				seed.name,
				seed.description,
				seed.systemPrompt,
				seed.modelTier,
				JSON.stringify(seed.configuredMcps),
				JSON.stringify(seed.agentpressTools),
				seed.avatar,
				seed.avatarColor,
				seed.tags,
			],
		)
		if ((result.rowCount ?? 0) > 0) inserted++
		else skipped++
	}
	return {inserted, skipped}
}
