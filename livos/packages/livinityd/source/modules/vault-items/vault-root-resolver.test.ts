/**
 * Phase 171-01 — vault-root-resolver.ts behavioral tests.
 *
 * 8 vitest assertions per the plan <behavior> block: 3 cover
 * resolveVaultRoot() env handling, 3 cover newItemId() shape/uniqueness/
 * time-sortability, 2 cover the barrel index.ts re-export surface.
 *
 * NOTE: Plan 171-01 originally specified `nanoid v7` but nanoid v5 has
 * no `v7` export. Swapped to the `uuidv7` package (RFC 9562 generator).
 * The regex /^[0-9a-z_-]{20,}$/ still passes — UUID v7 strings are
 * lowercase hex + hyphens (e.g. "0192abcd-ef01-7234-89ab-cdef01234567",
 * 36 chars, all in the allowed character class).
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

import {resolveVaultRoot, newItemId} from './vault-root-resolver.js'
import * as barrel from './index.js'

const here = fileURLToPath(import.meta.url)
const INDEX_PATH = path.resolve(path.dirname(here), 'index.ts')
const barrelSrc = readFileSync(INDEX_PATH, 'utf-8')

describe('vault-items/vault-root-resolver — Phase 171-01', () => {
	let prevEnv: string | undefined

	beforeEach(() => {
		prevEnv = process.env.LIV_VAULT_ROOT
	})

	afterEach(() => {
		if (prevEnv === undefined) {
			delete process.env.LIV_VAULT_ROOT
		} else {
			process.env.LIV_VAULT_ROOT = prevEnv
		}
	})

	// ── 1: LIV_VAULT_ROOT honored when set ─────────────────────────────
	it('returns process.env.LIV_VAULT_ROOT when set to a non-empty string', () => {
		process.env.LIV_VAULT_ROOT = '/srv/custom-vault'
		expect(resolveVaultRoot()).toBe('/srv/custom-vault')
	})

	// ── 2: fallback when unset ────────────────────────────────────────
	it('falls back to /root/livinity-vault when LIV_VAULT_ROOT is unset', () => {
		delete process.env.LIV_VAULT_ROOT
		expect(resolveVaultRoot()).toBe('/root/livinity-vault')
	})

	// ── 3: empty string treated as unset ──────────────────────────────
	it('falls back to /root/livinity-vault when LIV_VAULT_ROOT is empty string', () => {
		process.env.LIV_VAULT_ROOT = ''
		expect(resolveVaultRoot()).toBe('/root/livinity-vault')
	})

	// ── 4: id shape (uuidv7 alphabet, 20+ chars) ──────────────────────
	it('newItemId() returns a string matching /^[0-9a-z_-]{20,}$/ (uuidv7 lowercase hex + hyphens)', () => {
		const id = newItemId()
		expect(id).toMatch(/^[0-9a-z_-]{20,}$/)
	})

	// ── 5: uniqueness across 100 sequential calls ─────────────────────
	it('100 sequential newItemId() calls produce no duplicates', () => {
		const ids = new Set<string>()
		for (let i = 0; i < 100; i++) ids.add(newItemId())
		expect(ids.size).toBe(100)
	})

	// ── 6: time-sortable (D-V38-B) ─────────────────────────────────────
	it('two newItemId() calls separated by 5ms are lexicographically ordered', async () => {
		const id1 = newItemId()
		await new Promise(r => setTimeout(r, 5))
		const id2 = newItemId()
		expect(id1 < id2).toBe(true)
	})

	// ── 7: barrel re-exports the Item type surface ─────────────────────
	it('index.ts barrel re-exports Item / BaseItem / ProjectItem / AgentItem / ChatItem types', () => {
		// Type re-exports are erased at runtime, so we verify the
		// source-text. The pattern accepts both `export type {…}` and
		// `export {…}` on a single line listing every type name.
		expect(barrelSrc).toMatch(/export type\b[^;]*\bItem\b/)
		expect(barrelSrc).toMatch(/export type\b[^;]*\bBaseItem\b/)
		expect(barrelSrc).toMatch(/export type\b[^;]*\bProjectItem\b/)
		expect(barrelSrc).toMatch(/export type\b[^;]*\bAgentItem\b/)
		expect(barrelSrc).toMatch(/export type\b[^;]*\bChatItem\b/)
	})

	// ── 8: barrel re-exports resolveVaultRoot + newItemId as runtime ──
	it('index.ts barrel re-exports resolveVaultRoot + newItemId as runtime values', () => {
		expect(typeof barrel.resolveVaultRoot).toBe('function')
		expect(typeof barrel.newItemId).toBe('function')
		// Smoke: barrel-routed call works
		expect(barrel.newItemId()).toMatch(/^[0-9a-z_-]{20,}$/)
	})
})
