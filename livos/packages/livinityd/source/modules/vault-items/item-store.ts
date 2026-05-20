// Phase 171-02 — ItemStore (file-backed, atomic CRUD, per-type scaffolding).
//
// One Item = one folder under `<vaultRoot>/items/<uuid-v7>/`. Persists
// `item.json` as the authoritative BaseItem + type-discriminator payload
// plus per-type scaffolding files per D-V38-T canonical folder layout
// (master plan §"Folder Layout" lines 102-142):
//
//   <vaultRoot>/items/<id>/item.json          (BaseItem + type extras)
//   <vaultRoot>/items/<id>/README.md          (empty stub)
//   <vaultRoot>/items/<id>/CLAUDE.md          (empty stub — nested CC ctx)
//   <vaultRoot>/items/<id>/settings.json      ({} empty object)
//   <vaultRoot>/items/<id>/tasks.json         ([] — project only)
//   <vaultRoot>/items/<id>/agent.md           (YAML stub — agent only)
//   <vaultRoot>/items/<id>/tools.json         ([] — agent only)
//   <vaultRoot>/items/<id>/transcript.json    ({messages: []} — chat only)
//
// Atomic writes via `.tmp` + `fs.rename` (POSIX-atomic on same FS); all
// mutations serialize through an in-process Promise-chain writeQueue
// mirror of cc-pty/session-store.ts:109-127. Concurrent reads do not
// block. Threat T-171-02-04 (lost-update race) mitigated by the queue;
// Threat T-171-02-05 (partial mid-write crash) mitigated by .tmp+rename.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend (READ-ONLY analog — session-store.ts recipe
//   mirrored verbatim, but no Phase 166 file is modified by this plan)
// + Phase 168 cc-pty-router.ts
// + Phase 169 vault-graph backend
// all UNCHANGED. This NEW file owns the v38 ItemStore concern only.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import type {Item, ProjectItem, AgentItem, ChatItem} from './types.js'
import {newItemId} from './vault-root-resolver.js'

export interface ItemStoreOptions {
	/** Absolute path to the vault root. Caller passes `resolveVaultRoot()` result. */
	vaultRoot: string
}

export interface CreateInput {
	type: 'project' | 'agent' | 'chat'
	name: string
	parentId?: string | null
	/** project only — absolute path to repo/workspace */
	cwd?: string
	/** agent only — cron expression */
	schedule?: string
	/** chat only — CC PTY jsonl session id */
	ccSessionId?: string
}

export interface ListOptions {
	/** When false, archived Items are filtered out. Defaults to true (include all). */
	archived?: boolean
	/**
	 * When provided, returns only Items whose `parentId === this value`.
	 * Pass `null` explicitly to match root-level Items.
	 */
	parentId?: string | null
}

/** Item id shape guard — defends against `..`, slashes, NUL injection. */
const ID_SHAPE = /^[A-Za-z0-9_-]+$/

function assertSafeId(id: string): void {
	if (typeof id !== 'string' || id.length === 0 || !ID_SHAPE.test(id)) {
		throw new Error(`ItemStore: unsafe id '${id}'`)
	}
}

export class ItemStore {
	private readonly vaultRoot: string
	private writeQueue: Promise<void> = Promise.resolve() // single-writer mutex

	constructor(opts: ItemStoreOptions) {
		if (!opts || typeof opts.vaultRoot !== 'string' || opts.vaultRoot.length === 0) {
			throw new Error('ItemStore: vaultRoot is required')
		}
		if (!path.isAbsolute(opts.vaultRoot)) {
			throw new Error('ItemStore: vaultRoot must be absolute')
		}
		this.vaultRoot = path.normalize(opts.vaultRoot)
	}

	/** Per-Item folder path. Public so Plan 171-03 tree-resolver can walk it. */
	itemDir(id: string): string {
		assertSafeId(id)
		return path.join(this.vaultRoot, 'items', id)
	}

