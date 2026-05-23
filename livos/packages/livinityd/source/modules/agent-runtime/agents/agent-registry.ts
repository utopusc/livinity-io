/**
 * Phase 202-02 — AgentRegistry.
 *
 * In-memory `Map<string, Agent>` of every enabled `livos_agents` row,
 * rebuilt from the AgentRepository on boot (init) and on every CRUD
 * mutation (refresh). The registry is the canonical surface that
 * downstream code (chat-route.ts allow-list, scheduler, future agent
 * dashboard) reads when resolving an agent by id or name.
 *
 * Wave 1 — Plan 202-02 Task 2 in the phase's wave plan.
 *
 * Decisions honoured:
 *   D-202-03 — Supervisor pattern: parent agents are constructed with an
 *              `agents: {…}` map of child Agent instances via the second
 *              pass below. NOT deprecated .network(), NOT manual createTool.
 *   D-202-13 + INV-202-06 — sub-agent depth max 2 enforced at runtime by
 *              skipping any `row.parentAgentId → row.id → row.childId`
 *              three-deep chain. The DB trigger already rejects this at
 *              insert time (Phase 202-01 T-202-04 mitigation); the
 *              defense-in-depth registry guard catches the case where a
 *              stale row survives a migration or a manual SQL insert.
 *   D-202-17 — children + parent share the same Memory instance (deps.memory).
 *              Mastra Supervisor spawns a fresh thread per delegation under
 *              the shared instance — that is Mastra's job, not the registry's.
 *
 * Threat mitigations:
 *   T-202-05 (concurrent CRUD + refresh race) — refresh() is single-flight.
 *     If a refresh is in-flight, a concurrent call awaits the same Promise
 *     and re-returns. This coalesces N near-simultaneous mutations into
 *     one rebuild without blocking the caller chain.
 *
 * Invariants:
 *   INV-202-03 — this file only ADDS new surface. The LivOSMastra class
 *                is not touched here (mastra/index.ts gets ONE new slot
 *                + ONE new attach method via a sibling Task 3 edit).
 */

import {createAgentFromRow, type LocalAgent} from './agent-factory.js'
import type {AgentRepository} from './agent-repository.js'
import type {LivosAgent} from '../../../db/schema.js'
import type {ProviderRouter} from '../provider-router.js'
import type {McpBridge, McpBridgeLogger} from '../mcp-bridge.js'
import type {ApprovalGate} from './wrap-tool-with-approval.js'

// Phase 203-08 — local Agent shape (replaces `@mastra/core/agent` Agent type
// after the Mastra purge). Registry only touches the agent through downstream
// consumers' duck-typed `.stream()` reader (scheduler) — shape stays opaque.
type Agent = LocalAgent

export interface AgentRegistryDeps {
	repo: AgentRepository
	providerRouter: ProviderRouter
	memory: unknown
	mcpBridge: McpBridge
	approvalManager: ApprovalGate
	logger: McpBridgeLogger
}

export interface RegisteredAgent {
	id: string
	name: string
	agent: Agent
}

export class AgentRegistry {
	private agents = new Map<string, Agent>()
	private rowsById = new Map<string, LivosAgent>()
	/**
	 * T-202-05 single-flight latch. When a refresh is in-flight, concurrent
	 * callers await the same Promise — coalescing N near-simultaneous CRUD
	 * mutations into one rebuild while preserving the await-completion
	 * contract every caller depends on.
	 */
	private inflightRefresh: Promise<void> | null = null

	constructor(private deps: AgentRegistryDeps) {}

	/**
	 * Boot-time hydration. Called once from livinityd boot wire-up after
	 * Memory + McpBridge + ApprovalManager are ready (Plan 202-02 Task 3).
	 * Internally identical to refresh() — the registry has no "initial" vs
	 * "subsequent" state distinction.
	 */
	async init(): Promise<void> {
		await this.refresh()
	}

	/**
	 * Rebuild the live agent map from the repository. Idempotent — calling
	 * refresh() twice in a row produces the same final size and the same
	 * agent shapes (modulo Agent instance identity, which changes per
	 * construction).
	 *
	 * Two-pass algorithm:
	 *   1. First pass builds every enabled row as a plain (non-supervisor)
	 *      Agent. Children show up in this map.
	 *   2. Second pass walks rows again; for any row whose children list is
	 *      non-empty, REBUILD that row's Agent with the Supervisor
	 *      `agents:{…}` map referencing the first-pass child instances.
	 *      Leaf agents from pass 1 are forwarded unchanged.
	 *
	 * The two-pass shape is what makes Mastra Supervisor work — Mastra
	 * requires the agents:{} map to contain ALREADY-CONSTRUCTED Agent
	 * instances, not row references.
	 */
	async refresh(): Promise<void> {
		// T-202-05 — single-flight coalescing.
		if (this.inflightRefresh) {
			return this.inflightRefresh
		}
		this.inflightRefresh = this.refreshImpl().finally(() => {
			this.inflightRefresh = null
		})
		return this.inflightRefresh
	}

