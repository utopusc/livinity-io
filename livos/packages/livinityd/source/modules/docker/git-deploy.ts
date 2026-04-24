import {mkdir, writeFile, readFile, copyFile, rm, stat} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'
import {tmpdir} from 'node:os'

import {simpleGit, type SimpleGit} from 'simple-git'

import {decryptCredentialData} from './git-credentials.js'

/**
 * Git deploy module (Phase 21 GIT-02).
 *
 * Single-purpose helpers for cloning, pulling, and copying compose files from
 * git repos. Uses the system `git` binary via simple-git for blobless clones
 * (`--filter=blob:none --depth=1`) — minimal disk footprint and fast on push
 * webhooks.
 *
 * Storage layout:
 *   /opt/livos/data/git/<name>/                    — git working tree (this module)
 *   /opt/livos/data/stacks/<name>/docker-compose.yml — compose file (read by `docker compose`)
 *
 * Auth (decrypted at runtime, cleaned up immediately):
 *   - HTTPS: GIT_ASKPASS pointing to a temp shell script that echos username/PAT
 *   - SSH:   GIT_SSH_COMMAND with -i pointing to a temp keyfile (mode 0o600)
 */

const GIT_DIR = '/opt/livos/data/git'

export interface GitDeployConfig {
	url: string
	branch: string
	credentialId?: string | null
	composePath?: string // default 'docker-compose.yml'
}

export interface SyncResult {
	changed: boolean // HEAD moved?
	oldSha: string | null
	newSha: string
}

/**
 * Build env + auth helpers for a clone/pull op. For HTTPS, uses GIT_ASKPASS;
 * for SSH, writes a temp keyfile and points GIT_SSH_COMMAND at it. Caller MUST
 * await the returned `cleanup()` function (deletes temp files) when done.
 */
async function buildAuth(credentialId?: string | null): Promise<{
	env: NodeJS.ProcessEnv
	cleanup: () => Promise<void>
}> {
	if (!credentialId) {
		return {env: {}, cleanup: async () => {}}
	}
	const cred = await decryptCredentialData(credentialId)
	if (!cred) throw new Error(`[credential-not-found] credential ${credentialId} not found`)

	if (cred.type === 'https') {
		const data = cred.data as {username: string; password: string}
		// Write a tiny shell script that echos the credentials — referenced by GIT_ASKPASS.
		// Git invokes the script with the prompt as $1; we match on "Username" vs anything else.
		const askPath = join(tmpdir(), `livos-askpass-${randomBytes(8).toString('hex')}.sh`)
		const script = `#!/bin/sh\ncase "$1" in\n  Username*) echo "${data.username.replace(/"/g, '\\"')}" ;;\n  *) echo "${data.password.replace(/"/g, '\\"')}" ;;\nesac\n`
		await writeFile(askPath, script, {mode: 0o700})
		return {
			env: {GIT_ASKPASS: askPath, GIT_TERMINAL_PROMPT: '0'},
			cleanup: async () => {
				await rm(askPath, {force: true})
			},
		}
	} else {
		// ssh
		const data = cred.data as {privateKey: string}
		const keyPath = join(tmpdir(), `livos-sshkey-${randomBytes(8).toString('hex')}`)
		await writeFile(keyPath, data.privateKey, {mode: 0o600})
		return {
			env: {
				GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes`,
			},
			cleanup: async () => {
				await rm(keyPath, {force: true})
			},
		}
	}
}

/**
 * Clone (blobless) if not present, otherwise fetch + reset to origin/branch.
 * Returns the working-tree path. Idempotent.
 *
 * Blobless clone (GIT-02): --filter=blob:none --depth=1 --branch <branch> --single-branch
 * minimises bandwidth + disk usage; objects are fetched on-demand if needed.
 */
export async function cloneOrPull(stackName: string, config: GitDeployConfig): Promise<string> {
	const repoDir = join(GIT_DIR, stackName)
	await mkdir(GIT_DIR, {recursive: true})

	const auth = await buildAuth(config.credentialId)

	try {
		if (!existsSync(join(repoDir, '.git'))) {
			// Fresh blobless clone
			const git: SimpleGit = simpleGit({baseDir: tmpdir()}).env({...process.env, ...auth.env})
			await git.clone(config.url, repoDir, [
				'--filter=blob:none',
				'--depth=1',
				'--branch',
				config.branch,
				'--single-branch',
			])
		} else {
			// Existing checkout — fetch + hard reset to origin/branch
			const git: SimpleGit = simpleGit({baseDir: repoDir}).env({...process.env, ...auth.env})
			await git.fetch('origin', config.branch, ['--depth=1'])
			await git.reset(['--hard', `origin/${config.branch}`])
		}
	} finally {
		await auth.cleanup()
	}

	return repoDir
}

/**
 * Run cloneOrPull and report whether HEAD changed.
 * `previousSha` is the sha stored in the stacks PG row (null on first run).
 */
export async function syncRepo(
	stackName: string,
	config: GitDeployConfig,
	previousSha: string | null,
): Promise<SyncResult> {
	const repoDir = await cloneOrPull(stackName, config)
	const git: SimpleGit = simpleGit({baseDir: repoDir})
	const newSha = (await git.revparse(['HEAD'])).trim()
	return {changed: previousSha !== newSha, oldSha: previousSha, newSha}
}

/**
 * Copy the compose file from the git working tree to /opt/livos/data/stacks/<name>/docker-compose.yml.
 * This is the file `docker compose` actually reads — keeps the existing YAML deploy path unchanged.
 */
export async function copyComposeToStackDir(
	stackName: string,
	composePath: string,
): Promise<string> {
	const repoDir = join(GIT_DIR, stackName)
	const sourceFile = join(repoDir, composePath)
	if (!existsSync(sourceFile)) {
		throw new Error(`[compose-not-found] ${composePath} not found in repo`)
	}
	// Verify it's a regular file (not a directory) — defense against malicious compose_path
	const st = await stat(sourceFile)
	if (!st.isFile()) throw new Error(`[bad-compose-path] ${composePath} is not a file`)

	const stackDir = join('/opt/livos/data/stacks', stackName)
	await mkdir(stackDir, {recursive: true})
	const destFile = join(stackDir, 'docker-compose.yml')
	await copyFile(sourceFile, destFile)
	return destFile
}

/**
 * Read the compose YAML directly from the git working tree (no copy). Used by
 * the syncRepo path when we need to detect whether the compose file itself changed.
 */
export async function readComposeFromRepo(
	stackName: string,
	composePath: string,
): Promise<string> {
	const sourceFile = join(GIT_DIR, stackName, composePath)
	if (!existsSync(sourceFile))
		throw new Error(`[compose-not-found] ${composePath} not found in repo`)
	return readFile(sourceFile, 'utf-8')
}
