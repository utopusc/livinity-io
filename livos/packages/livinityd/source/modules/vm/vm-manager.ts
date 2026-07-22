/**
 * Phase 350 (VMLIFE-01/02/03) — VM lifecycle orchestrator.
 *
 * The composite that sequences the 350-01 primitives (VmRegistry, the vm-docker
 * seam, the vm-ports allocators) plus the 349 preflights into the actual VM
 * lifecycle. It is the correctness core of the phase:
 *   - create()  — preflight-gated, allocates dir+ports, writes the registry
 *                 record, then DETACHES the long compose-up (never blocks the
 *                 daemon — T-350-09, usb-import detached-runner discipline).
 *   - list()/get() — report LIVE state derived from `docker inspect` on EVERY
 *                 call (app-state-reconcile.ts discipline). The registry's
 *                 `lastIntent` is boot-reconciliation bookkeeping ONLY, never
 *                 returned as the reported state — a missing/failed container
 *                 surfaces error/stopped honestly, never a silent running.
 *   - start/stop/restart/delete — single-flight per VM, graceful stop, ordered
 *                 confirm-gated teardown (350-02 Task 2).
 *   - reconcileOnBoot() — re-ups every lastIntent==='running' VM after
 *                 cleanDockerState wipes all containers (350-02 Task 2 + index.ts
 *                 boot hook) so a box Update never permanently deletes a VM.
 *
 * NO app-install path (no installForUser / marketplace / store surface). Every
 * caller is assumed already-authorized (350-03 admin-gates the tRPC entry).
 */

import crypto from 'node:crypto'
import path from 'node:path'

import fse from 'fs-extra'

import {
	assertKvmAvailable,
	assertVmResourcesSane,
	probeHostCapacity,
	vmResizeVerdict,
	VmResourceInvalid,
} from '../apps/vm-preflight.js'
import {LOCAL_IMAGE_EXTENSIONS} from './vm-os-catalog.js'
import type Livinityd from '../../index.js'
import {
	composeDownVolumes,
	composeRestart,
	composeStop,
	composeUp,
	dockerInspectStatus,
	forceRemoveContainer,
	readOsRenderInputs,
	renderVmCompose,
	writeVmCompose,
} from './vm-docker.js'
import {getContainerStats} from '../docker/docker.js'
import getDirectorySize from '../utilities/get-directory-size.js'
import {vmPortAllocator, vmRdpPortAllocator, vmVncRawPortAllocator} from './vm-ports.js'
import {getVmTemplate} from './vm-template.js'
import {VmRegistry, type VmInstanceRecord} from './vm-registry.js'
import type {WindowsEdition, LinuxDistro} from './vm-os-catalog.js'

/** The reported live-state enum (VMLIFE-02). Superset of the app state enum. */
export type VmState = 'creating' | 'installing-os' | 'running' | 'stopped' | 'error'

export interface VmView {
	id: string
	name: string
	kind: 'windows' | 'linux'
	resources: {cpus: number; ramMiB: number; diskGiB: number}
	novncPort: number
	rdpPort?: number
	/** ALWAYS derived live (never the stored lastIntent). */
	state: VmState
	lastError?: string
	createdAt: number
}

/**
 * Phase 362 (VMSTATS-01): live per-VM CPU/RAM usage paired with the
 * registry-allocated resources. Live fields are ABSENT (not zero) when the VM
 * is not running — an absent field is unambiguously "not measured"; a 0 could be
 * misread as "measured and idle" for a VM that is actually stopped. NOTE the type
 * intentionally has NO memoryLimit/memoryPercent field: a VM sets no cgroup
 * mem_limit, so that cgroup value is the host's unbounded ceiling — meaningless as
 * "% allocated". Every consumer is forced through ramAllocMiB (the registry value).
 */
export interface VmStatsView {
	running: boolean
	cpuPercent?: number // 0-100, live — present iff running
	ramUsedMiB?: number // working-set MiB, live — present iff running
	ramAllocMiB: number // ALWAYS — record.resources.ramMiB, NEVER the cgroup
	cpuAllocated: number // ALWAYS — record.resources.cpus
}

/**
 * Phase 362 (VMSTATS-01): per-VM disk usage — SEPARATE from VmStatsView so the
 * du shell-out is never on the 3s stats poll (du causes CPU spikes —
 * live-usage-popover disk-not-polled precedent). diskUsedBytes is the honest,
 * thin-provisioning-aware on-host size of the guest storage dir (du block
 * accounting, sparse-aware); absent when not running.
 */
export interface VmDiskUsageView {
	running: boolean
	diskUsedBytes?: number // du of `${dataDir}/storage`, live — present iff running
	diskAllocGiB: number // ALWAYS — record.resources.diskGiB
}

export type VmResources = {cpus: number; ramMiB: number; diskGiB: number}

/**
 * Phase 351 (VMCREATE-01): the guest-OS selection, discriminated by `kind`.
 * Phase 359 (VMUSER-01): optional `username` — the dockur install-time guest
 * account name. CREATE-ONLY (dockur applies it once at install); qemus/Linux has
 * no equivalent account injection, so there is no username on LinuxOsSelection.
 */
