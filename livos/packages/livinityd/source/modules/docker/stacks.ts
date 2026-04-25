import {mkdir, writeFile, readFile, rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'

import {$} from 'execa'
import {Redis} from 'ioredis'

import {createStackSecretStore, type StackSecretStore} from './stack-secrets.js'
import {cloneOrPull, copyComposeToStackDir} from './git-deploy.js'
import {getDockerClient} from './docker-clients.js'
import {getPool} from '../database/index.js'
import type {StackInfo, StackContainer, StackControlOperation} from './types.js'

// Phase 22 MH-02 — Dockerode access goes through `getDockerClient(envId)` so
// listStacks can target a remote env. NOTE: `docker compose` CLI calls operate
// on the local filesystem at `/opt/livos/data/stacks` and stay host-local —
// multi-host stack deploy/control is deferred to v28.0.

const STACKS_DIR = '/opt/livos/data/stacks'

// Lazily-initialised singleton so we don't connect to Redis at import time
// (matches the ai/index.ts pattern).
let _store: StackSecretStore | null = null
function getStore(): StackSecretStore {
	if (!_store) {
		const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
			maxRetriesPerRequest: null,
		})
		_store = createStackSecretStore(redis)
	}
	return _store
}

async function ensureStacksDir(name: string): Promise<string> {
	const stackDir = join(STACKS_DIR, name)
	await mkdir(stackDir, {recursive: true})
	return stackDir
}

export async function listStacks(environmentId?: string | null): Promise<StackInfo[]> {
	const docker = await getDockerClient(environmentId ?? null)
	const containers = await docker.listContainers({all: true})

	// Group containers by compose project label
	const projects = new Map<string, StackContainer[]>()

	for (const c of containers) {
		const project = c.Labels?.['com.docker.compose.project']
		if (!project) continue

		if (!projects.has(project)) {
			projects.set(project, [])
		}

		projects.get(project)!.push({
			id: c.Id.slice(0, 12),
			name: c.Names[0]?.replace('/', '') ?? c.Id.slice(0, 12),
			image: c.Image,
			state: c.State,
			status: c.Status,
		})
	}

	// Build StackInfo array
	const stacks: StackInfo[] = []

	for (const [name, stackContainers] of projects) {
		const allRunning = stackContainers.every((c) => c.state === 'running')
		const allStopped = stackContainers.every(
			(c) => c.state === 'exited' || c.state === 'created' || c.state === 'dead',
		)

		let status: StackInfo['status']
		if (allRunning) {
			status = 'running'
		} else if (allStopped) {
			status = 'stopped'
		} else {
			status = 'partial'
		}

		stacks.push({
			name,
			status,
			containerCount: stackContainers.length,
			containers: stackContainers,
		})
	}

	return stacks.sort((a, b) => a.name.localeCompare(b.name))
}

// Input env-var shape: `secret?: boolean` flags secrets that must never be
// written to disk (QW-02). They are encrypted-at-rest in Redis and injected
// via execa's `env` option at `docker compose up` time only.
export type StackEnvVarInput = {key: string; value: string; secret?: boolean}

// Phase 21 GIT-01: optional git config for git-backed stacks.
// Mutually exclusive with composeYaml on deployStack input.
export type StackGitInput = {
	url: string
	branch?: string // default 'main'
	credentialId?: string | null
	composePath?: string // default 'docker-compose.yml'
}

