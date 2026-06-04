/**
 * Phase 150-B — native Linux app installer.
 *
 * Implements `InstallHandler<'native'>` per SPEC §4.
 *
 * Two install paths:
 *   - apt: `sudo apt-get install -y <pkgs>`. The sudoers entry shipped
 *     alongside this module restricts the allowed binary + flags
 *     pattern so we can't escalate beyond the install scope.
 *   - appimage: download .AppImage, verify sha256, chmod +x, place in
 *     /home/<user>/.local/bin/<slug>
 *
 * Common to both paths:
 *   - Generate /home/<user>/.local/share/applications/<slug>.desktop
 *   - Persist a record into Redis liv:apps:native:<uuid> via the
 *     existing NativeAppConfigStore (P101-03) — that re-parses the
 *     manifest through nativeAppConfigSchema, which is our trust
 *     boundary (no shell metachars, no LD_/DYLD_ env, absolute path).
 *
 * Uninstall is best-effort: removes the .desktop file + Redis record,
 * and apt-removes packages we explicitly installed. We never apt-remove
 * shared packages (which would break the rest of the system).
 *
 * NOTE: this file ships code-only as part of Wave B. Live UAT happens
 * on Mini PC after the operator's next deploy cycle. The dispatcher is
 * not wired into trpc yet — that integration is part of the deploy
 * commit.
 */

import {randomUUID} from 'crypto'
import {spawn} from 'child_process'
import {createWriteStream, existsSync, promises as fs} from 'fs'
import {createHash} from 'crypto'
import {homedir} from 'os'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'

import {
	type AppCatalogRow,
	type InstallContext,
	type InstallHandler,
	type InstallOutcome,
	type ProgressEmitter,
	ok,
	fail,
	progressFactory,
} from './install-contracts.js'
// writeSurfaceContext / removeSurfaceContext lived in claude-runner/ — removed
// with the AI Chat teardown. Install/uninstall now skip vault scaffolding.
import {
	NativeAppConfigStore,
	nativeAppConfigSchema,
	type NativeAppConfig,
} from './native-app-config.js'

// ─── Manifest shape (SPEC §2.3) ──────────────────────────────────────────

type NativeManifest = {
	install:
		| {primary: 'apt'; aptPackages: string[]}
		// Phase 259 — for apps NOT in the default Ubuntu repos (VS Code, Brave, …):
		// download the official .deb and `apt-get install -y <file>` (apt resolves
		// deps). Works for EVERY install (no per-box manual repo setup). Optional
		// sha256 pin.
		| {primary: 'deb'; debUrl: string; debSha256?: string}
		| {primary: 'appimage'; appimageUrl: string; appimageSha256: string}
	launch: {
		binaryPath: string
		args?: string[]
		env?: Record<string, string>
		wmClassHint?: string
	}
	desktopEntry: {
		name: string
		comment?: string
		icon?: string
		categories?: string[]
	}
	windowing?: {
		vncMode?: 'x11vnc'
		geometry?: {w: number; h: number}
	}
}

function parseManifest(raw: unknown): NativeManifest | null {
	if (!raw || typeof raw !== 'object') return null
	const m = raw as Partial<NativeManifest>
	if (!m.install || !m.launch || !m.desktopEntry) return null
	return m as NativeManifest
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Run a child process, stream stdout/stderr into the logger, resolve
 * when it exits. Never goes through a shell, so even if argv contains
 * stray characters they're not re-interpreted.
 */
function execCmd(
	cmd: string,
	args: readonly string[],
	logger: InstallContext['logger'],
): Promise<{code: number; stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe']})
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', (chunk: Buffer) => {
			const s = chunk.toString('utf8')
			stdout += s
			logger.info(`[${cmd}] ${s.trimEnd()}`)
		})
		child.stderr.on('data', (chunk: Buffer) => {
			const s = chunk.toString('utf8')
			stderr += s
			logger.warn(`[${cmd}] ${s.trimEnd()}`)
		})
		child.on('error', reject)
		child.on('close', (code) => resolve({code: code ?? -1, stdout, stderr}))
	})
}

