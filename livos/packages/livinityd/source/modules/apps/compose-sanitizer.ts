import path from 'node:path'

import {CLI_MOUNT_PREFIX} from './inject-local-ai-clis.js'

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
