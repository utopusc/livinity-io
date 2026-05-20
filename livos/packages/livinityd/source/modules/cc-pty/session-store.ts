// Phase 166-02 — SessionStore (file-backed metadata).
//
// Persists CcPtySession metadata in `<vaultPath>/.claude/livos-cc-sessions.json`
// using a JSON envelope `{schemaVersion: 1, sessions: CcPtySession[]}` per
// D-V35-C. Atomic writes via .tmp + fs.rename; single-writer in-process
// mutex via Promise-chain (writeQueue). schemaVersion guard rejects
// mismatched files at load time.
//
// Sacred SHA f3538e1d... + D-09 + Phase 161-02 helper + Phase 162-01
// vault-scaffolder + Phase 162-02 agent-session.ts + Phase 163 ws-agent.ts
// + Phase 164 + Phase 165-01 all UNCHANGED. This file owns NEW concern only.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import type {CcPtySession} from './types.js'

export interface SessionStoreOptions {
	vaultPath: string
}

const SCHEMA_VERSION = 1

export class SessionStore {
	private filePath: string
	private writeQueue: Promise<void> = Promise.resolve() // single-writer mutex

	constructor(opts: SessionStoreOptions) {
		this.filePath = path.join(opts.vaultPath, '.claude', 'livos-cc-sessions.json')
	}

	/**
	 * Read sessions from disk. Returns [] if file missing (ENOENT swallowed).
	 * Throws if schemaVersion is not 1.
	 */
	async load(): Promise<CcPtySession[]> {
		try {
			const raw = await fs.readFile(this.filePath, 'utf-8')
			const parsed = JSON.parse(raw) as {schemaVersion?: number; sessions?: CcPtySession[]}
			if (parsed.schemaVersion !== 1) {
				throw new Error(
					`SessionStore: unsupported schemaVersion ${parsed.schemaVersion} (expected ${SCHEMA_VERSION})`,
				)
			}
			return parsed.sessions ?? []
		} catch (err: unknown) {
			const code = (err as NodeJS.ErrnoException | null)?.code
			if (code === 'ENOENT') return []
			throw err
		}
	}

	/**
	 * Atomic save: write `.tmp` first, then fs.rename to final path.
	 * Serialized through writeQueue so concurrent saves don't lose writes.
	 * Auto-creates `.claude/` directory if missing.
	 */
	async save(sessions: CcPtySession[]): Promise<void> {
		return this.enqueueWrite(async () => {
			await this.saveNoLock(sessions)
		})
	}

	async getByUser(userId: string): Promise<CcPtySession[]> {
		const all = await this.load()
		return all.filter((s) => s.userId === userId)
	}

	async getById(id: string): Promise<CcPtySession | null> {
		const all = await this.load()
		return all.find((s) => s.id === id) ?? null
	}

	async add(session: CcPtySession): Promise<void> {
		// Serialize read-modify-write through writeQueue so concurrent add()
		// calls don't all read the same baseline (lost-write race).
		return this.enqueueWrite(async () => {
			const all = await this.load()
			all.push(session)
			await this.saveNoLock(all)
		})
	}

	async update(id: string, patch: Partial<CcPtySession>): Promise<void> {
		return this.enqueueWrite(async () => {
			const all = await this.load()
			const idx = all.findIndex((s) => s.id === id)
			if (idx < 0) return // no-op for unknown id (per assertion 6)
			all[idx] = {...all[idx], ...patch}
			await this.saveNoLock(all)
		})
	}

	async remove(id: string): Promise<void> {
		return this.enqueueWrite(async () => {
			const all = await this.load()
			const filtered = all.filter((s) => s.id !== id)
			await this.saveNoLock(filtered)
		})
	}

	// ─── Internal helpers ────────────────────────────────────────────────

	/**
	 * Run `op` after the writeQueue tail resolves. The queue is updated to
	 * the new tail (with rejection swallowed so a failed write doesn't
	 * poison subsequent writes) — but the returned promise propagates the
	 * actual op result so callers see errors.
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
	 * The raw atomic-write recipe. Caller MUST hold the writeQueue.
	 */
	private async saveNoLock(sessions: CcPtySession[]): Promise<void> {
		await fs.mkdir(path.dirname(this.filePath), {recursive: true})
		const tmp = this.filePath + '.tmp'
		const body = JSON.stringify({schemaVersion: 1, sessions}, null, 2)
		await fs.writeFile(tmp, body, 'utf-8')
		await fs.rename(tmp, this.filePath)
	}
}
