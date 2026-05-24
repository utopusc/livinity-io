/**
 * Phase 206 — Direct read/write of openclaw `auth-profiles.json`.
 *
 * The openclaw agent reads provider credentials from
 * `$OPENCLAW_STATE_DIR/agents/<id>/agent/auth-profiles.json`. For OAuth flows
 * we go through the CLI (which spawns the device-code dance and writes the
 * profile on success). For raw API-key entries we write the file directly —
 * the CLI's `auth login --method api-key` prompts on stdin which is awkward
 * from a tRPC procedure, and the schema is stable enough to author
 * server-side.
 *
 * Canonical schema (verified from upstream openclaw docs +
 * `auth-profiles-lyVELBq6.js` source on Mini PC 2026-05-24):
 *
 *   {
 *     "version": 1,
 *     "profiles": {
 *       "<provider>:<name>": {
 *         "type": "api_key" | "oauth",
 *         "provider": "<provider>",
 *         "key": "<raw value>"   // present for api_key; omitted for oauth
 *       }
 *     }
 *   }
 *
 * Profile-ID convention: `<provider>:<name>`. Default name is `default`.
 *
 * Atomic writes use the temp+rename pattern (same as Phase 195
 * XaiCredentialsService and Phase 204 EnvFileWriter) so concurrent readers
 * never see a half-written file.
 *
 * INV-204-04 carry-forward — raw `key` value NEVER returned to the browser.
 * Read operations from the tRPC layer must redact before returning.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuthProfileType = 'api_key' | 'oauth'

export interface AuthProfile {
	type: AuthProfileType
	provider: string
	key?: string
	/**
	 * For OAuth profiles the upstream CLI may include additional fields
	 * (refresh_token, expires_at, etc.). We preserve unknown fields on
	 * read/write so we never strip data the CLI wrote.
	 */
	[extra: string]: unknown
}

export interface AuthProfilesFile {
	version: 1
	profiles: Record<string, AuthProfile>
	/** Allow forward-compat fields. */
	[extra: string]: unknown
}

const EMPTY_FILE: AuthProfilesFile = {
	version: 1,
	profiles: {},
}

// ─── Path resolution ─────────────────────────────────────────────────────────

const DEFAULT_OPENCLAW_STATE_DIR = '/opt/livos/data/openclaw'
const DEFAULT_AGENT_ID = 'main'

export interface AuthProfilesPathOpts {
	stateDir?: string
	agentId?: string
}

/**
 * Resolve the canonical auth-profiles.json path for a given agent. Mirrors
 * openclaw's own `$OPENCLAW_STATE_DIR/agents/<id>/agent/auth-profiles.json`
 * convention (verified live via `openclaw capability model auth status`).
 */
export function resolveAuthProfilesPath(opts: AuthProfilesPathOpts = {}): string {
	const stateDir =
		opts.stateDir ?? process.env.OPENCLAW_STATE_DIR ?? DEFAULT_OPENCLAW_STATE_DIR
	const agentId = opts.agentId ?? DEFAULT_AGENT_ID
	return path.join(stateDir, 'agents', agentId, 'agent', 'auth-profiles.json')
}

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Read the auth-profiles file. Returns the empty shape if the file does not
 * exist yet (first-time install).
 */
export async function readAuthProfiles(
	opts: AuthProfilesPathOpts = {},
): Promise<AuthProfilesFile> {
	const filePath = resolveAuthProfilesPath(opts)
	try {
		const raw = await fs.readFile(filePath, 'utf8')
		const parsed = JSON.parse(raw)
		if (
			parsed &&
			typeof parsed === 'object' &&
			parsed.version === 1 &&
			parsed.profiles &&
			typeof parsed.profiles === 'object'
		) {
			return parsed as AuthProfilesFile
		}
		// Corrupt or non-conforming — treat as empty so a follow-up write can
		// repair the file rather than leave the operator stuck.
		return {...EMPTY_FILE}
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code
		if (code === 'ENOENT') return {...EMPTY_FILE}
		throw err
	}
}

// ─── Write (atomic tmp+rename) ───────────────────────────────────────────────

/**
 * Write the auth-profiles file atomically (tmp+rename). The parent
 * directories are created (recursive) if missing — `agents/<id>/agent/`
 * sometimes doesn't exist until the agent's first run.
 */
export async function writeAuthProfilesAtomic(
	file: AuthProfilesFile,
	opts: AuthProfilesPathOpts = {},
): Promise<{path: string}> {
	const filePath = resolveAuthProfilesPath(opts)
	const dir = path.dirname(filePath)
	await fs.mkdir(dir, {recursive: true})
	const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`
	await fs.writeFile(tmp, JSON.stringify(file, null, 2) + '\n', {
		encoding: 'utf8',
		mode: 0o600,
	})
	await fs.rename(tmp, filePath)
	return {path: filePath}
}

// ─── Mutation helpers ────────────────────────────────────────────────────────

/**
 * Set (or replace) an api_key profile for a provider. Profile-ID is
 * `<provider>:default` per the upstream convention.
 */
export async function setApiKeyProfile(
	provider: string,
	key: string,
	opts: AuthProfilesPathOpts = {},
): Promise<{path: string; profileId: string}> {
	if (!provider || typeof provider !== 'string') {
		throw new Error('provider name is required')
	}
	if (!key || typeof key !== 'string' || key.length < 1) {
		throw new Error('key cannot be empty')
	}
	const profileId = `${provider}:default`
	const current = await readAuthProfiles(opts)
	current.profiles[profileId] = {
		type: 'api_key',
		provider,
		key,
	}
	const {path: writtenPath} = await writeAuthProfilesAtomic(current, opts)
	return {path: writtenPath, profileId}
}

/**
 * Remove a profile by provider (drops `<provider>:default`). Returns whether
 * a profile was actually removed.
 */
export async function removeProfileForProvider(
	provider: string,
	opts: AuthProfilesPathOpts = {},
): Promise<{path: string; removed: boolean}> {
	const profileId = `${provider}:default`
	const current = await readAuthProfiles(opts)
	if (!(profileId in current.profiles)) {
		return {path: resolveAuthProfilesPath(opts), removed: false}
	}
	delete current.profiles[profileId]
	const {path: writtenPath} = await writeAuthProfilesAtomic(current, opts)
	return {path: writtenPath, removed: true}
}

// ─── Redaction helper ────────────────────────────────────────────────────────

/**
 * Build a redacted "key preview" for UI display. Phase 204 INV-204-04 carry-
 * forward — the raw `key` value MUST NEVER cross the wire to the browser.
 *
 * Shape: `<first 4>***<last 4>` for keys ≥ 12 chars; shorter keys redact to
 * `***`.
 */
export function previewKey(key: string | undefined): string {
	if (!key) return '***'
	if (key.length < 12) return '***'
	return `${key.slice(0, 4)}***${key.slice(-4)}`
}
