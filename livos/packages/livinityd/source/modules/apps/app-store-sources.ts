// Phase 341-01 (REPO-01, D-341-1/D-341-3) — federated app-store source model +
// source-namespaced id helpers.
//
// A federated source is an admin-added HTTPS catalog-INDEX URL (D-341-1) — not
// git, not zip. This module is PURE (only node:crypto) so the id/namespacing
// logic is unit-testable offline and carries no daemon/store coupling.
//
// SECURITY — the id namespace is the anti-shadowing control (D-341-3):
//   - Official/builtin app ids are bare slugs and can NEVER begin with `fed-`
//     (guaranteed on the official resolve side too).
//   - Every federated app id is `fed-<sourceId12hex>-<catalogSlug>`. The
//     sourceId is exactly 12 hex chars (from sha256(url)) and the catalog slug
//     is charset-validated, so the split is unambiguous and a federated app can
//     never structurally collide with / impersonate an official app id.
//   - Hyphen-based (NOT colon): a colon is invalid in a docker `container_name`
//     and unsafe in `app-data/<id>` paths + the `<app>-<user>` subdomain
//     pattern. The whole namespaced id stays docker/path/subdomain-safe.

import {createHash} from 'node:crypto'

export type AppStoreSource = {
	/** deriveSourceId(url) — 12-hex, stable, NOT the raw url. */
	id: string
	/** https catalog-index URL as the admin entered it. */
	url: string
	/** admin-supplied display label (authoritative; never overwritten by payload). */
	name: string
	enabled: boolean
	addedAt: number
	/** userId (audit). */
	addedBy?: string
	lastFetchedAt?: number
	lastFetchStatus?: 'ok' | 'error'
	lastFetchError?: string
}

/**
 * A federated catalog app AFTER the box has resolved it: namespaced id + the
 * box-stamped trust flag. `trusted` is ALWAYS a literal `false` stamped in ONE
 * place (AppStore.getFederatedCatalog) from the fetch path — it is NEVER read
 * from the catalog payload (D-341-3). No `verified` field is carried through.
 */
export type FederatedCatalogApp = {
	id: string // fed-<sourceId12hex>-<catalogSlug>
	sourceId: string
	sourceName: string
	trusted: false // NON-overridable — federated ⇒ untrusted
	catalogSlug: string
	manifest: unknown // strict-parsed AppManifest (typed unknown to avoid a schema cycle)
	iconUrl?: string
}

export const FED_ID_PREFIX = 'fed-'
// A catalog-local slug: lowercase alnum, internal hyphens, no leading/trailing
// hyphen. Matches the docker/subdomain-safe charset. Rejects UPPER, spaces,
// path traversal (`../evil`), empty, and a literal `fed-…` (starts with `fed`
// but the whole-string anchors + charset mean it is still just a slug, never a
// forged namespace — namespacing is applied by namespacedAppId, below).
export const CATALOG_SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/** Stable, case/whitespace-insensitive 12-hex id derived from the source URL. */
export function deriveSourceId(url: string): string {
	return createHash('sha256').update(url.trim().toLowerCase()).digest('hex').slice(0, 12)
}

/** Build the source-namespaced app id. Throws on an invalid catalog slug. */
export function namespacedAppId(sourceId: string, catalogSlug: string): string {
	if (!CATALOG_SLUG_RE.test(catalogSlug)) throw new Error(`invalid catalog slug: ${catalogSlug}`)
	return `${FED_ID_PREFIX}${sourceId}-${catalogSlug}`
}

export function isFederatedAppId(id: string): boolean {
	return typeof id === 'string' && id.startsWith(FED_ID_PREFIX)
}

/**
 * Reverse fed-<12hex>-<slug> → {sourceId, catalogSlug}. Returns null if the id
 * is not federated or is malformed. The hex-only sourceId + charset-guarded
 * slug make the split unambiguous.
 */
export function parseFederatedAppId(id: string): {sourceId: string; catalogSlug: string} | null {
	if (!isFederatedAppId(id)) return null
	const rest = id.slice(FED_ID_PREFIX.length)
	const m = rest.match(/^([0-9a-f]{12})-(.+)$/)
	if (!m || !CATALOG_SLUG_RE.test(m[2])) return null
	return {sourceId: m[1], catalogSlug: m[2]}
}