export async function deployStack(input: {
	name: string
	composeYaml?: string
	git?: StackGitInput
	envVars?: StackEnvVarInput[]
}): Promise<{success: boolean; message: string; webhookSecret?: string}> {
	// Validate stack name
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(input.name)) {
		throw new Error(
			`[validation-error] Invalid stack name '${input.name}'. Must start with alphanumeric and contain only [a-zA-Z0-9_.-]`,
		)
	}

	// Mutually exclusive — either composeYaml (existing path) or git (new path)
	if (!input.composeYaml && !input.git) {
		throw new Error('[validation-error] Either composeYaml or git must be provided')
	}
	if (input.composeYaml && input.git) {
		throw new Error('[validation-error] composeYaml and git are mutually exclusive')
	}

	const stackDir = await ensureStacksDir(input.name)
	const composePath = join(stackDir, 'docker-compose.yml')
	let webhookSecret: string | undefined

	if (input.git) {
		// Git path (Phase 21 GIT-02): clone, copy compose, persist row
		const branch = input.git.branch || 'main'
		const repoComposePath = input.git.composePath || 'docker-compose.yml'
		await cloneOrPull(input.name, {
			url: input.git.url,
			branch,
			credentialId: input.git.credentialId ?? null,
			composePath: repoComposePath,
		})
		await copyComposeToStackDir(input.name, repoComposePath)

		// Generate webhook secret + persist stack row
		webhookSecret = randomBytes(32).toString('hex')
		const pool = getPool()
		if (!pool) throw new Error('[db-error] Database not initialized')
		await pool.query(
			`INSERT INTO stacks (name, git_url, git_branch, git_credential_id, compose_path, webhook_secret, last_synced_at)
			 VALUES ($1, $2, $3, $4, $5, $6, NOW())
			 ON CONFLICT (name) DO UPDATE SET
				git_url = EXCLUDED.git_url, git_branch = EXCLUDED.git_branch,
				git_credential_id = EXCLUDED.git_credential_id, compose_path = EXCLUDED.compose_path,
				webhook_secret = EXCLUDED.webhook_secret, last_synced_at = NOW(), updated_at = NOW()`,
			[
				input.name,
				input.git.url,
				branch,
				input.git.credentialId ?? null,
				repoComposePath,
				webhookSecret,
			],
		)
	} else {
		// YAML path — UNCHANGED, write compose to disk as before
		await writeFile(composePath, input.composeYaml!, 'utf-8')
	}

	// Split into secret vs plain entries (QW-02)
	const allEnv = input.envVars ?? []
	const secretEntries = allEnv.filter((e) => e.secret)
	const plainEntries = allEnv.filter((e) => !e.secret)

	// Write ONLY plain entries to .env on disk. If there are none but a prior
	// .env exists from an earlier deploy, overwrite with empty content so stale
	// values don't linger (docker compose tolerates an empty .env file).
	const envPath = join(stackDir, '.env')
	if (plainEntries.length > 0) {
		const envContent = plainEntries.map((e) => `${e.key}=${e.value}`).join('\n') + '\n'
		await writeFile(envPath, envContent, 'utf-8')
	} else if (existsSync(envPath)) {
		await writeFile(envPath, '', 'utf-8')
	}

	// Fresh deploy: replace any prior secret set entirely so removed keys are purged
	const store = getStore()
	await store.deleteAll(input.name).catch(() => {})
	for (const e of secretEntries) {
		await store.setSecret(input.name, e.key, e.value)
	}

	// Inject secrets as shell env for `docker compose up` — compose interpolates
	// them into containers WITHOUT ever touching the .env file on disk.
	const envOverrides = await store.getSecrets(input.name)
	try {
		await $({
			cwd: stackDir,
			env: {...process.env, ...envOverrides},
		})`docker compose -p ${input.name} -f ${composePath} up -d`
	} catch (err: any) {
		throw new Error(`[compose-error] Failed to deploy stack '${input.name}': ${err.stderr || err.message}`)
	}

	return {success: true, message: `Stack '${input.name}' deployed`, webhookSecret}
}

// Phase 21 GIT-03 helpers — only git-backed stacks have rows in the `stacks` PG table.
export type GitStackRow = {
	name: string
	gitUrl: string
	gitBranch: string
	gitCredentialId: string | null
	composePath: string
	webhookSecret: string
	lastSyncedSha: string | null
}

