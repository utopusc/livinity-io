/**
 * Phase 219 T7 — Skills marketplace registry (curated seed).
 *
 * Each entry is a complete, installable skill: frontmatter + body. The T7
 * UI renders these as category-grouped cards in `/settings → AI → Skills`;
 * clicking Install writes a real SKILL.md to `~bruce/livinity/<agent>/
 * skills/<slug>/SKILL.md` via the existing SkillsLoader.
 *
 * The 10 seeds below were chosen per `.planning/phases/219-mcp-skills-
 * subdomain-ux/RESEARCH-skills-market.md`. Categories follow the research
 * file's recommended taxonomy: code-review / frontend / devops / prompt /
 * brainstorm / research / debug.
 *
 * Future (v220+): move this registry to an external GitHub repo
 * (utopusc/livinity-skills) and fetch + cache the registry.json so
 * community submissions land without a LivOS redeploy. For now the
 * embedded list is the source-of-truth (single LivOS surface, telemetry-
 * free per D-219-NO-PHONE-HOME).
 */

export interface MarketSkill {
	slug: string
	name: string
	description: string
	category: 'code-review' | 'frontend' | 'devops' | 'prompt' | 'brainstorm' | 'research' | 'debug'
	tools: string[]
	/** Markdown body — installed into ~bruce/livinity/<agent>/skills/<slug>/SKILL.md. */
	body: string
	/** Optional verified flag (Livinity-authored). UI surfaces a checkmark. */
	verified?: boolean
}

const SKILL = (slug: string, description: string, body: string): string =>
	`---\nname: ${slug}\ndescription: ${description}\n---\n\n${body.trim()}\n`

