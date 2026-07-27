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

/**
 * Phase 368.8-10 — where kopia keeps its OWN state (not the backup data).
 *
 * kopia writes two things outside the repository it manages: a per-repository
 * `*.config` file and a content/metadata cache (plus its logs, under the cache).
 * livinityd pins both to fixed directories through XDG_CONFIG_HOME /
 * XDG_CACHE_HOME so every spawn shares them regardless of which HOME the
 * service unit happens to have.
 *
 * ⚠ REVERSAL — do NOT move this back to the root-owned `/kopia` tree.
 *
 * `/kopia` was created only by root (`update.sh` Step 1c and
 * `scripts/install/deploy-livinityd.sh`) and **nothing in this repo ever chowned
 * it**. livinityd runs as an unprivileged service user (systemd `User=`, Phase
 * 192) and spawns kopia with a plain execa — no sudo, no container — so every
 * spawn died before doing any work:
 *
 *   Unable to create logs directory: mkdir …/kopia: permission denied
 *   unable to write config file: … permission denied
 *
 * Measured on the operator's box 2026-07-26 on v1.1.13, whose run-user is uid
 * 1001: both directories were `root root`, and the config directory was EMPTY —
 * i.e. no kopia repository had ever been created there. USB, NAS, pool and the
 * 368.5 safety snapshots had all been silently failing since they shipped.
 *
 * `/opt/livos` is the tree livinityd already owns: `update.sh:4566-4568` chowns
 * it to the DERIVED run-user on every update, and livinityd already creates
 * children there itself (`SAFETY_REPO_PATH`, and `INTERNAL_BACKUP_ROOT` under
 * Route C / OP-05 — see destination-policy.ts:37-58 for that identical
 * reasoning). Putting kopia's state here means no installer is on the critical
 * path, so a box heals on the FIRST update rather than the one after it
 * (`update.sh` self-replaces via atomic mv, `:1884-1904`; hazard named in-tree
 * at `:4429-4435`).
 *
 * Verified safe: `/opt/livos/kopia` is NOT inside `dataDirectory`
 * (`/opt/livos/data`), so it is outside both the snapshot source and the
 * restore-wipe containment bound; and every `rsync --delete` in `update.sh`
 * targets a specific package subdirectory, never `$LIVOS_DIR` itself, so it
 * survives updates exactly as `/opt/livos/backups-local` already does.
 */
export const KOPIA_STATE_ROOT = '/opt/livos/kopia'
export const KOPIA_CONFIG_DIR = `${KOPIA_STATE_ROOT}/config`
export const KOPIA_CACHE_DIR = `${KOPIA_STATE_ROOT}/cache`

/**
 * The pre-368.8-10 location. Read-only, and referenced from exactly one place:
 * the one-time migration in `Backups#ensureKopiaStateDirs`. A box whose
 * livinityd once ran as root could hold working `*.config` files here, and
 * orphaning those would silently make its repositories unrestorable.
 */
export const LEGACY_KOPIA_STATE_ROOT = '/kopia'
export const LEGACY_KOPIA_CONFIG_DIR = `${LEGACY_KOPIA_STATE_ROOT}/config`

/**
 * The environment every kopia spawn receives. Pure — extracted so there is
 * exactly ONE place to assert about (engine.test.ts, "every kopia state path …
 * is under /opt/livos").
 */
export type KopiaSpawnEnv = {
	KOPIA_CHECK_FOR_UPDATES: string
	XDG_CACHE_HOME: string
	XDG_CONFIG_HOME: string
}

export function kopiaSpawnEnv(): KopiaSpawnEnv {
	return {
		KOPIA_CHECK_FOR_UPDATES: 'false',
		XDG_CACHE_HOME: KOPIA_CACHE_DIR,
		XDG_CONFIG_HOME: KOPIA_CONFIG_DIR,
	}
}

/**
 * Phase 368.8-15 — the argv that runs kopia under a pseudo-terminal.
 *
 * kopia only renders progress when its output is a terminal; spawned through a
 * pipe it emits nothing at all to parse (measured on a box: zero lines matching
 * `estimated`, zero matching `hashing`, across whole multi-minute runs). It has
 * no flag that forces it — `--progress` is already the default and does not
 * help, and 0.23.1 has no `--progress-interval` at the snapshot level. So the
 * terminal has to be real, and util-linux `script(1)` is the way to get one
 * without adding a native pty dependency.
 *
 * `script -qec CMD /dev/null` runs CMD on a pty, quietly, and `-e` returns
 * CMD's own exit status — so execa still fails the way it always did.
 *
 * CMD is ONE string handed to a shell, which makes quoting load-bearing rather
 * than cosmetic: repository paths contain an operator-typed folder name, so an
 * unquoted argument here would be shell injection reachable from the setup
 * wizard. Every argument is single-quoted with the POSIX escape, and that is
 * what engine.test.ts asserts.
 */
export function posixShellQuote(argument: string): string {
	// Close the quote, emit an escaped literal quote, reopen — the only way to
	// get a `'` inside a single-quoted POSIX string.
	return `'${argument.replaceAll("'", `'\\''`)}'`
}

export function kopiaPtyArgs(flags: string[]): string[] {
	return ['-qec', ['kopia', ...flags].map(posixShellQuote).join(' '), '/dev/null']
}

/**
 * Where `script(1)` lives, in probe order. Both are real on Debian-family
 * boxes depending on the merged-/usr state; a box with neither simply gets no
 * progress figure, never a failed backup.
 */
export const PTY_WRAPPER_CANDIDATES = ['/usr/bin/script', '/bin/script']

/**
 * The percentage out of one chunk of kopia's progress output, or undefined.
 *
 * A pty rewrites the progress line in place with `\r`, so a single chunk
 * routinely carries several frames; the LAST one is the only current one.
 * Character classes exclude `\r`/`\n` so a greedy `.` cannot span two frames
 * and read one frame's percentage against another's `left`.
 *
 * kopia prints `estimating...` — with no figure — until it has an estimate,
 * which on a first snapshot lasts a while. That yields undefined, i.e. "no
 * news", not zero.
 */
export function parseKopiaProgressPercent(output: string): number | undefined {
	const frames = [...output.matchAll(/estimated[^\r\n]*?\((\d+(?:\.\d+)?)%\)[^\r\n]*?left/g)]
	if (frames.length === 0) return undefined
	return Number(frames.at(-1)![1])
}

/**
 * The `--config-file=` argument for one repository. Pure.
 *
 * These files are cheap: kopia recreates one the next time we connect. They
 * still must live somewhere writable, because kopia refuses to run when it
 * cannot write the config it was told to use.
 */
export function kopiaConfigFile(repositoryId: string): string {
	return `${KOPIA_CONFIG_DIR}/${repositoryId}.config`
}

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

		// The kopia() wrapper points the XDG dirs at KOPIA_STATE_ROOT. Best-effort
		// here (this branch only runs as root); the authoritative, unprivileged
		// creator is Backups#ensureKopiaStateDirs, which runs before every spawn.
		await fs.mkdir(KOPIA_CONFIG_DIR, {recursive: true}).catch(() => {})
		await fs.mkdir(KOPIA_CACHE_DIR, {recursive: true}).catch(() => {})

		logger.log(`[engine] kopia ${KOPIA_VERSION} installed at ${KOPIA_INSTALL_PATH}`)
		return true
	} catch (error) {
		logger.error('[engine] kopia self-install failed (non-fatal — backups stay disabled until it succeeds)', error)
		return false
	} finally {
		if (temporaryDirectory) await fs.rm(temporaryDirectory, {recursive: true, force: true}).catch(() => {})
	}
}
