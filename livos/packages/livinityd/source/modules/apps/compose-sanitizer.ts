import path from 'node:path'

import {CLI_MOUNT_PREFIX} from './inject-local-ai-clis.js'
// Phase 341-02 (D-341-2b) — import the REAL broker/cred-proxy identifiers so the
// federated broker-reach reject list can NEVER drift from the values the daemon
// actually injects. Do NOT hardcode duplicates of these strings here.
import {BROKER_HOST, BROKER_SENTINEL_KEY} from './inject-ai-provider.js'
import {CREDPROXY_HOST, CREDPROXY_PLACEHOLDER_KEY} from './cred-egress-proxy.js'

/**
 * WS-C (Phase 256-03) — non-builtin compose sanitizer.
 *
 * Closes LIVOS-007 (no host-path validation on per-user app compose volumes —
 * any marketplace app can mount arbitrary host paths incl. docker.sock) and
 * LIVOS-013 (untrusted app-store compose run verbatim — no filter of
 * privileged / docker.sock / host-mount).
 *
 * Policy (applied to EVERY service of a NON-BUILTIN compose):
 *   - delete `privileged`
 *   - delete `network_mode` when value === 'host'
 *   - delete `pid` / `userns_mode` when value === 'host'
 *   - delete `cap_add`
 *   - strip any `security_opt` entry containing `unconfined`
 *   - REJECT (throw ComposeRejected) any volume bind whose HOST side is NOT
 *     under `appDataDir` — this covers `/var/run/docker.sock`, `/`, another
 *     user's `/opt/livos/data/users/<other>`, `~/.claude`, `/proc`, `/sys`, …
 *     EXCEPT operator-trusted WS-B inject paths under `CLI_MOUNT_PREFIX`
 *     (`/opt/livos-clis`, e.g. the read-only `credproxy-ca.pem` CA cert and the
 *     glibc/node/CLI/wrapper mounts) — those are allowlisted (revision fix F).
 *   - always merge `security_opt: ['no-new-privileges:true']` into the service.
 *
 * BUILTIN + platform-DB composes are operator-curated and are NOT passed through
 * this sanitizer — Portainer's deliberate docker.sock and OpenHands' accepted
 * risk keep their declared mounts (SC7).
 *
 * Ordering invariant (fix F): in the install pipeline this runs on the
 * app-author compose BEFORE the WS-B `requiresLocalAiClis` inject, so injected
 * mounts are not present at sanitize time; the CLI_MOUNT_PREFIX allowlist is a
 * belt-and-suspenders guard in case the ordering ever changes.
 *
 * The function mutates and returns the parsed YAML object only — it does NOT
 * re-serialize; the caller writes the file back.
 */

/** Thrown when a non-builtin compose declares an irremediable directive (a
 * host-path bind outside the app data dir). The install MUST abort — silently
 * stripping a mount the app depends on would produce a broken, confusing app. */
export class ComposeRejected extends Error {
	readonly directive: string
	constructor(directive: string) {
		super(`Compose rejected (untrusted directive): ${directive}`)
		this.name = 'ComposeRejected'
		this.directive = directive
	}
}

const NO_NEW_PRIVS = 'no-new-privileges:true'

/**
 * Returns true when `hostPath` (already absolute / normalized) is inside `base`.
 * Uses path boundary semantics so `/a/bc` is NOT considered inside `/a/b`.
 */
function isUnder(hostPath: string, base: string): boolean {
	const rel = path.posix.relative(base, hostPath)
	return rel === '' || (!rel.startsWith('..') && !path.posix.isAbsolute(rel))
}

/**
 * Extracts the HOST side of a volume entry if it is a bind mount.
 * Supports short form `"<host>:<container>[:mode]"` and long form
 * `{type:'bind', source:'<host>', target:'<container>'}`.
 * Returns null for named volumes (no host path) or non-bind long-form entries.
 */
