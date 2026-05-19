// Phase 162-01 — Vault scaffolder (master plan D-V34-D).
//
// Idempotent boot-time bootstrap of the LivOS↔Claude Code vault filesystem at
// /home/bruce/livinity-vault/. Materialises the bundled template tree from
// `livos/packages/livinityd/source/data/vault-templates/` into the target
// vault path WITHOUT overwriting any user-edited files (fs.cp force:false).
//
// Permission model: chown -R bruce:bruce + 0755 dirs / 0644 files. When the
// chown spawn fails (e.g. running as a non-root CI user), the function logs a
// warning and returns `partial` — boot continues normally; the operator can
// fix ownership manually later.
//
// Non-fatal contract: this module NEVER throws. All recoverable errors are
// reflected in the ScaffoldResult discriminator + the logger callback. The
// caller (livinityd start()) does its own try/catch around scaffoldVault()
// purely as a defence-in-depth (against bugs that could leak unexpected
// throws), but the production happy path is fully captured by the return
// value.

import {access, cp, mkdir, readdir, stat, chmod, writeFile} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export interface ScaffoldVaultOptions {
	vaultPath: string
	templatesDir?: string
	ownerUser?: string
	ownerGroup?: string
	logger?: {
		log: (msg: string) => void
		error: (msg: string, err?: unknown) => void
	}
}

export type ScaffoldResult =
	| {status: 'scaffolded'; created: string[]}
	| {status: 'existing'; preserved: string[]}
	| {status: 'partial'; created: string[]; preserved: string[]}
	| {status: 'failed-non-fatal'; reason: string}

const NOOP_LOGGER = {log: () => {}, error: () => {}}

/**
 * Default location of the bundled vault-templates tree (committed under
 * `livos/packages/livinityd/source/data/vault-templates/`).
 *
 * Resolved relative to THIS module's path so the function locates the
 * templates regardless of process cwd. `import.meta.url` is preserved
 * through tsx for the source-on-disk codepath livinityd uses today.
 */
function defaultTemplatesDir(): string {
	const here = fileURLToPath(import.meta.url)
	// here = .../source/modules/claude-runner/vault-scaffolder.ts
	// templates = .../source/data/vault-templates
	return path.resolve(path.dirname(here), '..', '..', 'data', 'vault-templates')
}

/**
 * Walk a directory tree and return all entries as relative POSIX paths.
 * `isDir` is true for directories, false for files (including .gitkeep stubs).
 */
async function walkTree(root: string): Promise<Array<{rel: string; isDir: boolean}>> {
	const out: Array<{rel: string; isDir: boolean}> = []
	async function recurse(dir: string, prefix: string): Promise<void> {
		const entries = await readdir(dir, {withFileTypes: true})
		for (const ent of entries) {
			const childRel = prefix ? `${prefix}/${ent.name}` : ent.name
			const childAbs = path.join(dir, ent.name)
			if (ent.isDirectory()) {
				out.push({rel: childRel, isDir: true})
				await recurse(childAbs, childRel)
			} else if (ent.isFile()) {
				out.push({rel: childRel, isDir: false})
			}
		}
	}
	await recurse(root, '')
	return out
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await access(p)
		return true
	} catch {
		return false
	}
}