export async function getGitStack(name: string): Promise<GitStackRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT name, git_url, git_branch, git_credential_id, compose_path,
				webhook_secret, last_synced_sha
		 FROM stacks WHERE name = $1`,
		[name],
	)
	if (rows.length === 0) return null
	const r = rows[0]
	return {
		name: r.name,
		gitUrl: r.git_url,
		gitBranch: r.git_branch,
		gitCredentialId: r.git_credential_id,
		composePath: r.compose_path,
		webhookSecret: r.webhook_secret,
		lastSyncedSha: r.last_synced_sha,
	}
}

export async function listGitStacks(): Promise<GitStackRow[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query(
		`SELECT name, git_url, git_branch, git_credential_id, compose_path,
				webhook_secret, last_synced_sha FROM stacks ORDER BY name ASC`,
	)
	return rows.map((r: any) => ({
		name: r.name,
		gitUrl: r.git_url,
		gitBranch: r.git_branch,
		gitCredentialId: r.git_credential_id,
		composePath: r.compose_path,
		webhookSecret: r.webhook_secret,
		lastSyncedSha: r.last_synced_sha,
	}))
}

export async function updateGitStackSyncSha(name: string, sha: string): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(
		`UPDATE stacks SET last_synced_sha = $1, last_synced_at = NOW(), updated_at = NOW() WHERE name = $2`,
		[sha, name],
	)
}

export async function editStack(input: {
	name: string
	composeYaml: string
	envVars?: StackEnvVarInput[]
}): Promise<{success: boolean; message: string}> {
	const stackDir = join(STACKS_DIR, input.name)

	if (!existsSync(stackDir)) {
		throw new Error(`[not-found] Stack '${input.name}' not found`)
	}

	const composePath = join(stackDir, 'docker-compose.yml')

	// Overwrite compose file
	await writeFile(composePath, input.composeYaml, 'utf-8')

	const allEnv = input.envVars ?? []
	const secretEntries = allEnv.filter((e) => e.secret)
	const plainEntries = allEnv.filter((e) => !e.secret)

	// Plain entries: same disk semantics as deployStack
	const envPath = join(stackDir, '.env')
	if (plainEntries.length > 0) {
		const envContent = plainEntries.map((e) => `${e.key}=${e.value}`).join('\n') + '\n'
		await writeFile(envPath, envContent, 'utf-8')
	} else if (existsSync(envPath)) {
		await writeFile(envPath, '', 'utf-8')
	}

	// Secret entries: incremental update — DO NOT deleteAll, otherwise
	// blank-value rows sent by the UI (meaning "keep existing secret as-is")
	// would wipe the stored value. Instead:
	//   1. Delete any stored secret NOT present in the submitted list.
	//   2. Only overwrite secrets whose submitted value is non-empty.
	const store = getStore()
	const existingKeys = await store.listSecretKeys(input.name)
	const submittedSecretKeys = new Set(secretEntries.map((e) => e.key))
	for (const k of existingKeys) {
		if (!submittedSecretKeys.has(k)) await store.deleteSecret(input.name, k)
	}
	for (const e of secretEntries) {
		if (e.value !== '') await store.setSecret(input.name, e.key, e.value)
	}

	// Inject secrets as shell env for compose up (see deployStack comment)
	const envOverrides = await store.getSecrets(input.name)
	try {
		await $({
			cwd: stackDir,
			env: {...process.env, ...envOverrides},
		})`docker compose -p ${input.name} -f ${composePath} up -d --remove-orphans`
	} catch (err: any) {
		throw new Error(`[compose-error] Failed to update stack '${input.name}': ${err.stderr || err.message}`)
	}

	return {success: true, message: `Stack '${input.name}' updated`}
}

export async function controlStack(
	name: string,
	operation: StackControlOperation,
): Promise<{success: boolean; message: string}> {
	const stackDir = join(STACKS_DIR, name)

	if (!existsSync(stackDir)) {
		throw new Error(`[not-found] Stack '${name}' not found`)
	}

	const composePath = join(stackDir, 'docker-compose.yml')

	// If this is a `up` (or `pull-and-up`), we also need to supply secret
	// overrides so containers that reference them still get them. Other
	// operations don't need them.
	const needsSecrets = operation === 'up' || operation === 'pull-and-up'
	const envOverrides = needsSecrets ? await getStore().getSecrets(name) : {}

	try {
		if (operation === 'pull-and-up') {
			// QW-03: pull latest images first, then recreate containers on new digest.
			// Pull is a network op (can be slow) — execa streams stderr to caller.
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} pull`
			await $({
				cwd: stackDir,
				env: {...process.env, ...envOverrides},
			})`docker compose -p ${name} -f ${composePath} up -d`
		} else if (operation === 'up') {
			await $({
				cwd: stackDir,
				env: {...process.env, ...envOverrides},
			})`docker compose -p ${name} -f ${composePath} up -d`
		} else {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} ${operation}`
		}
	} catch (err: any) {
		throw new Error(
			`[compose-error] Failed to ${operation} stack '${name}': ${err.stderr || err.message}`,
		)
	}

	return {success: true, message: `Stack '${name}' ${operation} completed`}
}

export async function removeStack(
	name: string,
	removeVolumes?: boolean,
): Promise<{success: boolean; message: string}> {
	const stackDir = join(STACKS_DIR, name)

	if (!existsSync(stackDir)) {
		throw new Error(`[not-found] Stack '${name}' not found`)
	}

	const composePath = join(stackDir, 'docker-compose.yml')

	try {
		if (removeVolumes) {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} down --volumes`
		} else {
			await $({cwd: stackDir})`docker compose -p ${name} -f ${composePath} down`
		}
	} catch (err: any) {
		throw new Error(
			`[compose-error] Failed to remove stack '${name}': ${err.stderr || err.message}`,
		)
	}

	// Purge encrypted secrets for this stack (best-effort) then remove directory
	await getStore()
		.deleteAll(name)
		.catch(() => {})
	await rm(stackDir, {recursive: true, force: true})

	// Phase 21 — also clean up git working tree + PG row for git-backed stacks.
	// Both are no-ops for YAML-only stacks (best-effort, never fail removeStack).
	await rm(join('/opt/livos/data/git', name), {recursive: true, force: true}).catch(() => {})
	const pool = getPool()
	if (pool) await pool.query(`DELETE FROM stacks WHERE name = $1`, [name]).catch(() => {})

	return {success: true, message: `Stack '${name}' removed`}
}

