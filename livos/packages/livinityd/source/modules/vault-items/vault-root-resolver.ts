// Phase 171-01 — vault root + Item id helpers.
//
// resolveVaultRoot() reads the LIV_VAULT_ROOT env var with a stable
// fallback (`/root/livinity-vault`). Phase 173 owns the on-disk vault
// migration; this resolver does NOT move data — it only answers "where
// does the NEW vault-items module read/write under?". Plan 162-01's
// vault-scaffolder.ts keeps hard-coding `/home/bruce/livinity-vault` per
// the Phase 162-01 freeze; that path is intentionally not unified here.
//
// newItemId() returns a time-sortable UUID v7 string (RFC 9562). The
// plan originally specified `import { v7 } from 'nanoid'`, but nanoid v5
// ships only random-alphabet ids, not v7. Swapped to the `uuidv7`
// package which exports a purpose-built RFC 9562 generator — same
// time-sortable invariant, satisfies D-V38-B.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts (hard-coded path stays)
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend
// + Phase 168 cc-pty-router.ts
// + Phase 169 vault-graph backend
// all UNCHANGED. This file is ADDITIVE for the NEW v38 surface only.

import {uuidv7} from 'uuidv7'

/**
 * Resolve the vault root directory for the v38 vault-items module.
 *
 * Returns `process.env.LIV_VAULT_ROOT` when that env var is a non-empty
 * string; otherwise returns the stable fallback `/root/livinity-vault`.
 * Empty string is treated as unset (per the plan's behavior assertion 3).
 *
 * Threat T-171-01-01: callers (Plan 171-02 item-store) MUST `path.resolve`
 * and `path.normalize` this value before any filesystem op — this
 * resolver only guarantees a non-empty string, NOT an absolute or
 * tampered-shape-safe path.
 */
export function resolveVaultRoot(): string {
	const env = process.env.LIV_VAULT_ROOT
	if (typeof env === 'string' && env.length > 0) return env
	return '/root/livinity-vault'
}

/**
 * Emit a new RFC 9562 UUID v7 string. UUID v7 embeds a 48-bit unix-ms
 * timestamp in the high bits so lexicographic order tracks insertion
 * order — the load-bearing D-V38-B requirement that lets the on-disk
 * Item tree sort newest-first cheaply.
 *
 * Threat T-171-01-02: UUID v7 leaks ~48 bits of timestamp by design.
 * That IS the feature (time-sortability). Item ids are not security
 * tokens and carry no PII.
 */
export function newItemId(): string {
	return uuidv7()
}
