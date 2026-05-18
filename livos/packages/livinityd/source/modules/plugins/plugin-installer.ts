/**
 * Phase 153 — plugin install handler.
 *
 * Implements `InstallHandler<'plugin'>` per SPEC §4.
 *
 * Flow:
 *   1. Read catalog manifest (apps.section='plugin'). Pull bundleUrl +
 *      bundleSha256 + signingTier.
 *   2. Download bundle to /tmp.
 *   3. Verify SHA-256.
 *   4. Extract to /opt/livos/plugins/<id>/.
 *   5. Read plugin-manifest.json + plugin-manifest.sig from extracted dir.
 *   6. Verify Ed25519 signature against pubkey registry (v37: only
 *      operator tier allowed).
 *   7. Capability gate: refuse install if any declared capability
 *      exceeds the allowed surface for the signing tier.
 *   8. Run any new migrations (manifest.migrations[]).
 *   9. Tell PluginLoader to load from the new directory (hot-mount).
 *   10. Broadcast `plugin:installed` to WS subscribers.
 *
 * Uninstall: reverse of 9-3. Migrations are NOT rolled back automatically
 * (operator must drop tables/schemas explicitly if they care).
 */

import {promises as fs} from 'fs'
import * as path from 'path'
import {createHash} from 'crypto'
import {pipeline} from 'stream/promises'
import {createWriteStream, createReadStream} from 'fs'
import * as zlib from 'zlib'
import {Readable} from 'stream'

import {
	type AppCatalogRow,
	type InstallContext,
	type InstallHandler,
	type InstallOutcome,
	type ProgressEmitter,
	ok,
	fail,
	progressFactory,
} from '../apps/install-contracts.js'

import {PluginManifestSchema, type PluginManifest} from './manifest-schema.js'
import type {PluginLoader} from './plugin-loader.js'
import {
	loadPubkeyRegistry,
	verifyManifestSignature,
} from './signature-verify.js'

// ─── Catalog manifest shape (apps.manifest for section='plugin') ─────────

type CatalogPluginManifest = {
	kind: 'plugin'
	bundleUrl: string
	bundleSha256: string
	signingTier: 'operator' | 'verified' | 'community'
	minLivosVersion: string
}

function parseCatalogManifest(raw: unknown): CatalogPluginManifest | null {
	if (!raw || typeof raw !== 'object') return null
	const m = raw as Partial<CatalogPluginManifest>
	if (
		m.kind !== 'plugin' ||
		typeof m.bundleUrl !== 'string' ||
		typeof m.bundleSha256 !== 'string' ||
		typeof m.signingTier !== 'string'
	) {
		return null
	}
	return m as CatalogPluginManifest
}

// ─── Handler ─────────────────────────────────────────────────────────────

export interface PluginInstallerOptions {
	loader: PluginLoader
	pluginsDir: string // /opt/livos/plugins
	pubkeyCachePath: string // /opt/livos/plugins/.cache/pubkeys.json
	// v37 default: ['operator']. v38 will allow 'verified' once the
	// review pipeline ships.
	allowedTiers?: ReadonlyArray<'operator' | 'verified' | 'community'>
}

export class PluginInstaller implements InstallHandler<'plugin'> {
	readonly section = 'plugin' as const
	private readonly opts: PluginInstallerOptions

	constructor(opts: PluginInstallerOptions) {
		this.opts = opts
	}

