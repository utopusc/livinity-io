import archiver from 'archiver'
import fse from 'fs-extra'
import nodePath from 'node:path'
import {pipeline} from 'node:stream/promises'

import {$} from 'execa'

import getDirectorySize from '../utilities/get-directory-size.js'

import type Livinityd from '../../index.js'

export default class Archive {
	#livinityd: Livinityd
	logger: Livinityd['logger']

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(`files:${name.toLocaleLowerCase()}`)
	}

	// No background tasks
	async start() {}
	async stop() {}

	// Get the name for a zip archive based on it's contents
	zipName(files: string[], {defaultName = 'Archive.zip'} = {}) {
		if (files.length === 1) return `${nodePath.basename(files[0])}.zip`
		return defaultName
	}

	// Returns a readable stream of a zip archive from a list of system paths
	async createZipStream(systemPaths: string[]) {
		// Check that all paths are in the same directory
		// This is to avoid collisions in the zip archive
		// e.g:
		// /foo/file.txt
		// /bar/file.txt
		// would result in a zip archive with two files called file.txt
		const directories = systemPaths.map((systemPath) => nodePath.dirname(systemPath))
		const uniqueDirectories = new Set(directories)
		if (uniqueDirectories.size > 1) throw new Error('paths must be in same directory')

		const archive = archiver('zip')
		for (const systemPath of systemPaths) {
			const status = await fse.stat(systemPath)
			if (status.isDirectory()) archive.directory(systemPath, nodePath.basename(systemPath))
			else archive.file(systemPath, {name: nodePath.basename(systemPath)})
		}
		archive.finalize()
		return archive
	}

	// Creates a zip archive
	// TODO: There's probably a race condition where creating the same archive twice at the same time
	// will cause the second to overwrite the first. Think of a better way to handle this.
	async createZipFile(virtualPaths: string[]) {
		// Phase 336 (ACLUI-01, review C1) — the zip is WRITTEN into dirname(paths[0]).
		// archive is the one mutating op that does NOT go through
		// getAllowedOperations, so a read-only /Shared grant could otherwise plant a
		// file in another user's tree. Gate the destination directory on a WRITE
		// grant; a no-op for own-tree paths (their writes are governed as before).
		if (virtualPaths[0]) {
			await this.#livinityd.files.assertSharedWritable(nodePath.dirname(virtualPaths[0]))
		}

		// Convert virtual paths to system paths
		const systemPaths = await Promise.all(
			virtualPaths.map((virtualPath) => this.#livinityd.files.virtualToSystemPath(virtualPath)),
		)

		// Phase 339 STORD-01 (W1) — the zip is a NEW write into dirname(paths[0]) that
		// previously bypassed BOTH the per-user AND per-folder quota gates. Gate it now
		// with a best-effort uncompressed-size estimate (sum of each source's byte size;
		// `du` for a directory subtree). An over-estimate vs. the compressed zip is fine —
		// the gate should err toward blocking, not under-counting. Behavior-TIGHTENING:
		// closes the pre-existing bypass, same class as 336's C1 archive fix.
		if (virtualPaths[0]) {
			const destinationVirtualDirectory = nodePath.dirname(virtualPaths[0])
			let estimatedBytes = 0
			// WR-03: the per-FOLDER gate must count only bytes genuinely ENTERING the
			// destination folder. Sources already inside it are ALREADY reflected in the
			// folder's cached usage, so counting their (uncompressed) size again — against
			// a smaller, possibly hardBlock folder — would falsely block a legitimate
			// archive-in-place. Sources from OUTSIDE the folder do add net-new bytes.
			let folderEstimateBytes = 0
			const destPrefix = `${destinationVirtualDirectory}/`
			for (let i = 0; i < systemPaths.length; i++) {
				try {
					const stat = await fse.stat(systemPaths[i])
					const size = stat.isDirectory() ? await getDirectorySize(systemPaths[i]) : stat.size
					estimatedBytes += size
					const vp = virtualPaths[i]
					const alreadyInFolder = vp === destinationVirtualDirectory || vp.startsWith(destPrefix)
					if (!alreadyInFolder) folderEstimateBytes += size
				} catch {
					// A racing/absent source contributes 0 — createZipStream surfaces the real error.
				}
			}
			// Per-user gate keeps the full conservative estimate (user quotas are generous;
			// over-block toward safety matches the pre-existing intent).
			await this.#livinityd.files.assertWithinQuota(this.#livinityd.files.quotaUsername(), estimatedBytes)
			await this.#livinityd.files.assertWithinFolderQuota(destinationVirtualDirectory, folderEstimateBytes)
		}

		// Calculate the zip path
		let zipPath = nodePath.join(nodePath.dirname(systemPaths[0]), this.zipName(systemPaths))
		zipPath = await this.#livinityd.files.getUniqueName(zipPath)

		// Create a zip stream
		// TODO: Add progress reporting
		const zipStream = await this.createZipStream(systemPaths)
		const writeStream = fse.createWriteStream(zipPath)
		await pipeline(zipStream, writeStream)

		// Return virtual path of the zip archive
		return this.#livinityd.files.systemToVirtualPath(zipPath)
	}

	// Creates an archive (alias for createZipFile)
	async archive(virtualPaths: string[]) {
		return this.createZipFile(virtualPaths)
	}

	// Check if the archive format is supported
	isUnarchiveable(path: string) {
		const supportedArchiveFormats = ['.tar.gz', '.tgz', '.tar.bz2', '.tar.xz', '.tar', '.zip', '.7z', '.rar'] as const
		return supportedArchiveFormats.some((format) => path.endsWith(format))
	}

	// Unarchives an archive
	async unarchive(virtualPath: string) {
		// Check if operation is allowed
		const allowedOperations = await this.#livinityd.files.getAllowedOperations(virtualPath)
		if (!allowedOperations.includes('unarchive')) throw new Error('[operation-not-allowed]')

		// Get system path
		const systemPath = await this.#livinityd.files.virtualToSystemPath(virtualPath)

		// Calculate target directory
		const {name} = this.#livinityd.files.splitExtension(systemPath)
		let targetDirectory = nodePath.join(nodePath.dirname(systemPath), name)
		targetDirectory = await this.#livinityd.files.getUniqueName(targetDirectory)

		// Unarchive
		// TODO: Add progress reporting
		await $`unar -force-overwrite -no-directory -output-directory ${targetDirectory} ${systemPath}`

		// Phase 339 STORD-01 (W1) — extraction previously bypassed BOTH quota gates and
		// could inflate far past the compressed size. The extracted size is only knowable
		// AFTER extraction (unar spans many formats with no cheap pre-scan), so measure the
		// just-written tree and run the SAME per-user + per-folder gates copy() uses. On a
		// HARD breach (per-user over-quota, or a hardBlock folder cap over 100%) roll the
		// extraction back so a cap cannot be defeated by unarchive; a warn-only folder cap
		// just fires its target-qualified bell. Fail-open if the size probe itself errors —
		// never strand a successful extraction on infra failure. Behavior-TIGHTENING.
		try {
			const extractedBytes = await getDirectorySize(targetDirectory)
			const destinationVirtualDirectory = nodePath.dirname(virtualPath)
			await this.#livinityd.files.assertWithinQuota(this.#livinityd.files.quotaUsername(), extractedBytes)
			await this.#livinityd.files.assertWithinFolderQuota(destinationVirtualDirectory, extractedBytes)
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message === '[quota-exceeded]' || error.message === '[folder-quota-exceeded]')
			) {
				await fse.remove(targetDirectory).catch(() => {})
				throw error
			}
			// A non-quota error (e.g. du failing) must NOT strand a good extraction.
		}

		// Return virtual path of the unarchived files
		return this.#livinityd.files.systemToVirtualPath(targetDirectory)
	}
}