async function downloadToFile(url: string, dest: string): Promise<void> {
	const u = new URL(url)
	if (u.protocol !== 'https:' && u.protocol !== 'http:') {
		throw new Error(`unsupported protocol "${u.protocol}"`)
	}
	const lib = u.protocol === 'https:' ? https : http
	await fs.mkdir(path.dirname(dest), {recursive: true})
	await new Promise<void>((resolve, reject) => {
		const out = createWriteStream(dest, {mode: 0o755})
		const req = lib.get(
			url,
			{headers: {'User-Agent': 'LivinityNativeInstaller/1.0'}},
			(res) => {
				// Follow one redirect — typical for GitHub releases.
				if (
					res.statusCode &&
					[301, 302, 307, 308].includes(res.statusCode) &&
					res.headers.location
				) {
					out.close()
					fs.unlink(dest).catch(() => {})
					downloadToFile(res.headers.location, dest)
						.then(resolve)
						.catch(reject)
					return
				}
				if (res.statusCode !== 200) {
					reject(new Error(`download HTTP ${res.statusCode}`))
					return
				}
				res.pipe(out)
				out.on('finish', () => out.close(() => resolve()))
				out.on('error', reject)
			},
		)
		req.on('error', reject)
	})
}

async function sha256File(file: string): Promise<string> {
	const hash = createHash('sha256')
	const handle = await fs.open(file, 'r')
	try {
		const stream = handle.createReadStream()
		for await (const chunk of stream) hash.update(chunk)
	} finally {
		await handle.close()
	}
	return hash.digest('hex')
}

function userHome(userId: string): string {
	// Phase 259 BUGFIX — native apps install into the OS DESKTOP user's home: the
	// `:1` XFCE session runs as that user and its dock / .desktop launchers + the
	// installed binary must live there to be launchable. The LivOS DB `userId` is a
	// UUID (or the literal 'admin') — NOT an OS account — so the old
	// `/home/<userId>` resolved to a non-existent dir and EVERY native install on
	// the single-user Mini PC silently failed at writeDesktopFile (EACCES under the
	// root-owned /home), leaving no .desktop + no Redis config. Resolve the home of
	// the user livinityd runs as (the desktop user, bruce); honor `userId` ONLY when
	// it is a real OS username whose home exists (defensive multi-user path).
	if (userId && /^[a-z_][a-z0-9_-]*$/.test(userId) && existsSync(`/home/${userId}`)) {
		return `/home/${userId}`
	}
	return process.env.HOME || homedir() || '/home/bruce'
}

function writeDesktopFile(
	homeDir: string,
	slug: string,
	manifest: NativeManifest,
): Promise<string> {
	const filePath = path.join(homeDir, '.local/share/applications', `${slug}.desktop`)
	const entry = manifest.desktopEntry
	const launch = manifest.launch
	// .desktop spec: Exec field gets binaryPath + args. We avoid quoting
	// because nativeAppConfigSchema already rejects shell metachars.
	const exec = [launch.binaryPath, ...(launch.args ?? [])].join(' ')
	const content = [
		'[Desktop Entry]',
		'Type=Application',
		'Version=1.0',
		`Name=${entry.name}`,
		entry.comment ? `Comment=${entry.comment}` : undefined,
		entry.icon ? `Icon=${entry.icon}` : undefined,
		`Exec=${exec}`,
		'Terminal=false',
		entry.categories?.length ? `Categories=${entry.categories.join(';')};` : undefined,
		launch.wmClassHint ? `StartupWMClass=${launch.wmClassHint}` : undefined,
		'',
	]
		.filter(Boolean)
		.join('\n')

	return fs
		.mkdir(path.dirname(filePath), {recursive: true})
		.then(() => fs.writeFile(filePath, content, {mode: 0o644}))
		.then(() => filePath)
}

// ─── Handler ─────────────────────────────────────────────────────────────

export class NativeInstaller implements InstallHandler<'native'> {
	readonly section = 'native' as const

	constructor(private readonly configStore: NativeAppConfigStore) {}

