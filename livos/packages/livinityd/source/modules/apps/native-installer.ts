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

// Phase 262-02 (LIVOS-055) — SSRF guard reused on EVERY download hop: blocks
// loopback/RFC1918/link-local (incl. 169.254.169.254 metadata)/ULA targets.
import {getDesktopHome} from '../system/desktop-user.js'
import {validateUrl} from '../webapps/url-validator.js'
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
// Phase 290-r6 — derive the installed app's tile by re-scanning host .desktop
// entries after a local .deb install (same parser the Native tab "Installed on
// this device" picker uses, so the binaryPath is realpath-gated identically).
import {
	scanHostApps,
	parseDesktopEntry,
	buildScannedApp,
	iconValueToUrl,
	type ScannedNativeApp,
} from './native-scanner.js'

// ─── Manifest shape (SPEC §2.3) ──────────────────────────────────────────

type NativeManifest = {
	install:
		| {primary: 'apt'; aptPackages: string[]}
		// Phase 259 — for apps NOT in the default Ubuntu repos (VS Code, Brave, …):
		// download the official .deb and `apt-get install -y <file>` (apt resolves
		// deps). Works for EVERY install (no per-box manual repo setup).
		// Phase 262-02 (LIVOS-045): sha256 pin is MANDATORY — fail-closed.
		| {primary: 'deb'; debUrl: string; debSha256: string}
		| {primary: 'appimage'; appimageUrl: string; appimageSha256: string}
		// Phase 259 (round 2) — for apps officially distributed via a 3rd-party APT
		// repo (Brave, Signal, Spotify, …): add the repo + signing key, then apt
		// install. The privileged work is done by a single allow-listed helper
		// (livos-add-apt-repo.sh) so sudoers stays tightly scoped.
		| {
				primary: 'apt-repo'
				aptPackages: string[]
				aptRepoName: string // [a-z0-9-] slug used for the keyring + list filenames
				aptRepoLine: string // e.g. "https://repo.example.com/ stable main"
				aptKeyUrl: string // https URL to the (armored or binary) signing key
				// Phase 262-02 (LIVOS-045): REQUIRED 40-hex full fingerprint of the
				// signing key. The downloaded key is verified against this pin BEFORE
				// the root-capable livos-add-apt-repo.sh helper is invoked.
				aptKeyFingerprint: string
		  }
		// Phase 259 (round 2) — for apps whose ONLY official Linux install is a
		// `curl … | bash` script that clones/builds locally (e.g. the official
		// Hermes Agent). The script is run as the unprivileged install user (bruce),
		// NEVER root — its blast radius is that user's account. stdin is closed so
		// any optional sudo/interactive prompt gets EOF and is skipped.
		// Phase 262-02 (LIVOS-045): sha256 pin is MANDATORY — fail-closed.
		| {primary: 'script'; scriptUrl: string; scriptArgs?: string[]; scriptSha256: string}
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

// Phase 259 — apt hardening for the headless Mini PC. `DEBIAN_FRONTEND` is
// preserved across `sudo` by the `env_keep` line in the livos-native sudoers
// file. `--force-confold` keeps existing config files on package upgrades so
// dpkg never opens an interactive conffile prompt that would hang the install.
const APT_ENV: Record<string, string> = {DEBIAN_FRONTEND: 'noninteractive'}
const APT_CONFOLD: readonly string[] = ['-o', 'Dpkg::Options::=--force-confold']

/**
 * Phase 290-r6 — the ONE definition of the apt argv that installs a LOCAL .deb
 * file (the deb-URL branch AND the new installLocalDeb helper share it, so the
 * sudoers-allowlisted shape never drifts between the two callers). `debPath` is
 * server-constructed (sanitized appId / randomUUID tmp name), and the `--`
 * end-of-options marker precedes it — belt-and-suspenders under the sudoers
 * `apt-get install -y *` wildcard so the path can never parse as an apt option.
 */
function aptInstallDebArgv(debPath: string): readonly string[] {
	return ['-n', '/usr/bin/apt-get', 'install', '-y', ...APT_CONFOLD, '--', debPath]
}
// Allow-listed helper (shipped via scripts/install/livos-add-apt-repo.sh) that does
// the privileged repo+key writes for the `apt-repo` install method. sudoers grants
// `bruce` NOPASSWD on exactly this path so the installer never needs broad root.
const LIVOS_ADD_APT_REPO = '/usr/local/lib/livos/livos-add-apt-repo.sh'

// Phase 290-r4 (INV-4) — apt prints "E: Unable to locate package <x>" (and exits
// 100) when a name isn't an apt package at all (e.g. `discord`, which ships as a
// .deb/Flatpak/Snap). Detect *only* that case from stderr — exit 100 ALSO covers
// dpkg-lock / broken-deps / repo-fetch failures, so we never blanket-map the code.
const APT_PKG_NOT_FOUND_RE =
	/Unable to locate package|Couldn't find any package|has no installation candidate|Package .* is not available/i
// Human, actionable message for the not-found case. Keep the literal pkg out of
// it (stderr still carries it in the InstallError cause arg for diagnostics).
const APT_PKG_NOT_FOUND_MESSAGE =
	'This package is not available via apt — it likely ships as a .deb, Flatpak, or Snap (not supported here yet). Try the "Installed on this device" picker, or add it as a Web or Terminal shortcut.'

// Redis key holding the platform API key (mirrors apps.ts REDIS_PLATFORM_API_KEY).
const REDIS_PLATFORM_API_KEY = 'livos:platform:api_key'

// ─── Phase 262-02 — fail-closed input validators (LIVOS-044/045/055) ─────

/**
 * LIVOS-044 — Debian package-name charset. Structurally rejects leading `-`
 * (apt `-o DPkg::Pre-Invoke` hook injection through the `apt-get install -y *`
 * NOPASSWD sudoers wildcard), `/` (local .deb paths), `=` (version pinning /
 * option syntax), whitespace, and `::` option syntax.
 */
export const APT_PACKAGE_RE = /^[a-z0-9][a-z0-9+._-]*$/

/** Returns an error message, or null when every element is a valid name. */
export function validateAptPackages(pkgs: string[]): string | null {
	if (!pkgs.length) return 'aptPackages empty'
	for (const p of pkgs) {
		if (!APT_PACKAGE_RE.test(p)) return `invalid apt package name: ${JSON.stringify(p)}`
	}
	return null
}

/** LIVOS-045 — checksums are MANDATORY: exactly 64 hex chars, fail-closed. */
export const SHA256_RE = /^[0-9a-f]{64}$/i

/** LIVOS-045 — apt-repo signing keys carry a REQUIRED 40-hex full fingerprint pin. */
export const GPG_FINGERPRINT_RE = /^[0-9a-f]{40}$/i

/**
 * LIVOS-045 — https-only host allowlist for EVERY artifact the native
 * installer downloads (scriptUrl / debUrl / appimageUrl / aptKeyUrl / the URL
 * token inside aptRepoLine). Seeded from the hosts the curated catalog
 * actually uses: GitHub release infrastructure (incl. the CDN hosts GitHub
 * 302s to) + the official vendor repo hosts of the Phase 259 catalog apps
 * (Brave / Signal / Spotify / VS Code / Chrome). Extend deliberately when a
 * new catalog row needs a new vendor host — never wildcard.
 */
export const NATIVE_DOWNLOAD_HOST_ALLOWLIST: ReadonlySet<string> = new Set([
	// GitHub releases + raw + the CDN hosts release downloads redirect to.
	'github.com',
	'objects.githubusercontent.com',
	'release-assets.githubusercontent.com',
	'raw.githubusercontent.com',
	// Vendor apt-repo / artifact hosts used by the curated native catalog.
	'brave-browser-apt-release.s3.brave.com', // Brave repo + key
	'updates.signal.org', // Signal repo + key
	'repository.spotify.com', // Spotify repo
	'download.spotify.com', // Spotify signing key
	'packages.microsoft.com', // VS Code repo + key
	'dl.google.com', // Chrome .deb / repo
])

/**
 * LIVOS-045/055 — returns an error message (string) when `raw` is not an
 * https URL on an allowlisted host; null when acceptable. Used both at
 * manifest-validation time (per install method) and on EVERY downloadToFile
 * redirect hop (no cross-host escape via redirect).
 */
export function assertAllowedDownloadUrl(raw: string): string | null {
	let u: URL
	try {
		u = new URL(raw)
	} catch {
		return `invalid download URL: ${JSON.stringify(raw)}`
	}
	if (u.protocol !== 'https:') {
		return `download URL must be https (got ${u.protocol.replace(':', '')}): ${raw}`
	}
	const host = u.hostname.toLowerCase()
	if (!NATIVE_DOWNLOAD_HOST_ALLOWLIST.has(host)) {
		return `download host not allowlisted: ${host}`
	}
	return null
}

/**
 * nativeAppConfigSchema's iconUrl gate accepts only http(s) URLs (parseable by
 * URL) or root-relative paths — NOT bare freedesktop icon names. Mirror it here
 * so we never store an iconUrl that would throw at parse().
 */
function isSchemaValidIconUrl(v: string): boolean {
	if (v.startsWith('/')) return /^\/[A-Za-z0-9_\-./]*$/.test(v)
	try {
		new URL(v)
		return true
	} catch {
		return false
	}
}

/**
 * Phase 259 — fetch the catalog row's hosted icon_url SERVER-SIDE so native tiles
 * show real artwork even when the store webapp (Server5) hasn't been redeployed to
 * forward iconUrl in the install postMessage. Same endpoint + api-key the Docker
 * installer uses (apps.ts:fetchPlatformTemplate). Best-effort: any failure → undefined.
 */
async function fetchCatalogIconUrl(
	slug: string,
	ctx: InstallContext,
): Promise<string | undefined> {
	try {
		const apiKey = await ctx.redis.get(REDIS_PLATFORM_API_KEY)
		if (!apiKey) return undefined
		const res = await fetch(`https://livinity.io/api/apps/${encodeURIComponent(slug)}`, {
			headers: {'X-Api-Key': apiKey},
		})
		if (!res.ok) return undefined
		const data = (await res.json()) as {icon_url?: unknown}
		return typeof data.icon_url === 'string' ? data.icon_url : undefined
	} catch {
		return undefined
	}
}

/**
 * Run a child process, stream stdout/stderr into the logger, resolve
 * when it exits. Never goes through a shell, so even if argv contains
 * stray characters they're not re-interpreted.
 */
function execCmd(
	cmd: string,
	args: readonly string[],
	logger: InstallContext['logger'],
	extraEnv?: Record<string, string>,
): Promise<{code: number; stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			stdio: ['ignore', 'pipe', 'pipe'],
			// Phase 259 — pass DEBIAN_FRONTEND=noninteractive (kept across sudo via the
			// env_keep in scripts/install/sudoers.d/livos-native) so apt never blocks on
			// a debconf/conffile prompt on the headless Mini PC (a prior silent hang/fail).
			...(extraEnv ? {env: {...process.env, ...extraEnv}} : {}),
		})
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

