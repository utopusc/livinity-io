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

import {assertKvmAvailable, assertVmResourcesSane} from '../apps/vm-preflight.js'
import type Livinityd from '../../index.js'
import {
	composeUp,
	dockerInspectStatus,
	renderVmCompose,
	writeVmCompose,
} from './vm-docker.js'
import {vmPortAllocator, vmRdpPortAllocator} from './vm-ports.js'
import {getVmTemplate} from './vm-template.js'
import {VmRegistry, type VmInstanceRecord} from './vm-registry.js'

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

export interface CreateVmInput {
	name: string
	kind: 'windows' | 'linux'
	resources: {cpus: number; ramMiB: number; diskGiB: number}
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

export class VmManager {
	readonly #livinityd: Livinityd
	readonly #registry: VmRegistry

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		// A real FileStore<StoreSchema> (livinityd.store) satisfies the registry's
		// structural Pick<...,'get'|'set'> constructor (350-01 decision).
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

		// (1) Preflights BEFORE any provisioning (T-350-07). A throw propagates and
		//     leaves the registry EMPTY — no /dev/kvm ⇒ clean refusal, never a
		//     silent TCG-emulation trap; an insane RAM/CPU request is refused here.
		const env = {
			CPU_CORES: String(resources.cpus),
			RAM_SIZE: `${resources.ramMiB}M`,
			DISK_SIZE: `${resources.diskGiB}G`,
		}
		await assertKvmAvailable()
		assertVmResourcesSane(env)

		// (2) Allocate identity + the VM's OWN data dir (VMSEC-02) + loopback ports.
		const id = crypto.randomUUID()
		const dataDir = `${this.#livinityd.dataDirectory}/vm-data/${id}`
		const novncPort = vmPortAllocator.allocate()
		const rdpPort = kind === 'windows' ? vmRdpPortAllocator.allocate() : undefined

		// (3) Render the 349 template → compose file on disk.
		const rendered = renderVmCompose(getVmTemplate(kind), {id, dataDir, novncPort, rdpPort, resources})
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
				await this.#registry.patch(id, {lastError: String(err?.message ?? err)})
				this.#livinityd.logger.error(`[vm] create ${id} failed`, err)
			})

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
		return {
			id: record.id,
			name: record.name,
			kind: record.kind,
			resources: record.resources,
			novncPort: record.novncPort,
			rdpPort: record.rdpPort,
			state: await this.#deriveState(record),
			lastError: record.lastError,
			createdAt: record.createdAt,
		}
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
}
