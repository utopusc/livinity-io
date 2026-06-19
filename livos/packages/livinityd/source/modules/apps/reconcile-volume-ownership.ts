import {$} from 'execa'
import fse from 'fs-extra'
import path from 'node:path'
import {type Compose} from 'compose-spec-schema'

export interface UidGid {
	uid: number
	gid: number
}

// System / non-data host paths that must NEVER be chowned.
const SYSTEM_PATH_PREFIXES = [
	'/var/run/',
	'/run/',
	'/proc',
	'/sys',
	'/dev',
	'/etc',
	'/usr',
	'/bin',
	'/sbin',
	'/lib',
	'/var/lib/docker',
]

// Parse a compose `user:` directive of the form "<uid>" or "<uid>:<gid>".
// Returns null when the value is non-numeric (a name like `node`) or absent.
function parseUserDirective(user: unknown): UidGid | null {
	if (user === undefined || user === null) return null
	const m = String(user).match(/^(\d+)(?::(\d+))?$/)
	if (!m) return null
	const uid = parseInt(m[1], 10)
	const gid = m[2] !== undefined ? parseInt(m[2], 10) : uid
	return {uid, gid}
}

// Resolve the target uid:gid a service's data must be owned by.
//   1. compose `user:` directive (numeric) wins.
//   2. else image Config.User (passed in as `inspectUser`): numeric -> use it; name/empty -> see below.
//   3. else default 1000:1000 (the Umbrel convention - 316 services).
// Returns null ONLY when the service runs as root (user:0 OR image Config.User empty)
// -> root inside the container can write any ownership, so SKIP the chown.
export function resolveServiceUidGid(service: {user?: unknown}, inspectUser: string | undefined): UidGid | null {
	const directive = parseUserDirective(service.user)
	if (directive) {
		if (directive.uid === 0) return null // root service - skip
		return directive
	}
	// No numeric directive. If the directive was a NAME (e.g. 'node'), fall to default 1000.
	if (service.user !== undefined && service.user !== null) {
		return {uid: 1000, gid: 1000}
	}
	// No directive at all - consult the inspected image Config.User.
	const fromImage = parseUserDirective(inspectUser)
	if (fromImage) {
		if (fromImage.uid === 0) return null
		return fromImage
	}
	if (inspectUser === '' || inspectUser === undefined) {
		// empty Config.User => image runs as root => skip
		return null
	}
	// Config.User is a NAME (e.g. 'postgres') -> default 1000.
	return {uid: 1000, gid: 1000}
}

type VolClass = {kind: 'named'; key: string} | {kind: 'bind'; hostPath: string} | {kind: 'skip'}

function isUnder(hostPath: string, base: string): boolean {
	const rel = path.posix.relative(base, hostPath)
	return rel === '' || (!rel.startsWith('..') && !path.posix.isAbsolute(rel))
}

// Classify ONE service-volume entry. namedVolumeKeys = Object.keys(compose.volumes ?? {})
// minus any with `external: true`. appDataDir = the app's data directory root.
export function classifyVolumeEntry(entry: unknown, namedVolumeKeys: Set<string>, appDataDir: string): VolClass {
	let host: string | null = null
	if (typeof entry === 'string') {
		host = entry.split(':')[0]
	} else if (entry && typeof entry === 'object') {
		const o = entry as any
		if (o.type === 'volume' && o.source)
			return namedVolumeKeys.has(o.source) ? {kind: 'named', key: o.source} : {kind: 'skip'}
		if (o.type === 'bind' && o.source) host = o.source
	}

	if (!host) return {kind: 'skip'}
	// Named volume reference (host side is a top-level volume key, not a path)?
	if (namedVolumeKeys.has(host)) return {kind: 'named', key: host}
	// System path -> never chown.
	if (SYSTEM_PATH_PREFIXES.some((p) => host === p || host!.startsWith(p + '/') || host!.startsWith(p)))
		return {kind: 'skip'}
	// Bind under the app data dir -> chown. Anything else (absolute path outside data) -> skip (out of scope).
	if (host.startsWith('/')) {
		return isUnder(host, appDataDir) ? {kind: 'bind', hostPath: host} : {kind: 'skip'}
	}

	// Relative / unexpanded token we can't resolve -> skip.
	return {kind: 'skip'}
}