function bindHostSide(entry: any): string | null {
	if (typeof entry === 'string') {
		// Split only on the FIRST colon-delimited host side. A bind has a host
		// side that begins with `/`, `.`, or `~`. Named volumes (`myvol:/data`)
		// have a first segment that is a plain identifier → not a bind.
		// Windows-safe: we operate on POSIX-style compose paths.
		const firstColon = entry.indexOf(':')
		if (firstColon === -1) return null
		const host = entry.slice(0, firstColon)
		if (host.startsWith('/') || host.startsWith('.') || host.startsWith('~')) {
			return host
		}
		return null
	}
	if (entry && typeof entry === 'object') {
		if (entry.type === 'bind' && typeof entry.source === 'string') {
			return entry.source
		}
		// long-form without explicit type but with a path-like source
		if (typeof entry.source === 'string' && (entry.source.startsWith('/') || entry.source.startsWith('.') || entry.source.startsWith('~'))) {
			return entry.source
		}
		return null
	}
	return null
}

/**
 * Normalize a compose host-path to an absolute POSIX path for comparison.
 * Relative paths (`.`, `./x`, `~`) resolve against `appDataDir` — compose
 * resolves relative binds against the compose-file directory which IS the app
 * data dir post-rsync.
 */
function normalizeHost(host: string, appDataDir: string): string {
	let h = host
	if (h.startsWith('~')) {
		// `~` would be the container caller's home — never trust it; treat as
		// an absolute non-appdir path so it is rejected.
		return path.posix.normalize(h.replace(/^~/, '/__home__'))
	}
	if (!h.startsWith('/')) {
		// relative to the app data dir (compose-file dir)
		h = path.posix.join(appDataDir, h)
	}
	return path.posix.normalize(h)
}

export function sanitizeNonBuiltinCompose(
	composeData: any,
	appDataDir: string,
): {compose: any; removed: string[]} {
	const removed: string[] = []
	const services = composeData?.services
	if (!services || typeof services !== 'object') {
		return {compose: composeData, removed}
	}

	const normAppDir = path.posix.normalize(appDataDir.replace(/\\/g, '/'))
	const normCliPrefix = path.posix.normalize(CLI_MOUNT_PREFIX)

	for (const serviceName of Object.keys(services)) {
		const service = services[serviceName]
		if (!service || typeof service !== 'object') continue

		// privileged
		if ('privileged' in service) {
			delete service.privileged
			removed.push(`${serviceName}.privileged`)
		}

		// network_mode: host
		if (service.network_mode === 'host') {
			delete service.network_mode
			removed.push(`${serviceName}.network_mode:host`)
		}

		// pid: host
		if (service.pid === 'host') {
			delete service.pid
			removed.push(`${serviceName}.pid:host`)
		}

		// userns_mode: host
		if (service.userns_mode === 'host') {
			delete service.userns_mode
			removed.push(`${serviceName}.userns_mode:host`)
		}

		// cap_add (any)
		if ('cap_add' in service) {
			delete service.cap_add
			removed.push(`${serviceName}.cap_add`)
		}

		// security_opt: strip *unconfined entries
		if (Array.isArray(service.security_opt)) {
			const before = service.security_opt.length
			service.security_opt = service.security_opt.filter((s: any) => {
				const keep = !(typeof s === 'string' && /unconfined/.test(s))
				return keep
			})
			if (service.security_opt.length !== before) {
				removed.push(`${serviceName}.security_opt:unconfined`)
			}
		}

		// volumes: reject host-path binds outside appDataDir (allowlist CLI_MOUNT_PREFIX)
		if (Array.isArray(service.volumes)) {
			for (const entry of service.volumes) {
				const host = bindHostSide(entry)
				if (host === null) continue // named volume / non-bind
				const normHost = normalizeHost(host, normAppDir)
				const allowed = isUnder(normHost, normAppDir) || isUnder(normHost, normCliPrefix)
				if (!allowed) {
					throw new ComposeRejected(`host-path bind: ${host}`)
				}
			}
		}

		// always add no-new-privileges (merge, no dup)
		if (!Array.isArray(service.security_opt)) {
			service.security_opt = []
		}
		if (!service.security_opt.includes(NO_NEW_PRIVS)) {
			service.security_opt.push(NO_NEW_PRIVS)
		}
	}

	return {compose: composeData, removed}
}

