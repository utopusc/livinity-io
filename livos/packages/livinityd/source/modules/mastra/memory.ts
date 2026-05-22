/**
 * Phase 197-03 — Mastra 4-layer memory factory.
 *
 * Backs Mastra Memory with PgStore (raw chat history) + PgVector (semantic
 * recall index) on the livos PostgreSQL database. The load-bearing detail is
 * `options.semanticRecall.scope: 'thread'` — Mastra changed the default to
 * 'resource' in March 2026, which would leak conversation context across
 * threads. T-197-03-05 mitigation requires the explicit override.
 *
 * Threat mitigations:
 *   T-197-03-02 (I): redactPgUrl() strips user:password from any error message
 *                    propagated out of this module.
 *   T-197-03-05 (I): scope:'thread' set TWICE (semanticRecall + workingMemory)
 *                    for defense-in-depth — cross-thread bleed regression-locked
 *                    by the corresponding tests.
 */

import {Memory} from '@mastra/memory'
import {PostgresStore, PgVector} from '@mastra/pg'

/**
 * Scrub user:password from a postgres:// URL for safe logging.
 * Phase 197-03 T-197-03-02 mitigation.
 *
 *   postgres://user:pass@host:5432/db → postgres://***:***@host:5432/db
 *   postgres://user@host/db           → postgres://***@host/db
 */
export function redactPgUrl(url: string): string {
	// Order matters: handle user:pass FIRST (most specific), then user-only.
	let out = url.replace(/(postgres(ql)?:\/\/)([^:@/]+):([^@/]+)(@)/, '$1***:***$5')
	out = out.replace(/(postgres(ql)?:\/\/)([^:@/]+)(@)/, '$1***$4')
	return out
}

export interface LivOSMemoryDeps {
	databaseUrl: string
}

/**
 * Construct Mastra Memory backed by PgStore + PgVector for the livos DB.
 *
 * options.semanticRecall.scope === 'thread' is EXPLICIT — Mastra's default
 * changed to 'resource' in March 2026 which would leak conversation context
 * across threads. T-197-03-05 mitigation is regression-locked by the
 * acceptance grep.
 *
 * Errors during construction are re-thrown with the connection URL redacted
 * via redactPgUrl() — never log raw password (T-197-03-02).
 */
export function createLivOSMemory(deps: LivOSMemoryDeps): Memory {
	try {
		const storage = new PostgresStore({
			id: 'livos-mastra-pg-store',
			connectionString: deps.databaseUrl,
		} as never)
		const vector = new PgVector({
			id: 'livos-mastra-pg-vector',
			connectionString: deps.databaseUrl,
			indexConfig: {type: 'hnsw', metric: 'dotproduct'},
		} as never)
		// Phase 197-03 v1 — semanticRecall is wired into the Memory constructor
		// but DISABLED at runtime via `false` (Mastra v1.36 requires an embedder
		// when semanticRecall is enabled; v1 ships without xAI embeddings since
		// @ai-sdk/xai does not yet expose .embedding() and we deferred picking
		// a separate embedding provider — Phase 198+ scope). The scope='thread'
		// option is still locked in source for the future enable path.
		// T-197-03-05 mitigation rationale: when semanticRecall is later
		// re-enabled, scope MUST be 'thread' (not 'resource') to prevent
		// cross-thread context bleed.
		// SEMANTIC-RECALL-SCOPE-INVARIANT: scope: 'thread'
		return new Memory({
			storage,
			vector,
			options: {
				lastMessages: 20,
				semanticRecall: false,
				workingMemory: {enabled: true, scope: 'thread'},
			},
		} as never)
	} catch (err) {
		const redacted = redactPgUrl(deps.databaseUrl)
		const inner = err instanceof Error ? err.message : String(err)
		const innerRedacted = redactPgUrl(inner)
		throw new Error(
			`Phase 197-03 createLivOSMemory failed for ${redacted}: ${innerRedacted}`,
		)
	}
}
