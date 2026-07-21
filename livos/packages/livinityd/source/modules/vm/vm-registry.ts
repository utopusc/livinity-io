/**
 * Phase 350 (VMLIFE-01) — VM-instance registry.
 *
 * Owns ALL access to the dedicated top-level `vmInstances` StoreSchema key
 * (index.ts). 350-02 (lifecycle manager) and 350-03 (tRPC router) MUST go
 * through this class — no other module reads or writes the `vmInstances` key
 * directly. Mirrors the landns/routes.ts store read-merge-write idiom, adapted
 * to an array-of-records key.
 *
 * Discipline (inherited from app-state-reconcile.ts): the persisted `lastIntent`
 * field is a boot-reconciliation hint ONLY — 350-02 derives the REPORTED live
 * state from `docker inspect`, never from a stored flag.
 */

import type FileStore from '../utilities/file-store.js'

/**
 * The persisted VM-instance record shape. Written as a `type` (not an
 * `interface`) so `vmInstances?: VmInstanceRecord[]` keeps StoreSchema
 * satisfying FileStore's `T extends Serializable` constraint — a named
 * interface lacks the implicit index signature that the Serializable index-type
 * requires (matches the existing StoragePoolState/FolderQuotaEntry/AppStoreSource
 * `type`-alias precedents used the same way in index.ts). Forward-compatible
 * with 351's GPU/host-capacity fields (additive optional fields only).
 */
export type VmInstanceRecord = {
	id: string // server-generated uuid (crypto.randomUUID())
	name: string // user-chosen display name — NEVER used for the docker project/container name
	kind: 'windows' | 'linux' // VmTemplateKind from vm-template.ts
	resources: {cpus: number; ramMiB: number; diskGiB: number}
	lastIntent: 'running' | 'stopped' // boot-reconciliation hint ONLY — never returned as reported state
	dataDir: string // `${livinityd.dataDirectory}/vm-data/<id>` — the VM's OWN dir only (VMSEC-02)
	composePath: string // `${dataDir}/docker-compose.yml`
	containerName: string // `vm-<id>` — compose container_name + docker project name
	novncPort: number // allocated loopback host port -> container 8006
	rdpPort?: number // windows only, allocated loopback host port -> container 3389
	createdAt: number
	lastError?: string // surfaced verbatim by list/get on `error` state
}

/**
 * Centralizes every `vmInstances` store-key access behind typed accessors.
 * Store-read-merge-write against the top-level key (mirrors landns/routes.ts,
 * adapted for an array).
 */
export class VmRegistry {
	// Typed structurally against just the accessors this registry uses, so a real
	// `FileStore<StoreSchema>` (index.ts) or a plain fake store both satisfy it
	// without pulling the huge StoreSchema type across a module boundary.
	// `getWriteLock` is REQUIRED (WR-02): every read-modify-write mutation runs
	// INSIDE FileStore's write PQueue so two concurrent mutations cannot each read
	// the pre-mutation array and clobber each other (a lost record would orphan a
	// privileged /dev/kvm container with no registry entry). Plain reads (list/get)
	// stay outside the lock — a stale read is harmless; a lost write is not.
	readonly #store: Pick<FileStore<any>, 'get' | 'set' | 'getWriteLock'>

	constructor(store: Pick<FileStore<any>, 'get' | 'set' | 'getWriteLock'>) {
		this.#store = store
	}

	async list(): Promise<VmInstanceRecord[]> {
		return ((await this.#store.get('vmInstances')) as VmInstanceRecord[] | undefined) ?? []
	}

	async get(id: string): Promise<VmInstanceRecord | undefined> {
		const all = await this.list()
		return all.find((r) => r.id === id)
	}

	async upsert(record: VmInstanceRecord): Promise<void> {
		await this.#store.getWriteLock(async ({get, set}) => {
			const all = ((await get('vmInstances')) as VmInstanceRecord[] | undefined) ?? []
			const index = all.findIndex((r) => r.id === record.id)
			if (index === -1) {
				all.push(record)
			} else {
				all[index] = record
			}
			await set('vmInstances', all as any)
		})
	}

	async patch(id: string, patch: Partial<VmInstanceRecord>): Promise<void> {
		await this.#store.getWriteLock(async ({get, set}) => {
			const all = ((await get('vmInstances')) as VmInstanceRecord[] | undefined) ?? []
			const index = all.findIndex((r) => r.id === id)
			if (index === -1) return // unknown id — no-op (never throws)
			all[index] = {...all[index], ...patch}
			await set('vmInstances', all as any)
		})
	}

	async delete(id: string): Promise<void> {
		await this.#store.getWriteLock(async ({get, set}) => {
			const all = ((await get('vmInstances')) as VmInstanceRecord[] | undefined) ?? []
			const next = all.filter((r) => r.id !== id)
			if (next.length === all.length) return // unknown id — no-op (never throws)
			await set('vmInstances', next as any)
		})
	}
}
