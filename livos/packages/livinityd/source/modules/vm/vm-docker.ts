/**
 * Phase 350 (VMLIFE-01) — VM docker orchestration seam.
 *
 * The ONLY new file that shells to docker. Mirrors the apps.ts:425 compose
 * idiom (`docker compose --file … --project-name … up -d`) and the
 * app-state-reconcile.ts:59-63 dynamic-`import('execa')` inspect shape so the
 * whole seam is offline-testable via `vi.mock('execa')`. NO dockerode (that is
 * the unrelated remote multi-host subsystem), NO appScript wrapper.
 *
 * renderVmCompose materializes the Phase-349 template's elevated set VERBATIM
 * into a compose-file object: `${APP_DATA_DIR}` substituted for the VM's OWN
 * `vm-data/<id>` dir (VMSEC-02 — no host bind outside it) and host-side ports
 * rendered loopback-only (`127.0.0.1:`). The elevated devices/cap_add/
 * stop_grace_period are copied straight from the template, never re-declared
 * here — the template's compile-time literal types remain the VMSEC-02 backstop.
 */

import {$} from 'execa'
import fse from 'fs-extra'
import yaml from 'js-yaml'

import {VmResourceInvalid} from '../apps/vm-preflight.js'
import type {VmTemplate} from './vm-template.js'

/**
 * Bring a VM container up. Throws on failure — the caller (350-02 vm-manager)
 * decides fatal vs. writing `lastError` to the registry.
 */
export async function composeUp(composePath: string, projectName: string): Promise<void> {
	await $`docker compose --file ${composePath} --project-name ${projectName} up -d`
}

/**
 * Gracefully stop a VM container — `stop` honors the template's
 * `stop_grace_period: '2m'` (no guest disk corruption).
 */
export async function composeStop(composePath: string, projectName: string): Promise<void> {
	await $`docker compose --file ${composePath} --project-name ${projectName} stop`
}

/** Restart a VM container (compose restart — honors stop_grace_period on the stop half). */
export async function composeRestart(composePath: string, projectName: string): Promise<void> {
	await $`docker compose --file ${composePath} --project-name ${projectName} restart`
}

/**
 * Tear a VM container down AND remove its volumes — the delete path. Callers on
 * the cleanup path `.catch()` this into a logger (mirrors apps.ts cleanup),
 * never blocking the delete.
 */
export async function composeDownVolumes(composePath: string, projectName: string): Promise<void> {
	await $`docker compose --file ${composePath} --project-name ${projectName} down --volumes`
}

/**
 * Force-remove a VM container BY NAME (`docker rm -f <name>`) — the delete-path
 * fallback for when compose-based teardown can't run: an ORPHANED VM whose
 * `docker-compose.yml` was already removed (so `compose down` errors on the
 * missing `--file`), or a wedged qemu the compose-down didn't reap. Because the
 * compose sets an explicit deterministic `container_name: vm-<id>`, this reliably
 * targets the real container and frees any HOST FILE (the guest `data.img`) it
 * still holds — without which `fse.remove(dataDir)` throws on the busy file and
 * the durable `registry.delete` never runs (the zombie-VM bug, live-found
 * 2026-07-22). Best-effort: the caller `.catch()`es it; a missing container just
 * exits non-zero, harmlessly. containerName is server-derived (`vm-<id>`), never
 * request input.
 */
export async function forceRemoveContainer(containerName: string): Promise<void> {
	await $`docker rm -f ${containerName}`
}

/**
 * Live container status via `docker inspect`. Dynamic `import('execa')` INSIDE
 * the function (not a top-level import) so `vi.mock('execa')` intercepts it in
 * offline tests — the exact shape app-state-reconcile.ts:59-63 uses. The
 * container name is server-derived (`vm-<id>`), never request input.
 */
export async function dockerInspectStatus(containerName: string): Promise<string> {
	const {$: exec} = await import('execa')
	const result = await exec`docker inspect --format={{.State.Status}} ${containerName}`
	return result.stdout.trim()
}

/**
 * Phase 351 (VMCREATE-01, Pitfall 1): double every '$' → '$$' in a set of
 * user-supplied env values so docker compose's own `$VAR`/`${VAR}` interpolation
 * pass (run over the compose FILE at parse time, independent of js-yaml) cannot
 * mangle a value — e.g. a signed custom-image URL's `?sig=$2b$...` query. Pure;
 * returns a NEW object (never mutates the caller's osEnv).
 */
