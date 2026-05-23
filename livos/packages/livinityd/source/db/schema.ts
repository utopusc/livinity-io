/**
 * Phase 202-01 — Drizzle schema bindings for LivOS-owned tables.
 *
 * Mirrors `migrations/0002_livos_agents.sql` exactly. The SQL file is the
 * source of truth at runtime (CREATE TABLE IF NOT EXISTS); this file is the
 * type-safe surface for the AgentRepository and any future tRPC routes.
 *
 * Decisions honoured:
 *   D-202-01 — table name is `livos_agents`
 *   D-202-02 — drizzle-orm/pg-core pgTable definitions
 *   D-202-14 — `name` UNIQUE constraint (column-level `.unique()`)
 *
 * Threat mitigations:
 *   INV-202-07 — UNIQUE on `name` propagates to drizzle so any insert with a
 *                duplicate name rejects at the DB layer
 */

import {boolean, pgTable, text, timestamp} from 'drizzle-orm/pg-core'

export const livosAgents = pgTable('livos_agents', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	instructions: text('instructions').notNull().default(''),
	modelName: text('model_name').notNull().default('grok-4.3'),
	toolIds: text('tool_ids')
		.array()
		.notNull()
		.default([]),
	scheduleCron: text('schedule_cron'),
	// Self-referencing FK — `(): any` is the documented drizzle escape hatch
	// for circular table references (the table identifier is not yet bound
	// at the point of evaluation, so we defer with a thunk).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parentAgentId: text('parent_agent_id').references((): any => livosAgents.id, {
		onDelete: 'set null',
	}),
	enabled: boolean('enabled').notNull().default(true),
	system: boolean('system').notNull().default(false),
	createdAt: timestamp('created_at', {withTimezone: true})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {withTimezone: true})
		.notNull()
		.defaultNow(),
})

export type LivosAgent = typeof livosAgents.$inferSelect
export type LivosAgentInsert = typeof livosAgents.$inferInsert
