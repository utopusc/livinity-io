/**
 * Phase 202-01 — AgentRepository.
 *
 * Drizzle-backed CRUD surface for the `livos_agents` table. Wraps an
 * already-constructed NodePgDatabase instance (callers own the pg Pool /
 * lifecycle — same pattern as Mastra PgStore) and exposes the seven core
 * methods that every later 202-XX plan consumes:
 *
 *   listAll      — full table scan (no pagination in v202; agent count is
 *                  expected to stay < 100 for a single-user OS)
 *   getById      — primary-key lookup, returns null when absent
 *   getByName    — UNIQUE(name) lookup, returns null when absent
 *   create       — insert + return the persisted row (DB defaults applied)
 *   update       — partial update + bumped updatedAt; throws when id missing
 *   delete       — refuses to delete `system: true` rows (D-202-20)
 *   listChildren — flat list of `parent_agent_id = $1` rows
 *
 * Decisions honoured:
 *   D-202-01 — table `livos_agents`
 *   D-202-20 — `system: true` rows are undeletable from the UI surface;
 *              repository raises so the tRPC mutation can surface it
 *
 * Threat mitigations:
 *   T-202-02 — duplicate-name inserts propagate the DB UNIQUE-violation
 *              error unchanged (caller maps to AGENT_NAME_TAKEN)
 *   T-202-04 — depth>2 inserts propagate the trigger's "Sub-agent depth > 2"
 *              EXCEPTION unchanged (caller maps to UI-readable string)
 *
 * Plus the boot-time `seedSystemAgents(repo)` helper that idempotently
 * upserts the original Phase 197-04 `livAi` row (D-202-20).
 */

import {eq} from 'drizzle-orm'
import type {NodePgDatabase} from 'drizzle-orm/node-postgres'

import {
	livosAgents,
	type LivosAgent,
	type LivosAgentInsert,
} from '../../../db/schema.js'

/**
 * Phase 203-08 — LIV_AI_SYSTEM_PROMPT inlined from the deleted
 * `agents/liv-ai.ts`. The literal substring 'luse_*' / 'selfclaude_*' /
 * 'take a screenshot FIRST' / 'Liv AI, the assistant built into LivOS' MUST
 * all appear (regression-locked by Plan 197-04 tests). Used solely by
 * `seedSystemAgents` below as the default instructions for the seeded
 * `livAi` row (D-202-20).
 */
export const LIV_AI_SYSTEM_PROMPT =
	"You are Liv AI, the assistant built into LivOS. You can:\n" +
	"- Chat with the operator and answer questions\n" +
	"- Take screenshots, list windows, click, type, launch apps (via the luse_* and selfclaude_* tools)\n" +
	"- Remember the operator's preferences and past conversations across sessions\n" +
	"- Run as part of the operator's own LivOS install (you are NOT a cloud service)\n" +
	"- Defer destructive actions for explicit operator approval before executing\n" +
	"\n" +
	"Tone: concise, direct, no narration. When the operator asks for a desktop action, take a screenshot FIRST to see current state, then act, then confirm.\n" +
	"\n" +
	"LANGUAGE: If the operator writes in Turkish, respond in Turkish. Code, paths, command output stay in their original form.\n"

export class AgentRepository {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(private db: NodePgDatabase<any>) {}

	async listAll(): Promise<LivosAgent[]> {
		return this.db.select().from(livosAgents)
	}

	async getById(id: string): Promise<LivosAgent | null> {
		const rows = await this.db
			.select()
			.from(livosAgents)
			.where(eq(livosAgents.id, id))
			.limit(1)
		return rows[0] ?? null
	}

	async getByName(name: string): Promise<LivosAgent | null> {
		const rows = await this.db
			.select()
			.from(livosAgents)
			.where(eq(livosAgents.name, name))
			.limit(1)
		return rows[0] ?? null
	}

	async create(input: LivosAgentInsert): Promise<LivosAgent> {
		const rows = await this.db.insert(livosAgents).values(input).returning()
		const row = rows[0]
		if (!row) {
			throw new Error(
				`Phase 202-01 AgentRepository.create — insert returned 0 rows for ${input.name}`,
			)
		}
		return row
	}

	async update(
		id: string,
		patch: Partial<LivosAgentInsert>,
	): Promise<LivosAgent> {
		const rows = await this.db
			.update(livosAgents)
			.set({...patch, updatedAt: new Date()})
			.where(eq(livosAgents.id, id))
			.returning()
		const row = rows[0]
		if (!row) {
			throw new Error(`Phase 202-01 AgentRepository.update — agent ${id} not found`)
		}
		return row
	}

	async delete(id: string): Promise<void> {
		const row = await this.getById(id)
		if (!row) {
			// Idempotent delete — re-deleting a missing row is a no-op so the
			// tRPC mutation surface doesn't need a separate exists-check.
			return
		}
		if (row.system) {
			throw new Error(
				`Phase 202-01 AgentRepository.delete — system agent ${row.name} cannot be deleted (D-202-20)`,
			)
		}
		await this.db.delete(livosAgents).where(eq(livosAgents.id, id))
	}

	async listChildren(parentId: string): Promise<LivosAgent[]> {
		return this.db
			.select()
			.from(livosAgents)
			.where(eq(livosAgents.parentAgentId, parentId))
	}
}

/**
 * Phase 202-01 D-202-20 — idempotent boot-time seed of the original
 * `livAi` agent. Called from livinityd boot after `runLivOSMigrations`.
 *
 * If a row with `name='livAi'` already exists, the call is a no-op. Otherwise
 * the original Phase 197-04 system-prompt + grok-4.3 model are persisted with
 * `system: true` so the UI hides the Delete button.
 *
 * The DB id is `livai` (lowercase) to keep tRPC params URL-safe; the
 * displayed `name` is the original mixed-case `livAi`.
 */
export async function seedSystemAgents(repo: AgentRepository): Promise<void> {
	const existing = await repo.getByName('livAi')
	if (existing) return
	await repo.create({
		id: 'livai',
		name: 'livAi',
		instructions: LIV_AI_SYSTEM_PROMPT,
		modelName: 'grok-4.3',
		toolIds: [], // empty = inherit the full tool catalog (D-202-20)
		enabled: true,
		system: true,
	})
}
