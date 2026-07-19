import {z} from 'zod'
import semver from 'semver'

// TODO: this is used outside of the apps module, move it somewhere more appropriate
export type ProgressStatus = {
	running: boolean
	/** From 0 to 100 */
	progress: number
	description: string
	error: boolean | string
}

export const AppRepositoryMetaSchema = z.object({
	id: z.string(),
	name: z.string(),
})

export type AppRepositoryMeta = z.infer<typeof AppRepositoryMetaSchema>

const validateSemanticVersion = z.string().refine(semver.valid, {
	message: 'invalid semantic version',
})

// We might want to describe this further so we can do runtime valdiation with
// useful errors like tagline max length etc.
export const AppManifestSchema = z.object({
	manifestVersion: validateSemanticVersion,
	id: z.string(),
	disabled: z.boolean().optional(),
	name: z.string(),
	tagline: z.string(),
	icon: z.string().optional(),
	category: z.string(),
	// TODO (apps refactor): switch to semantic versions?
	version: z.string(),
	port: z.number().int(),
	description: z.string(),
	website: z.string().url(),
	// TODO: one developer/submitter is an integer
	developer: z.union([z.string(), z.number()]).optional(),
	submitter: z.union([z.string(), z.number()]).optional(),
	submission: z.string().url().optional(),
	// TODO: some apps have an empty repo string
	repo: z.union([z.string().url(), z.string().length(0)]).optional(),
	support: z.string(),
	gallery: z.array(z.string()),
	releaseNotes: z.string().optional(),
	dependencies: z.array(z.string()).optional(),
	permissions: z.array(z.string()).optional(),
	path: z.string().optional(),
	defaultUsername: z.string().optional(),
	defaultPassword: z.string().optional(),
	deterministicPassword: z.boolean().optional(),
	optimizedForLivinityHome: z.boolean().optional(),
	/**
	 * When true, the per-user installer auto-injects the Livinity AI broker
	 * configuration into this app's compose file:
	 *   - env: ANTHROPIC_BASE_URL=http://livinity-broker:8080/u/<userId>
	 *   - env: ANTHROPIC_REVERSE_PROXY=http://livinity-broker:8080/u/<userId>
	 *   - env: LLM_BASE_URL=http://livinity-broker:8080/u/<userId>/v1
	 *   - extra_hosts: ["livinity-broker:host-gateway"]
	 *
	 * Apps with this flag get Claude access via the user's subscription with
	 * zero BYOK / API key prompts. Optional; defaults to false (omitted = no injection).
	 * See .planning/phases/43-marketplace-integration-anchor-mirofish/ for details.
	 */
	requiresAiProvider: z.boolean().optional(),
	/**
	 * When true, the installer mounts the HOST's installed AI CLIs (claude,
	 * gemini, …) + the host glibc runtime + the operator's CLI credentials into
	 * this app's container, and puts thin wrappers on PATH. The app then detects
	 * and runs the real local CLIs directly (no broker), exactly as they run on
	 * the host — e.g. agent-native tools like Open Design that shell out to
	 * `claude`/`gemini`. Credentials are shared from the host (read/write so the
	 * CLIs refresh tokens) and access is granted to the container's uid via ACL.
	 * Optional; defaults to false. Gated by install-time consent at the UI layer.
	 */
	requiresLocalAiClis: z.boolean().optional(),
	/**
	 * Phase 258 WS-A — the app AUTHOR's declaration that this app SUPPORTS public
	 * (login-bypassed) access, plus the suggested public surface. This is NOT the
	 * per-install enable toggle — declaring it does not expose anything. The
	 * operator's per-install setting (persisted on the Redis SubdomainConfig by
	 * 258-03) is merged with this declaration by resolvePublicAccess() into the
	 * single effective PublicAccessConfig the Caddy emitter (258-02) consumes.
	 *   - mode: 'none' (default/private) | 'whole-app' (drop the gated catch-all —
	 *     for apps with their own login) | 'paths' (specific prefixes public on an
	 *     otherwise-gated subdomain, e.g. Cal.com booking pages).
	 *   - paths: author-suggested public prefixes (used to pre-fill the UI and as a
	 *     fallback when the operator picks 'paths' without overriding the list).
	 *   - hasOwnAuth: advisory signal that the app protects its own dashboard (e.g.
	 *     Cal.com/Gitea/Vaultwarden); surfaced in the 258-04 confirm dialog. Never a
	 *     substitute for the server-side forbidden-app guard (258-03).
	 * Optional; omitted = the app never supports public access (behaves as today).
	 */
	publicAccess: z
		.object({
			mode: z.enum(['none', 'whole-app', 'paths']),
			paths: z.array(z.string()).optional(),
			hasOwnAuth: z.boolean().optional(),
		})
		.optional(),
	/**
	 * Phase 258 WS-A — hard marker that this app must NEVER be exposed publicly,
	 * regardless of any operator toggle. Set on the admin/host-access app class
	 * (alongside the runtime signals 258-03 also checks: requiresLocalAiClis,
	 * docker.sock / privileged / network_mode:host, and the 256-04 daemon-bearer
	 * apps). The enable-public API (258-03) rejects these and the UI (258-04)
	 * locks the toggle with a reason. Optional; absence does not by itself make an
	 * app public — public access is opt-in only.
	 */
	neverPublic: z.boolean().optional(),
	/**
	 * Optional install-time configuration. `subdomain` overrides the auto-derived
	 * Caddy subdomain (defaults to app id). `environmentOverrides` declares fields
	 * the install dialog must prompt for and pass through to the compose `environment`
	 * block (e.g., ZEP_API_KEY, N8N_BASIC_AUTH_USER). Required entries block install
	 * until the user fills them in.
	 */
	installOptions: z
		.object({
			subdomain: z.string().optional(),
			// 330 GPU-05 — marks an app that SHOWS the install-time "Use GPU" toggle.
			// VISIBILITY ONLY — never read by resolveWantsGpu (that stays
			// permission/override-driven), so a gpuCapable app is still default-OFF
			// until the user opts in (Pitfall 3).
			gpuCapable: z.boolean().optional(),
			// 322 IDENT-02 (D-322-6) — marks an OIDC-native app that SHOWS the "Enable SSO" toggle in app settings. VISIBILITY ONLY — never auto-enables SSO; an explicit admin toggle (setOidcEnabled) is required.
			oidcNative: z.boolean().optional(),
			environmentOverrides: z
				.array(
					z.object({
						name: z.string(),
						label: z.string(),
						type: z.enum(['string', 'password']),
						default: z.string().optional(),
						required: z.boolean().optional(),
					}),
				)
				.optional(),
		})
		.optional(),
	// In bytes
	installSize: z.number().int().optional(),
	// TODO: Define this type
	widgets: z.array(z.any()).optional(),
	defaultShell: z.string().optional(),
	implements: z.array(z.string()).optional(),
	backupIgnore: z.array(z.string()).optional(),
})