// Expand compose env tokens in a SHORT-form volume entry HOST side so the bind
// path is resolvable (the app-script normally expands these via envsubst, but the
// reconciler reads the compose object directly, where builtin composes may still
// carry the literal token). Only the host side (before the first ':') is expanded.
// dataDir is the app data directory; rootDir is livinityd data root (UMBREL_ROOT).
export function expandVolumeTokens(entry: unknown, dataDir: string, rootDir: string): unknown {
	if (typeof entry !== 'string') return entry
	return entry
		.replace(/\$\{APP_DATA_DIR\}/g, dataDir)
		.replace(/\$\{UMBREL_ROOT\}/g, rootDir)
		.replace(/\$\{LIVINITY_ROOT\}/g, rootDir)
}

// Runtime name docker-compose gives a top-level named volume: `${project}_${key}`.
export function namedVolumeRuntimeName(projectName: string, key: string): string {
	return `${projectName}_${key}`
}

// Inspect an image's Config.User. Best-effort; returns '' on any failure.
async function inspectImageUser(image: string | undefined): Promise<string | undefined> {
	if (!image) return undefined
	try {
		const {stdout} = await $`docker image inspect ${image} -f {{.Config.User}}`
		return stdout.trim()
	} catch {
		return undefined
	}
}

type ReconcileApp = {
	id: string
	dataDirectory: string
	readCompose: () => Promise<Compose>
	logger: {log: (m: string) => void; error: (m: string, e?: unknown) => void}
}

// Reconcile ownership of every data volume of an app BEFORE `docker compose up`.
//   - app: anything exposing { id, dataDirectory, readCompose(), logger }
//   - opts.projectName: the docker-compose project name (named-volume runtime name = `${projectName}_${key}`)
//   - opts.appDataDir (optional): override the bind-scoping root (per-user installs pass the user subtree)
export async function reconcileAppVolumeOwnership(
	app: ReconcileApp,
	opts: {projectName: string; appDataDir?: string; rootDir?: string},
): Promise<void> {
	let compose: Compose
	try {
		compose = await app.readCompose()
	} catch (e) {
		app.logger.error(`[reconcile] could not read compose for ${app.id}`, e)
		return
	}

	const appDataDir = opts.appDataDir ?? app.dataDirectory
	// rootDir resolves ${UMBREL_ROOT}/${LIVINITY_ROOT} tokens. Default: strip the
	// `/app-data/<id>` suffix off app.dataDirectory to get livinityd data root.
	const rootDir = opts.rootDir ?? appDataDir.replace(/[\\/]app-data[\\/][^\\/]+[\\/]?$/, '')
	const services = compose.services ?? {}
	const topLevelVols = (compose as any).volumes ?? {}
	const namedVolumeKeys = new Set(
		Object.keys(topLevelVols).filter((k) => !(topLevelVols[k] && topLevelVols[k].external === true)),
	)

	for (const [, service] of Object.entries(services)) {
		const target = resolveServiceUidGid(service as any, await inspectImageUser((service as any).image))
		if (!target) continue // root / skip
		const {uid, gid} = target
		for (const rawEntry of (service as any).volumes ?? []) {
			const entry = expandVolumeTokens(rawEntry, appDataDir, rootDir)
			const cls = classifyVolumeEntry(entry, namedVolumeKeys, appDataDir)
			if (cls.kind === 'skip') continue
			try {
				if (cls.kind === 'named') {
					const volName = namedVolumeRuntimeName(opts.projectName, cls.key)
					await $`docker volume create ${volName}`.catch(() => {}) // idempotent
					await $`docker run --rm -v ${volName + ':/d'} alpine chown -R ${uid + ':' + gid} /d`
				} else {
					await fse.mkdirp(cls.hostPath)
					await $`docker run --rm -v ${cls.hostPath + ':/d'} alpine chown -R ${uid + ':' + gid} /d`
				}
			} catch (e) {
				app.logger.error(`[reconcile] failed to chown volume for ${app.id} (${cls.kind})`, e)
			}
		}
	}

	app.logger.log(`[reconcile] volume ownership reconciled for ${app.id} (project=${opts.projectName})`)
}