export async function scaffoldVault(opts: ScaffoldVaultOptions): Promise<ScaffoldResult> {
	const logger = opts.logger ?? NOOP_LOGGER
	const templatesDir = opts.templatesDir ?? defaultTemplatesDir()
	const ownerUser = opts.ownerUser ?? 'bruce'
	const ownerGroup = opts.ownerGroup ?? 'bruce'
	const vaultPath = opts.vaultPath

	// Templates dir guard — without templates we cannot do anything useful.
	if (!(await pathExists(templatesDir))) {
		const reason = `templates dir not found at ${templatesDir}`
		logger.error(`vault-scaffolder: ${reason}`)
		return {status: 'failed-non-fatal', reason}
	}

	// Build the expected tree from the templates source.
	let templateEntries: Array<{rel: string; isDir: boolean}>
	try {
		templateEntries = await walkTree(templatesDir)
	} catch (err) {
		const reason = `failed to walk templates dir: ${(err as Error).message}`
		logger.error(`vault-scaffolder: ${reason}`, err)
		return {status: 'failed-non-fatal', reason}
	}

	const created: string[] = []
	const preserved: string[] = []

	try {
		// Ensure the vault root exists.
		await mkdir(vaultPath, {recursive: true})

		// Pre-flight — record which template paths ALREADY exist at the target
		// before any copy. This is the only reliable way to attribute
		// `created` vs `preserved` because `fs.cp force:false` reports
		// nothing about which entries it skipped.
		const preExistingFiles = new Set<string>()
		for (const ent of templateEntries) {
			if (ent.isDir) continue
			const targetPath = path.join(vaultPath, ent.rel)
			if (await pathExists(targetPath)) {
				preExistingFiles.add(ent.rel)
			}
		}

		// Phase 1 — idempotent file copy. `force: false` is THE idempotency
		// guarantee: pre-existing files at the destination are skipped silently
		// (no overwrites of user edits). `errorOnExist: false` keeps cp from
		// raising on those skipped paths.
		await cp(templatesDir, vaultPath, {
			recursive: true,
			force: false,
			errorOnExist: false,
		})

		// Phase 2 — walk the template entries and verify each target path
		// exists. For any template path that is STILL missing at the target
		// (e.g. the user deleted a directory between runs), recreate it.
		// For directories, also recreate any .gitkeep stub if missing.
		for (const ent of templateEntries) {
			const targetPath = path.join(vaultPath, ent.rel)
			if (ent.isDir) {
				if (!(await pathExists(targetPath))) {
					await mkdir(targetPath, {recursive: true})
					created.push(ent.rel)
				}
			} else {
				if (!(await pathExists(targetPath))) {
					// The template has a file the target is missing AFTER cp
					// (rare — usually means cp also failed to create the
					// containing dir). Recreate from the template source.
					const srcPath = path.join(templatesDir, ent.rel)
					await mkdir(path.dirname(targetPath), {recursive: true})
					const srcContents = await (await import('node:fs/promises')).readFile(srcPath)
					await writeFile(targetPath, srcContents)
					created.push(ent.rel)
				} else if (preExistingFiles.has(ent.rel)) {
					// File existed BEFORE the cp — user-edit-preserved path.
					preserved.push(ent.rel)
				} else {
					// File did NOT exist before cp but exists now — newly
					// created by cp in this scaffold run.
					created.push(ent.rel)
				}
			}
		}

		// Phase 3 — permission hygiene. Walk the destination tree once for
		// chmod (cheap, in-process). chown requires a privileged process; we
		// shell out once for the recursive run and tolerate failure when the
		// scaffolder is invoked as a non-root user (tests, dev boxes, CI).
		const targetEntries = await walkTree(vaultPath)
		for (const ent of targetEntries) {
			const abs = path.join(vaultPath, ent.rel)
			try {
				await chmod(abs, ent.isDir ? 0o755 : 0o644)
			} catch (err) {
				// chmod failure is non-fatal (e.g. CIFS/Windows test mount has
				// limited permission model). Log + continue.
				logger.error(`vault-scaffolder: chmod failed on ${abs}`, err)
			}
		}
		// Also chmod the vault root itself.
		try {
			await chmod(vaultPath, 0o755)
		} catch (err) {
			logger.error(`vault-scaffolder: chmod failed on root ${vaultPath}`, err)
		}

		// chown only attempted when running as root (uid 0). Otherwise skip
		// silently — non-root users cannot chown to bruce:bruce on Linux and
		// the platform doesn't support chown semantics on Windows anyway.
		let chownOk = true
		const uid = typeof process.getuid === 'function' ? process.getuid() : -1
		if (uid === 0) {
			try {
				await execFileAsync('chown', ['-R', `${ownerUser}:${ownerGroup}`, vaultPath])
			} catch (err) {
				chownOk = false
				logger.error(`vault-scaffolder: chown -R ${ownerUser}:${ownerGroup} failed`, err)
			}
		}

		// Status discriminator: scaffolded (everything new) / existing (nothing
		// new) / partial (some new, some preserved, OR chown failed).
		const allFresh = preserved.length === 0
		const allExisting = created.length === 0
		let status: ScaffoldResult['status']
		if (!chownOk) {
			status = 'partial'
		} else if (allFresh) {
			status = 'scaffolded'
		} else if (allExisting) {
			status = 'existing'
		} else {
			status = 'partial'
		}

		logger.log(
			`vault-scaffolder: ${status} — ${created.length} new files, ${preserved.length} preserved existing`,
		)

		if (status === 'scaffolded') return {status: 'scaffolded', created}
		if (status === 'existing') return {status: 'existing', preserved}
		return {status: 'partial', created, preserved}
	} catch (err) {
		const reason = `unexpected error during scaffold: ${(err as Error).message}`
		logger.error(`vault-scaffolder: ${reason}`, err)
		return {status: 'failed-non-fatal', reason}
	}
}

// Re-export of stat for any future consumers; left out of the public surface
// to keep the API minimal. Internal use only.
export const _internal = {walkTree, pathExists, defaultTemplatesDir}
// `stat` import is used by the test file to assert mode bits in future.
// Kept here as a re-export to avoid a separate import chain.
export {stat as _statForTests}
