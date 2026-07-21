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

import fse from 'fs-extra'

import {assertKvmAvailable, assertVmResourcesSane, probeHostCapacity} from '../apps/vm-preflight.js'
import type Livinityd from '../../index.js'
import {
	composeDownVolumes,
	composeRestart,
	composeStop,
	composeUp,
	dockerInspectStatus,
	renderVmCompose,
	writeVmCompose,
} from './vm-docker.js'
import {vmPortAllocator, vmRdpPortAllocator} from './vm-ports.js'
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

export type VmResources = {cpus: number; ramMiB: number; diskGiB: number}

/** Phase 351 (VMCREATE-01): the guest-OS selection, discriminated by `kind`. */
export type WindowsOsSelection = {edition: WindowsEdition}
export type LinuxOsSelection = {distro: LinuxDistro} | {customImage: {url: string}}

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

/** Resolve a Linux `BOOT` env value: a distro name, or a custom-image URL. */
function resolveLinuxBootValue(os: LinuxOsSelection): string {
	return 'customImage' in os ? os.customImage.url : os.distro
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

		// Phase 351 (VMCREATE-01): resolve the guest-OS selection into its env value
		// — VERSION for a Windows edition, BOOT for a Linux distro or custom-image
		// URL. `input.kind` (not the destructured `kind`) drives the narrowing so TS
		// resolves `input.os` to the correct branch.
		const osEnv: Record<string, string> =
			input.kind === 'windows' ? {VERSION: input.os.edition} : {BOOT: resolveLinuxBootValue(input.os)}

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

		// (3) Render the 349 template → compose file on disk. The OS selection
		//     (osEnv) is threaded through so the container actually boots the chosen
		//     guest OS — renderVmCompose escapes any user-supplied '$' before merge.
		const rendered = renderVmCompose(getVmTemplate(kind), {id, dataDir, novncPort, rdpPort, resources, osEnv})
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
			createdAt: Date.now(),
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
			await fse.remove(record.dataDir)
			await this.#registry.delete(id)
			vmPortAllocator.release(record.novncPort)
			if (record.rdpPort !== undefined) vmRdpPortAllocator.release(record.rdpPort)

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
		}

		for (const inst of all) {
			if (inst.lastIntent !== 'running') continue
			try {
				await composeUp(inst.composePath, `vm-${inst.id}`)
			} catch (error) {
				this.#livinityd.logger.error(`[vm] reconcileOnBoot failed for ${inst.id}`, error)
			}
		}
	}
}