export async function getStackCompose(name: string): Promise<string> {
	const composePath = join(STACKS_DIR, name, 'docker-compose.yml')

	if (!existsSync(composePath)) {
		throw new Error(`[not-found] Stack '${name}' compose file not found`)
	}

	return readFile(composePath, 'utf-8')
}

// Return shape for a single env var as shown in the UI.
//
// - `secret=false, hasValue=true`: plain entry read from .env file
// - `secret=true,  hasValue=true, value=''`: stored-encrypted entry; value is
//   REDACTED (never round-tripped to the client). UI shows a placeholder and
//   only overwrites when user re-enters the value.
export type StackEnvVarListItem = {
	key: string
	value: string
	secret: boolean
	hasValue: boolean
}

export async function getStackEnv(name: string): Promise<StackEnvVarListItem[]> {
	const envPath = join(STACKS_DIR, name, '.env')
	const out: StackEnvVarListItem[] = []

	// 1. Plain entries from .env on disk
	if (existsSync(envPath)) {
		const content = await readFile(envPath, 'utf-8')
		for (const line of content.split('\n')) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith('#')) continue

			const eqIndex = trimmed.indexOf('=')
			if (eqIndex === -1) continue

			out.push({
				key: trimmed.slice(0, eqIndex),
				value: trimmed.slice(eqIndex + 1),
				secret: false,
				hasValue: true,
			})
		}
	}

	// 2. Secret keys from Redis — values are always redacted
	// convention: secrets shadow plain vars (if both .env and store have same
	// key, the secret entry is appended and takes precedence in the form UI).
	try {
		const secretKeys = await getStore().listSecretKeys(name)
		for (const k of secretKeys) {
			out.push({key: k, value: '', secret: true, hasValue: true})
		}
	} catch {
		// Redis unavailable — fall back to plain-only view rather than erroring
	}

	return out
}
