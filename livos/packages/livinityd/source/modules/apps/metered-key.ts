/**
 * Per-app metered virtual-key path for UNVERIFIED / community apps
 * (LIVOS-001 ToS-safe leg / SC4b).
 *
 * The credential-egress proxy (cred-egress-proxy.ts) lends the operator's
 * PERSONAL OAuth subscription at the wire — correct for VERIFIED / operator-
 * trusted apps (OpenDesign etc.). But routing an UNTRUSTED community app's
 * inference through the operator's personal subscription may violate provider
 * ToS regardless of the mechanism (SECURITY-REMEDIATION-DESIGN.md:87-90, citing
 * The Register 2026-02-20). The ToS-safe answer for the open marketplace is a
 * PER-APP METERED VIRTUAL KEY — the LiteLLM/OpenRouter "virtual key per
 * workload" model (per-workload identity beats sharing a human's account;
 * SPIFFE/Aembit principle).
 *
 * `chooseCredentialPath` is the SINGLE decision point, keyed off the SAME trust
 * dimension WS-C's admin-gate (256-03) uses (`isGeneratedTemplate`):
 *   - VERIFIED (builtin / platform-curated, isGeneratedTemplate === true)
 *       → 'oauth-proxy' (the cred-egress proxy / injectAiProviderConfig sentinel).
 *   - UNVERIFIED (community-repo, isGeneratedTemplate === false)
 *       → 'metered-key' (mint a per-app broker virtual key; the operator OAuth
 *         is NEVER lent to a community app).
 *
 * Each per-app key is budget-capped + model-allowlisted + independently
 * revocable (on uninstall). Minting/revocation go through the existing
 * plugins/livinity-broker create/delete handlers via the injected `BrokerClient`
 * (a thin client) so this module is unit-testable without a live broker.
 */

export type CredentialPath = 'oauth-proxy' | 'metered-key'

/**
 * The single verified-vs-unverified decision. `isGeneratedTemplate` is true for
 * builtin compose generation + platform-DB templates (operator-curated =
 * verified), false for community git-repo templates (unverified). Same flag the
 * WS-C admin-gate keys off, so trust is consistent across the phase.
 */
export function chooseCredentialPath(opts: {isGeneratedTemplate: boolean}): CredentialPath {
	return opts.isGeneratedTemplate ? 'oauth-proxy' : 'metered-key'
}

/** Budget envelope for a per-app metered key. */
export interface MeteredKeyBudget {
	maxUsd?: number
}

/**
 * Thin broker client the install flow injects. Wraps the plugins/livinity-broker
 * createKey / deleteKey handlers (or a direct pg/HTTP call). Kept narrow so the
 * unit test stubs it.
 */
export interface BrokerClient {
	createKey(opts: {
		userId: string
		name: string
		budget?: MeteredKeyBudget
		modelAllowlist?: string[]
	}): Promise<{id: string; plaintext: string; prefix: string}>
	deleteKey(keyId: string): Promise<void>
}

export interface MintedMeteredKey {
	/** The plaintext `lvb_…` virtual key — the container's ONLY credential. */
	virtualKey: string
	/** The broker key id, persisted with the install record for later revocation. */
	keyId: string
	/** The app slug this key is scoped to. */
	appSlug: string
}

/**
 * Encode the per-app scope into the broker key `name` so it is auditable +
 * greppable + clearly tied to one app/user (per-workload identity).
 */
function meteredKeyName(appSlug: string, userId: string): string {
	return `metered:app=${appSlug}:user=${userId}`
}

/**
 * Mint a per-app metered virtual key for an UNVERIFIED app. The container holds
 * ONLY this key (never the operator OAuth). On broker failure this THROWS a
 * clear error — the install must surface that the unverified app could not be
 * provisioned a metered key; we must NOT silently fall back to lending the
 * operator subscription (that is the whole point of the ToS-safe leg).
 */
export async function mintMeteredKeyForApp(
	opts: {appSlug: string; userId: string; budget?: MeteredKeyBudget; modelAllowlist?: string[]},
	broker: BrokerClient,
): Promise<MintedMeteredKey> {
	if (!opts.appSlug || !opts.userId) {
		throw new Error('mintMeteredKeyForApp: appSlug and userId are required')
	}
	let created: {id: string; plaintext: string; prefix: string}
	try {
		created = await broker.createKey({
			userId: opts.userId,
			name: meteredKeyName(opts.appSlug, opts.userId),
			budget: opts.budget,
			modelAllowlist: opts.modelAllowlist,
		})
	} catch (error) {
		throw new Error(
			`mintMeteredKeyForApp: broker failed to mint a metered key for '${opts.appSlug}' ` +
				`— refusing to fall back to the operator OAuth subscription (ToS). Cause: ${
					(error as Error)?.message ?? error
				}`,
		)
	}
	if (!created?.plaintext || !created?.id) {
		throw new Error(`mintMeteredKeyForApp: broker returned an invalid key for '${opts.appSlug}'`)
	}
	return {virtualKey: created.plaintext, keyId: created.id, appSlug: opts.appSlug}
}

/**
 * Revoke a per-app metered key (on uninstall). Independently revocable: revoking
 * one app's key never touches another's. Best-effort logging is the caller's job.
 */
export async function revokeMeteredKeyForApp(
	opts: {keyId: string},
	broker: BrokerClient,
): Promise<void> {
	if (!opts.keyId) return
	await broker.deleteKey(opts.keyId)
}
