// Phase 344-01 XFER-01 — cross-box single-app migration: the SHARED bundle-format
// contract imported by BOTH the export engine (344-01) and the import engine (344-02).
// Interface-first: everything here is a pure type / constant / hash helper — NO I/O
// beyond node's synchronous crypto hash. Keeping the contract in one module means the
// importer validates against the exact schema the exporter wrote.
//
// ⚠️ BUNDLE IS PLAINTEXT (D-344-6, AMENDED 2026-07-18 — optional passphrase encryption
// DEFERRED from v1 entirely). A `.livbundle` is a plain tar.gz that CONTAINS THE APP'S
// DATA (bind-mount dir + named volumes + compose). It is NOT encrypted. The transport is
// the admin's own browser/machine (admin-only surfaces both sides). Handle bundles with
// care — treat them as sensitive as the app's on-disk data. DEK-encrypted per-app secrets
// (every `*Enc` field, e.g. immichApiKeyEnc) are STRIPPED at export (see stripDekSecrets)
// and listed in `manifest.strippedSecrets` — no DEK material ever leaves a box (D-344-5).
// A follow-up can add an `encryption` manifest field without breaking this contract.

import crypto from 'node:crypto'

import {z} from 'zod'

// ---------------------------------------------------------------------------
// Schema version — integer floor. The importer (344-02) REJECTS a bundle whose
// schemaVersion is GREATER than the value the box understands (a newer box wrote
// it), with an honest "bundle is from a newer release" message (D-344-8).
// ---------------------------------------------------------------------------
export const BUNDLE_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Path constants — the entry names INSIDE the tar.gz. tar-stream preserves add
// order, so the exporter packs MANIFEST_ENTRY FIRST (the importer reads it before
// any data is applied — integrity-check-before-write, the update.sh sacred-sha idiom).
// ---------------------------------------------------------------------------
export const MANIFEST_ENTRY = 'manifest.json'
export const APP_DATA_PREFIX = 'app-data/'
export const VOLUMES_PREFIX = 'volumes/'
export const COMPOSE_ENTRY = 'compose/docker-compose.yml'
export const APP_MANIFEST_ENTRY = 'livinity-app.yml'
export const SUBDOMAIN_ENTRY = 'meta/subdomain.json'

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

/** One non-volume packed entry (manifest describes every byte-blob it wrote). */
export interface BundleEntry {
	/** entry path inside the tar (e.g. `app-data/settings.yml`, `compose/docker-compose.yml`) */
	path: string
	/** hex sha256 of the EXACT bytes packed (for settings.yml: the DEK-stripped bytes) */
	sha256: string
	bytes: number
}

/** One restored named volume — its tar.gz lives at `volumes/<key>.tar.gz`. */
export interface BundleVolume {
	/** the top-level compose volume key (NOT the runtime `${project}_${key}` name) */
	key: string
	/** entry path inside the bundle tar (e.g. `volumes/data.tar.gz`) */
	entryPath: string
	sha256: string
	bytes: number
}

export interface BundleManifest {
	schemaVersion: number
	appId: string
	appVersion: string
	/** the source box release string (informational; import does not gate on it beyond schemaVersion) */
	boxRelease: string
	/** epoch-ms the bundle was created */
	createdAt: number
	entries: BundleEntry[]
	volumes: BundleVolume[]
	/** names of the `*Enc` per-app store keys stripped at export (need re-entry on the target box) */
	strippedSecrets: string[]
	/** true when a SubdomainConfig capture was packed at meta/subdomain.json */
	hasSubdomain: boolean
	/** sum of every entry.bytes + every volume.bytes (import free-space precheck reads this) */
	totalBytes: number
}

// ---------------------------------------------------------------------------
// Zod mirror — the import path (344-02) parses the extracted manifest.json with
// this before trusting ANY field (schemaVersion floor, appId collision, space).
// ---------------------------------------------------------------------------

export const BundleEntrySchema = z.object({
	path: z.string(),
	sha256: z.string(),
	bytes: z.number(),
})

export const BundleVolumeSchema = z.object({
	key: z.string(),
	entryPath: z.string(),
	sha256: z.string(),
	bytes: z.number(),
})

// 344-02 PLAN-CHECK B1 (BLOCKER): appId is the SOLE string that flows into every
// path join / fse.copy / namedVolumeRuntimeName / Binds on the IMPORT side, so it is
// pinned to the EXACT App-constructor charset (`/^[a-zA-Z0-9-_]+$/`, app.ts:122) HERE
// at schema-parse time — the earliest possible gate, BEFORE the manifest is trusted for
// anything. A crafted appId with `../`, an absolute path, a colon, or an empty string
// fails this refinement and rejects the whole bundle as '[bundle-manifest-invalid]'.
export const BundleManifestSchema = z.object({
	schemaVersion: z.number().int(),
	appId: z.string().regex(/^[a-zA-Z0-9-_]+$/, 'appId must match /^[a-zA-Z0-9-_]+$/'),
	appVersion: z.string(),
	boxRelease: z.string(),
	createdAt: z.number(),
	entries: z.array(BundleEntrySchema),
	volumes: z.array(BundleVolumeSchema),
	strippedSecrets: z.array(z.string()),
	hasSubdomain: z.boolean(),
	totalBytes: z.number(),
})

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Hex sha256 of a buffer — the ONE integrity primitive (update.sh sacred-sha idiom). */
export function sha256Hex(buf: Buffer | Uint8Array): string {
	return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * A per-app store key is DEK-encrypted (box-local, non-portable) IFF its name ends
 * in `Enc`. Today this matches EXACTLY `immichApiKeyEnc` (schema.ts:210) — the audit
 * lives in the naming convention so a future `*Enc` key is stripped automatically
 * without touching this code. NOTE: `immichApiKeySet` (a boolean presence flag) does
 * NOT match — it ends in `Set`, not `Enc`.
 */
export function isDekEncryptedKey(key: string): boolean {
	return /Enc$/.test(key)
}

/**
 * Return a COPY of `settings` with every DEK-encrypted (`*Enc`) top-level key removed,
 * plus the list of removed key names. Operates on a shallow copy — the caller passes a
 * parsed settings.yml object; the LIVE settings.yml is never touched (D-344-5).
 */
export function stripDekSecrets(settings: Record<string, unknown>): {
	clean: Record<string, unknown>
	stripped: string[]
} {
	const clean: Record<string, unknown> = {}
	const stripped: string[] = []
	for (const [key, value] of Object.entries(settings)) {
		if (isDekEncryptedKey(key)) {
			stripped.push(key)
			continue
		}
		clean[key] = value
	}
	return {clean, stripped}
}
