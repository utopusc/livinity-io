/**
 * Phase 203-04 — OpenUIAppsRepository.
 *
 * Drizzle-backed CRUD surface for the `livos_openui_apps` table + its
 * `livos_openui_app_versions` history sibling. Wraps an already-constructed
 * NodePgDatabase instance (callers own the pg Pool / lifecycle — same
 * pattern as Mastra PgStore + AgentRepository).
 *
 * Exposed methods:
 *
 *   listAll          — sorted by updated_at DESC (newest first)
 *   getBySlug        — primary-key lookup, returns null when absent
 *   upsert           — create-if-absent, otherwise replace-and-bump-version;
 *                      on every update writes a row to the version-history
 *                      sibling table INSIDE A TRANSACTION + caps at 25 per
 *                      slug (oldest snapshot rows deleted on overflow)
 *   delete           — removes the parent row; FK ON DELETE CASCADE clears
 *                      version history too. Idempotent on missing-slug.
 *   versions         — flat list of {version, snapshotAt} for the slug,
 *                      newest first; empty array when slug missing or never
 *                      updated.
 *   currentVersion   — int — fast helper for `openclawos.apps.version` tRPC
 *                      query without fetching the full row.
 *
 * Decisions honoured:
 *   D-203-09  — primary table schema (slug PK)
 *   D-203-09 scope clarification — 25-version cap per slug enforced INSIDE
 *                                  the transaction that bumps version + writes
 *                                  the snapshot row (atomic — readers never
 *                                  see a half-update)
 *
 * Threat mitigations:
 *   T-203-03 — `content` validation lives at the tRPC boundary (whitelist +
 *              isSafeUrl); repository accepts already-validated strings.
 *   INV-203-02 — additive; no ALTERs of Phase 202 tables.
 *   INV-202-02 — Phase 202 contracts untouched.
 */

import {and, desc, eq, lt, sql} from 'drizzle-orm'
import type {NodePgDatabase} from 'drizzle-orm/node-postgres'

import {
	livosOpenuiAppVersions,
	livosOpenuiApps,
	type LivosOpenuiApp,
	type LivosOpenuiAppInsert,
	type LivosOpenuiAppVersion,
} from '../../db/schema.js'

/**
 * Max version snapshots retained per slug. Matches upstream
 * `packages/claw-plugin/src/app-store.ts` `MAX_VERSIONS = 25` so the
 * Postgres-backed implementation preserves the same UX guarantee.
 */
export const MAX_VERSIONS_PER_SLUG = 25

/** Input shape for `upsert`. `name`/`content` are required; `userId` opt. */
export interface OpenUIAppUpsertInput {
	slug: string
	name: string
	content: string
	userId?: string | null
}

export class OpenUIAppsRepository {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(private db: NodePgDatabase<any>) {}

	async listAll(opts: {limit?: number} = {}): Promise<LivosOpenuiApp[]> {
		const q = this.db
			.select()
			.from(livosOpenuiApps)
			.orderBy(desc(livosOpenuiApps.updatedAt))
		if (opts.limit != null) {
			return q.limit(opts.limit)
		}
		return q
	}

	async getBySlug(slug: string): Promise<LivosOpenuiApp | null> {
		const rows = await this.db
			.select()
			.from(livosOpenuiApps)
			.where(eq(livosOpenuiApps.slug, slug))
			.limit(1)
		return rows[0] ?? null
	}

