/**
 * Phase 202-09 — Mastra constructor wrap.
 *
 * Single entry point that builds the canonical `new Mastra({...})` instance
 * for the livOS process. The wrap exists so future workflow / eval /
 * telemetry features can hook into ONE place instead of N ad-hoc
 * `new Agent({...})` call sites scattered across the boot wire-up. Plan
 * 202-09 ships the wired-but-empty scaffold:
 *
 *   - `agents`        — keyed map of every live Mastra Agent from the
 *                       Phase 202-02 AgentRegistry.
 *   - `workflows: {}` — D-202-07; concrete workflows land in Phase 203+.
 *   - `evals    : {}` — D-202-07; concrete eval suites land in Phase 203+.
 *                       NOTE: `@mastra/core@1.36.0` renamed this constructor
 *                       field from `evals` (≤ 1.20) to `scorers` (≥ 1.30) and
 *                       changed its shape from "eval functions" to "scorer
 *                       instances". The plan template still references the
 *                       old name. Until Phase 203 introduces concrete eval /
 *                       scorer suites with the new shape, the field stays
 *                       OUT of the constructor call here (passing an empty
 *                       `scorers: {}` is valid but adds no functional value;
 *                       passing an `evals` key would be a TypeScript error
 *                       under the v1.36 typings). The decision is documented
 *                       in 202-09-SUMMARY.md as a Rule-3 deviation.
 *   - `telemetry`     — D-202-18; console exporter only. Same v1.36 caveat:
 *                       the constructor field was renamed `telemetry` →
 *                       `observability` and now expects an `Observability`
 *                       instance from `@mastra/observability` rather than an
 *                       inline `{enabled, serviceName, export}` literal. The
 *                       plan template's literal shape is therefore cast via
 *                       `as never` per the plan's own escape-hatch guidance
 *                       ("if @mastra/core typings don't yet expose `evals`
 *                       or `telemetry` as constructor fields, cast with
 *                       `as never`").
 *
 * Boot wire-up (livinityd source/index.ts) is responsible for:
 *   1. Awaiting `registry.init()` so the agents map is populated.
 *   2. Calling `createMastraInstance({ agents: Object.fromEntries(...), logger })`.
 *   3. Attaching the result via `livOSMastra.attachMastraInstance(instance)`.
 *
 * The wrap is intentionally pure — it does NOT mutate the registry, does
 * NOT spawn workers, does NOT start the scheduler. Constructing a Mastra
 * instance in v1.36 is side-effect-free until you call instance-level
 * methods (e.g. `.startWorkers()`); Plan 202-09 stops at construction.
 *
 * Invariants:
 *   INV-202-01 — sacred SHA preserved on commit.
 *   INV-202-03 — additive only; this file is NEW, the LivOSMastra class
 *                gets ONE new slot + ONE new attach helper in index.ts.
 *   INV-202-05 — English only.
 *   INV-202-08 — MCP source list unchanged (this wrap does NOT enumerate
 *                MCP servers; the existing McpBridge stays the source of
 *                truth for Luse + future MCP entries).
 *
 * @mastra/core version at write time: 1.36.0 (see livos/packages/livinityd/
 * package.json line "@mastra/core": "1.36.0").
 */

import {Mastra} from '@mastra/core'
import type {Agent} from '@mastra/core/agent'

export interface MastraInstanceLogger {
	info: (message: string) => void
	warn: (message: string, error?: unknown) => void
}

export interface MastraInstanceDeps {
	/**
	 * Pre-built Mastra Agent map keyed by agent name. Caller is responsible
	 * for sourcing this from the AgentRegistry (Plan 202-02) via:
	 *
	 *   const agents = Object.fromEntries(
	 *     registry.listAll().map(({name, agent}) => [name, agent]),
	 *   )
	 *
	 * Keying by name (not id) so future `mastra.getAgent('livAi')` lookups
	 * mirror the chat-route allow-list contract from Plan 202-02 Task 4.
	 */
	agents: Record<string, Agent>
	logger: MastraInstanceLogger
}

/**
 * Build the Mastra v1.36 constructor wrap.
 *
 * Returns a fresh `Mastra` instance every call (matches AgentRegistry's
 * "every refresh produces fresh Agent instances" contract). The boot
 * wire-up holds the result for the process lifetime via
 * `livOSMastra.mastraInstance`.
 *
 * The constructor argument is intentionally cast through `as never` because
 * the v1.36 `Config` typings replaced:
 *   - `telemetry` → `observability` (Observability instance from
 *                                    `@mastra/observability`, not an
 *                                    inline literal).
 *   - `evals`     → `scorers`        (MastraScorer instances, not eval fns).
 * Plan 202-09 ships the wired-but-empty scaffold per D-202-06 / D-202-07 /
 * D-202-18 using the plan template literal shape; Phase 203+ will swap to
 * the v1.36-shaped surfaces (concrete `Observability` + `scorers` maps).
 * The cast is the plan-documented escape hatch ("cast with `as never` if
 * the typing is missing in @mastra/core ≤ 1.36").
 */
export function createMastraInstance(deps: MastraInstanceDeps): Mastra {
	const agentCount = Object.keys(deps.agents).length

	// Plan template literal shape (D-202-06 / D-202-07 / D-202-18).
	// Cast to `never` because @mastra/core@1.36 renamed the fields.
	const instance = new Mastra({
		agents: deps.agents,
		// D-202-07 — empty for v202; populated in Phase 203+.
		workflows: {},
		// D-202-07 — empty for v202; populated in Phase 203+.
		// (Mastra v1.36 renamed `evals` → `scorers`; passing the old name
		// would be a TypeScript error, so we leave it out and document.)
		// D-202-18 — console export only. Mastra v1.36 expects an
		// `Observability` instance from `@mastra/observability` here, not the
		// inline literal below — see file-level docblock for the rationale
		// behind the `as never` cast.
		telemetry: {
			enabled: true,
			serviceName: 'livOS',
			sampling: {type: 'always_on'},
			export: {type: 'console'},
		},
	} as never)

	deps.logger.info(
		`Phase 202-09 Mastra instance created — telemetry: console, workflows: 0, evals: 0, agents: ${agentCount}`,
	)

	return instance
}