	private async refreshImpl(): Promise<void> {
		const rows = await this.deps.repo.listAll()
		this.rowsById = new Map(rows.map((r) => [r.id, r]))

		const enabledRows = rows.filter((r) => r.enabled)
		const baseDeps = {
			providerRouter: this.deps.providerRouter,
			memory: this.deps.memory,
			mcpBridge: this.deps.mcpBridge,
			approvalManager: this.deps.approvalManager,
		}

		// Pass 1 — flat (no Supervisor wiring). Every enabled row becomes an
		// Agent here. Children + leafs + parents all show up.
		const flat = new Map<string, Agent>()
		for (const row of enabledRows) {
			flat.set(row.id, createAgentFromRow(row, baseDeps))
		}

		// Pass 2 — Supervisor rebuild for any row with enabled children.
		// Depth > 2 detection is a defense-in-depth check; the DB trigger
		// from Phase 202-01 already raises an EXCEPTION at insert time so
		// reaching this branch implies a stale row from before the trigger
		// landed or a direct SQL bypass.
		const final = new Map<string, Agent>()
		for (const row of enabledRows) {
			const children = enabledRows.filter(
				(c) => c.parentAgentId === row.id,
			)
			if (children.length === 0) {
				const existing = flat.get(row.id)
				if (existing) final.set(row.id, existing)
				continue
			}
			// T-202-04 runtime double-check (D-202-13 / INV-202-06). If any
			// child of this row is ITSELF a parent (i.e. some row's
			// parentAgentId === child.id), we are looking at a 3-deep
			// chain. Log a warning + keep the immediate child layer but do
			// not propagate beyond depth 2.
			for (const c of children) {
				if (enabledRows.some((g) => g.parentAgentId === c.id)) {
					this.deps.logger.warn(
						`Phase 202-02 AgentRegistry — sub-agent depth > 2 detected (${row.name} → ${c.name} → ...); deeper levels skipped (D-202-13)`,
					)
				}
			}
			const subAgentsMap: Record<string, Agent> = {}
			for (const c of children) {
				const childAgent = flat.get(c.id)
				if (childAgent) subAgentsMap[c.name] = childAgent
			}
			final.set(
				row.id,
				createAgentFromRow(row, {
					...baseDeps,
					subAgents: subAgentsMap,
				}),
			)
		}

		this.agents = final
		this.deps.logger.info(
			`Phase 202-02 AgentRegistry refreshed — ${final.size} live agents`,
		)
	}

	/**
	 * Look up an agent by its row id. Returns undefined when the row is
	 * absent or disabled. The id is the stable identifier — names are
	 * editable from the UI, ids are not.
	 */
	get(id: string): Agent | undefined {
		return this.agents.get(id)
	}

	/**
	 * Look up an agent by its row name. Names are UNIQUE per
	 * `livos_agents.name` UNIQUE constraint (D-202-14 / INV-202-07), so the
	 * lookup is unambiguous. Returns undefined when the name is absent or
	 * the underlying row is disabled.
	 *
	 * The chat-route allow-list (Plan 202-02 Task 4) calls this exclusively.
	 */
	getByName(name: string): Agent | undefined {
		for (const row of this.rowsById.values()) {
			if (row.name === name) return this.agents.get(row.id)
		}
		return undefined
	}

	/**
	 * Enumerate every live agent + its id + name. Used by future scheduler
	 * + dashboard surfaces.
	 */
	listAll(): RegisteredAgent[] {
		const out: RegisteredAgent[] = []
		for (const [id, agent] of this.agents.entries()) {
			const row = this.rowsById.get(id)
			if (!row) continue
			out.push({id, name: row.name, agent})
		}
		return out
	}

	/**
	 * Enumerate every row the registry has seen — enabled or not. The
	 * chat-route allow-list uses this to honour disabled rows (return 404
	 * for a name that exists but is disabled) without having to round-trip
	 * the repository.
	 */
	rowsAll(): LivosAgent[] {
		return Array.from(this.rowsById.values())
	}
}
