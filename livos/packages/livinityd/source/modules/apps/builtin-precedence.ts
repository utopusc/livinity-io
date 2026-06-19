/**
 * Phase 286 (SC5) — catalog>builtin precedence.
 *
 * Resolution USED to try generateAppTemplate (builtin) first (apps.ts install
 * chain), so any app also present in builtin-apps.ts installed the stale builtin
 * def (bind mount + unpinned image + default port) instead of the well-engineered
 * catalog def (named volume + pinned image + unique port 41000-41534). Proven by
 * n8n: builtin = bind mount + `n8nio/n8n:latest` + port 5678; catalog = named
 * volume + pinned `2.26.4` + unique port 41292. The builtin shadowed the catalog.
 *
 * Fix: prefer the catalog for every builtin EXCEPT the operator-curated specials
 * below, which carry AI-broker env injection / docker.sock / privileged setup the
 * catalog does not replicate. Those keep builtin precedence.
 *
 * Task-1 checkpoint decision (286-03): approve-as-proposed — the 6-app allowlist,
 * confirmed exactly against the builtin-apps.ts flag audit (requiresAiProvider /
 * docker.sock / privileged). No plain builtin carries any of those flags.
 */

// SPECIAL builtins that ALWAYS keep builtin precedence (derived from the
// builtin-apps.ts flag audit: requiresAiProvider / docker.sock / privileged).
// EDIT to match the Task-1 checkpoint decision.
export const BUILTIN_PRECEDENCE_ALLOWLIST: ReadonlySet<string> = new Set([
	'portainer', // docker.sock + privileged + net-host
	'open-webui', // requiresAiProvider
	'mirofish', // requiresAiProvider
	'bolt-diy', // requiresAiProvider + docker.sock
	'suna', // requiresAiProvider + docker.sock
	'bytebot-desktop', // privileged
])

/**
 * True when install should try the CATALOG before the builtin for this appId.
 *
 * - Plain builtins (n8n, jellyfin, …) → true (catalog def is strictly better).
 * - Allowlisted specials (the 6 above) → false (keep builtin precedence).
 * - Catalog-only ids (not in builtin-apps.ts) → true (catalog is the only
 *   source; the resolver still falls back to the null builtin correctly).
 */
export function shouldPreferCatalog(
	appId: string,
	allowlist: ReadonlySet<string> = BUILTIN_PRECEDENCE_ALLOWLIST,
): boolean {
	return !allowlist.has(appId)
}