/**
 * Phase 262-02 (LIVOS-055) — hardened downloader. https-only, SSRF-checked
 * (validateUrl: loopback/RFC1918/link-local/metadata/ULA rejected), host
 * allowlisted — re-validated at function entry AND on EVERY redirect hop
 * (each hop recurses through this entry), with the redirect chain capped.
 */
async function downloadToFile(url: string, dest: string, redirectsLeft = 5): Promise<void> {
	const u = new URL(url)
	if (u.protocol !== 'https:') {
		throw new Error(`unsupported protocol "${u.protocol}" — https only`)
	}
	const ssrf = validateUrl(url, {isAdmin: false})
	if (!ssrf.ok) {
		throw new Error(`download URL rejected (${ssrf.code}): ${ssrf.reason}`)
	}
	const allowErr = assertAllowedDownloadUrl(url)
	if (allowErr) {
		throw new Error(`download URL rejected: ${allowErr}`)
	}
	await fs.mkdir(path.dirname(dest), {recursive: true})
	await new Promise<void>((resolve, reject) => {
		const out = createWriteStream(dest, {mode: 0o755})
		const req = https.get(
			url,
			{headers: {'User-Agent': 'LivinityNativeInstaller/1.0'}},
			(res) => {
				// Follow redirects (typical for GitHub releases) — capped, and every
				// hop re-enters downloadToFile, re-running the scheme + SSRF + host
				// allowlist checks above (no https→http downgrade, no private-target
				// or cross-host escape via redirect).
				if (
					res.statusCode &&
					[301, 302, 307, 308].includes(res.statusCode) &&
					res.headers.location
				) {
					out.close()
					fs.unlink(dest).catch(() => {})
					if (redirectsLeft <= 0) {
						reject(new Error('too many redirects'))
						return
					}
					let next: string
					try {
						// Resolve relative Location headers against the current URL.
						next = new URL(res.headers.location, url).toString()
					} catch {
						reject(new Error(`invalid redirect location: ${String(res.headers.location)}`))
						return
					}
					downloadToFile(next, dest, redirectsLeft - 1)
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
	// Phase 278: final fallback derives from the desktop user (getDesktopHome),
	// not a hardcoded /home/bruce — correct on any operator's box.
	return process.env.HOME || homedir() || getDesktopHome()
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

	/**
	 * Phase 262-02 (LIVOS-044) — the ONE fixed apt-install spawn for the apt +
	 * apt-repo branches. Every flag is a pinned constant; callers supply ONLY
	 * pre-validated (APT_PACKAGE_RE) package names, and the `--` end-of-options
	 * marker precedes them — belt-and-suspenders under the sudoers
	 * `apt-get install -y *` wildcard so no caller-supplied element can ever be
	 * parsed as an apt option (`-o DPkg::Pre-Invoke` hook injection).
	 */
	async #aptInstall(
		pkgs: readonly string[],
		logger: InstallContext['logger'],
	): Promise<{code: number; stdout: string; stderr: string}> {
		return execCmd(
			'sudo',
			['-n', '/usr/bin/apt-get', 'install', '-y', ...APT_CONFOLD, '--', ...pkgs],
			logger,
			APT_ENV,
		)
	}

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
		//
		// Icon: prefer the catalog row's hosted `icon_url` (a real https image
		// the desktop tile can render). `desktopEntry.icon` is usually a bare
		// freedesktop name ("vscode", "brave-browser") which both fails
		// nativeAppConfigSchema's iconUrl gate AND can't be rendered as <img>;
		// only fall back to it when it already satisfies the schema (a URL or
		// root-relative path). Anything non-conforming → undefined so parse()
		// doesn't throw; the bare name still reaches the .desktop Icon= line via
		// writeDesktopFile, and the tile shows the placeholder.
		const rawIcon = manifest.desktopEntry.icon
		// Resolve a displayable icon in priority order:
		//   1. iconUrl the store webapp forwarded in the install message
		//   2. the catalog row's icon_url fetched SERVER-SIDE (works even when the
		//      Server5 store webapp hasn't been redeployed to forward it)
		//   3. a schema-valid manifest desktopEntry.icon (rarely — usually a bare name)
		// Anything non-conforming is dropped so parse() can't throw and the tile shows
		// the placeholder.
		let resolvedIconUrl: string | undefined =
			app.iconUrl && isSchemaValidIconUrl(app.iconUrl) ? app.iconUrl : undefined
		if (!resolvedIconUrl) {
			const fetched = await fetchCatalogIconUrl(app.id, ctx)
			if (fetched && isSchemaValidIconUrl(fetched)) resolvedIconUrl = fetched
		}
		if (!resolvedIconUrl && rawIcon && isSchemaValidIconUrl(rawIcon)) {
			resolvedIconUrl = rawIcon
		}
		const configCandidate: NativeAppConfig = {
			id: randomUUID(),
			name: app.name,
			iconUrl: resolvedIconUrl,
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
			// Phase 262-02 (LIVOS-044) — charset-validate BEFORE any spawn so an
			// injected `-o DPkg::Pre-Invoke` element can never reach the sudo argv.
			const pkgErr = validateAptPackages(pkgs)
			if (pkgErr) {
				return fail(app.id, 'native', 'manifest_invalid', pkgErr)
			}
			progress(12, 'apt-get update')
			// Best-effort cache refresh so packages added to repos (or .deb deps)
			// resolve. Never fail the install on a stale/offline update — a present
			// cache may still satisfy the package. (sudoers allows `apt-get update`.)
			await execCmd(
				'sudo',
				['-n', '/usr/bin/apt-get', 'update'],
				ctx.logger,
				APT_ENV,
			).catch(() => undefined)
			progress(15, `apt install ${pkgs.join(' ')}`)
			// The sudoers entry (scripts/install/sudoers.d/livos-native) must
			// allow exactly this argv pattern. Any drift here breaks install.
			const {code, stderr} = await this.#aptInstall(pkgs, ctx.logger)
			if (code !== 0) {
				const sudoDenied = stderr.includes('sudo:') || stderr.includes('password is required')
				const message = sudoDenied
					? `apt-get install -y ${pkgs.join(' ')} exited ${code}`
					: APT_PKG_NOT_FOUND_RE.test(stderr)
						? APT_PKG_NOT_FOUND_MESSAGE
						: `apt-get install -y ${pkgs.join(' ')} exited ${code}`
				return fail(
					app.id,
					'native',
					sudoDenied ? 'sudo_denied' : 'apt_failed',
					message,
					stderr,
				)
			}
		} else if (manifest.install.primary === 'deb') {
			// Phase 259 — download the official .deb and let apt install it (resolving
			// dependencies). For apps NOT in the default Ubuntu repos (VS Code, Brave)
			// — works on every box without manual per-machine repo setup.
			const {debUrl, debSha256} = manifest.install
			// Phase 262-02 (LIVOS-045) — https-only + host allowlist (the old check
			// accepted plaintext http:// → MITM-to-root via the apt sink).
			const debUrlErr = assertAllowedDownloadUrl(debUrl ?? '')
			if (debUrlErr) {
				return fail(app.id, 'native', 'manifest_invalid', `debUrl: ${debUrlErr}`)
			}
			// Phase 262-02 (LIVOS-045) — checksum is MANDATORY, fail-closed.
			if (!SHA256_RE.test(debSha256 ?? '')) {
				return fail(app.id, 'native', 'signature_invalid', 'debSha256: sha256 checksum required (64 hex chars)')
			}
			const tmpDeb = path.join('/tmp', `livos-native-${app.id.replace(/[^a-zA-Z0-9_-]/g, '')}.deb`)
			progress(15, `Downloading ${debUrl}`)
			try {
				await downloadToFile(debUrl, tmpDeb)
			} catch (err) {
				return fail(app.id, 'native', 'network_failed', `download failed: ${err instanceof Error ? err.message : String(err)}`)
			}
			progress(45, 'Verifying SHA-256')
			{
				const actual = await sha256File(tmpDeb)
				if (actual !== debSha256.toLowerCase()) {
					await fs.unlink(tmpDeb).catch(() => {})
					return fail(app.id, 'native', 'signature_invalid', `sha256 mismatch — manifest=${debSha256} actual=${actual}`)
				}
			}
			progress(55, 'apt-get update')
			await execCmd('sudo', ['-n', '/usr/bin/apt-get', 'update'], ctx.logger, APT_ENV).catch(
				() => undefined,
			)
			progress(60, 'Installing .deb (apt resolves dependencies)')
			// Phase 290-r6 — share the ONE apt-install-deb argv with installLocalDeb
			// so the sudoers-allowlisted shape never diverges between callers.
			const {code, stderr} = await execCmd('sudo', aptInstallDebArgv(tmpDeb), ctx.logger, APT_ENV)
			await fs.unlink(tmpDeb).catch(() => {})
			if (code !== 0) {
				const sudoDenied = stderr.includes('sudo:') || stderr.includes('password is required')
				const message =
					!sudoDenied && APT_PKG_NOT_FOUND_RE.test(stderr)
						? APT_PKG_NOT_FOUND_MESSAGE
						: `apt-get install -y <deb> exited ${code}`
				return fail(app.id, 'native', sudoDenied ? 'sudo_denied' : 'apt_failed', message, stderr)
			}
		} else if (manifest.install.primary === 'apt-repo') {
			// Apps distributed via a 3rd-party APT repo (Brave, Signal, Spotify, …).
			const {aptPackages, aptRepoName, aptRepoLine, aptKeyUrl, aptKeyFingerprint} = manifest.install
			if (!aptPackages?.length) {
				return fail(app.id, 'native', 'manifest_invalid', `aptPackages empty`)
			}
			// Phase 262-02 (LIVOS-044) — charset-validate BEFORE any spawn (the
			// follow-on apt install reuses the same NOPASSWD wildcard grant).
			const repoPkgErr = validateAptPackages(aptPackages)
			if (repoPkgErr) {
				return fail(app.id, 'native', 'manifest_invalid', repoPkgErr)
			}
			if (!/^[a-z0-9][a-z0-9-]*$/.test(aptRepoName)) {
				return fail(
					app.id,
					'native',
					'manifest_invalid',
					`aptRepoName must be a lowercase [a-z0-9-] slug: ${String(aptRepoName)}`,
				)
			}
			// Phase 262-02 (LIVOS-045) — key URL must be https on an allowlisted host.
			const keyUrlErr = assertAllowedDownloadUrl(aptKeyUrl ?? '')
			if (keyUrlErr) {
				return fail(app.id, 'native', 'manifest_invalid', `aptKeyUrl: ${keyUrlErr}`)
			}
			if (!aptRepoLine || !/^https?:\/\/\S+\s+\S+/.test(aptRepoLine)) {
				return fail(
					app.id,
					'native',
					'manifest_invalid',
					`aptRepoLine must be "<url> <suite> [components]": ${String(aptRepoLine)}`,
				)
			}
			// Phase 262-02 (LIVOS-045) — the repo line's URL token must ALSO be https
			// on an allowlisted host (the old check permitted http:// → MITM-able
			// package fetch even with an https key).
			const repoLineUrl = aptRepoLine.trim().split(/\s+/)[0]
			const repoLineErr = assertAllowedDownloadUrl(repoLineUrl)
			if (repoLineErr) {
				return fail(app.id, 'native', 'manifest_invalid', `aptRepoLine URL: ${repoLineErr}`)
			}
			// Phase 262-02 (LIVOS-045) — REQUIRED key-fingerprint pin: download the
			// key ourselves and verify its full 40-hex fingerprint BEFORE the
			// root-capable livos-add-apt-repo.sh trusts it as a keyring.
			if (!GPG_FINGERPRINT_RE.test(aptKeyFingerprint ?? '')) {
				return fail(
					app.id,
					'native',
					'signature_invalid',
					'aptKeyFingerprint required (40 hex chars — full GPG key fingerprint)',
				)
			}
			progress(12, 'Verifying repo signing key fingerprint')
			const tmpKey = path.join(
				'/tmp',
				`livos-native-${app.id.replace(/[^a-zA-Z0-9_-]/g, '')}.key`,
			)
			try {
				await downloadToFile(aptKeyUrl, tmpKey)
			} catch (err) {
				return fail(
					app.id,
					'native',
					'network_failed',
					`key download failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
			try {
				const gpg = await execCmd(
					'gpg',
					['--show-keys', '--with-colons', tmpKey],
					ctx.logger,
				)
				if (gpg.code !== 0) {
					return fail(
						app.id,
						'native',
						'signature_invalid',
						`gpg --show-keys failed (exit ${gpg.code}) — cannot verify key fingerprint`,
						gpg.stderr,
					)
				}
				// Colon-format fingerprint records: `fpr:::::::::<40HEX>:`
				const fingerprints = gpg.stdout
					.split('\n')
					.filter((line) => line.startsWith('fpr:'))
					.map((line) => line.split(':')[9] ?? '')
					.filter((fpr) => GPG_FINGERPRINT_RE.test(fpr))
				const pin = aptKeyFingerprint.toLowerCase()
				if (!fingerprints.some((fpr) => fpr.toLowerCase() === pin)) {
					return fail(
						app.id,
						'native',
						'signature_invalid',
						`apt key fingerprint mismatch — pinned=${aptKeyFingerprint} got=[${fingerprints.join(', ') || 'none'}]`,
					)
				}
			} finally {
				await fs.unlink(tmpKey).catch(() => {})
			}
			progress(15, `Adding apt repo ${aptRepoName}`)
			// The helper writes the keyring + sources.list.d entry and runs apt-get
			// update (all root-only work) behind a single sudoers allow-list entry.
			const repo = await execCmd(
				'sudo',
				['-n', LIVOS_ADD_APT_REPO, aptRepoName, aptKeyUrl, aptRepoLine],
				ctx.logger,
				APT_ENV,
			)
			if (repo.code !== 0) {
				const sudoDenied =
					repo.stderr.includes('sudo:') || repo.stderr.includes('password is required')
				return fail(
					app.id,
					'native',
					sudoDenied ? 'sudo_denied' : 'apt_failed',
					`add-apt-repo ${aptRepoName} exited ${repo.code}`,
					repo.stderr,
				)
			}
			progress(45, `apt install ${aptPackages.join(' ')}`)
			const {code, stderr} = await this.#aptInstall(aptPackages, ctx.logger)
			if (code !== 0) {
				const sudoDenied =
					stderr.includes('sudo:') || stderr.includes('password is required')
				const message =
					!sudoDenied && APT_PKG_NOT_FOUND_RE.test(stderr)
						? APT_PKG_NOT_FOUND_MESSAGE
						: `apt-get install -y ${aptPackages.join(' ')} exited ${code}`
				return fail(
					app.id,
					'native',
					sudoDenied ? 'sudo_denied' : 'apt_failed',
					message,
					stderr,
				)
			}
		} else if (manifest.install.primary === 'appimage') {
			const {appimageUrl, appimageSha256} = manifest.install
			// Phase 262-02 (LIVOS-045) — https-only + host allowlist (previously the
			// appimage URL was not validated at all).
			const appimageUrlErr = assertAllowedDownloadUrl(appimageUrl ?? '')
			if (appimageUrlErr) {
				return fail(app.id, 'native', 'manifest_invalid', `appimageUrl: ${appimageUrlErr}`)
			}
			// Phase 262-02 (LIVOS-045) — the type said required but the runtime check
			// silently skipped empty/malformed values. Fail-closed now.
			if (!SHA256_RE.test(appimageSha256 ?? '')) {
				return fail(
					app.id,
					'native',
					'signature_invalid',
					'appimageSha256: sha256 checksum required (64 hex chars)',
				)
			}
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
			progress(50, 'Verifying SHA-256')
			{
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
		} else if (manifest.install.primary === 'script') {
			const {scriptUrl, scriptArgs, scriptSha256} = manifest.install
			// Phase 262-02 (LIVOS-045) — https-only + host allowlist (the old check
			// accepted ANY https host → curl|bash-as-bruce from anywhere).
			const scriptUrlErr = assertAllowedDownloadUrl(scriptUrl ?? '')
			if (scriptUrlErr) {
				return fail(app.id, 'native', 'manifest_invalid', `scriptUrl: ${scriptUrlErr}`)
			}
			// Phase 262-02 (LIVOS-045) — checksum is MANDATORY, fail-closed.
			if (!SHA256_RE.test(scriptSha256 ?? '')) {
				return fail(
					app.id,
					'native',
					'signature_invalid',
					'scriptSha256: sha256 checksum required (64 hex chars)',
				)
			}
			const tmpScript = path.join(
				'/tmp',
				`livos-native-${app.id.replace(/[^a-zA-Z0-9_-]/g, '')}.sh`,
			)
			progress(15, 'Downloading installer')
			try {
				await downloadToFile(scriptUrl, tmpScript)
			} catch (err) {
				return fail(
					app.id,
					'native',
					'network_failed',
					`download failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
			progress(35, 'Verifying SHA-256')
			{
				const actual = await sha256File(tmpScript)
				if (actual !== scriptSha256.toLowerCase()) {
					await fs.unlink(tmpScript).catch(() => {})
					return fail(
						app.id,
						'native',
						'signature_invalid',
						`sha256 mismatch — manifest=${scriptSha256} actual=${actual}`,
					)
				}
			}
			progress(50, 'Running installer (may take several minutes)')
			// Run as the install user (bruce) — NEVER sudo. execCmd uses stdio
			// 'ignore' for stdin, so any optional sudo/interactive prompt gets EOF
			// and is skipped instead of hanging.
			const {code, stderr} = await execCmd(
				'bash',
				[tmpScript, ...(scriptArgs ?? [])],
				ctx.logger,
			)
			await fs.unlink(tmpScript).catch(() => {})
			if (code !== 0) {
				return fail(
					app.id,
					'native',
					'apt_failed',
					`install script exited ${code}`,
					stderr,
				)
			}
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

// ─── Phase 290-r6 — install a LOCAL .deb file (admin uploads) ────────────────
//
// An admin uploads a .deb (Discord / Chrome / etc. — apps NOT in apt) via the
// gated POST /api/native/upload-deb route. The route streams + magic-byte
// validates the bytes, then calls this helper. It reuses the EXACT proven apt
// argv (aptInstallDebArgv) the deb-URL install branch uses (apt resolves deps),
// then derives the desktop tile by re-scanning host .desktop entries — exactly
// like the Native tab's "Installed on this device" picker, so the binaryPath is
// realpath-gated identically and the persisted NativeAppConfig is schema-valid.
//
// SECURITY: a .deb runs maintainer scripts as ROOT via apt. The route enforces
// the admin gate + .deb magic-byte validation BEFORE calling here; this helper
// performs the privileged apt install (sudo -n, NOPASSWD-allowlisted) and runs
// dpkg-deb / dpkg -L as the UNPRIVILEGED daemon user (NO sudo) to find the tile.

export interface InstallLocalDebResult {
	ok: boolean
	name: string
	nativeConfigId?: string
	message?: string
}

/** Slug a display name into the [a-z0-9-] catalog-mapping key space. */
function slugifyDebName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
	return slug || 'native-deb'
}

/**
 * Optional injectable seams so the route's unit tests can drive installLocalDeb
 * without a real apt/dpkg/host. Production passes nothing → the real apt argv +
 * the real host scanner are used.
 */
export interface InstallLocalDebDeps {
	exec?: typeof execCmd
	scanHostApps?: typeof scanHostApps
	home?: string
}

/**
 * Install a local .deb and return a tile descriptor. `debPath` is a trusted,
 * server-written temp path (the route writes it via a streamed pipeline to a
 * randomUUID name). `opts.name` is the operator-facing display name (defaults
 * to the dpkg Package field, then the filename).
 */
export async function installLocalDeb(
	debPath: string,
	ctx: InstallContext,
	configStore: NativeAppConfigStore,
	opts: {name?: string} = {},
	deps: InstallLocalDebDeps = {},
): Promise<InstallLocalDebResult> {
	const exec = deps.exec ?? execCmd
	const scan = deps.scanHostApps ?? scanHostApps
	const homeDir = deps.home ?? userHome(ctx.userId)

	// ── Discover the package name BEFORE install (unprivileged dpkg-deb). Used
	//    to map dpkg -L → the .desktop tile and to default the display name. A
	//    failure here is non-fatal: install can still succeed and we fall back to
	//    the scan-diff path below.
	let pkgName: string | null = null
	try {
		const {code, stdout} = await exec('dpkg-deb', ['-f', debPath, 'Package'], ctx.logger)
		if (code === 0) {
			const candidate = stdout.trim().split('\n')[0]?.trim()
			if (candidate && APT_PACKAGE_RE.test(candidate)) pkgName = candidate
		}
	} catch {
		/* dpkg-deb unavailable / unreadable — fall through to scan-diff */
	}

	// ── Snapshot installed binaryPaths BEFORE install so we can pick the NEW
	//    app when dpkg -L doesn't surface a usable .desktop.
	let beforeBinaries = new Set<string>()
	try {
		const before = await scan({home: homeDir})
		beforeBinaries = new Set(before.map((a) => a.binaryPath))
	} catch {
		/* scan failure is non-fatal — diff just won't find a new app */
	}

	// ── Privileged install (apt resolves deps). Reuse the EXACT shared argv.
	const {code, stderr} = await exec('sudo', aptInstallDebArgv(debPath), ctx.logger, APT_ENV)
	if (code !== 0) {
		const sudoDenied = stderr.includes('sudo:') || stderr.includes('password is required')
		const message = sudoDenied
			? `Installing the .deb failed: the installer is not permitted to run apt (sudo denied). exit ${code}`
			: APT_PKG_NOT_FOUND_RE.test(stderr)
				? // apt can emit a not-found for an UNMET DEPENDENCY referenced by the
					// .deb (the .deb itself is local). Surface the apt stderr clearly.
					`Installing the .deb failed — apt could not satisfy a dependency:\n${stderr.trim().slice(0, 800)}`
				: `Installing the .deb failed (apt exit ${code}):\n${stderr.trim().slice(0, 800)}`
		return {ok: false, name: opts.name ?? pkgName ?? 'native app', message}
	}

	// ── Derive the tile. Priority:
	//    1. dpkg -L <pkg> → the package's own /usr/share/applications/*.desktop
	//       (most accurate — it's THIS package's launcher), parsed + B1-gated.
	//    2. scan-diff — the new app whose binaryPath wasn't installed before.
	//    3. /usr/bin/<pkg> fallback (no .desktop shipped) if it passes the schema.
	let scanned: ScannedNativeApp | null = null

	if (pkgName) {
		try {
			const {code: lcode, stdout} = await exec('dpkg', ['-L', pkgName], ctx.logger)
			if (lcode === 0) {
				const desktopFiles = stdout
					.split('\n')
					.map((l) => l.trim())
					.filter((l) => l.startsWith('/usr/share/applications/') && l.endsWith('.desktop'))
				for (const desktopPath of desktopFiles) {
					let content: string
					try {
						content = await fs.readFile(desktopPath, 'utf8')
					} catch {
						continue
					}
					const fields = parseDesktopEntry(content)
					const app = buildScannedApp(fields, desktopPath, {home: homeDir})
					if (app) {
						scanned = app
						break
					}
				}
			}
		} catch {
			/* dpkg -L unavailable — fall through to scan-diff */
		}
	}

	if (!scanned) {
		try {
			const after = await scan({home: homeDir})
			scanned = after.find((a) => !beforeBinaries.has(a.binaryPath)) ?? null
		} catch {
			/* scan failure — fall through to the /usr/bin/<pkg> fallback */
		}
	}

	// Resolve display name + binaryPath + icon from whatever we found.
	const displayName = (opts.name?.trim() || scanned?.name || pkgName || 'native app').slice(0, 64)

	let binaryPath: string | undefined = scanned?.binaryPath
	if (!binaryPath && pkgName && APT_PACKAGE_RE.test(pkgName)) {
		// Fallback: a CLI .deb ships no .desktop. Derive /usr/bin/<pkg> if it
		// exists AND passes the schema's ABSOLUTE_PATH_RE (it does by construction
		// for an APT_PACKAGE_RE name) so the tile is launchable.
		const guess = `/usr/bin/${pkgName}`
		if (existsSync(guess)) binaryPath = guess
	}

	// ── No launchable binary found: the install SUCCEEDED but we can't build a
	//    desktop tile (e.g. a library/font .deb). Report ok with a generic name —
	//    the caller surfaces "installed" without a tile rather than a false error.
	if (!binaryPath) {
		return {ok: true, name: displayName}
	}

	const iconUrl =
		scanned?.iconUrl && isSchemaValidIconUrl(scanned.iconUrl)
			? scanned.iconUrl
			: scanned?.icon
				? iconValueToUrl(scanned.icon)
				: undefined

	const config: NativeAppConfig = {
		id: randomUUID(),
		name: displayName,
		iconUrl: iconUrl && isSchemaValidIconUrl(iconUrl) ? iconUrl : undefined,
		binaryPath,
		wmClassHint: scanned?.wmClassHint,
	}
	try {
		nativeAppConfigSchema.parse(config)
	} catch (err) {
		// The binaryPath/icon failed the schema — install still succeeded, but we
		// can't persist a tile. Report ok with the name (no false failure).
		ctx.logger.warn(
			`installLocalDeb: derived config failed schema for ${displayName}: ${err instanceof Error ? err.message : String(err)}`,
		)
		return {ok: true, name: displayName}
	}

	await configStore.upsert(config)

	// Catalog mapping (mirror the install tail) so apps.v37List reports it
	// installed + uninstall can find the UUID from the slug.
	const slug = slugifyDebName(pkgName ?? displayName)
	await ctx.redis
		.set(`liv:apps:native-catalog:${slug}`, config.id)
		.catch((err) =>
			ctx.logger.error(`installLocalDeb: failed to write catalog mapping for ${slug}`, err),
		)

	return {ok: true, name: displayName, nativeConfigId: config.id}
}
