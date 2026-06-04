// livos/packages/livinityd/source/modules/apps/public-forbidden.ts
// Phase 258 WS-C (258-03) — the ONE source of truth for "this app may NEVER be
// made public". Both the API gate (routes.ts setPublicAccess) and the
// subdomain-wiring (apps.ts registerAppSubdomain / computeEffectivePublicAccess)
// import isPublicForbidden — there is exactly one policy, enforced at two call
// sites.
//
// ──────────────────────────────────────────────────────────────────────────
// NOTE-2 — LOAD-BEARING vs DEFENSE-IN-DEPTH (read this before changing anything):
//
//   LOAD-BEARING triggers (the PRIMARY guard, NOT stripped by anything):
//     1. neverPublic           — manifest.neverPublic === true
//     2. requiresLocalAiClis   — manifest.requiresLocalAiClis === true
//     3. hasDaemonBearer       — the 256-04 daemon bearer is present for this
//                                install (readAppDaemonToken / SubdomainConfig
//                                .upstreamBearer is set)
//   These three protect OpenDesign / OpenHands / agent-native classes. They are
//   manifest/runtime facts the 257 install-time sanitizer
//   (sanitizeNonBuiltinCompose) does NOT touch, so they are reliable for an
//   INSTALLED app.
//
//   DEFENSE-IN-DEPTH signals (a BACKSTOP, may already be neutralized at install):
//     4. compose docker.sock host-bind     (cross-ref compose-sanitizer.ts:176-185 — THROWS at install)
//     5. compose privileged                (cross-ref compose-sanitizer.ts:134      — `delete`d at install)
//     6. compose network_mode: host        (cross-ref compose-sanitizer.ts:140      — `delete`d at install)
//   Because the 257 sanitizer MUTATES the compose at install time (deletes
//   privileged / network_mode:host, rejects docker.sock), an installed app's
//   on-disk compose may NO LONGER carry these. So the compose checks CANNOT be
//   the primary guard for installed apps — they only catch a never-sanitized or
//   read-pre-sanitize compose. The three load-bearing triggers above carry the
//   real guarantee.
//
//   WHICH COMPOSE: isPublicForbidden is a PURE predicate — it forbids based on
//   whatever compose it is handed. Callers SHOULD pass the ORIGINAL
//   catalog/manifest compose (un-sanitized) when available so the
//   defense-in-depth signals are meaningful; if only the sanitized on-disk
//   compose is available, the load-bearing triggers still fully protect the
//   dangerous classes.
//
// PURE module: no Redis, no app instance, no I/O. The caller supplies the
// signals (it already reads the manifest + compose + the daemon token).
// ──────────────────────────────────────────────────────────────────────────

import {resolvePublicAccess, type PublicAccessConfig, type PublicAccessInstallSetting} from './public-access.js'

/**
 * Why an app is public-forbidden. The order here is the deterministic reporting
 * order in isPublicForbidden: LOAD-BEARING first, DEFENSE-IN-DEPTH second.
 */
export type PublicForbiddenReason =
	| 'never-public' // load-bearing: manifest.neverPublic
	| 'local-ai-clis' // load-bearing: manifest.requiresLocalAiClis
	| 'daemon-bearer' // load-bearing: 256-04 daemon bearer present
	| 'docker-sock' // defense-in-depth: compose binds /var/run/docker.sock
	| 'privileged' // defense-in-depth: compose service privileged
	| 'host-network' // defense-in-depth: compose service network_mode: host

export interface PublicForbiddenSignals {
	/** LOAD-BEARING — manifest.neverPublic (admin/host-access apps). */
	neverPublic?: boolean
	/** LOAD-BEARING — manifest.requiresLocalAiClis (rides operator host AI CLIs). */
	requiresLocalAiClis?: boolean
	/** LOAD-BEARING — the 256-04 daemon bearer is present (readAppDaemonToken/upstreamBearer set). */
	hasDaemonBearer?: boolean
	/**
	 * DEFENSE-IN-DEPTH — the parsed docker-compose object. Callers SHOULD pass the
	 * ORIGINAL catalog/manifest compose when available: the 257 install-time
	 * sanitizer strips `privileged`/`network_mode:host` and rejects a docker.sock
	 * bind, so a sanitized on-disk compose may NOT carry these signals. The
	 * LOAD-BEARING guarantee comes from neverPublic / requiresLocalAiClis /
	 * hasDaemonBearer (never stripped); the compose scan is a backstop only.
	 */
	compose?: any
}

/**
 * Detects a /var/run/docker.sock host-bind in a single compose volume entry.
 * Mirrors the bind-extraction shape of compose-sanitizer.ts bindHostSide()
 * (short form `"<host>:<container>[:mode]"` + long form `{type:'bind',source}`)
 * so the two never drift. We only care whether the HOST side resolves to the
 * docker socket — not the full appDataDir containment check the sanitizer does.
 */
