import {$} from 'execa'

// 322-06 (IDENT-02, D-322-4, RESEARCH Pitfall 1): the SECOND OIDC provisioning
// mechanism — distinct from Vaultwarden's compose-env injection (322-05
// patchComposeFile). Nextcloud/Gitea register their OIDC login source via a
// docker-exec CLI call; Immich provisions via a loopback (127.0.0.1) REST PUT to
// its own /api/system-config. This is what makes "per-app client credentials
// provisioned automatically" (SC2) actually TRUE for the 3 apps that env-injection
// alone can never reach. The caller runs this strictly AFTER container health.
//
// SECURITY — T-322-13 (argv injection): every docker-exec is built with the execa
// `$` tagged template so each ${...} lands as a SINGLE, discrete argv element,
// NEVER a shell string (no shell:true). The only interpolated values are a FIXED
// `livos-${app.id}` literal, a fixed discovery URL, the derived hex client secret,
// and the resolved container name — no manifest/user free string ever reaches the
// command line (mirrors the livos-gpu-install.sh closed-enum discipline).
// SECURITY — T-322-14 (SSRF / key leak): the Immich fetch host is the literal
// 127.0.0.1 ONLY — no request-derived host. The admin API key is consumed from
// getImmichApiKey() (DEK-encrypted at rest, 322-05) and is NEVER logged.
// SECURITY — T-322-20 (DoS): each app branch is try/catch-isolated —
// provisionOidcForApp NEVER throws; a failure returns {ok:false} so one app can
// never crash the install or the other apps.

// The execa `$` tagged-template shape (records discrete argv; no shell). The test
// seam injects a fake to assert the argv stays discrete and no shell string is
// built. In production this defaults to the real execa `$`.
type ExecTag = (strings: TemplateStringsArray, ...args: unknown[]) => Promise<unknown>

export interface ProvisionOidcOpts {
	mainDomain: string
	clientSecret: string
	containerName: string
	immichPort?: number
	immichAdminApiKey?: string
	logger?: {error: (...a: unknown[]) => void; log: (...a: unknown[]) => void}
	// Test seams — default to the real execa `$` / global fetch. Never set in production.
	deps?: {run?: ExecTag; fetchImpl?: typeof globalThis.fetch}
}

export interface ProvisionResult {
	ok: boolean
	deferred?: boolean
	reason?: string
}

// T-322-11: execa error messages echo the FULL failed command line (which for
// Nextcloud/Gitea includes `--clientsecret=<hex>`), so a raw error must NEVER reach a
// log or the returned `reason`. Strip every known secret first. Hex secrets have no
// shell-special chars, so a plain substring replace is exhaustive.
function redactSecrets(text: string, secrets: (string | undefined)[]): string {
	let out = text
	for (const s of secrets) {
		if (s) out = out.split(s).join('***')
	}
	return out
}

/**
 * Register this app's OIDC client with the running container (docker-exec CLI for
 * Nextcloud/Gitea, loopback REST for Immich; Vaultwarden is a no-op — its SSO env is
 * injected in patchComposeFile). Returns {ok} — or {deferred:true} for Immich when no
 * admin API key has been pasted yet (Pitfall 7). NEVER throws (failure isolation).
 */
export async function provisionOidcForApp(app: {id: string}, opts: ProvisionOidcOpts): Promise<ProvisionResult> {
	const run: ExecTag = opts.deps?.run ?? ($ as unknown as ExecTag)
	const fetchImpl = opts.deps?.fetchImpl ?? globalThis.fetch
	// FIXED literal — the client_id buildStaticClients (322-05 oidc/clients.ts) registers.
	const clientId = `livos-${app.id}`
	const discoveryUrl = `https://${opts.mainDomain}/oidc/.well-known/openid-configuration`

	try {
		switch (app.id) {
			case 'vaultwarden':
				// env-inject already handled in patchComposeFile (322-05) — no post-install step.
				return {ok: true}

			case 'nextcloud':
				// occ provider registration — a CLI call run INSIDE the running container.
				// -u www-data because occ must run as the web user, not root (A4-class check).
				await run`docker exec -u www-data ${opts.containerName} php occ user_oidc:provider livos --clientid=${clientId} --clientsecret=${opts.clientSecret} --discoveryuri=${discoveryUrl} --group-provisioning=1`
				return {ok: true}

			case 'gitea':
				// gitea admin auth CLI — ships with the container's gitea binary (A4 path check).
				await run`docker exec ${opts.containerName} gitea admin auth add-oauth --provider openidConnect --name livos --key ${clientId} --secret ${opts.clientSecret} --auto-discover-url ${discoveryUrl} --group-claim-name groups --admin-group admin`
				return {ok: true}

			case 'immich': {
				// Pitfall 7: Immich has no env/CLI admin bootstrap (first web signup = admin).
				// With no admin-pasted API key yet, DEFER with a real reason — never a silent
				// no-op / confusing 401. The 322-07 UI explains the order (first-run signup →
				// create an API key → paste it → Enable SSO).
				if (!opts.immichAdminApiKey) {
					return {ok: false, deferred: true, reason: 'immich-api-key-missing'}
				}
				// Loopback ONLY (T-322-14 SSRF scope) — Immich publishes its port on the host.
				const res = await fetchImpl(`http://127.0.0.1:${opts.immichPort}/api/system-config`, {
					method: 'PUT',
					headers: {
						'x-api-key': opts.immichAdminApiKey,
						'content-type': 'application/json',
					},
					body: JSON.stringify({
						oauth: {
							enabled: true,
							issuerUrl: `https://${opts.mainDomain}/oidc`,
							clientId,
							clientSecret: opts.clientSecret,
							scope: 'openid email profile groups',
							roleClaim: 'groups',
						},
					}),
				})
				return {ok: res.ok}
			}

			default:
				return {ok: false, reason: 'not-oidc-native'}
		}
	} catch (e) {
		// Failure isolation (T-322-20): never throw out of provisioning. The raw execa
		// error object carries the full failed command (incl. the secret) in its
		// .message/.command/.stack, so we redact FIRST and log/return only the redacted
		// STRING — never the raw object (T-322-11 / T-322-14 no-secret-in-logs).
		const raw = e instanceof Error ? e.message : String(e)
		const redacted = redactSecrets(raw, [opts.clientSecret, opts.immichAdminApiKey])
		opts.logger?.error(`[oidc-provisioning] ${app.id} failed`, redacted)
		return {ok: false, reason: redacted}
	}
}