export type WindowsOsSelection = {edition: WindowsEdition; username?: string}
/**
 * A Linux/any-OS guest source: a named distro, a custom-image URL, or (351 gap
 * closure — VMCREATE-01 "local file or URL") a custom-image LOCAL file path. The
 * URL and localPath forms are mutually exclusive by construction.
 */
export type LinuxCustomImage = {url: string} | {localPath: string}
export type LinuxOsSelection = {distro: LinuxDistro} | {customImage: LinuxCustomImage}

/**
 * The create payload. `os` is discriminated by `kind` so a Windows edition and a
 * Linux distro/custom-image are mutually exclusive by construction (mirrors the
 * trpc-router discriminated-union schema — the router is the cheap first gate,
 * this type is the manager-level contract). macOS is unrepresentable: no OS
 * selection literal admits it.
 */
export type CreateVmInput =
	| {name: string; kind: 'windows'; resources: VmResources; os: WindowsOsSelection}
	| {name: string; kind: 'linux'; resources: VmResources; os: LinuxOsSelection}

/**
 * The resolved Linux boot source. Either an ENV value (a distro name or a
 * custom-image URL, threaded into `BOOT`), or a validated LOCAL FILE that will be
 * hardlinked into the VM's own data dir and bind-mounted to `/boot.<ext>` (qemus
 * IGNORES `BOOT` when such a file is bound — upstream contract).
 */
type LinuxBootPlan = {kind: 'env'; boot: string} | {kind: 'localFile'; sourceRealPath: string; ext: string}

/**
 * Resolve a Linux boot source into an env value or a validated local file.
 *
 * (WR-01) For the URL branch the http/https scheme is RE-ASSERTED here — where the
 * value is actually consumed — not only at the router zod refine. The router is the
 * cheap first gate; this is the load-bearing one, so a future non-router caller
 * (352's create UI, a test, a refactor) cannot reintroduce a `file://`/`gopher://`
 * boot source. A valid-but-forbidden scheme throws VmResourceInvalid (→ the existing
 * callVm → BAD_REQUEST mapping).
 *
 * For the LOCAL FILE branch (351 gap closure — VMCREATE-01 "local file or URL") the
 * load-bearing containment + regular-file checks run in resolveLocalImage below.
 */
async function resolveLinuxBoot(os: LinuxOsSelection, dataDirectory: string): Promise<LinuxBootPlan> {
	if ('customImage' in os) {
		if ('localPath' in os.customImage) {
			return resolveLocalImage(os.customImage.localPath, dataDirectory)
		}
		const {protocol} = new URL(os.customImage.url)
		if (protocol !== 'http:' && protocol !== 'https:') {
			throw new VmResourceInvalid(`Custom-image URL scheme ${protocol} is not allowed (http/https only).`)
		}
		return {kind: 'env', boot: os.customImage.url}
	}
	return {kind: 'env', boot: os.distro}
}

/**
 * (VMCREATE-01 gap closure + VMSEC-02) The LOAD-BEARING validation for a custom
 * LOCAL image path — the first create-path input that lets an admin reference a
 * host file, so it is fail-closed on every axis:
 *   - extension must be one qemus binds locally (LOCAL_IMAGE_EXTENSIONS) — reject
 *     a `.vmdk`/`.vhd`/etc. that qemus would silently ignore as a bind.
 *   - `fs.realpath` resolves symlinks BEFORE the containment check, so a symlink
 *     that lives inside the data dir but points OUTSIDE it cannot escape.
 *   - the real path must be CONTAINED inside `livinityd.dataDirectory` (prefix
 *     check after realpath + an explicit separator guard so `/data-evil` cannot
 *     masquerade as `/data`) — no host bind outside the managed data root.
 *   - it must be a REGULAR FILE (a dir / device / dangling path is refused).
 * Every failure throws VmResourceInvalid (→ BAD_REQUEST), and — because this runs
 * BEFORE any provisioning in create() — the docker seam is never reached on reject.
 */