// ── Phase 341-02 (REPO-02, D-341-5 + D-341-2b) — federated compose safety = REJECT ──
//
// A federated app author is UNTRUSTED. `sanitizeNonBuiltinCompose` above silently
// STRIPS escape-class directives (privileged/cap_add/host-net…) — which for a
// federated app would look installed-but-defanged/broken
// (feedback_app_running_vs_ready_state). So the federated path runs THIS assert
// FIRST and THROWS `ComposeRejected` on any escape-class directive rather than
// editing it away. It is assert-only (no mutation, no no-new-privileges merge);
// `installFederated` still runs the mutating `sanitizeNonBuiltinCompose`
// afterward for the no-new-privileges hardening + defense-in-depth.
//
// D-341-2b (the compose-side broker door): NOT injecting the broker credential
// daemon-side is necessary but NOT sufficient — the broker sentinel path
// authenticates VERIFIED apps by source-IP (docker-bridge subnet) + URL path
// only (it did NOT get the 262-04 per-app-token hardening the cred-egress proxy
// got). So a federated app could SELF-DECLARE the reach in its own compose
// (extra_hosts: livinity-broker:host-gateway + ANTHROPIC_API_KEY:
// livinity-broker-managed) and spend the operator's subscription. Therefore this
// gate ALSO rejects any compose-declared reach to the broker / cred-proxy.
//
// ⚠ KNOWN v1 RESIDUAL (surfaced in 341-HUMAN-UAT + STATE): the static compose can no
// longer declare the reach — the hostname/sentinel form AND the numeric private/
// host-gateway IP form (172.17.0.1:8080 etc.) are both rejected (WR-01). The residual
// is strictly a RUNTIME one: the app's OWN CODE can construct the gateway IP at run
// time (read it from /proc/net/route, resolve host.docker.internal, etc.) and hit the
// broker's source-IP-gated sentinel — the compose-reject cannot see runtime-built hosts.
// Fully closing it needs
// EITHER the 262-04 per-app-token pattern applied to the broker (touches the
// broker path — OUT OF SCOPE here) OR firewall/network isolation of federated
// containers from the host broker port (the parked per-app micro-segmentation
// item). v1 compensating controls: admin-only install + untrusted badge +
// blocking trust warning + this compose-reject.

// The broker/cred-proxy identifier tokens a federated compose may not reference.
// Sourced from the REAL constants (imported above) so they can't drift. Lowercased
// for case-insensitive substring matching. `livinity-broker` already subsumes the
// `livinity-broker-managed` sentinel and any `…//livinity-broker:8080…` base URL;
// `livinity-credproxy` subsumes an `HTTPS_PROXY=http://livinity-credproxy:…`; the
// underscore-form credproxy placeholder is listed explicitly (hyphen forms miss it).
const BROKER_REACH_TOKENS = [
	BROKER_HOST, // 'livinity-broker'
	BROKER_SENTINEL_KEY, // 'livinity-broker-managed'
	CREDPROXY_HOST, // 'livinity-credproxy'
	CREDPROXY_PLACEHOLDER_KEY, // '__livinity_credproxy__'
].map((t) => t.toLowerCase())

function referencesBrokerReach(value: string): boolean {
	const v = value.toLowerCase()
	return BROKER_REACH_TOKENS.some((tok) => v.includes(tok))
}

