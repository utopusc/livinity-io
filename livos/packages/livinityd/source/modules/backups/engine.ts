import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {execa} from 'execa'

/**
 * Backups v2 P0 (2026-07-12) — the kopia engine preflight + self-heal.
 *
 * The backups module shells out to `kopia`, but nothing ever installed it:
 * umbrelOS ships kopia inside their OS image while LivOS runs livinityd on
 * stock Ubuntu, so every backup attempt since launch died with ENOENT — and
 * died SILENTLY (zero repositories ⇒ the interval loop no-ops without error).
 *
 * Two install paths keep every box covered:
 *   1. scripts/install/deploy-livinityd.sh installs the pinned release on
 *      fresh installs / deploys that source it.
 *   2. `installEngine()` below is the boot-time self-heal for boxes whose
 *      update path never runs the deploy script: pinned version, sha256
 *      verified, atomic rename into /usr/local/bin.
 *
 * Version is pinned ≥ 0.23.1 — the epoch-manager race fixed in 0.23.1
 * (kopia/kopia#5371) is a data-loss class bug, so older engines are treated
 * as unavailable, not merely old.
 */

export const KOPIA_VERSION = '0.23.1'
export const KOPIA_MINIMUM_VERSION = '0.23.1'

const KOPIA_INSTALL_PATH = '/usr/local/bin/kopia'

// sha256 of the official release tarballs (github.com/kopia/kopia v0.23.1 checksums.txt)
const KOPIA_SHA256: Record<string, string> = {
	x64: '416d0f84a3dbb321a8b2d8f0997b1a0a6e915babe79ee76fa6e4d2bd1e1c5178',
	arm64: 'a4ffbc019e0b0f932e2632054e73ec521dc1e80172a00095369c53ecf4e5a6cb',
}

export type EngineStatus = {
	available: boolean
	reason?: 'missing' | 'outdated' | 'unknown'
	version?: string
	minimumVersion: string
}

export interface EngineLogger {
	log: (message: string) => void
	error: (message: string, error?: unknown) => void
}

/** First token of `kopia --version` output ("0.23.1 build: ..." → "0.23.1"). */
export function parseKopiaVersion(output: string): string | undefined {
	const token = output.trim().split(/\s+/)[0]?.replace(/^v/, '')
	if (!token || !/^\d+(\.\d+)*/.test(token)) return undefined
	return token
}

/** Numeric dotted-version compare; non-numeric segments count as 0. */
export function isVersionAtLeast(version: string, minimum: string): boolean {
	const parse = (v: string) => v.split('.').map((part) => Number.parseInt(part, 10) || 0)
	const a = parse(version)
	const b = parse(minimum)
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const diff = (a[i] ?? 0) - (b[i] ?? 0)
		if (diff !== 0) return diff > 0
	}
	return true
}

/** Probe the installed kopia binary. Never throws. */
export async function detectEngine(): Promise<EngineStatus> {
	try {
		const {stdout} = await execa('kopia', ['--version'], {env: {KOPIA_CHECK_FOR_UPDATES: 'false'}})
		const version = parseKopiaVersion(stdout)
		if (!version) return {available: false, reason: 'unknown', minimumVersion: KOPIA_MINIMUM_VERSION}
		if (!isVersionAtLeast(version, KOPIA_MINIMUM_VERSION)) {
			return {available: false, reason: 'outdated', version, minimumVersion: KOPIA_MINIMUM_VERSION}
		}
		return {available: true, version, minimumVersion: KOPIA_MINIMUM_VERSION}
	} catch {
		return {available: false, reason: 'missing', minimumVersion: KOPIA_MINIMUM_VERSION}
	}
}

async function sha256File(filePath: string): Promise<string> {
	const hash = createHash('sha256')
	for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
	return hash.digest('hex')
}

/**
 * Download + verify + atomically install the pinned kopia release.
 * Returns true on success. Never throws — a failed install leaves the box
 * exactly as it was and the engine-unavailable state stays visible.
 */
export async function installEngine(logger: EngineLogger): Promise<boolean> {
	if (process.platform !== 'linux') return false

	// livinityd runs as an unprivileged service user (Phase 192) and cannot
	// write /usr/local/bin — attempting the install would download ~20MB and
	// then EACCES on every retry. Skip cleanly and defer to the root install
	// paths (deploy-livinityd.sh on fresh installs, update.sh Step 1c on
	// existing boxes — both reached by the normal "Update LivOS" flow).
	if (typeof process.getuid === 'function' && process.getuid() !== 0) {
		logger.log('[engine] kopia missing and livinityd is not root — deferring install to the next LivOS update (update.sh runs as root)')
		return false
	}

	const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : undefined
	if (!arch) {
		logger.error(`[engine] unsupported arch ${process.arch} — cannot self-install kopia`)
		return false
	}

	const expectedSha = KOPIA_SHA256[arch]
	const url = `https://github.com/kopia/kopia/releases/download/v${KOPIA_VERSION}/kopia-${KOPIA_VERSION}-linux-${arch}.tar.gz`
	let temporaryDirectory: string | undefined
	try {
		temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kopia-install-'))
		const tarball = path.join(temporaryDirectory, 'kopia.tgz')

		logger.log(`[engine] downloading kopia ${KOPIA_VERSION} (${arch})`)
		await execa('curl', ['-fsSL', '--retry', '3', '-o', tarball, url])

		const actualSha = await sha256File(tarball)
		if (actualSha !== expectedSha) {
			logger.error(`[engine] sha256 mismatch for ${url} — expected ${expectedSha}, got ${actualSha}; NOT installing`)
			return false
		}

		await execa('tar', ['-xzf', tarball, '-C', temporaryDirectory])
		const binary = path.join(temporaryDirectory, `kopia-${KOPIA_VERSION}-linux-${arch}`, 'kopia')

		// Atomic install: copy next to the destination, chmod, rename over.
		const staged = `${KOPIA_INSTALL_PATH}.tmp-${process.pid}`
		await fs.mkdir(path.dirname(KOPIA_INSTALL_PATH), {recursive: true})
		await fs.copyFile(binary, staged)
		await fs.chmod(staged, 0o755)
		await fs.rename(staged, KOPIA_INSTALL_PATH)

		// The kopia() wrapper points XDG dirs at /kopia/{config,cache}
		await fs.mkdir('/kopia/config', {recursive: true}).catch(() => {})
		await fs.mkdir('/kopia/cache', {recursive: true}).catch(() => {})

		logger.log(`[engine] kopia ${KOPIA_VERSION} installed at ${KOPIA_INSTALL_PATH}`)
		return true
	} catch (error) {
		logger.error('[engine] kopia self-install failed (non-fatal — backups stay disabled until it succeeds)', error)
		return false
	} finally {
		if (temporaryDirectory) await fs.rm(temporaryDirectory, {recursive: true, force: true}).catch(() => {})
	}
}