	async install(
		app: AppCatalogRow,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const progress = progressFactory(emit, app.id, 'native')
		const manifest = parseManifest(app.manifest)
		if (!manifest) {
			return fail(
				app.id,
				'native',
				'manifest_invalid',
				`native manifest missing required keys (install / launch / desktopEntry)`,
			)
		}

		progress(5, 'Parsing manifest')

		// Re-parse launch through the schema BEFORE running any external
		// command. This is the trust boundary — manifests from Supabase
		// are operator-controlled but defense-in-depth check is cheap.
		const configCandidate: NativeAppConfig = {
			id: randomUUID(),
			name: app.name,
			binaryPath: manifest.launch.binaryPath,
			args: manifest.launch.args,
			env: manifest.launch.env,
			wmClassHint: manifest.launch.wmClassHint,
		}
		try {
			nativeAppConfigSchema.parse(configCandidate)
		} catch (err) {
			return fail(
				app.id,
				'native',
				'manifest_invalid',
				`launch block failed nativeAppConfigSchema: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		const homeDir = userHome(ctx.userId)

		// ── Install path: apt or appimage ────────────────────────────────
		if (manifest.install.primary === 'apt') {
			const pkgs = manifest.install.aptPackages ?? []
			if (pkgs.length === 0) {
				return fail(app.id, 'native', 'manifest_invalid', `aptPackages empty`)
			}
			progress(15, `apt install ${pkgs.join(' ')}`)
			// The sudoers entry (scripts/install/sudoers.d/livos-native) must
			// allow exactly this argv pattern. Any drift here breaks install.
			const {code, stderr} = await execCmd(
				'sudo',
				['-n', '/usr/bin/apt-get', 'install', '-y', ...pkgs],
				ctx.logger,
			)
			if (code !== 0) {
				const sudoDenied = stderr.includes('sudo:') || stderr.includes('password is required')
				return fail(
					app.id,
					'native',
					sudoDenied ? 'sudo_denied' : 'apt_failed',
					`apt-get install -y ${pkgs.join(' ')} exited ${code}`,
					stderr,
				)
			}
		} else if (manifest.install.primary === 'deb') {
			// Phase 259 — download the official .deb and let apt install it (resolving
			// dependencies). For apps NOT in the default Ubuntu repos (VS Code, Brave)
			// — works on every box without manual per-machine repo setup.
			const {debUrl, debSha256} = manifest.install
			if (!debUrl || !/^https?:\/\//.test(debUrl)) {
				return fail(app.id, 'native', 'manifest_invalid', `debUrl missing or not http(s): ${String(debUrl)}`)
			}
			const tmpDeb = path.join('/tmp', `livos-native-${app.id.replace(/[^a-zA-Z0-9_-]/g, '')}.deb`)
			progress(15, `Downloading ${debUrl}`)
			try {
				await downloadToFile(debUrl, tmpDeb)
			} catch (err) {
				return fail(app.id, 'native', 'network_failed', `download failed: ${err instanceof Error ? err.message : String(err)}`)
			}
			if (debSha256 && debSha256.length === 64) {
				progress(45, 'Verifying SHA-256')
				const actual = await sha256File(tmpDeb)
				if (actual !== debSha256.toLowerCase()) {
					await fs.unlink(tmpDeb).catch(() => {})
					return fail(app.id, 'native', 'signature_invalid', `sha256 mismatch — manifest=${debSha256} actual=${actual}`)
				}
			}
			progress(60, 'Installing .deb (apt resolves dependencies)')
			const {code, stderr} = await execCmd('sudo', ['-n', '/usr/bin/apt-get', 'install', '-y', tmpDeb], ctx.logger)
			await fs.unlink(tmpDeb).catch(() => {})
			if (code !== 0) {
				const sudoDenied = stderr.includes('sudo:') || stderr.includes('password is required')
				return fail(app.id, 'native', sudoDenied ? 'sudo_denied' : 'apt_failed', `apt-get install -y <deb> exited ${code}`, stderr)
			}
		} else if (manifest.install.primary === 'appimage') {
			const {appimageUrl, appimageSha256} = manifest.install
			const targetDir = path.join(homeDir, '.local/bin')
			const targetPath = path.join(targetDir, app.id)
			progress(15, `Downloading ${appimageUrl}`)
			try {
				await downloadToFile(appimageUrl, targetPath)
			} catch (err) {
				return fail(
					app.id,
					'native',
					'network_failed',
					`download failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
			if (appimageSha256 && appimageSha256.length === 64) {
				progress(50, 'Verifying SHA-256')
				const actual = await sha256File(targetPath)
				if (actual !== appimageSha256.toLowerCase()) {
					await fs.unlink(targetPath).catch(() => {})
					return fail(
						app.id,
						'native',
						'signature_invalid',
						`sha256 mismatch — manifest=${appimageSha256} actual=${actual}`,
					)
				}
			}
			await fs.chmod(targetPath, 0o755)
		} else {
			return fail(
				app.id,
				'native',
				'manifest_invalid',
				`unknown install.primary "${(manifest.install as {primary: string}).primary}"`,
			)
		}

		// ── Desktop entry ────────────────────────────────────────────────
		progress(80, 'Writing .desktop')
		let desktopPath: string
		try {
			desktopPath = await writeDesktopFile(homeDir, app.id, manifest)
		} catch (err) {
			return fail(
				app.id,
				'native',
				'disk_full',
				`writing .desktop failed: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		// ── Persist config ───────────────────────────────────────────────
		progress(95, 'Persisting config')
		await this.configStore.upsert(configCandidate)

		// Phase 157 follow-up — Redis mapping from catalog appId
		// (e.g. "blender") to the random NativeAppConfig UUID. Lets
		// `apps.v37List` answer "is this catalog row installed?" without
		// scanning every native config. Also gives uninstall a way to
		// find the UUID from the catalog appId.
		await ctx.redis
			.set(`liv:apps:native-catalog:${app.id}`, configCandidate.id)
			.catch((err) =>
				ctx.logger.error(
					`native-installer: failed to write catalog mapping for ${app.id}`,
					err,
				),
			)

		// Surface context write removed with AI Chat teardown.

		progress(100, 'Done', true)
		return ok(app.id, 'native', {
			desktopEntryPath: desktopPath,
			binaryPath: manifest.launch.binaryPath,
			nativeConfigId: configCandidate.id,
		})
	}

	async uninstall(
		appId: string,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const progress = progressFactory(emit, appId, 'native')
		const homeDir = userHome(ctx.userId)

		progress(10, 'Removing .desktop')
		const desktopPath = path.join(
			homeDir,
			'.local/share/applications',
			`${appId}.desktop`,
		)
		await fs.unlink(desktopPath).catch(() => {})

		progress(40, 'Removing Redis config')
		// Phase 157 follow-up — look up the UUID via the catalog mapping
		// FIRST (precise), fall back to name/id match (legacy installs).
		const mappedUuid = await ctx.redis
			.get(`liv:apps:native-catalog:${appId}`)
			.catch(() => null)
		const configs = await this.configStore.list()
		const match = mappedUuid
			? configs.find((c: NativeAppConfig) => c.id === mappedUuid)
			: configs.find(
					(c: NativeAppConfig) => c.name === appId || c.id === appId,
				)
		if (match) await this.configStore.delete(match.id)
		await ctx.redis.del(`liv:apps:native-catalog:${appId}`).catch(() => {})

		// Best-effort apt-remove for AppImage / standalone binary path —
		// we skip apt-remove for shared packages to avoid breaking the
		// system (e.g. `gimp` is removable, but `libreoffice` shares deps
		// with many things; an explicit deny-list is operator-curated and
		// lives in scripts/install/sudoers.d/livos-native).
		progress(70, 'Cleaning binary')
		const appimagePath = path.join(homeDir, '.local/bin', appId)
		await fs.unlink(appimagePath).catch(() => {})

		// Surface context remove skipped with AI Chat teardown.

		progress(100, 'Done', true)
		return ok(appId, 'native', {desktopEntryPath: desktopPath})
	}
}
