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

import {sql} from 'drizzle-orm'
import {
	boolean,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from 'drizzle-orm/pg-core'

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

/**
 * Phase 203-04 — `livos_openui_apps` registry table.
 *
 * Mirrors `migrations/0003_livos_openui_apps.sql` exactly. Holds the live
 * OpenUI Lang program for each agent-generated app keyed by stable slug.
 *
 * Decisions honoured:
 *   D-203-09 — slug PK, name/content/version/user_id/timestamps surface
 *
 * Threat mitigations:
 *   T-203-03 — `content` is validated against the 14-component whitelist
 *              + isSafeUrl() guard at the tRPC boundary before insert/update
 *              (see modules/openclawos/openui-apps-repository.ts +
 *              modules/server/trpc/openclawos-router.ts).
 *   INV-203-02 — additive only; no ALTERs of Phase 202 tables.
 */
export const livosOpenuiApps = pgTable('livos_openui_apps', {
	slug: text('slug').primaryKey(),
	name: text('name').notNull(),
	content: text('content').notNull(),
	version: integer('version').notNull().default(1),
	userId: text('user_id'),
	createdAt: timestamp('created_at', {withTimezone: true})
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', {withTimezone: true})
		.notNull()
		.defaultNow(),
	// Phase 208-07 R7 — per-app icon customization.
	// `iconKind` is one of `'icon-pack' | 'url' | 'ai-generated'` but the DB
	// stays permissive (TEXT not enum); the zod schema at the tRPC boundary
	// is the enforcement point. `iconConfig` shape is kind-specific (see
	// AppIcon renderer at packages/liv-claw-os/packages/claw-client/src/lib/
	// app-icon-renderer.tsx for the IconConfig union).
	iconKind: text('icon_kind').notNull().default('icon-pack'),
	iconConfig: jsonb('icon_config')
		.notNull()
		.default(sql`'{}'::jsonb`),
})

export type LivosOpenuiApp = typeof livosOpenuiApps.$inferSelect
export type LivosOpenuiAppInsert = typeof livosOpenuiApps.$inferInsert

/**
 * Phase 203-04 — `livos_openui_app_versions` append-only history.
 *
 * Each `openclawos.apps.update` mutation writes ONE row here capturing the
 * pre-update `content` snapshot, then increments the parent row's `version`.
 * AppRepository.update() enforces MAX_VERSIONS=25 per slug inside the same
 * transaction (oldest version rows are deleted when the cap is hit).
 *
 * FK with ON DELETE CASCADE so deleting the parent slug clears the history
 * defensively (repo.delete() also issues a manual DELETE for symmetry).
 */
export const livosOpenuiAppVersions = pgTable(
	'livos_openui_app_versions',
	{
		slug: text('slug')
			.notNull()
			.references(() => livosOpenuiApps.slug, {onDelete: 'cascade'}),
		version: integer('version').notNull(),
		content: text('content').notNull(),
		snapshotAt: timestamp('snapshot_at', {withTimezone: true})
			.notNull()
			.defaultNow(),
	},
	(table) => ({
		pk: primaryKey({columns: [table.slug, table.version]}),
	}),
)

export type LivosOpenuiAppVersion = typeof livosOpenuiAppVersions.$inferSelect
export type LivosOpenuiAppVersionInsert = typeof livosOpenuiAppVersions.$inferInsert