export type AppManifest = z.infer<typeof AppManifestSchema>

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tryNormalizeVersion(version: number | string) {
	// Convert versions parsed as a number, e.g. `1` or `1.2`
	if (typeof version === 'number') {
		version = String(version)
	}
	// Retain valid version
	if (semver.valid(version)) {
		return version
	}
	// Otherwise try to coerce, e.g. 1 to 1.0.0
	const coerced = semver.coerce(version)
	return coerced ? coerced.toString() : version
}

export function validateManifest(parsed: unknown): AppManifest {
	if (!isRecord(parsed)) {
		throw new Error('invalid manifest')
	}
	parsed.manifestVersion = tryNormalizeVersion(parsed.manifestVersion)

	// TODO (apps refactor): switch to semantic versions?
	// parsed.version = tryNormalizeVersion(parsed.version)

	// TODO (apps refactor): enable schema validation
	// return AppManifestSchema.parse(parsed)

	return parsed as AppManifest
}

export const AppSettingsSchema = z.object({
	hideCredentialsBeforeOpen: z.boolean().optional(),
	dependencies: z.record(z.string()).optional(),
	backupIgnore: z.boolean().optional(),
	autoStart: z.boolean().optional(),
	// 316-02 GPU-02: per-app-instance GPU-access override. undefined = fall back
	// to the manifest's silent auto-inject (unchanged behavior for untouched
	// apps); true/false explicitly enables/disables GPU passthrough for this app.
	gpuAccess: z.boolean().optional(),
	// 256-02 SC4b: the broker keyId of this app's per-app metered virtual key
	// (UNVERIFIED/community apps only). Persisted at install so uninstall can
	// independently revoke it. Absent for verified/OAuth-path apps.
	meteredKeyId: z.string().optional(),
	// 322-05 IDENT-02 (D-322-6): per-app "Enable SSO" toggle. undefined = never
	// enabled (default OFF — unlike gpuAccess there is NO manifest-permission
	// fallback). Only set true by the admin-gated setOidcEnabled route; drives the
	// Vaultwarden SSO env-inject in patchComposeFile + the static-clients rebuild.
	oidcEnabled: z.boolean().optional(),
	// 322-05 IDENT-02 (Pitfall 7): Immich's admin API key, DEK-encrypted at rest
	// (base64(iv‖tag‖ct) via secrets/dek.ts). WRITE-ONLY from the outside — set by
	// the admin-gated setImmichApiKey route, decrypted only inside getImmichApiKey
	// at 322-06 provisioning time; never logged, never returned. apps.list exposes
	// ONLY the boolean immichApiKeySet (store-presence), never this ciphertext.
	immichApiKeyEnc: z.string().optional(),
	// 326-01 APPS-01 (D-01/D-02/D-03): filtered post-install env overrides, re-applied
	// inside patchComposeFile so Configure values survive app updates. Written ONLY
	// through apps.setEnvironmentOverrides (allowlist-filtered against the manifest's
	// installOptions.environmentOverrides — same gate as install()).
	environmentOverrides: z.record(z.string()).optional(),
	// 326-01 APPS-02 (D-04): per-app update policy + exact-version pin marker. undefined
	// treated as 'manual' (the safe default). ignoredVersion pins a specific available
	// version out of the "updates available"/"Update all" surfaces until it changes.
	autoUpdatePolicy: z.enum(['auto', 'manual']).optional(),
	ignoredVersion: z.string().optional(),
	// 326-01 APPS-03 (D-07): per-app resource limits — cpuLimit = decimal cores,
	// memoryLimit = BYTES. Applied to the MAIN service's deploy.resources.limits via
	// patchComposeFile().then(restart) (compose-recreation-safe), never docker update.
	cpuLimit: z.number().optional(),
	memoryLimit: z.number().optional(),
	// 342-01 APPD-01 (D-342-1): per-app maintenance window — HH:MM box-local, ONE top-level
	// per-app key (oidcLastProvision nested-object precedent), delete-to-clear. Gates ONLY the
	// automatic path; wrap-past-midnight allowed. start===end + <30min rejected at the route.
	updateWindow: z.object({start: z.string(), end: z.string()}).optional(),
	// 342-01 APPD-02 (D-342-4): per-app CPU pinning (cpuset). Regex-shaped + semantic-validated
	// at the route (validateCpuSet) before persist; applied on the main service in patchComposeFile.
	cpuSet: z.string().optional(),
	// 343-01 RESIL-01 (D-343-1): when true, patchComposeFile suppresses the MAIN service's
	// entrypoint (sleep-infinity) so a crash-looping app sits idle + writable for terminal repair.
	debugMode: z.boolean().optional(),
	// 343-02 RESIL-02 (D-343-5): per-app OOM self-heal opt-out. undefined = ON (auto-restart an
	// OOM-killed container is strictly recovery); false = opt out of OOM auto-restart. Read by the
	// oom-watch scheduler job's decideOomAction; never triggers a compose change or restart itself.
	oomSelfHeal: z.boolean().optional(),
	// 343-01 RESIL-01 (D-343-1): the main service's ORIGINAL entrypoint/command/healthcheck
	// captured at enter-time; JSON `null` encodes "this key was absent originally" (restore = delete
	// vs set). Restored to disk by patchComposeFile's clear branch, then cleared by exitDebugMode —
	// so a livinityd restart mid-exit still restores. Not surfaced to the UI.
	debugStash: z
		.object({
			entrypoint: z.any().optional(),
			command: z.any().optional(),
			healthcheck: z.any().optional(),
		})
		.optional(),
	// 326-01 MEDIA-01 (D-19/D-23): Immich onboarding QR card dismissal flag (UI-only).
	immichCardDismissed: z.boolean().optional(),
	// 329-11 MEDIA-02 (D-23): Jellyfin setup onboarding card dismissal flag (UI-only).
	jellyfinCardDismissed: z.boolean().optional(),
	// 331-02 FIX-02: the LAST SSO provisioning outcome, persisted so the UI can
	// surface an honest "activation could not be confirmed" state instead of the
	// fire-and-forget log-only result (322-06 audit gap). `reason` is ALREADY
	// secret-redacted by oidc/provisioning.ts before it ever reaches this store.
	oidcLastProvision: z
		.object({
			ok: z.boolean(),
			deferred: z.boolean().optional(),
			reason: z.string().optional(),
			at: z.number(),
		})
		.optional(),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