	private itemFile(id: string): string {
		return path.join(this.itemDir(id), 'item.json')
	}

	/**
	 * Create a new Item of the requested type. Generates a UUID v7 id,
	 * writes the per-type folder + scaffolding files atomically, returns
	 * the freshly-built Item. Serialized through writeQueue.
	 */
	async create(input: CreateInput): Promise<Item> {
		return this.enqueueWrite(async () => {
			const id = newItemId()
			const now = Date.now()
			const dir = this.itemDir(id)
			await fs.mkdir(dir, {recursive: true})

			// Build the type-specific Item record.
			let item: Item
			switch (input.type) {
				case 'project': {
					const proj: ProjectItem = {
						id,
						parentId: input.parentId ?? null,
						name: input.name,
						pinned: false,
						createdAt: now,
						updatedAt: now,
						archivedAt: null,
						schemaVersion: 1,
						type: 'project',
						...(input.cwd === undefined ? {} : {cwd: input.cwd}),
					}
					item = proj
					break
				}
				case 'agent': {
					const ag: AgentItem = {
						id,
						parentId: input.parentId ?? null,
						name: input.name,
						pinned: false,
						createdAt: now,
						updatedAt: now,
						archivedAt: null,
						schemaVersion: 1,
						type: 'agent',
						...(input.schedule === undefined ? {} : {schedule: input.schedule}),
					}
					item = ag
					break
				}
				case 'chat': {
					const ch: ChatItem = {
						id,
						parentId: input.parentId ?? null,
						name: input.name,
						pinned: false,
						createdAt: now,
						updatedAt: now,
						archivedAt: null,
						schemaVersion: 1,
						type: 'chat',
						...(input.ccSessionId === undefined ? {} : {ccSessionId: input.ccSessionId}),
					}
					item = ch
					break
				}
				default: {
					// Exhaustiveness guard — caller passed an unsupported type literal.
					const bad = (input as {type: string}).type
					throw new Error(`ItemStore: unsupported Item type '${bad}'`)
				}
			}

			// Shared baseline files (every Item gets these four).
			await this.atomicWriteJson(path.join(dir, 'item.json'), item)
			await this.atomicWriteText(path.join(dir, 'README.md'), '')
			await this.atomicWriteText(path.join(dir, 'CLAUDE.md'), '')
			await this.atomicWriteJson(path.join(dir, 'settings.json'), {})

			// Per-type scaffolding extras.
			switch (item.type) {
				case 'project':
					await this.atomicWriteJson(path.join(dir, 'tasks.json'), [])
					break
				case 'agent':
					await this.atomicWriteText(
						path.join(dir, 'agent.md'),
						`---\nname: ${input.name}\n---\n\n# Agent system prompt\n`,
					)
					await this.atomicWriteJson(path.join(dir, 'tools.json'), [])
					break
				case 'chat':
					await this.atomicWriteJson(path.join(dir, 'transcript.json'), {messages: []})
					break
			}

			return item
		})
	}