function escapeComposeEnv(env: Record<string, string> | undefined): Record<string, string> {
	if (!env) return {}
	// NOTE: the FUNCTION replacer is deliberate — a STRING replacement of '$$'
	// would be interpreted by replaceAll as a literal single '$' (the `$$` special
	// pattern), collapsing rather than doubling. A function return is inserted
	// verbatim, so each '$' becomes the two-char '$$' compose escape.
	return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v.replaceAll('$', () => '$$')]))
}

export interface RenderVmComposeOpts {
	id: string
	dataDir: string
	novncPort: number
	rdpPort?: number
	resources: {cpus: number; ramMiB: number; diskGiB: number}
	/**
	 * Phase 351 (VMCREATE-01): the guest-OS selection env override — `VERSION`
	 * (windows edition) or `BOOT` (linux distro / custom-image URL). Merged into
	 * `environment` the same way CPU/RAM/DISK are. Values may be user-supplied
	 * (a custom-image URL), so they are `$`-escaped before the merge (see below).
	 */
	osEnv?: Record<string, string>
	/**
	 * Phase 351 (VMCREATE-01 gap closure): a custom LOCAL image bind. The manager
	 * has already hardlinked/copied the validated file into the VM's OWN data dir
	 * as `hostFileName` (VMSEC-02 — never the original host path), so the rendered
	 * bind source is `${dataDir}/${hostFileName}` (inside the VM's own dir) and the
	 * target is the qemus-recognized `/boot.<ext>` (`containerPath`). Both fields
	 * are SERVER-DERIVED (a uuid-scoped dir + a validated extension) — no
	 * user-supplied string reaches the compose here, so no `$`-escape is needed.
	 */
	bootFileMount?: {hostFileName: string; containerPath: string}
}

/**
 * Render a full compose-FILE object (`{services: {vm: {...}}}`) from a 349
 * template. Deep-clone + `${APP_DATA_DIR}` replaceAll to the VM's OWN dir, then
 * layer on the requested resources (guest env) and the allocated loopback host
 * ports. container_name is set EXPLICITLY to `vm-<id>` so dockerInspectStatus
 * targets a deterministic name (compose's default `<project>-<service>-1` would
 * be non-deterministic).
 */
export function renderVmCompose(template: VmTemplate, opts: RenderVmComposeOpts): object {
	// Deep-clone the immutable template compose + substitute the token BEFORE we
	// read any field off it (Pitfall 2 — no host bind outside the VM's own dir).
	const svc = JSON.parse(
		JSON.stringify(template.compose).replaceAll('${APP_DATA_DIR}', opts.dataDir),
	)

	const environment = {
		...svc.environment,
		CPU_CORES: String(opts.resources.cpus),
		RAM_SIZE: `${opts.resources.ramMiB}M`,
		DISK_SIZE: `${opts.resources.diskGiB}G`,
		// Phase 351 (VMCREATE-01): layer the guest-OS selection (VERSION/BOOT) over
		// the template default, exactly where CPU/RAM/DISK are merged. osEnv values
		// can be USER-SUPPLIED (a custom-image URL), and docker compose interpolates
		// $VAR/${VAR} over compose-file content at parse time — independent of
		// js-yaml's safe serialization (351-RESEARCH Pitfall 1). Double every '$' to
		// '$$' (compose's escape) BEFORE the merge, mirroring the ${APP_DATA_DIR}
		// "substitute-before-read" discipline two blocks above, so a signed URL's
		// raw '$' cannot silently truncate the download target.
		...escapeComposeEnv(opts.osEnv),
	}

	// Host side rendered loopback-only; container side stays as the template's
	// fixed 8006 (noVNC) / 3389 (RDP). RDP is windows-only (opts.rdpPort present).
	const ports = [`127.0.0.1:${opts.novncPort}:8006`]
	if (opts.rdpPort !== undefined) {
		ports.push(`127.0.0.1:${opts.rdpPort}:3389/tcp`, `127.0.0.1:${opts.rdpPort}:3389/udp`)
	}

	// Volumes: the template's `${APP_DATA_DIR}/storage:/storage` (already
	// token-substituted to the VM's own dir above), plus — for a custom LOCAL image
	// — a bind of the hardlinked file INSIDE the VM's own data dir to `/boot.<ext>`.
	// The bind SOURCE is always within `opts.dataDir` (VMSEC-02 — no host bind
	// outside the VM data dir); the original admin-supplied path is never mounted.
	const volumes = [...svc.volumes]
	if (opts.bootFileMount) {
		volumes.push(`${opts.dataDir}/${opts.bootFileMount.hostFileName}:${opts.bootFileMount.containerPath}`)
	}

	return {
		services: {
			vm: {
				container_name: `vm-${opts.id}`,
				image: svc.image,
				restart: svc.restart,
				// Elevated set copied VERBATIM from the template — never re-declared here.
				devices: svc.devices,
				cap_add: svc.cap_add,
				stop_grace_period: svc.stop_grace_period,
				environment,
				volumes,
				ports,
			},
		},
	}
}

