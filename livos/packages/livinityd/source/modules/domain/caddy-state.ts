// livos/packages/livinityd/source/modules/domain/caddy-state.ts
// Phase 218 T2 — derive a CaddyConfig from current DB + Redis state.
//
// Why this exists: Phase 140 introduced Server5-minted hyphen-pattern app
// subdomains (e.g. `bolt-diy-bruce.livinity.io`) cached locally in
// `user_app_subdomains`. Per-user app installs land in `user_app_instances`
// with the host port. The Caddyfile must reflect BOTH tables. Until T2, the
// only Caddy-regeneration paths read Redis (`livos:domain:subdomains`), which
// is single-user-shaped and unused by the multi-user installForUser flow —
// resulting in installs that never touch the Caddyfile, so the new app's
// subdomain falls through to the catch-all (livinityd's LivOS UI).
//
// Design choices:
//   - Pure dependency injection. The function takes a `CaddyStateDeps`
//     interface so unit tests can run without a Postgres pool. Production
//     callers (boot regen + post-install regen) wire the real pg.Pool +
//     ioredis client to the deps.
//   - Defensive: missing `user_app_subdomains` table (pre-T3 boxes) is
//     tolerated — getSubdomains() returns []. Hyphen fallback derives the
//     host from `<app_slug>-<username>.<mainDomain>` directly. Same shape,
//     just no CF DNS record id cached.
//   - Status filter: only `status='running'` instances emit Caddy blocks.
//     Stopped/failed apps don't get routed (they 502'd anyway).
//   - MCP / native-app filtering is NOT this helper's job. MCP servers
//     don't write to `user_app_instances` (they live in Redis under
//     `liv:mcp:config`). Native apps live on `this.nativeInstances` and
//     stay rendered through the existing `nativeApps` arg to
//     `generateFullCaddyfile`. This helper only produces the per-user
//     Docker-app subdomain list.

import type {CaddyConfig, SubdomainConfig} from './caddy.js'

/**
 * A single running per-user app instance, joined with its owning user's
 * username. Returned shape matches what `buildCaddyConfigFromState` needs
 * to emit a Caddy block; richer fields stay in the DB.
 */
export interface CaddyStateInstance {
	userId: string
	username: string
	appSlug: string // app_id column on user_app_instances (TEXT slug, not UUID)
	port: number
	status: string
}

/**
 * A cached canonical FQDN minted by Server5 for a (user, app) pair.
 * `subdomain` here is the FULL host (e.g. `bolt-diy-bruce.livinity.io`),
 * matching `SubdomainConfig.host` so downstream consumers do zero rewrite.
 */
export interface CaddyStateSubdomain {
	userId: string
	appSlug: string
	subdomain: string
}

/**
 * Dependency injection seam. Production wires DB + Redis; tests pass
 * static arrays.
 */
export interface CaddyStateDeps {
	getInstances: () => Promise<CaddyStateInstance[]>
	getSubdomains: () => Promise<CaddyStateSubdomain[]>
	getMainDomain: () => Promise<string | null>
}

/**
 * Build a `CaddyConfig` from the current DB + Redis state.
 *
 * Rules:
 *   - Only running instances.
 *   - Prefer the cached canonical FQDN from `user_app_subdomains` when
 *     present (Phase 140 hyphen-pattern minted by Server5).
 *   - Fallback: derive `<app_slug>-<username>.<mainDomain>` locally.
 *   - Drop instances whose username can't compose a valid subdomain
 *     label (defense in depth against bad migrations).
 */
export async function buildCaddyConfigFromState(deps: CaddyStateDeps): Promise<CaddyConfig> {
	const [instances, subdomainCache, mainDomain] = await Promise.all([
		deps.getInstances(),
		deps.getSubdomains().catch(() => [] as CaddyStateSubdomain[]),
		deps.getMainDomain(),
	])

	// Index the subdomain cache by (userId, appSlug) for O(1) lookup.
	const cacheKey = (userId: string, appSlug: string) => `${userId}::${appSlug}`
	const cache = new Map<string, string>()
	for (const row of subdomainCache) {
		cache.set(cacheKey(row.userId, row.appSlug), row.subdomain)
	}

	const subdomains: SubdomainConfig[] = []
	for (const inst of instances) {
		if (inst.status !== 'running') continue
		if (!inst.username || !inst.appSlug) continue

		const cachedHost = cache.get(cacheKey(inst.userId, inst.appSlug))
		const host = cachedHost ?? (mainDomain ? `${inst.appSlug}-${inst.username}.${mainDomain}` : null)
		if (!host) continue

		subdomains.push({
			subdomain: `${inst.appSlug}-${inst.username}`,
			appId: inst.appSlug,
			port: inst.port,
			enabled: true,
			host: host.toLowerCase(),
		})
	}

	return {
		mainDomain: mainDomain ?? null,
		subdomains,
	}
}