	/**
	 * Read an Item's authoritative `item.json`. Returns null if the file
	 * does not exist (ENOENT swallowed). Any other I/O or parse error
	 * propagates — store stays strict per Threat T-171-02-01.
	 */
	async read(id: string): Promise<Item | null> {
		try {
			assertSafeId(id)
		} catch {
			return null
		}
		try {
			const raw = await fs.readFile(this.itemFile(id), 'utf-8')
			return JSON.parse(raw) as Item
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException | null)?.code
			if (code === 'ENOENT') return null
			throw err
		}
	}

	/**
	 * Patch an Item's mutable fields. Forbidden keys (id, type, createdAt,
	 * schemaVersion) are stripped before merge; `updatedAt` is bumped to
	 * `Date.now()`. Throws if the Item is missing. Serialized through
	 * writeQueue.
	 */
	async update(
		id: string,
		patch: Partial<Omit<Item, 'id' | 'type' | 'createdAt' | 'schemaVersion'>>,
	): Promise<Item> {
		return this.enqueueWrite(async () => {
			const current = await this.read(id)
			if (current === null) {
				throw new Error(`ItemStore: item ${id} not found`)
			}
			// Strip immutable keys defensively — even though the type signature
			// already forbids them, callers may pass `as any`.
			const safe = {...(patch as Record<string, unknown>)}
			delete safe.id
			delete safe.type
			delete safe.createdAt
			delete safe.schemaVersion
			const next = {...current, ...safe, updatedAt: Date.now()} as Item
			await this.atomicWriteJson(this.itemFile(id), next)
			return next
		})
	}

	/** Mark Item archived (archivedAt = now). Folder stays on disk. */
	async archive(id: string): Promise<Item> {
		return this.update(id, {archivedAt: Date.now()})
	}

	/** Reverse `archive` — clear the archive marker. */
	async unarchive(id: string): Promise<Item> {
		return this.update(id, {archivedAt: null})
	}

	/**
	 * Hard-delete the Item's folder recursively. Returns `true` if the
	 * directory existed and was removed, `false` if it was already gone.
	 * Serialized through writeQueue.
	 */
	async delete(id: string): Promise<boolean> {
		return this.enqueueWrite(async () => {
			try {
				assertSafeId(id)
			} catch {
				return false
			}
			try {
				await fs.rm(this.itemDir(id), {recursive: true, force: false})
				return true
			} catch (err: unknown) {
				const code = (err as NodeJS.ErrnoException | null)?.code
				if (code === 'ENOENT') return false
				throw err
			}
		})
	}

	/**
	 * List all Items. By default archived Items are included; pass
	 * `{archived: false}` to filter them out. Pass `{parentId}` to scope
	 * to a single tree branch (use `null` explicitly for root-level Items).
	 */
	async list(opts: ListOptions = {}): Promise<Item[]> {
		const itemsDir = path.join(this.vaultRoot, 'items')
		let entries: string[]
		try {
			entries = await fs.readdir(itemsDir)
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException | null)?.code
			if (code === 'ENOENT') return []
			throw err
		}
		const items: Item[] = []
		for (const entry of entries) {
			// Skip entries that don't match the id shape — defends against stray
			// `.tmp` files or operator-dropped junk in the items/ directory.
			if (!ID_SHAPE.test(entry)) continue
			const item = await this.read(entry)
			if (item === null) continue
			if (opts.archived === false && item.archivedAt !== null) continue
			if (opts.parentId !== undefined && item.parentId !== opts.parentId) continue
			items.push(item)
		}
		return items
	}

	// ─── Internal helpers ────────────────────────────────────────────────

	/**
	 * Run `op` after the writeQueue tail resolves. Queue is updated to the
	 * new tail with rejection swallowed so a failed write doesn't poison
	 * subsequent writes — caller still sees the error via the returned
	 * promise. Mirrors cc-pty/session-store.ts:109-116 verbatim.
	 */
	private enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
		const next = this.writeQueue.then(op)
		this.writeQueue = next.then(
			() => undefined,
			() => undefined,
		)
		return next
	}

	/**
	 * Atomic JSON write — pretty-printed for human grep-ability (matches
	 * SessionStore.saveNoLock formatting precedent). Writes to `<file>.tmp`
	 * then `fs.rename` to the final path; POSIX-atomic on the same FS.
	 */
	private async atomicWriteJson(file: string, value: unknown): Promise<void> {
		await fs.mkdir(path.dirname(file), {recursive: true})
		const tmp = file + '.tmp'
		await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
		await fs.rename(tmp, file)
	}

	/** Atomic text write — same recipe as `atomicWriteJson` but raw body. */
	private async atomicWriteText(file: string, body: string): Promise<void> {
		await fs.mkdir(path.dirname(file), {recursive: true})
		const tmp = file + '.tmp'
		await fs.writeFile(tmp, body, 'utf-8')
		await fs.rename(tmp, file)
	}
}