// WR-01 — a federated compose can reach the source-IP-gated broker WITHOUT naming
// it, by pointing at the numeric docker host-gateway / a private IP (e.g.
// `ANTHROPIC_BASE_URL: http://172.17.0.1:8080/u/<id>` or `extra_hosts:[a:172.17.0.1]`).
// Match private/loopback/link-local IPv4 literals + `host-gateway` so the broker-reach
// reject covers the numeric form too. (IPv6 host-gateway is not a docker default; the
// runtime-constructed residual is documented on the gate.)
const PRIVATE_IP_RE =
	/\b(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/
function referencesPrivateHost(value: string): boolean {
	const v = value.toLowerCase()
	return v.includes('host-gateway') || PRIVATE_IP_RE.test(v)
}

// CR-01 — `bindHostSide` classifies a `$`-interpolated host (`${APP_DATA_DIR}/…`,
// `${HOME}/.ssh`) as a NAMED VOLUME (it doesn't start with / . ~) and skips it, so a
// federated app could bind `${APP_DATA_DIR}/../../../var/run/docker.sock` past the gate
// → host root. This superset extractor returns the host side for `$`-prefixed binds too;
// the federated volume loop then resolves ONLY the box-set `${APP_DATA_DIR}` token and
// rejects any bind still carrying an unresolved `$` (unverifiable) or escaping app-data.
function federatedVolumeHost(entry: any): string | null {
	if (typeof entry === 'string') {
		const firstColon = entry.indexOf(':')
		if (firstColon === -1) return null // no container target → not a host bind
		const host = entry.slice(0, firstColon)
		return /^[/.~$]/.test(host) ? host : null // path- or variable-like ⇒ bind; plain ident ⇒ named volume
	}
	if (entry && typeof entry === 'object' && typeof entry.source === 'string') {
		if (/^[/.~$]/.test(entry.source) || entry.type === 'bind') return entry.source
	}
	return null
}
const APP_DATA_TOKEN_RE = /\$\{APP_DATA_DIR\}|\$APP_DATA_DIR\b/g

/** Flatten an `environment` (map or `KEY=VALUE` list) + `env_file` (string or
 * list) into scannable strings. For a map we join `key=value` so both sides are
 * covered; a list entry is already `KEY=VALUE`. */
function collectEnvStrings(env: any): string[] {
	if (env == null) return []
	if (Array.isArray(env)) return env.map((e) => String(e))
	if (typeof env === 'object') return Object.entries(env).map(([k, v]) => `${k}=${v}`)
	return [String(env)]
}

/** Normalize `extra_hosts` (list of `alias:ip` or a map `{alias: ip}`) to strings. */
function collectExtraHosts(eh: any): string[] {
	if (eh == null) return []
	if (Array.isArray(eh)) return eh.map((e) => String(e))
	if (typeof eh === 'object') return Object.entries(eh).map(([k, v]) => `${k}:${v}`)
	return [String(eh)]
}

/**
 * REJECT (throw) if a single `ports` entry publishes to a PRIVILEGED host port
 * (<1024) or an EXPLICIT non-loopback host interface. A bare container port or a
 * `HOST:CONTAINER` with no interface is allowed here (installFederated rewrites
 * every port to loopback afterward); only an explicit non-loopback bind or a
 * privileged host port is irremediable enough to refuse up-front.
 */
function assertPortEntrySafe(entry: any, reject: (directive: string) => never): void {
	let hostIp: string | undefined
	let hostPort: string | undefined

	if (typeof entry === 'number') return // bare container port, no host publish
	if (typeof entry === 'string') {
		const s = entry.trim().replace(/\/(tcp|udp)$/i, '')
		const bracket = s.match(/^\[([^\]]+)\]:(.*)$/) // [::1]:host:container IPv6 form
		if (bracket) {
			hostIp = bracket[1]
			const rest = bracket[2].split(':')
			if (rest.length >= 2) hostPort = rest[0]
		} else {
			const parts = s.split(':')
			if (parts.length === 1) return // container port only
			if (parts.length === 2) hostPort = parts[0] // HOST:CONTAINER
			else {
				hostIp = parts[0] // HOST_IP:HOST_PORT:CONTAINER
				hostPort = parts[1]
			}
		}
	} else if (entry && typeof entry === 'object') {
		if (entry.host_ip != null) hostIp = String(entry.host_ip)
		if (entry.published != null) hostPort = String(entry.published)
	} else {
		return
	}

	if (hostIp !== undefined && hostIp !== '') {
		const ip = hostIp.toLowerCase()
		const loopback = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip.startsWith('127.')
		if (!loopback) reject(`ports:non-loopback(${hostIp})`)
	}
	if (hostPort !== undefined && hostPort !== '') {
		const n = parseInt(hostPort, 10)
		if (Number.isInteger(n) && n > 0 && n < 1024) reject(`ports:privileged-host-port(${hostPort})`)
	}
}

/**
 * The federated REJECT gate. THROWS `ComposeRejected('<service>.<directive>')` on
 * the first offending directive; returns void when the compose is safe. Runs
 * BEFORE staging mutation. See the block comment above for the D-341-2b rationale
 * and the known v1 runtime-numeric-IP residual.
 */