async function resolveLocalImage(localPath: string, dataDirectory: string): Promise<LinuxBootPlan> {
	const ext = path.posix.extname(localPath).slice(1).toLowerCase()
	if (!(LOCAL_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
		throw new VmResourceInvalid(
			`Custom-image file extension .${ext || '(none)'} is not a locally-bootable format (allowed: ${LOCAL_IMAGE_EXTENSIONS.map((e) => `.${e}`).join(', ')}).`,
		)
	}
	let realFile: string
	let realRoot: string
	try {
		// fse.realpath's type union includes Buffer (the encoding overload); the
		// default (utf8) call returns a string — cast to keep the containment check
		// string-typed. A symlink is resolved to its real target here (the gate below).
		realFile = (await fse.realpath(localPath)) as string
		realRoot = (await fse.realpath(dataDirectory)) as string
	} catch {
		throw new VmResourceInvalid('Custom-image file does not exist or is not accessible.')
	}
	const root = realRoot.endsWith('/') ? realRoot.slice(0, -1) : realRoot
	if (realFile !== root && !realFile.startsWith(root + '/')) {
		throw new VmResourceInvalid('Custom-image file must reside within the LivOS data directory.')
	}
	const stat = await fse.stat(realFile)
	if (!stat.isFile()) {
		throw new VmResourceInvalid('Custom-image path is not a regular file.')
	}
	return {kind: 'localFile', sourceRealPath: realFile, ext}
}

// ── Per-VM keyed single-flight (module scope) ────────────────────────────────
// KEYED variant of migration-progress.ts:46-56 (which is a process-wide single
// boolean). A concurrent op on the SAME VM refuses; a DIFFERENT VM is unaffected.
// Process-scoped by design (no StoreSchema key) — a livinityd restart clears it,
// which is correct: reconcileOnBoot() is the explicit post-restart recovery
// path, not a resumed in-flight op.
const inFlight = new Map<string, true>()
function beginVmFlight(vmId: string): boolean {
	if (inFlight.has(vmId)) return false
	inFlight.set(vmId, true)
	return true
}
function endVmFlight(vmId: string): void {
	inFlight.delete(vmId)
}

// ── Live state-derivation mapping (app-state-reconcile.ts:44-49 idiom) ────────
// The VM enum is a superset of the app enum. `creating` / `installing-os` are
// NOT in this table — they are synthesized honestly in #deriveState (never faked
// from a stored flag).
const DOCKER_STATUS_TO_VM_STATE: Record<string, 'running' | 'stopped' | 'error'> = {
	running: 'running',
	exited: 'stopped',
	created: 'stopped',
	paused: 'stopped',
	dead: 'error',
}

// Phase 351 (VMCREATE-04): the honest generic reason surfaced when a VM derives
// 'error' but no specific reason was recorded (e.g. a post-start crash-loop the
// detached create().catch never observed — Pitfall 4). Ensures the admin never
// sees a silent, unexplained 'error' state. See #deriveLastError for the richer
// docker-inspect enrichment documented as an intentional residual.
const VM_GENERIC_ERROR_REASON = 'VM stopped unexpectedly — check the container logs.'

export class VmManager {
	readonly #livinityd: Livinityd
	readonly #registry: VmRegistry

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		// A real FileStore<StoreSchema> (livinityd.store) satisfies the registry's
		// structural Pick<...,'get'|'set'|'getWriteLock'> constructor (350-01
		// decision); getWriteLock serializes registry read-modify-writes (WR-02).
		this.#registry = new VmRegistry(livinityd.store)
	}

	/**
	 * Provision a new VM PROGRAMMATICALLY (VMLIFE-01) — never via installForUser.
	 * Awaits only the FAST path (preflight + registry write); DETACHES the long
	 * compose-up (a Windows ISO pull can take minutes) so the daemon never blocks
	 * (T-350-09). The client polls list()/get() for live state.
	 */
	async create(input: CreateVmInput): Promise<{id: string}> {
		const {name, kind, resources} = input

		// Phase 351 (VMCREATE-01): resolve the guest-OS selection. For Linux this may
		// VALIDATE a custom LOCAL image file (realpath containment + regular-file +
		// extension) and THROW VmResourceInvalid BEFORE any provisioning — the
		// load-bearing gate (the router zod is the cheap first gate). `input.kind`
		// (not the destructured `kind`) drives the narrowing so TS resolves `input.os`.
		const bootPlan: LinuxBootPlan | null =
			input.kind === 'linux' ? await resolveLinuxBoot(input.os, this.#livinityd.dataDirectory) : null

		// VERSION for a Windows edition; BOOT for a Linux distro or custom-image URL.
		// A custom LOCAL file layers NO env value (qemus IGNORES BOOT when a
		// /boot.<ext> file is bind-mounted — the host path never leaks into env).
		// Phase 359 (VMUSER-01): a supplied Windows username rides the SAME osEnv bag
		// as VERSION, so 359-01's registry persistence + re-render round-trip preserve
		// it across a later vm.update with zero extra code. escapeComposeEnv $-escapes
		// it at render (defense-in-depth; the router regex already forbids `$`).
		const osEnv: Record<string, string> =
			input.kind === 'windows'
				? {VERSION: input.os.edition, ...(input.os.username ? {USERNAME: input.os.username} : {})}
				: bootPlan!.kind === 'env'
					? {BOOT: bootPlan!.boot}
					: {}

		// (1) Preflights BEFORE any provisioning (T-350-07). A throw propagates and
		//     leaves the registry EMPTY — no /dev/kvm ⇒ clean refusal, never a
		//     silent TCG-emulation trap; an insane RAM/CPU request is refused here.
		//     The OS selection rides the SAME env object literal as CPU/RAM/DISK.
		const env = {
			CPU_CORES: String(resources.cpus),
			RAM_SIZE: `${resources.ramMiB}M`,
			DISK_SIZE: `${resources.diskGiB}G`,
			...osEnv,
		}
		await assertKvmAvailable()
		// Phase 351 (VMCREATE-02): sanity-bound RAM/CPU/DISK against the host's REAL
		// capacity BEFORE provisioning. The disk free space is re-probed LIVE every
		// create (never a cached value — it drifts mid-session, T-351-08); the probe
		// reads the SAME data-dir the VM's vm-data/<id> root lives under so the bound
		// reflects the real target filesystem. The `await` sits on probeHostCapacity
		// (Promise<HostCapacity>) — dropping it is a tsc TYPE error, not a silent
		// Promise<void> no-op (the assert itself is pure/sync; Pitfall 2 / T-351-07).
		assertVmResourcesSane(env, await probeHostCapacity(this.#livinityd.dataDirectory))

		// (2) Allocate identity + the VM's OWN data dir (VMSEC-02) + loopback ports.
		const id = crypto.randomUUID()
		const dataDir = `${this.#livinityd.dataDirectory}/vm-data/${id}`
		const novncPort = vmPortAllocator.allocate()
		const rdpPort = kind === 'windows' ? vmRdpPortAllocator.allocate() : undefined
		// Phase 364 (VMENC-01): a raw RFB (container VNC_PORT) loopback host port for the
		// host-side encode bridge. UNIVERSAL — allocated for BOTH kinds like novncPort
		// (every qemus/dockur guest exposes a raw QEMU VNC server), not windows-only.
		const vncRawPort = vmVncRawPortAllocator.allocate()

		// (3) Render the 349 template → compose file on disk. The OS selection
		//     (osEnv) is threaded through so the container actually boots the chosen
		//     guest OS — renderVmCompose escapes any user-supplied '$' before merge.
		// (2b) Custom LOCAL image (VMCREATE-01 gap closure): hardlink the VALIDATED
		//      file into the VM's OWN data dir as `custom.<ext>` and bind THAT (never
		//      the original host path) to `/boot.<ext>` — VMSEC-02 posture (no host
		//      bind outside the VM data dir). A hardlink is free (same filesystem, no
		//      data copy); on EXDEV (cross-device) or any link failure fall back to a
		//      full copy so a data-dir on a different mount than the source still works.
		let bootFileMount: {hostFileName: string; containerPath: string} | undefined
		if (bootPlan?.kind === 'localFile') {
			await fse.ensureDir(dataDir)
			const hostFileName = `custom.${bootPlan.ext}`
			const dest = `${dataDir}/${hostFileName}`
			try {
				await fse.link(bootPlan.sourceRealPath, dest)
			} catch {
				await fse.copyFile(bootPlan.sourceRealPath, dest)
			}
			bootFileMount = {hostFileName, containerPath: `/boot.${bootPlan.ext}`}
		}

		const rendered = renderVmCompose(getVmTemplate(kind), {
			id,
			dataDir,
			novncPort,
			rdpPort,
			vncRawPort,
			resources,
			osEnv,
			bootFileMount,
		})
		const composePath = await writeVmCompose(dataDir, rendered)

		// (4) Persist the registry record (lastIntent:'running' so reconcileOnBoot
		//     re-ups it after a restart). containerName is the uuid-derived vm-<id>,
		//     never the user `name`.
		await this.#registry.upsert({
			id,
			name,
			kind,
			resources,
			lastIntent: 'running',
			dataDir,
			composePath,
			containerName: `vm-${id}`,
			novncPort,
			rdpPort,
			// Phase 364 (VMENC-01): persist the raw-VNC host port so delete()/reconcileOnBoot
			// release/reserve it in lock-step with novncPort/rdpPort (the four-site discipline).
			vncRawPort,
			createdAt: Date.now(),
			// Phase 359 (VMSET-01): persist the RAW OS render inputs so a later
			// vm.update re-renders WITHOUT dropping VERSION/BOOT (pre-359 records that
			// lack these fall back to the on-disk recovery path in update()).
			osEnv,
			bootFileMount,
		})

		// (5) DETACH the long compose-up (usb-import .catch-into-logger discipline).
		//     The single-flight marker is claimed here and released when the detached
		//     op settles — while it is held, #deriveState reports 'creating'.
		beginVmFlight(id)
		void composeUp(composePath, `vm-${id}`)
			.then(() => endVmFlight(id))
			.catch(async (err) => {
				endVmFlight(id)
				// (IN-02) A permanently-failed create must not keep holding its ports
				// nor keep a running-intent record that reconcileOnBoot re-attempts on
				// every boot. Release the allocated ports (idempotent — delete() may
				// release them again harmlessly) and flip to honest stopped-intent so
				// the known-broken VM stops being auto-retried.
				vmPortAllocator.release(novncPort)
				if (rdpPort !== undefined) vmRdpPortAllocator.release(rdpPort)
				vmVncRawPortAllocator.release(vncRawPort) // Phase 364 (VMENC-01): release the raw-VNC port too
				try {
					await this.#registry.patch(id, {
						lastIntent: 'stopped',
						lastError: String(err?.message ?? err),
					})
				} catch (patchErr) {
					// (IN-03) A store write inside the failure handler must never itself
					// become an unhandledRejection — swallow-and-log.
					this.#livinityd.logger.error(`[vm] create ${id} failure-handler patch failed`, patchErr)
				}
				this.#livinityd.logger.error(`[vm] create ${id} failed`, err)
			})
			// (IN-03) Terminal guard: the async handler above can never reject
			// unhandled even if a logger/patch path throws unexpectedly.
			.catch(() => {})

		return {id}
	}

	/**
	 * Derive the honest live state for a record. NEVER trusts lastIntent as the
	 * reported state (app-state-reconcile.ts raison d'être). While a create's
	 * detached compose-up is in flight the marker yields 'creating'; otherwise the
	 * real container status decides.
	 *
	 * installing-os is INTENTIONALLY collapsed to running: there is no reliable
	 * dockur/qemus install-complete signal (Pitfall 4 / Assumption A2), so a
	 * running container honestly reports 'running' rather than faking precision. A
	 * log-marker refinement is a 350-HUMAN-UAT follow-up.
	 */
	async #deriveState(record: VmInstanceRecord): Promise<VmState> {
		if (inFlight.has(record.id)) return 'creating'
		try {
			const status = await dockerInspectStatus(record.containerName)
			// PESSIMISTIC fallback (VMCREATE-04): an UNMAPPED docker status — notably
			// 'restarting' (a crash-loop) — falls through to 'error', NOT a silent
			// 'running'. This is a DELIBERATE divergence from apps.ts's optimistic
			// `|| 'ready'`; do NOT "fix" it toward that (RESEARCH Don't-Hand-Roll).
			return DOCKER_STATUS_TO_VM_STATE[status] ?? 'error'
		} catch {
			// No inspectable container. If it was supposed to be up (running intent)
			// or a create failed (lastError), that is an honest 'error'; otherwise
			// the VM is simply 'stopped'.
			if (record.lastError) return 'error'
			return record.lastIntent === 'running' ? 'error' : 'stopped'
		}
	}

	/** Single shared record→view mapper so list() and get() stay consistent. */
	async #toView(record: VmInstanceRecord): Promise<VmView> {
		const state = await this.#deriveState(record)
		return {
			id: record.id,
			name: record.name,
			kind: record.kind,
			resources: record.resources,
			novncPort: record.novncPort,
			rdpPort: record.rdpPort,
			state,
			lastError: this.#deriveLastError(record, state),
			createdAt: record.createdAt,
		}
	}

	/**
	 * Honest-failure reason (VMCREATE-04). The recorded `lastError` always wins; but
	 * when the derived state is 'error' and NO reason was recorded (e.g. a post-start
	 * crash-loop the detached create().catch never saw — Pitfall 4), synthesize a
	 * TRANSIENT generic reason so the admin never sees a silent, unexplained 'error'.
	 * Never fabricated for a healthy 'running'/'stopped'/'creating' state. Not
	 * persisted (transient synth only — recomputed on every view).
	 *
	 * RESIDUAL (documented, matching 350's installing-os collapse precedent): a RICHER
	 * reason read from `docker inspect --format={{json .State}}` (.Error/.ExitCode/
	 * .FinishedAt) is an OUT-OF-SCOPE enrichment (RESEARCH Open-Q1 off-ramp). The
	 * existing dockerInspectStatus seam lives in vm-docker.ts (outside this plan's
	 * allowed 2-file surface) and a new execa seam here would be more than a one-line
	 * extension. The generic reason satisfies VMCREATE-04's "a reason is present on
	 * error" honestly; the richer read is a 351-HUMAN-UAT follow-up.
	 */
	#deriveLastError(record: VmInstanceRecord, state: VmState): string | undefined {
		if (record.lastError) return record.lastError
		if (state === 'error') return VM_GENERIC_ERROR_REASON
		return undefined
	}

	/** List every VM with LIVE-derived state (VMLIFE-02). */
	async list(): Promise<VmView[]> {
		const records = await this.#registry.list()
		return Promise.all(records.map((r) => this.#toView(r)))
	}

	/** Get one VM with LIVE-derived state, or undefined if unknown. */
	async get(id: string): Promise<VmView | undefined> {
		const record = await this.#registry.get(id)
		if (!record) return undefined
		return this.#toView(record)
	}

	/**
	 * Live CPU/RAM usage for one VM (VMSTATS-01). READ-ONLY, admin-gated at the
	 * router (audit-exempt query). Gates on #deriveState (the SAME live-state
	 * derivation list()/get() use) BEFORE touching docker: a stopped VM returns
	 * allocated-only, and getContainerStats is NOT called — a stopped container's
	 * stats call can return a misleading all-zero SUCCESS (not a throw), so we never
	 * rely on the call to detect state. Pairs the live read against the registry
	 * allocated values SERVER-side (the client never reconciles two sources).
	 */
	async stats(id: string): Promise<VmStatsView | undefined> {
		const record = await this.#registry.get(id)
		if (!record) return undefined
		const running = (await this.#deriveState(record)) === 'running'
		const base = {running, ramAllocMiB: record.resources.ramMiB, cpuAllocated: record.resources.cpus}
		if (!running) return base
		const live = await getContainerStats(record.containerName)
		return {
			...base,
			cpuPercent: live.cpuPercent,
			// ALLOC stays the registry ramMiB (base) — ramUsedMiB is the live working
			// set; live.memoryLimit/memoryPercent are DELIBERATELY unused (Pitfall 1).
			ramUsedMiB: Math.round(live.memoryUsage / 1024 / 1024),
		}
	}

	/**
	 * Per-VM disk usage (VMSTATS-01) — SEPARATE from stats() so the du shell-out is
	 * never on the 3s poll path (the router exposes this as its own procedure the
	 * client fetches once on open, not on the poll interval). Same #deriveState gate
	 * + honest-stopped contract as stats(). du of `${dataDir}/storage` is the honest
	 * thin-provisioning-aware metric (getDirectorySize block accounting).
	 */
	async diskUsage(id: string): Promise<VmDiskUsageView | undefined> {
		const record = await this.#registry.get(id)
		if (!record) return undefined
		const running = (await this.#deriveState(record)) === 'running'
		const base = {running, diskAllocGiB: record.resources.diskGiB}
		if (!running) return base
		const diskUsedBytes = await getDirectorySize(`${record.dataDir}/storage`)
		return {...base, diskUsedBytes}
	}

	// ── Lifecycle mutations (single-flight per VM) ───────────────────────────────

	/**
	 * Claim the per-VM single-flight marker for the duration of `fn`. A concurrent
	 * op on the SAME id refuses (T-350-08); a DIFFERENT id is unaffected. Always
	 * releases the marker (finally) even when `fn` throws.
	 */
	async #withFlight<T>(id: string, fn: () => Promise<T>): Promise<T> {
		if (!beginVmFlight(id)) throw new Error(`VM ${id}: an operation is already in progress`)
		try {
			return await fn()
		} finally {
			endVmFlight(id)
		}
	}

	async #requireRecord(id: string): Promise<VmInstanceRecord> {
		const record = await this.#registry.get(id)
		if (!record) throw new Error(`VM ${id}: not found`)
		return record
	}

	/** Bring a VM up and record running intent. */
	async start(id: string): Promise<void> {
		return this.#withFlight(id, async () => {
			const record = await this.#requireRecord(id)
			// (live-found 2026-07-22) A clear error beats a raw docker "no such file or
			// directory" when the compose file is gone (an orphaned/partial-delete
			// record): the VM is unrecoverable, so tell the admin to delete + recreate
			// rather than surfacing a cryptic compose path.
			if (!(await fse.pathExists(record.composePath))) {
				throw new Error(`VM ${id}: its files are missing — delete this VM and recreate it`)
			}
			await composeUp(record.composePath, `vm-${id}`)
			await this.#registry.patch(id, {lastIntent: 'running'})
		})
	}

	/**
	 * Gracefully stop a VM. Uses `composeStop` (docker compose `stop`), which
	 * honors the template's `stop_grace_period: '2m'` — a Windows guest mid-write
	 * is not SIGKILLed into disk corruption (VMLIFE-03). Records stopped intent.
	 */
	async stop(id: string): Promise<void> {
		return this.#withFlight(id, async () => {
			const record = await this.#requireRecord(id)
			await composeStop(record.composePath, `vm-${id}`)
			await this.#registry.patch(id, {lastIntent: 'stopped'})
		})
	}

	/** Restart a VM (leaves running intent). */
	async restart(id: string): Promise<void> {
		return this.#withFlight(id, async () => {
			const record = await this.#requireRecord(id)
			await composeRestart(record.composePath, `vm-${id}`)
			await this.#registry.patch(id, {lastIntent: 'running'})
		})
	}

	/**
	 * Rename a VM (edit-where-safe — VMAPP-02). The display `name` is PURE registry
	 * metadata: it never reaches docker (the container/project is the uuid-derived
	 * `vm-<id>`, never the user name), so a rename touches NO container, compose,
	 * port, or data dir — just a registry.patch({name}). Single-flighted so it
	 * cannot race a concurrent delete/lifecycle op on the SAME VM (a rename onto a
	 * record being torn down would be a lost/orphaned write). Validates existence
	 * first (throws the standard not-found), so renaming an unknown id is an honest
	 * error, not a silent no-op.
	 *
	 * RESIDUAL (documented, VMAPP-02 scope boundary): a RESOURCE resize
	 * (cpus/ramMiB/diskGiB) is DELIBERATELY not offered — it is NOT a safe in-place
	 * edit (it needs a container/disk recreate), so it is out of scope for this
	 * "edit-where-safe" verb and left to a future phase.
	 */
	async rename(id: string, name: string): Promise<void> {
		return this.#withFlight(id, async () => {
			await this.#requireRecord(id) // throws `VM ${id}: not found` for an unknown id
			await this.#registry.patch(id, {name})
		})
	}

	/**
	 * Sanctioned resource resize (VMSET-01/02). adminProcedure + single-flight like
	 * every other vm.* verb. Allowed keys ONLY: cpus/ramMiB/diskGiB (name stays
	 * vm.rename; USERNAME is create-only). GROW-ONLY disk + host-capacity re-check
	 * (fail-closed, BAD_REQUEST). RESTART-TO-APPLY: rewrites the on-disk compose IN
	 * PLACE (same path — reconcile/zombie-delete guards untouched) + patches the
	 * registry, but NEVER composeUp — a running guest keeps its old config until an
	 * explicit stop+start (start() re-reads the compose fresh off disk). Returns the
	 * honest {restartRequired,...} shape (provider-config-router precedent) — the VM
	 * is NEVER auto-restarted inside the mutation.
	 */
	async update(
		id: string,
		patch: {resources: {cpus?: number; ramMiB?: number; diskGiB?: number}},
	): Promise<{restartRequired: boolean; restartTriggered: boolean; restartReason?: string}> {
		return this.#withFlight(id, async () => {
			const record = await this.#requireRecord(id)
			// (WR-02) Files-missing guard — parity with start() (:481-483): a VM whose
			// compose file (data dir / guest disk) was removed is UNRECOVERABLE, so refuse
			// with an honest typed VmResourceInvalid (→ BAD_REQUEST) BEFORE any render/write.
			// Without this, writeVmCompose's fse.ensureDir would silently RECREATE the data
			// dir + a fresh compose over an orphaned VM and report success — masking the same
			// "delete + recreate" signal start() correctly surfaces (and, on a later start,
			// booting a fresh empty disk instead of surfacing the loss).
			if (!(await fse.pathExists(record.composePath))) {
				throw new VmResourceInvalid(`VM ${id}: its files are missing — delete this VM and recreate it`)
			}
			const proposed = {
				cpus: patch.resources.cpus ?? record.resources.cpus,
				ramMiB: patch.resources.ramMiB ?? record.resources.ramMiB,
				diskGiB: patch.resources.diskGiB ?? record.resources.diskGiB,
			}
			// Grow-only + host-capacity (delta-credited) — fail-closed BEFORE any write.
			const reason = vmResizeVerdict(record.resources, proposed, await probeHostCapacity(this.#livinityd.dataDirectory))
			if (reason) throw new VmResourceInvalid(reason)
			// Recover the OS-selection render inputs so the re-render NEVER drops
			// VERSION/BOOT. New VMs carry osEnv on the record; pre-359 VMs recover it
			// from the on-disk compose (fail-closed: readOsRenderInputs throws a typed
			// VmResourceInvalid on an unreadable/unparseable compose rather than emitting
			// an OS-losing render). Computed BEFORE BOTH writes so the registry patch and
			// the compose render share the SAME recovered OS bag.
			const {osEnv, bootFileMount} =
				record.osEnv !== undefined
					? {osEnv: record.osEnv, bootFileMount: record.bootFileMount}
					: await readOsRenderInputs(record.composePath, record.kind)
			// (WR-01) Registry-FIRST ordering (research T-359-10): patch the authoritative
			// intent BEFORE writing the compose. The grow-only guard's baseline is the
			// REGISTRY diskGiB (vmResizeVerdict above reads record.resources), so soundness
			// requires the registry to NEVER understate the provisioned disk. Registry-first
			// means a crash in the ~ms window leaves registry ahead-or-equal of compose (safe:
			// an over-conservative refusal that self-heals) — compose-first could leave
			// compose>registry and let a later grow re-render DISK_SIZE below the physical
			// size = a forbidden shrink. Backfill osEnv/bootFileMount so a pre-359 record
			// becomes self-describing.
			await this.#registry.patch(id, {resources: proposed, osEnv, bootFileMount})
			// Overwrite the compose file IN PLACE (same path). NEVER composeUp here —
			// restart-to-apply, not live-mutate (Pitfall 1 / CONTEXT.md locked). A
			// stale-on-crash compose self-heals on the next update/start.
			const rendered = renderVmCompose(getVmTemplate(record.kind), {
				id,
				dataDir: record.dataDir,
				novncPort: record.novncPort,
				rdpPort: record.rdpPort,
				resources: proposed,
				osEnv,
				bootFileMount,
			})
			await writeVmCompose(record.dataDir, rendered)
			// Honest restart-required: derive 'running' WITHOUT #deriveState (which would
			// report 'creating' — we hold the flight). Never auto-restart the guest.
			let running = false
			try {
				running = (await dockerInspectStatus(record.containerName)) === 'running'
			} catch {
				running = false
			}
			return running
				? {
						restartRequired: true,
						restartTriggered: false,
						restartReason: 'Resource changes apply the next time this VM is stopped and started.',
					}
				: {restartRequired: false, restartTriggered: false}
		})
	}

	/**
	 * Destroy a VM. Requires an explicit `confirm:true` acknowledgement (the
	 * backend half of 352's UI confirm). ORDERED teardown (T-350-11):
	 *   graceful stop → down --volumes → remove data dir → registry delete →
	 *   release ports.
	 * The graceful stop goes FIRST so a guest mid-write is not SIGKILLed before
	 * the volume teardown.
	 */
	async delete(id: string, opts: {confirm: true}): Promise<{deleted: boolean}> {
		// Explicit destruction ack — refuse BEFORE any teardown.
		if (opts?.confirm !== true) {
			throw new Error(`VM ${id}: delete requires an explicit confirm:true acknowledgement`)
		}
		return this.#withFlight(id, async () => {
			const record = await this.#registry.get(id)
			if (!record) return {deleted: false} // unknown id — no side effects

			// (IN-04) The docker steps are BEST-EFFORT: a transient docker error at
			// stop/down must never leave a VM un-deletable. Log and proceed to the
			// durable teardown (dir + registry + ports) — this matches the
			// composeDownVolumes doc contract ("never blocking the delete"). The
			// graceful stop still goes FIRST so a healthy guest is not SIGKILLed
			// before the volume teardown; only a THROWING stop is tolerated here.
			await composeStop(record.composePath, `vm-${id}`).catch((error) => {
				this.#livinityd.logger.error(`[vm] delete ${id}: composeStop failed (continuing teardown)`, error)
			})
			await composeDownVolumes(record.composePath, `vm-${id}`).catch((error) => {
				this.#livinityd.logger.error(`[vm] delete ${id}: composeDownVolumes failed (continuing teardown)`, error)
			})
			// (live-found 2026-07-22) Force-remove the container BY NAME as well: on an
			// ORPHAN whose compose file is already gone, `compose down` errors on the
			// missing --file and never removes the container; on a wedged qemu the down
			// may not reap it. Either way the still-running qemu holds the guest
			// `data.img` open, so the fse.remove below throws on the busy file and the
			// durable registry.delete never runs — the zombie VM the operator hit.
			// `docker rm -f vm-<id>` (deterministic container_name) reaps it + frees the
			// file. Best-effort: a missing container just exits non-zero, harmlessly.
			await forceRemoveContainer(record.containerName).catch((error) => {
				this.#livinityd.logger.error(`[vm] delete ${id}: forceRemoveContainer failed (continuing teardown)`, error)
			})
			// (live-found 2026-07-22) BEST-EFFORT dir removal — a locked/busy file must
			// NEVER abort the durable teardown. A leftover data dir is recoverable disk
			// cruft; a SURVIVING REGISTRY ENTRY is a resurrection (the list keeps showing
			// the VM and reconcileOnBoot re-ups a VM the admin explicitly deleted). So the
			// registry.delete + port release below run REGARDLESS of a dir-removal error.
			await fse.remove(record.dataDir).catch((error) => {
				this.#livinityd.logger.error(
					`[vm] delete ${id}: data-dir removal failed (leaving disk cruft; VM still removed from registry)`,
					error,
				)
			})
			await this.#registry.delete(id)
			vmPortAllocator.release(record.novncPort)
			if (record.rdpPort !== undefined) vmRdpPortAllocator.release(record.rdpPort)
			// Phase 364 (VMENC-01): release the raw-VNC port (absent on pre-364 records).
			if (record.vncRawPort !== undefined) vmVncRawPortAllocator.release(record.vncRawPort)

			return {deleted: true}
		})
	}

	/**
	 * Boot-durability hook (VMLIFE-03). cleanDockerState() (apps.ts:195) nukes ALL
	 * containers on every non-dev boot; apps recreates its own instances, and VMs
	 * need this mirror or a box Update silently deletes every running VM
	 * (Pitfall 1 — the most load-bearing line in the phase). Re-ups every
	 * lastIntent==='running' VM; a stopped-intent VM is left down; a per-VM
	 * composeUp failure is caught+logged and does NOT abort the loop.
	 *
	 * Residual carried to 350-REVIEW.md (out of scope, additive-only — do NOT fix
	 * cleanDockerState here): its `docker stop --time 30` is a HARDER deadline than
	 * the template's `stop_grace_period: '2m'`.
	 */
	async reconcileOnBoot(): Promise<void> {
		const all = await this.#registry.list()

		// (WR-01) Re-prime the IN-MEMORY allocators from every persisted record
		// BEFORE any subsequent create() can run. The allocators reset to empty on
		// a daemon restart, but the ports on-disk are still bound by the re-upped
		// containers below — without this, the next create() deterministically
		// re-hands-out an existing VM's port and its composeUp fails on a bind
		// collision. Prime BOTH running and stopped records: a stopped VM still
		// owns its port for when it is later started. reserve() is a no-cursor-move
		// mark, so ports freed by a later delete() still recycle normally.
		for (const inst of all) {
			vmPortAllocator.reserve(inst.novncPort)
			if (inst.rdpPort !== undefined) vmRdpPortAllocator.reserve(inst.rdpPort)
			// Phase 364 (VMENC-01): re-prime the raw-VNC allocator too (absent on pre-364
			// records) so the next create() never re-hands-out a live VM's raw RFB port.
			if (inst.vncRawPort !== undefined) vmVncRawPortAllocator.reserve(inst.vncRawPort)
		}

		for (const inst of all) {
			if (inst.lastIntent !== 'running') continue
			// (live-found 2026-07-22) Skip a record whose compose file is gone (an
			// orphan from a partial delete, or a hand-removed data dir): composeUp would
			// spam "no such file or directory" on every boot. It already surfaces as
			// 'error' in the list (dockerInspectStatus finds no container), and the
			// hardened delete() now cleans it up on retry. Do NOT auto-delete here —
			// that is destructive and the admin decides.
			if (!(await fse.pathExists(inst.composePath))) {
				this.#livinityd.logger.log(
					`[vm] reconcileOnBoot: compose file missing for ${inst.id} (${inst.composePath}) — skipping re-up; delete this VM to clean it up`,
				)
				continue
			}
			try {
				await composeUp(inst.composePath, `vm-${inst.id}`)
			} catch (error) {
				this.#livinityd.logger.error(`[vm] reconcileOnBoot failed for ${inst.id}`, error)
			}
		}
	}
}
