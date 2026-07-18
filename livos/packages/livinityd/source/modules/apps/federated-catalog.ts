// Phase 341-01 (REPO-01, D-341-4/D-341-5) — SSRF-hardened federated catalog
// fetch + strict (Zod-enforced) federated manifest validation.
//
// A user-supplied catalog URL is an SSRF vector. This reuses the box's EXISTING
// accepted fetch-hardening pattern (the same one dispatch.ts ships): resolve →
// classify the resolved IP via `assertResolvedHostSafe` → fetch https-only with
// `redirect:'manual'` + refuse-3xx + a request timeout + a STREAMED byte cap.
//
// W1 (plan-check, BINDING): this is NOT a true DNS-pinned dispatcher. The
// DNS-rebinding TOCTOU window between the resolve-check and the fetch's own
// resolve is the SAME accepted residual dispatch.ts already ships — documented,
// not silently claimed as pinned. If a later phase adds a pinned dispatcher,
// both sites adopt it together. The guard is applied at BOTH add-source-time
// validation (AppStore.addSource) AND every refresh (AppStore.getFederatedCatalog).
//
// D-341-5: every federated manifest is Zod-parsed against AppManifestSchema
// (`parseFederatedManifest`) — the strict parse the shared `validateManifest`
// deliberately skips. Federation is what makes strictness load-bearing, so a
// malformed/hostile manifest is REJECTED here, never best-effort-accepted.

import {z} from 'zod'

import {assertResolvedHostSafe} from '../notifications/ssrf-guard.js'
import {AppManifestSchema, type AppManifest} from './schema.js'
import {CATALOG_SLUG_RE} from './app-store-sources.js'

export const FETCH_TIMEOUT_MS = 8000
export const MAX_CATALOG_BYTES = 2 * 1024 * 1024 // 2 MB — a hostile catalog can't OOM the box

// z.object strips unknown keys by default — a hostile payload's `verified` /
// `trusted` field is discarded HERE and never survives into our objects. We
// additionally never define nor read such a field anywhere (D-341-3).
export const FederatedAppEntrySchema = z.object({
	// catalog-local slug; the charset guard rejects UPPER, spaces, `../evil`,
	// empty, and any `fed-`-forged namespace attempt (still just a slug — the
	// `fed-` namespace is only ever produced by namespacedAppId).
	id: z.string().regex(CATALOG_SLUG_RE),
	// parsed strictly by parseFederatedManifest (below), not by this outer shape.
	manifest: z.unknown(),
	docker_compose: z.string().min(1),
	icon_url: z.string().url().optional(), // N3: unguarded is fine — client-rendered, never server-fetched
})

export const FederatedCatalogSchema = z.object({
	apps: z.array(FederatedAppEntrySchema).max(500), // hard cap on catalog length
})

/**
 * A federated catalog app as fetched from the source — raw + UN-namespaced. The
 * caller (AppStore.getFederatedCatalog) applies namespacing + the box trust
 * stamp so trust is stamped in exactly ONE place.
 */
export type FederatedFetchedApp = {
	catalogSlug: string
	manifest: AppManifest
	dockerCompose: string
	iconUrl?: string
}

/**
 * Strict federated manifest parse — runs AppManifestSchema.parse (the parse the
 * shared validateManifest skips). Throws on any non-conformant manifest.
 * D-341-5's "NO skipped parse".
 */
export function parseFederatedManifest(raw: unknown): AppManifest {
	return AppManifestSchema.parse(raw)
}

// Mirror dispatch.ts:isRedirect — with redirect:'manual' a redirect surfaces as
// an explicit 3xx status (Node ≥22 undici) OR an opaque-redirect filtered
// response (status 0, type 'opaqueredirect'). Treat BOTH as a redirect so the
// refusal is robust across Node/undici versions.
function isRedirect(res: Response): boolean {
	return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
}

export interface FetchFederatedCatalogOptions {
	/** Injectable resolver for the SSRF guard (offline tests). */
	lookup?: (host: string) => Promise<string[]>
	/** Injectable fetch (offline tests). Defaults to global fetch. */
	fetchImpl?: typeof fetch
}