export function assertFederatedComposeSafe(composeData: any, appDataDir: string): void {
	const services = composeData?.services
	if (!services || typeof services !== 'object') return

	const normAppDir = path.posix.normalize(appDataDir.replace(/\\/g, '/'))

	for (const serviceName of Object.keys(services)) {
		const service = services[serviceName]
		if (!service || typeof service !== 'object') continue
		const reject = (directive: string): never => {
			throw new ComposeRejected(`${serviceName}.${directive}`)
		}

		// Privileged / capabilities / host-namespace escapes.
		if (service.privileged) reject('privileged')
		if ('cap_add' in service) {
			const c = service.cap_add
			const nonEmpty = Array.isArray(c) ? c.length > 0 : c != null && c !== ''
			if (nonEmpty) reject('cap_add')
		}
		if (service.network_mode === 'host') reject('network_mode:host')
		if (service.pid === 'host') reject('pid:host')
		if (service.ipc === 'host') reject('ipc:host') // NOT covered by the silent stripper
		if (service.userns_mode === 'host') reject('userns_mode:host')
		// WR-02 — additional host-reach surfaces an untrusted author must not use.
		if (typeof service.network_mode === 'string' && /^(?:container|service):/.test(service.network_mode)) {
			reject('network_mode:container')
		}
		if (typeof service.pid === 'string' && /^(?:container|service):/.test(service.pid)) reject('pid:container')
		for (const [dir, val] of [
			['devices', service.devices],
			['group_add', service.group_add],
			['sysctls', service.sysctls],
		] as const) {
			const present = dir in service && (Array.isArray(val) ? val.length > 0 : typeof val === 'object' && val !== null ? Object.keys(val).length > 0 : val != null && val !== '')
			if (present) reject(dir)
		}
		if (Array.isArray(service.security_opt)) {
			for (const s of service.security_opt) {
				if (typeof s === 'string' && /unconfined/.test(s)) reject('security_opt:unconfined')
			}
		}

		// Volume binds outside the app's own data dir (docker.sock, /, ~, other
		// users' data, operator secrets). NO CLI_MOUNT_PREFIX allowlist here —
		// federated apps get no operator-CLI mounts. Uses the CR-01 superset
		// extractor so a `$`-interpolated host is inspected, not skipped.
		if (Array.isArray(service.volumes)) {
			for (const entry of service.volumes) {
				const host = federatedVolumeHost(entry)
				if (host === null) continue // named volume / non-bind
				// Resolve ONLY the box-set ${APP_DATA_DIR}; any other unresolved `$` is
				// unverifiable → refuse (docker would resolve it at runtime).
				const resolved = host.replace(APP_DATA_TOKEN_RE, normAppDir)
				if (resolved.includes('$')) reject(`host-path-bind-var:${host}`)
				const normHost = normalizeHost(resolved, normAppDir)
				if (!isUnder(normHost, normAppDir)) reject(`host-path-bind:${host}`)
			}
		}

		// Sensitive host ports — privileged (<1024) or explicit non-loopback iface.
		if (Array.isArray(service.ports)) {
			for (const p of service.ports) assertPortEntrySafe(p, reject)
		}

		// D-341-2b — the compose-side broker / cred-proxy door. Reject a reach named
		// by hostname/sentinel (referencesBrokerReach) OR by a private/host-gateway IP
		// (referencesPrivateHost, WR-01) — the broker source-IP-gates the docker bridge,
		// so a numeric `172.17.0.1:8080` reach is as dangerous as the hostname form.
		for (const eh of collectExtraHosts(service.extra_hosts)) {
			const s = String(eh).toLowerCase()
			if (referencesBrokerReach(s) || referencesPrivateHost(s)) reject('extra_hosts:broker-reach')
		}
		for (const ev of collectEnvStrings(service.environment)) {
			if (referencesBrokerReach(ev) || referencesPrivateHost(ev)) reject('environment:broker-reach')
		}
		for (const ef of collectEnvStrings(service.env_file)) {
			if (referencesBrokerReach(ef)) reject('env_file:broker-reach')
		}
	}
}
