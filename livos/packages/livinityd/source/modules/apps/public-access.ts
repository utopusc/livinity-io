// livos/packages/livinityd/source/modules/apps/public-access.ts
// Phase 258 WS-A (258-01) — the resolved-shape contract + pure resolver for
// public (login-bypassed) app access. This module is the SINGLE source of truth
// for "what is the effective public config for this install": the Caddy emitter
// (258-02) and the enforcement/persistence layer (258-03) both import it and call
// resolvePublicAccess — never re-deriving the shape themselves.
//
// PURE module: no I/O, no Redis, no app-instance, no livinityd imports. Keep it
// dependency-light so it stays unit-testable in isolation.

/**
 * The RESOLVED runtime public-access shape for one app install. This is what the
 * 258-02 Caddy emitter reads and what rides on SubdomainConfig.publicAccess through
 * Redis/regen (like upstreamBearer today). Fully normalized — `paths` is always an
 * array (empty for non-'paths' modes), `hasOwnAuth` is always a boolean.
 */
export interface PublicAccessConfig {
	/**
	 * 'none'      — fully gated (256-04 forward_auth unchanged; the default, SC5).
	 * 'whole-app' — drop the gated catch-all for an app with its own login; the
	 *               258-02 emitter still header-strips the daemon-bearer/identity.
	 * 'paths'     — specific prefixes public on an otherwise-gated subdomain.
	 */
	mode: 'none' | 'whole-app' | 'paths'
	/** Effective public path prefixes (only meaningful for mode==='paths'; [] otherwise). */
	paths: string[]
	/** Advisory: the app protects its own dashboard (manifest-declared). */
	hasOwnAuth: boolean
}

/**
 * The per-install operator choice persisted by 258-03 onto the Redis
 * SubdomainConfig (the same store registerAppSubdomain writes). This is the runtime
 * toggle: absent/null means the operator never enabled public access → mode 'none'.
 */
export interface PublicAccessInstallSetting {
	mode: 'none' | 'whole-app' | 'paths'
	/** Operator-chosen effective prefixes; when omitted, the resolver falls back to the manifest suggestion. */
	paths?: string[]
}

/** The author-declared manifest shape (a structural subset of AppManifest). */
interface ManifestPublicDeclaration {
	publicAccess?: {
		mode: 'none' | 'whole-app' | 'paths'
		paths?: string[]
		hasOwnAuth?: boolean
	}
	neverPublic?: boolean
}

/**
 * Suggested default public path prefixes for Cal.com (the phase's driving app).
 * Used by the UI (258-04) to pre-fill the 'paths' suggestions and as the resolver's
 * fallback when the operator picks 'paths' without supplying a list.
 *
 * INVARIANT — catch-all stays LAST: this list deliberately contains NO bare '/'
 * (or empty) catch-all. The gated forward_auth catch-all block must remain the
 * final, lowest-priority handle in the 258-02 emit; a universal public prefix here
 * would shadow it and expose the whole app. The resolver additionally normalizes
 * away any empty/whitespace path so a '' / '/' cannot smuggle in through the
 * per-install setting either. The trailing '/[a-z]' covers Cal.com's `/username`
 * booking landing without being a universal catch.
 */
export const DEFAULT_CALCOM_PATHS: readonly string[] = [
	'/booking',
	'/booking-successful',
	'/d/',
	'/api/book',
	'/api/trpc/public',
	'/api/trpc/slots',
	'/api/trpc/availability',
	'/[a-z]',
]

/**
 * Normalize a public path prefix: trim, ensure a single leading slash. Returns null
 * for empty/whitespace-only inputs so callers can drop them (prevents a '' / bare
 * '/' from becoming a universal prefix that shadows the gated catch-all).
 */
function normalizePath(raw: string): string | null {
	const trimmed = raw.trim()
	if (trimmed === '' || trimmed === '/') return null
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizePaths(paths: string[] | undefined): string[] {
	if (!paths) return []
	const out: string[] = []
	for (const p of paths) {
		const n = normalizePath(p)
		if (n !== null) out.push(n)
	}
	return out
}

/**
 * Merge the app-author manifest declaration with the operator's per-install setting
 * into the single effective PublicAccessConfig. This is the ONE resolver both
 * downstream consumers (258-02 emit, 258-03 enforce) call.
 *
 * Merge rules:
 *   - mode    = installSetting.mode (operator activates; default 'none' / private).
 *               A manifest declaring publicAccess does NOT self-enable (T-258A-01).
 *   - paths   = installSetting.paths ?? manifest.publicAccess.paths ?? []   (operator
 *               choice wins; manifest is the suggestion fallback). Only meaningful for
 *               mode==='paths' — emptied for 'none'/'whole-app'. Always normalized.
 *   - hasOwnAuth = manifest.publicAccess.hasOwnAuth ?? false (an app property, not an
 *               operator choice).
 *
 * @param manifest       the app manifest (or a structural subset); null/undefined ok.
 * @param installSetting the operator's per-install choice; null/undefined => 'none'.
 */
export function resolvePublicAccess(
	manifest: ManifestPublicDeclaration | null | undefined,
	installSetting?: PublicAccessInstallSetting | null,
): PublicAccessConfig {
	const declaredPaths = manifest?.publicAccess?.paths
	const hasOwnAuth = manifest?.publicAccess?.hasOwnAuth ?? false

	const mode: PublicAccessConfig['mode'] = installSetting?.mode ?? 'none'

	if (mode !== 'paths') {
		// 'none' and 'whole-app' carry no public path list.
		return {mode, paths: [], hasOwnAuth}
	}

	// 'paths' mode — operator's chosen prefixes win; fall back to the manifest
	// author suggestion when the operator supplied none.
	const chosen = installSetting?.paths ?? declaredPaths
	return {mode, paths: normalizePaths(chosen), hasOwnAuth}
}