function entryBindsDockerSock(entry: any): boolean {
	let host: string | null = null
	if (typeof entry === 'string') {
		const firstColon = entry.indexOf(':')
		if (firstColon === -1) return false
		const h = entry.slice(0, firstColon)
		if (h.startsWith('/') || h.startsWith('.') || h.startsWith('~')) host = h
	} else if (entry && typeof entry === 'object') {
		if (typeof entry.source === 'string') host = entry.source
	}
	if (host === null) return false
	// Match the docker socket regardless of trailing path noise.
	return /(^|\/)docker\.sock$/.test(host) || host.includes('/var/run/docker.sock')
}

/**
 * Scans every service of a parsed compose for a defense-in-depth signal, in a
 * fixed precedence (docker-sock → privileged → host-network) so the reason is
 * deterministic. Reuses the SAME predicate shapes as the 257 sanitizer:
 *   - privileged: key present                         (compose-sanitizer.ts:134)
 *   - network_mode === 'host'                          (compose-sanitizer.ts:140)
 *   - any volume host-bind to /var/run/docker.sock     (compose-sanitizer.ts:176-185)
 */
function scanComposeSignals(compose: any): PublicForbiddenReason | undefined {
	const services = compose?.services
	if (!services || typeof services !== 'object') return undefined

	const serviceList = Object.keys(services).map((k) => services[k])

	// docker.sock first (highest-severity backstop)
	for (const service of serviceList) {
		if (!service || typeof service !== 'object') continue
		if (Array.isArray(service.volumes)) {
			for (const entry of service.volumes) {
				if (entryBindsDockerSock(entry)) return 'docker-sock'
			}
		}
	}
	// privileged
	for (const service of serviceList) {
		if (service && typeof service === 'object' && 'privileged' in service && service.privileged) {
			return 'privileged'
		}
	}
	// network_mode: host
	for (const service of serviceList) {
		if (service && typeof service === 'object' && service.network_mode === 'host') {
			return 'host-network'
		}
	}
	return undefined
}

/**
 * The single never-public predicate. Returns `{forbidden:true, reason}` for the
 * FIRST trigger that fires, checked LOAD-BEARING first then DEFENSE-IN-DEPTH:
 *   never-public → local-ai-clis → daemon-bearer → docker-sock → privileged → host-network
 * Returns `{forbidden:false}` for a clean app (e.g. Cal.com).
 */
export function isPublicForbidden(
	s: PublicForbiddenSignals,
): {forbidden: boolean; reason?: PublicForbiddenReason} {
	// LOAD-BEARING (not stripped by the 257 sanitizer) — the primary guard.
	if (s.neverPublic === true) return {forbidden: true, reason: 'never-public'}
	if (s.requiresLocalAiClis === true) return {forbidden: true, reason: 'local-ai-clis'}
	if (s.hasDaemonBearer === true) return {forbidden: true, reason: 'daemon-bearer'}

	// DEFENSE-IN-DEPTH (backstop for an un-sanitized / pre-sanitize compose).
	const composeReason = scanComposeSignals(s.compose)
	if (composeReason) return {forbidden: true, reason: composeReason}

	return {forbidden: false}
}

/** The author-declared manifest shape resolvePublicAccess reads (structural subset). */
type ManifestPublicDeclaration = {
	publicAccess?: {mode: 'none' | 'whole-app' | 'paths'; paths?: string[]; hasOwnAuth?: boolean}
	neverPublic?: boolean
}

/**
 * The ONE effective-public-access decision both call sites reuse (Task 2
 * registerAppSubdomain wiring + Task 3 getPublicAccess read side):
 *
 *   1. isPublicForbidden(signals) → forbidden ⇒ return undefined (NEVER public,
 *      fail-closed). This is the re-assert that defeats a stale/forged persisted
 *      setting (T-258C-03): even if a public setting survives on Redis, a now-
 *      forbidden app (e.g. an update added requiresLocalAiClis, or the daemon
 *      bearer is present) is forced back to private on every regen.
 *   2. else resolvePublicAccess(manifest, setting). When the resolved mode is
 *      'none' (no operator opt-in) ⇒ return undefined so SubdomainConfig.publicAccess
 *      is OMITTED and the emit is the fully-gated 256-04 block (default private, SC5).
 *   3. else return the resolved PublicAccessConfig to thread onto SubdomainConfig.
 *
 * Pure — the caller supplies the forbidden signals (manifest flags + daemon
 * bearer + the compose it chose to read), the manifest, and the persisted setting.
 */
export function effectivePublicAccess(
	signals: PublicForbiddenSignals,
	manifest: ManifestPublicDeclaration | null | undefined,
	installSetting: PublicAccessInstallSetting | null | undefined,
): PublicAccessConfig | undefined {
	// Re-assert never-public on EVERY call — a forbidden app can never be public,
	// regardless of any persisted/forged setting (fail-closed).
	if (isPublicForbidden(signals).forbidden) return undefined

	const resolved = resolvePublicAccess(manifest, installSetting)
	if (resolved.mode === 'none') return undefined
	return resolved
}