export const SKILL_MARKET: ReadonlyArray<MarketSkill> = [
	{
		slug: 'code-review',
		name: 'Code Review',
		description: 'Structural + security + quality review for TypeScript/React code.',
		category: 'code-review',
		tools: ['git_diff', 'fs_read'],
		verified: true,
		body: SKILL(
			'code-review',
			'Structural + security + quality review for TypeScript/React code.',
			`When the user asks for a code review:
1. Read the diff (or the named files) and identify changed surfaces.
2. For each change, name the risk class — correctness, security, perf, style, complexity, type-safety.
3. Surface concrete fix suggestions, not vague advice. Quote line numbers.
4. End with a Severity ranking (Block / High / Medium / Low) and a 1-line summary.`,
		),
	},
	{
		slug: 'component-design',
		name: 'Component Design',
		description: 'shadcn/ui + Tailwind component composition patterns.',
		category: 'frontend',
		tools: [],
		verified: true,
		body: SKILL(
			'component-design',
			'shadcn/ui + Tailwind component composition patterns.',
			`Default rules for new components:
- shadcn/ui primitives first (Button, Dialog, Tabs, Form). Compose, do not fork.
- Tailwind for layout + spacing. Avoid arbitrary values when a token works.
- Slot-based composition over prop avalanches. \`asChild\` + Radix slot for swap.
- Server Component by default; \`'use client'\` only when state, ref, or effect required.
- aria-* on every interactive element; tab order matches DOM order.`,
		),
	},
	{
		slug: 'docker-ops',
		name: 'Docker Ops',
		description: 'Container debugging, image optimization, compose templating.',
		category: 'devops',
		tools: ['docker_list_containers', 'docker_container_logs'],
		verified: true,
		body: SKILL(
			'docker-ops',
			'Container debugging, image optimization, compose templating.',
			`Container debugging playbook:
1. \`docker ps -a\` → identify the exited / unhealthy container.
2. \`docker logs --tail 200 <id>\` → look for the last 5 lines before exit.
3. \`docker inspect <id> | jq .State\` → check ExitCode + OOMKilled.
4. If image is bloated: multi-stage build, COPY only the build artifact.
5. Compose: pin every image tag. \`restart: unless-stopped\` for daemons.`,
		),
	},
	{
		slug: 'prompt-tuning',
		name: 'Prompt Tuning',
		description: 'Few-shot example crafting, token optimization, caching strategies.',
		category: 'prompt',
		tools: [],
		verified: true,
		body: SKILL(
			'prompt-tuning',
			'Few-shot example crafting, token optimization, caching strategies.',
			`Prompt iteration loop:
1. Start with the simplest direct instruction. Measure baseline.
2. Add 1-3 diverse few-shot examples — show the OUTPUT shape, not the reasoning.
3. Pull system-level constraints into a stable cache-prefix.
4. For long context: structure with explicit anchors (\`<doc>\`, \`<query>\`).
5. Measure tokens + latency on EVERY iteration.`,
		),
	},
	{
		slug: 'brainstorm',
		name: 'Brainstorm Facilitator',
		description: 'Open-ended ideation, assumption mining, divergent thinking.',
		category: 'brainstorm',
		tools: [],
		body: SKILL(
			'brainstorm',
			'Open-ended ideation, assumption mining, divergent thinking.',
			`Facilitation pattern:
1. State the problem in one sentence. Confirm with the user.
2. Mine assumptions out loud: "We're assuming X. What if not-X?"
3. Generate 3 ideas per direction (conservative / contrarian / wild).
4. Cluster ideas, name each cluster.
5. End by asking: "What's the ONE constraint blocking the strongest cluster?"`,
		),
	},
	{
		slug: 'web-research',
		name: 'Web Research',
		description: 'Multi-source synthesis, fact-checking, citation trails.',
		category: 'research',
		tools: ['fetch'],
		body: SKILL(
			'web-research',
			'Multi-source synthesis, fact-checking, citation trails.',
			`Research rigor:
1. Always cite 2+ sources for any non-trivial claim.
2. Disagreeing sources → surface BOTH; do not pick winners.
3. Prefer primary (specs, papers, official docs) over secondary (blogs).
4. Date-stamp every claim that depends on a moving target.
5. End with a "Confidence" line — High / Medium / Low + why.`,
		),
	},
	{
		slug: 'debugger',
		name: 'Debugger',
		description: 'Runtime tracing, breakpoint strategies, memory profiling.',
		category: 'debug',
		tools: [],
		body: SKILL(
			'debugger',
			'Runtime tracing, breakpoint strategies, memory profiling.',
			`Scientific debugging:
1. Reproduce the bug. Write the exact steps.
2. State a hypothesis BEFORE adding logs. Hypothesis must be falsifiable.
3. Bisect — git or binary-search the failing input.
4. When the bug is in YOUR code, fix the root cause; if upstream, file an issue and patch defensively.
5. Add a regression test before closing.`,
		),
	},
	{
		slug: 'database-design',
		name: 'Database Design',
		description: 'Schema normalization, index tuning, migration safety.',
		category: 'devops',
		tools: [],
		body: SKILL(
			'database-design',
			'Schema normalization, index tuning, migration safety.',
			`Schema defaults:
- 3NF unless you have a measured reason to denormalize.
- Every FK gets an index. Composite indexes match the WHERE-clause order.
- Migrations: additive first (add column NULL → backfill → set NOT NULL).
- NEVER ALTER + ADD-INDEX in the same transaction on a large table.
- Run EXPLAIN before assuming a query is fast.`,
		),
	},
	{
		slug: 'api-design',
		name: 'API Design',
		description: 'REST vs tRPC, error response patterns, rate limiting.',
		category: 'devops',
		tools: [],
		body: SKILL(
			'api-design',
			'REST vs tRPC, error response patterns, rate limiting.',
			`Default API choices:
- Internal: tRPC (type-safe, ergonomic). External / multi-language: REST.
- Errors: ALWAYS structured (code + message + optional details).
- Rate limit at the gateway, not per-handler. Surface the limit in headers.
- Idempotency keys for any non-idempotent POST.
- Version via URL path (v1, v2) — easier to grep + cache than headers.`,
		),
	},
	{
		slug: 'test-strategy',
		name: 'Test Strategy',
		description: 'Unit vs integration balance, coverage targets, flaky-test remediation.',
		category: 'code-review',
		tools: [],
		body: SKILL(
			'test-strategy',
			'Unit vs integration balance, coverage targets, flaky-test remediation.',
			`Testing pyramid:
- 70% unit (fast, hermetic, single-function).
- 20% integration (cross-module, real DB).
- 10% E2E (browser, full stack).
Flaky tests: quarantine FIRST (skip in CI), file an issue with the failing log, fix the root cause (usually time / order dep / shared state). Do not retry-loop.`,
		),
	},
]