// Phase 359 (VMSET-01): recover the RAW osEnv + bootFileMount from an ALREADY-
// RENDERED compose object so vm.update can re-render with new resources WITHOUT
// dropping the VM's OS/boot (Pitfall 2). Un-escapes the compose escape ('$$'->'$')
// so the value is raw again — renderVmCompose re-escapes it exactly once on the
// next render (a naive re-feed of the still-escaped value would double to '$$$$').
// Pure (no I/O) so it unit-tests against a plain object.
export function extractOsRenderInputs(
	composeObj: unknown,
	kind: 'windows' | 'linux',
): {osEnv: Record<string, string>; bootFileMount?: {hostFileName: string; containerPath: string}} {
	const svc = (composeObj as any)?.services?.vm ?? {}
	const env: Record<string, unknown> = svc.environment ?? {}
	const unescape = (v: string) => v.replaceAll('$$', '$') // reverse escapeComposeEnv (string search+replace, literal)
	const osEnv: Record<string, string> = {}
	const key = kind === 'windows' ? 'VERSION' : 'BOOT'
	if (typeof env[key] === 'string') osEnv[key] = unescape(env[key] as string)
	let bootFileMount: {hostFileName: string; containerPath: string} | undefined
	const volumes: string[] = Array.isArray(svc.volumes) ? svc.volumes : []
	const bootVol = volumes.find((v) => typeof v === 'string' && /:\/boot\.[a-z0-9]+$/i.test(v))
	if (bootVol) {
		const sep = bootVol.lastIndexOf(':')
		const containerPath = bootVol.slice(sep + 1)
		const hostPath = bootVol.slice(0, sep)
		bootFileMount = {hostFileName: hostPath.slice(hostPath.lastIndexOf('/') + 1), containerPath}
	}
	return {osEnv, bootFileMount}
}

/**
 * Thin I/O wrapper — read + parse the on-disk compose, then extract. FAIL-CLOSED:
 * an unreadable/unparseable compose THROWS a typed VmResourceInvalid (→ callVm's
 * BAD_REQUEST) rather than letting a raw fs/YAML error surface as an opaque 500 —
 * the caller must NEVER emit an OS-losing re-render on a recovery failure
 * (CONTEXT.md locked). The message mirrors start()'s "files missing — delete and
 * recreate" precedent (vm-manager.ts:460-462) so the admin gets an actionable next
 * step. Only reached for pre-359 records (new VMs carry osEnv on the record).
 */
export async function readOsRenderInputs(
	composePath: string,
	kind: 'windows' | 'linux',
): Promise<{osEnv: Record<string, string>; bootFileMount?: {hostFileName: string; containerPath: string}}> {
	let parsed: unknown
	try {
		parsed = yaml.load(await fse.readFile(composePath, 'utf8'))
	} catch (error) {
		throw new VmResourceInvalid(
			`This VM's compose file could not be read to preserve its OS selection (${String(
				(error as Error)?.message ?? error,
			)}). Its files may be missing or corrupt — delete this VM and recreate it.`,
		)
	}
	return extractOsRenderInputs(parsed, kind)
}

/**
 * Write a rendered compose object to `${dataDir}/docker-compose.yml` (mirrors
 * App#writeCompose, app.ts:159-161). Ensures the dir exists first. Returns the
 * written path.
 */
export async function writeVmCompose(dataDir: string, rendered: object): Promise<string> {
	const composePath = `${dataDir}/docker-compose.yml`
	await fse.ensureDir(dataDir)
	await fse.writeFile(composePath, yaml.dump(rendered))
	return composePath
}
