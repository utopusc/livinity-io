// Phase 173-02 — migrate Phase 168 flat-JSON session storage into the
// Phase 171 v38 Item tree. Reads <vaultRoot>/.claude/livos-cc-sessions.json,
// creates one ChatItem per session under Main Liv root, preserves
// ccSessionId + tmuxName + timestamps, and renames the source file into
// <vaultRoot>/.backups/v35-cc-sessions.json so the Phase 168 sidebar
// stops finding it (graceful coexistence: Phase 175 deletes the sidebar).
//
// Idempotency: keyed off backup-file existence. If the backup is on disk,
// migration already ran — return early with {skipped:true, reason:'already-migrated'}.
// If the source is missing entirely (fresh vault), return {skipped:true, reason:'no-source'}.
//
// Pure function — no Redis, no tRPC, no boot wire-up. Caller (Phase 173-05
// or livinityd boot path in a later phase) decides WHEN to run it.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend (READ-ONLY — only type-import CcPtySession)
// + Phase 168 cc-pty-router (UNCHANGED — Phase 175 deletes)
// + Phase 169 vault-graph backend
// + Phase 171 vault-items (READ-ONLY — only consume ItemStore public API)
// all UNCHANGED. This file is purely additive.

import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import type {ItemStore} from './item-store.js'
import type {CcPtySession} from '../cc-pty/types.js'

export interface MigrationOptions {
	/** Phase 171 item-store instance — DI for testability. */
	store: ItemStore
	/** Absolute vault root (matches resolveVaultRoot() output). */
	vaultRoot: string
}

export interface MigrationResult {
	/** Number of ChatItems created in the v38 tree. */
	migrated: number
	/** True when the function short-circuited without doing work. */
	skipped: boolean
	/** Skip reason — set only when skipped=true. */
	reason?: 'already-migrated' | 'no-source'
}

/** Source envelope shape — matches Phase 166-02 SessionStore.saveNoLock format. */
interface SourceEnvelope {
	schemaVersion: number
	sessions: CcPtySession[]
}

/**
 * Translate Phase 168 flat-JSON sessions into Phase 171 ChatItems.
 *
 * Steps:
 *   1. Compute source = <vaultRoot>/.claude/livos-cc-sessions.json
 *   2. Compute backup = <vaultRoot>/.backups/v35-cc-sessions.json
 *   3. If backup exists → skip 'already-migrated'
 *   4. If source missing → skip 'no-source'
 *   5. Parse source envelope; for each session create a ChatItem at root + attach metadata
 *   6. Rename source → backup (single fs.rename = atomic + removes source path)
 *   7. Return {migrated:N, skipped:false}
 *
 * Threat T-173-02-01: tampered source JSON — parser throws on bad shape,
 * caller (boot path) MUST decide whether to abort boot or proceed without
 * migration. We do NOT swallow parse errors.
 *
 * Threat T-173-02-02: partial-failure mid-migration — if create() succeeds
 * for K of N sessions then rename fails, source stays in place; next run
 * sees source still present AND backup absent → tries to migrate AGAIN,
 * producing duplicate ChatItems. Accepted: ChatItems are cheap, user can
 * delete duplicates from SidebarTree (Phase 174). Documented in v38 master
 * plan §"Migration constraints".
 */
export async function migrateV35SessionsToV38(opts: MigrationOptions): Promise<MigrationResult> {
	const {store, vaultRoot} = opts
	if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) {
		throw new Error('migrateV35SessionsToV38: vaultRoot is required')
	}
	if (!store) {
		throw new Error('migrateV35SessionsToV38: store is required')
	}

	const sourceFile = path.join(vaultRoot, '.claude', 'livos-cc-sessions.json')
	const backupDir = path.join(vaultRoot, '.backups')
	const backupFile = path.join(backupDir, 'v35-cc-sessions.json')

	// Idempotency gate: backup present = already ran
	if (await pathExists(backupFile)) {
		return {migrated: 0, skipped: true, reason: 'already-migrated'}
	}

	// No-source gate: nothing to migrate
	if (!(await pathExists(sourceFile))) {
		return {migrated: 0, skipped: true, reason: 'no-source'}
	}

	const raw = await fs.readFile(sourceFile, 'utf-8')
	const envelope = JSON.parse(raw) as SourceEnvelope
	if (typeof envelope !== 'object' || envelope === null || !Array.isArray(envelope.sessions)) {
		throw new Error('migrateV35SessionsToV38: source file is not a valid SessionStore envelope')
	}

	let migrated = 0
	for (const sess of envelope.sessions) {
		const name = sessionTitle(sess)
		const created = await store.create({
			type: 'chat',
			name,
			parentId: null,
			...(sess.ccSessionId === undefined ? {} : {ccSessionId: sess.ccSessionId}),
		})
		// Attach v35 metadata as pass-through extension fields on item.json.
		// ItemStore.update strips immutable keys (id/type/createdAt/schemaVersion)
		// but otherwise merges the patch verbatim, so unknown keys survive.
		await store.update(created.id, {
			// tmuxName, lastAttachedAt, lastMessageAt are NOT in BaseItem but
			// are preserved on disk for Phase 175 reconciliation tooling.
			...({
				tmuxName: sess.tmuxName,
				v35LastAttachedAt: sess.lastAttachedAt,
				v35LastMessageAt: sess.lastMessageAt,
			} as Record<string, unknown>),
		} as never)
		migrated++
	}

	// Atomic move source → backup (single fs.rename removes source path).
	await fs.mkdir(backupDir, {recursive: true})
	await fs.rename(sourceFile, backupFile)

	return {migrated, skipped: false}
}

/** Compute a non-empty title for the ChatItem name field. */
function sessionTitle(sess: CcPtySession): string {
	if (typeof sess.title === 'string' && sess.title.trim().length > 0) {
		return sess.title
	}
	return `Session ${new Date(sess.createdAt).toISOString()}`
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}