	/**
	 * Create when slug absent, otherwise REPLACE content + bump `version` +
	 * snapshot the PRE-update content into the version-history sibling. Whole
	 * sequence runs inside a single drizzle transaction so an error mid-flight
	 * leaves the table in its prior consistent state.
	 *
	 * Returns the final persisted row (post-write).
	 */
	async upsert(input: OpenUIAppUpsertInput): Promise<LivosOpenuiApp> {
		return this.db.transaction(async (tx) => {
			const existingRows = await tx
				.select()
				.from(livosOpenuiApps)
				.where(eq(livosOpenuiApps.slug, input.slug))
				.limit(1)
			const existing = existingRows[0]

			if (!existing) {
				const insertPayload: LivosOpenuiAppInsert = {
					slug: input.slug,
					name: input.name,
					content: input.content,
					version: 1,
					userId: input.userId ?? null,
				}
				const inserted = await tx
					.insert(livosOpenuiApps)
					.values(insertPayload)
					.returning()
				const row = inserted[0]
				if (!row) {
					throw new Error(
						`Phase 203-04 OpenUIAppsRepository.upsert — insert returned 0 rows for slug=${input.slug}`,
					)
				}
				return row
			}

			// EXISTS → snapshot pre-update content + bump version + replace.
			const nextVersion = existing.version + 1
			await tx.insert(livosOpenuiAppVersions).values({
				slug: existing.slug,
				version: existing.version,
				content: existing.content,
			})

			// Cap history at MAX_VERSIONS_PER_SLUG by deleting any rows older
			// than (nextVersion - MAX). This keeps storage bounded without
			// scanning the whole table.
			const oldestKept = nextVersion - MAX_VERSIONS_PER_SLUG
			if (oldestKept > 0) {
				await tx
					.delete(livosOpenuiAppVersions)
					.where(
						and(
							eq(livosOpenuiAppVersions.slug, existing.slug),
							lt(livosOpenuiAppVersions.version, oldestKept),
						),
					)
			}

			const updated = await tx
				.update(livosOpenuiApps)
				.set({
					name: input.name,
					content: input.content,
					version: nextVersion,
					userId: input.userId ?? existing.userId,
					updatedAt: sql`now()`,
				})
				.where(eq(livosOpenuiApps.slug, existing.slug))
				.returning()
			const row = updated[0]
			if (!row) {
				throw new Error(
					`Phase 203-04 OpenUIAppsRepository.upsert — update returned 0 rows for slug=${input.slug}`,
				)
			}
			return row
		})
	}

	async delete(slug: string): Promise<void> {
		// FK ON DELETE CASCADE clears version history; we still do an
		// explicit delete on the sibling for symmetry with stubs/test mocks
		// that may not implement FK cascade semantics.
		await this.db
			.delete(livosOpenuiAppVersions)
			.where(eq(livosOpenuiAppVersions.slug, slug))
		await this.db.delete(livosOpenuiApps).where(eq(livosOpenuiApps.slug, slug))
	}

	async versions(
		slug: string,
	): Promise<Array<Pick<LivosOpenuiAppVersion, 'version' | 'snapshotAt'>>> {
		const rows = await this.db
			.select({
				version: livosOpenuiAppVersions.version,
				snapshotAt: livosOpenuiAppVersions.snapshotAt,
			})
			.from(livosOpenuiAppVersions)
			.where(eq(livosOpenuiAppVersions.slug, slug))
			.orderBy(desc(livosOpenuiAppVersions.version))
		return rows
	}

	async currentVersion(slug: string): Promise<number | null> {
		const rows = await this.db
			.select({version: livosOpenuiApps.version})
			.from(livosOpenuiApps)
			.where(eq(livosOpenuiApps.slug, slug))
			.limit(1)
		return rows[0]?.version ?? null
	}

	/**
	 * Increment the version without rewriting content — used only when the
	 * caller wants to bump the version counter explicitly (e.g. force a
	 * `restore` to surface as a new revision). Snapshot the prior content as
	 * usual so the history sibling remains complete.
	 */
	async incrementVersion(slug: string): Promise<LivosOpenuiApp | null> {
		return this.db.transaction(async (tx) => {
			const existingRows = await tx
				.select()
				.from(livosOpenuiApps)
				.where(eq(livosOpenuiApps.slug, slug))
				.limit(1)
			const existing = existingRows[0]
			if (!existing) return null

			await tx.insert(livosOpenuiAppVersions).values({
				slug: existing.slug,
				version: existing.version,
				content: existing.content,
			})

			const nextVersion = existing.version + 1
			const oldestKept = nextVersion - MAX_VERSIONS_PER_SLUG
			if (oldestKept > 0) {
				await tx
					.delete(livosOpenuiAppVersions)
					.where(
						and(
							eq(livosOpenuiAppVersions.slug, existing.slug),
							lt(livosOpenuiAppVersions.version, oldestKept),
						),
					)
			}

			const updated = await tx
				.update(livosOpenuiApps)
				.set({version: nextVersion, updatedAt: sql`now()`})
				.where(eq(livosOpenuiApps.slug, slug))
				.returning()
			return updated[0] ?? null
		})
	}
}