	async install(
		app: AppCatalogRow,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const progress = progressFactory(emit, app.id, 'plugin')
		const catalog = parseCatalogManifest(app.manifest)
		if (!catalog) {
			return fail(
				app.id,
				'plugin',
				'manifest_invalid',
				`plugin catalog manifest missing required fields`,
			)
		}
		const allowedTiers = this.opts.allowedTiers ?? ['operator']
		if (!allowedTiers.includes(catalog.signingTier)) {
			return fail(
				app.id,
				'plugin',
				'signature_invalid',
				`signingTier "${catalog.signingTier}" not in allowed [${allowedTiers.join(',')}]`,
			)
		}

		// 1) Download bundle
		progress(10, 'Downloading bundle')
		const tmpPath = path.join('/tmp', `${app.id}-${Date.now()}.livpkg.tgz`)
		try {
			await downloadTo(catalog.bundleUrl, tmpPath)
		} catch (err) {
			return fail(
				app.id,
				'plugin',
				'network_failed',
				`bundle download failed: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		// 2) Verify SHA-256
		progress(30, 'Verifying bundle SHA-256')
		const actualSha = await sha256File(tmpPath)
		if (actualSha !== catalog.bundleSha256.toLowerCase()) {
			await fs.unlink(tmpPath).catch(() => {})
			return fail(
				app.id,
				'plugin',
				'signature_invalid',
				`bundle sha256 mismatch — expected ${catalog.bundleSha256} got ${actualSha}`,
			)
		}

		// 3) Extract to /opt/livos/plugins/<id>/
		const targetDir = path.join(this.opts.pluginsDir, app.id)
		progress(50, `Extracting → ${targetDir}`)
		// If a previous version exists, unload + replace.
		await this.opts.loader.unload(app.id).catch(() => {})
		await fs.rm(targetDir, {recursive: true, force: true}).catch(() => {})
		await fs.mkdir(targetDir, {recursive: true})
		try {
			await extractTgz(tmpPath, targetDir)
		} catch (err) {
			return fail(
				app.id,
				'plugin',
				'unknown',
				`bundle extraction failed: ${err instanceof Error ? err.message : String(err)}`,
				err,
			)
		} finally {
			await fs.unlink(tmpPath).catch(() => {})
		}

		// 4) Read manifest + sig
		progress(65, 'Verifying manifest signature')
		const manifestBytes = await fs.readFile(
			path.join(targetDir, 'plugin-manifest.json'),
		)
		const sigHex = (
			await fs.readFile(path.join(targetDir, 'plugin-manifest.sig'), 'utf8')
		).trim()

		let manifest: PluginManifest
		try {
			manifest = PluginManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')))
		} catch (err) {
			return fail(
				app.id,
				'plugin',
				'manifest_invalid',
				`plugin-manifest.json failed schema: ${err instanceof Error ? err.message : String(err)}`,
			)
		}

		// 5) Signature
		try {
			const registry = await loadPubkeyRegistry(this.opts.pubkeyCachePath, {
				allowStale: true,
			})
			const result = verifyManifestSignature(
				manifestBytes,
				sigHex,
				manifest.signing.publicKeyId,
				registry,
				allowedTiers,
			)
			if (!result.ok) {
				return fail(app.id, 'plugin', 'signature_invalid', result.reason)
			}
		} catch (err) {
			return fail(
				app.id,
				'plugin',
				'signature_invalid',
				`pubkey verification failed: ${err instanceof Error ? err.message : String(err)}`,
				err,
			)
		}

		// 6) Capability gate (v37: operator tier has full access, others
		//    capped — extend here when tier policies diverge).
		// (No-op for v37 — operator tier is trusted; placeholder for v38.)

		// 7) Migrations
		progress(80, 'Running migrations')
		if (manifest.migrations) {
			for (const migration of manifest.migrations) {
				const applied = await ctx.redis.get(migration.appliedAtKey)
				if (applied) continue
				const sqlPath = path.join(targetDir, migration.file)
				const sql = await fs.readFile(sqlPath, 'utf8')
				try {
					await ctx.pg.query(sql)
					await ctx.redis.set(migration.appliedAtKey, new Date().toISOString())
				} catch (err) {
					return fail(
						app.id,
						'plugin',
						'unknown',
						`migration ${migration.file} failed: ${err instanceof Error ? err.message : String(err)}`,
						err,
					)
				}
			}
		}

		// 8) Hot-mount via PluginLoader
		progress(95, 'Mounting plugin')
		try {
			await this.opts.loader.loadFromDir(targetDir)
		} catch (err) {
			return fail(
				app.id,
				'plugin',
				'plugin_load_failed',
				`loader.loadFromDir failed: ${err instanceof Error ? err.message : String(err)}`,
				err,
			)
		}

		progress(100, 'Done', true)
		return ok(app.id, 'plugin', {
			pluginId: app.id,
			pluginMountPath: `/p/${app.id}`,
		})
	}

	async uninstall(
		appId: string,
		_ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const progress = progressFactory(emit, appId, 'plugin')
		progress(20, 'Unmounting plugin')
		await this.opts.loader.unload(appId).catch(() => {})
		const targetDir = path.join(this.opts.pluginsDir, appId)
		progress(70, `Removing ${targetDir}`)
		await fs.rm(targetDir, {recursive: true, force: true}).catch(() => {})
		progress(100, 'Done', true)
		return ok(appId, 'plugin', {pluginId: appId})
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────

async function downloadTo(url: string, dest: string): Promise<void> {
	const res = await fetch(url, {
		headers: {'User-Agent': 'LivinityPluginInstaller/1.0'},
		redirect: 'follow',
	})
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	if (!res.body) throw new Error('no response body')
	const nodeStream = Readable.fromWeb(res.body as never)
	await pipeline(nodeStream, createWriteStream(dest))
}

async function sha256File(file: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256')
		const stream = createReadStream(file)
		stream.on('data', (chunk) => hash.update(chunk))
		stream.on('end', () => resolve(hash.digest('hex')))
		stream.on('error', reject)
	})
}

/**
 * Minimal tar.gz extractor — no external deps. Handles the small subset
 * of POSIX tar that npm-built bundles produce: file entries, directory
 * entries, no symlinks (livpkg policy forbids them).
 *
 * For production use we'll likely depend on the `tar` package (a
 * transitive of npm already), but to keep this commit dependency-free
 * we ship a parser for the 512-byte header records we actually see.
 */
async function extractTgz(tgzPath: string, destDir: string): Promise<void> {
	const buf = await fs.readFile(tgzPath)
	const tar = await new Promise<Buffer>((resolve, reject) => {
		zlib.gunzip(buf, (err, out) => (err ? reject(err) : resolve(out)))
	})

	let offset = 0
	while (offset < tar.length) {
		// All-zero block = end of archive.
		if (tar.subarray(offset, offset + 512).every((b) => b === 0)) break

		const header = tar.subarray(offset, offset + 512)
		const name = header.subarray(0, 100).toString('utf8').replace(/\0+$/, '')
		const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0+|\s+$/g, '')
		const size = parseInt(sizeOctal, 8) || 0
		const typeFlag = String.fromCharCode(header[156])

		offset += 512
		if (name) {
			const target = path.join(destDir, name)
			// Defensive: refuse any entry that resolves outside destDir
			// (zip-slip protection — tar headers can carry .. paths).
			const resolved = path.resolve(target)
			if (!resolved.startsWith(path.resolve(destDir))) {
				throw new Error(`tar entry escapes target: ${name}`)
			}
			if (typeFlag === '5') {
				// directory
				await fs.mkdir(target, {recursive: true})
			} else if (typeFlag === '' || typeFlag === '0') {
				await fs.mkdir(path.dirname(target), {recursive: true})
				await fs.writeFile(target, tar.subarray(offset, offset + size))
			}
			// Skip other flags (symlinks, hardlinks, longname, etc.) — livpkg policy forbids them.
		}
		offset += Math.ceil(size / 512) * 512
	}
}