/**
 * Fetch + validate a federated catalog index. Returns the raw (un-namespaced)
 * apps; the caller applies namespacing + trust-stamping. A single malformed
 * catalog ENTRY is skipped (one bad app never sinks the whole catalog, A1); a
 * top-level fetch/parse/shape failure throws (the whole source is errored).
 */
export async function fetchFederatedCatalog(
	url: string,
	opts: FetchFederatedCatalogOptions = {},
): Promise<FederatedFetchedApp[]> {
	// 1. https-only (stricter than the guard, which also permits http).
	let u: URL
	try {
		u = new URL(url)
	} catch {
		throw new Error('federated catalog: invalid URL')
	}
	if (u.protocol !== 'https:') {
		throw new Error('federated catalog: only https catalog URLs are allowed')
	}

	// 2. Resolve DNS then classify EVERY resolved IP against private/loopback/
	//    link-local/metadata/ULA ranges (+ integer/hex IP + IPv4-mapped-IPv6).
	//    Runs BEFORE any network I/O (http:// and private targets never fetch).
	await assertResolvedHostSafe(url, {lookup: opts.lookup})

	// 3. https-only + redirect:'manual' + timeout. A clean public first hop can
	//    302 → 169.254.169.254, so we refuse ANY 3xx (step 4) rather than let
	//    fetch chase the Location past the one-shot guard.
	const doFetch = opts.fetchImpl ?? fetch
	const res = await doFetch(url, {
		redirect: 'manual',
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: {Accept: 'application/json'},
	})

	// 4. Refuse redirects.
	if (isRedirect(res)) {
		throw new Error('federated catalog: redirected — refusing to follow (SSRF guard)')
	}
	// 5. Non-2xx is an error.
	if (!res.ok) {
		throw new Error(`federated catalog: fetch failed (${res.status})`)
	}

	// 6. Byte-cap STREAMING read — never trust Content-Length (a hostile catalog
	//    can lie). Abort + throw once accumulated bytes exceed the cap.
	const text = await readCapped(res, MAX_CATALOG_BYTES)

	let json: unknown
	try {
		json = JSON.parse(text)
	} catch {
		throw new Error('federated catalog: response is not valid JSON')
	}

	// 7. Accept a bare top-level array too by normalizing before parse.
	const normalized = Array.isArray(json) ? {apps: json} : json
	const catalog = FederatedCatalogSchema.parse(normalized)

	// 8. Strict-parse each entry's manifest. On a per-entry manifest/slug
	//    failure, SKIP that entry — one bad app never sinks the whole catalog.
	const out: FederatedFetchedApp[] = []
	for (const entry of catalog.apps) {
		let manifest: AppManifest
		try {
			manifest = parseFederatedManifest(entry.manifest)
		} catch {
			continue // skip the malformed entry, keep the rest
		}
		out.push({
			catalogSlug: entry.id,
			manifest,
			dockerCompose: entry.docker_compose,
			iconUrl: entry.icon_url,
		})
	}
	return out
}

/**
 * Read a Response body as UTF-8 text, aborting + throwing once accumulated bytes
 * exceed `maxBytes`. Streams the reader so an oversize body is refused WITHOUT
 * buffering it whole and WITHOUT trusting Content-Length.
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
	const body = res.body
	// No streamable body (some fetch impls / tests) — fall back to text() but
	// still enforce the cap on the decoded result.
	if (!body || typeof body.getReader !== 'function') {
		const t = await res.text()
		if (Buffer.byteLength(t, 'utf8') > maxBytes) {
			throw new Error('federated catalog: response exceeds size cap')
		}
		return t
	}

	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	try {
		for (;;) {
			const {done, value} = await reader.read()
			if (done) break
			if (value) {
				total += value.byteLength
				if (total > maxBytes) {
					throw new Error('federated catalog: response exceeds size cap')
				}
				chunks.push(value)
			}
		}
	} finally {
		try {
			await reader.cancel()
		} catch {
			/* best-effort */
		}
	}
	return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}
