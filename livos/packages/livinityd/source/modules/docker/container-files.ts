import {posix as posixPath} from 'node:path'
import {PassThrough} from 'node:stream'

import Dockerode from 'dockerode'
import archiver from 'archiver'

// Module-local Dockerode instance — mirrors docker-exec-socket.ts / docker-logs-socket.ts.
// The underlying connection is the shared /var/run/docker.sock, so creating a new
// constructor per module is essentially free.
const docker = new Dockerode()

export interface ContainerFileEntry {
	/** Basename only — never a path. */
	name: string
	type: 'file' | 'dir' | 'symlink' | 'other'
	/** Bytes (0 for directories). */
	size: number
	/** UNIX seconds (from `ls --time-style=+%s`). */
	mtime: number
	/** 10-char ls mode string, e.g. `-rw-r--r--` or `drwxr-xr-x`. */
	mode: string
	/** Symlink target when type === 'symlink'. */
	target?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Demultiplex Docker's 8-byte-framed non-TTY exec stream into separate
 * stdout / stderr strings.
 *
 * Frame format: [stream_type(1), 0, 0, 0, size(4)] — stream_type 1 = stdout, 2 = stderr.
 *
 * Unlike `stripDockerStreamHeaders` (stdout-only decoder in docker.ts), this
 * variant keeps the two streams apart so the caller can surface the right
 * context when exec exits non-zero.
 */
function demuxDockerStream(buf: Buffer): {stdout: string; stderr: string} {
	let stdout = ''
	let stderr = ''
	let offset = 0
	while (offset + 8 <= buf.length) {
		const streamType = buf[offset] // 1 = stdout, 2 = stderr
		const frameSize = buf.readUInt32BE(offset + 4)
		offset += 8
		if (offset + frameSize > buf.length) break
		const frame = buf.subarray(offset, offset + frameSize).toString('utf-8')
		if (streamType === 2) stderr += frame
		else stdout += frame
		offset += frameSize
	}
	return {stdout, stderr}
}

/**
 * Run a command in the container without a TTY, capture stdout/stderr and exit code.
 *
 * AttachStderr is enabled so Docker uses its multiplexed framing; we demux
 * back out on the caller side via `demuxDockerStream`.
 */
async function execCapture(
	container: Dockerode.Container,
	cmd: string[],
): Promise<{stdout: string; stderr: string; exitCode: number}> {
	const exec = await container.exec({
		Cmd: cmd,
		AttachStdin: false,
		AttachStdout: true,
		AttachStderr: true,
		Tty: false,
	})

	const stream = await exec.start({hijack: true, stdin: false})

	const chunks: Buffer[] = []
	await new Promise<void>((resolve, reject) => {
		stream.on('data', (chunk: Buffer) => chunks.push(chunk))
		stream.on('end', () => resolve())
		stream.on('close', () => resolve())
		stream.on('error', (err: Error) => reject(err))
	})

	const buffer = Buffer.concat(chunks)
	const {stdout, stderr} = demuxDockerStream(buffer)

	const info = await exec.inspect()
	const exitCode = info.ExitCode ?? 0

	return {stdout, stderr, exitCode}
}

/** Assert that a path is absolute (container paths are POSIX). */
function assertAbsolute(path: string): void {
	if (!path || !path.startsWith('/')) {
		throw new Error(`[bad-path] Path must be absolute (got: ${JSON.stringify(path)})`)
	}
}

/** Normalise dockerode's 404 errors into the `[not-found]` convention used by docker.ts. */
function wrap404<T>(containerName: string, err: any): never {
	if (err && (err.statusCode === 404 || err.reason === 'no such container')) {
		throw new Error(`[not-found] Container not found: ${containerName}`)
	}
	throw err as T
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * List a directory inside a container via `ls -la --time-style=+%s`.
 *
 * Returns entries sorted directories-first, then alpha-ascending within each group.
 * Skips `.` and `..`. Handles filenames containing spaces.
 */
export async function listDir(
	containerName: string,
	dirPath: string,
): Promise<ContainerFileEntry[]> {
	assertAbsolute(dirPath)

	const container = docker.getContainer(containerName)

	let result: {stdout: string; stderr: string; exitCode: number}
	try {
		result = await execCapture(container, ['ls', '-la', '--time-style=+%s', '--', dirPath])
	} catch (err: any) {
		wrap404(containerName, err)
	}

	if (result!.exitCode !== 0) {
		const detail = (result!.stderr || result!.stdout).trim() || `exit ${result!.exitCode}`
		throw new Error(`[ls-failed] ${detail}`)
	}

	const entries: ContainerFileEntry[] = []
	const lines = result!.stdout.split('\n')

	// Pattern: mode, link-count, owner, group, size, mtime (epoch seconds), rest (name [-> target])
	const lineRegex = /^(\S+)\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d+)\s+(.+)$/

	for (const raw of lines) {
		const line = raw.trimEnd()
		if (!line) continue
		// Skip the leading `total N` summary that ls -l emits.
		if (/^total\s+\d+/.test(line)) continue

		const match = line.match(lineRegex)
		if (!match) continue

		const [, mode, sizeStr, mtimeStr, rest] = match

		let name = rest
		let target: string | undefined
		if (mode.startsWith('l')) {
			const arrowIdx = rest.indexOf(' -> ')
			if (arrowIdx !== -1) {
				name = rest.slice(0, arrowIdx)
				target = rest.slice(arrowIdx + 4)
			}
		}

		if (name === '.' || name === '..') continue

		let type: ContainerFileEntry['type']
		if (mode.startsWith('d')) type = 'dir'
		else if (mode.startsWith('-')) type = 'file'
		else if (mode.startsWith('l')) type = 'symlink'
		else type = 'other'

		const entry: ContainerFileEntry = {
			name,
			type,
			size: Number.parseInt(sizeStr, 10) || 0,
			mtime: Number.parseInt(mtimeStr, 10) || 0,
			mode,
		}
		if (target !== undefined) entry.target = target

		entries.push(entry)
	}

	// Directories first (including symlinks-to-dir are ambiguous here; treat symlinks as files-tier),
	// then alphabetically within each tier.
	entries.sort((a, b) => {
		const aDir = a.type === 'dir' ? 0 : 1
		const bDir = b.type === 'dir' ? 0 : 1
		if (aDir !== bDir) return aDir - bDir
		return a.name.localeCompare(b.name)
	})

	return entries
}

/**
 * Read a text file inside a container. Enforces a byte ceiling (default 1MB).
 *
 * Returns `{content, size}` where `size` is the authoritative byte count from `stat`.
 *
 * Throws `[file-too-large]` if the file exceeds `maxBytes`.
 */
export async function readFile(
	containerName: string,
	filePath: string,
	maxBytes: number = 1_000_000,
): Promise<{content: string; size: number}> {
	assertAbsolute(filePath)

	const container = docker.getContainer(containerName)

	// Step 1 — stat for size
	let statResult: {stdout: string; stderr: string; exitCode: number}
	try {
		statResult = await execCapture(container, ['stat', '-c', '%s', '--', filePath])
	} catch (err: any) {
		wrap404(containerName, err)
	}

	if (statResult!.exitCode !== 0) {
		const detail = (statResult!.stderr || statResult!.stdout).trim() || `exit ${statResult!.exitCode}`
		throw new Error(`[read-failed] ${detail}`)
	}

	const size = Number.parseInt(statResult!.stdout.trim(), 10)
	if (!Number.isFinite(size) || size < 0) {
		throw new Error(`[read-failed] Could not determine file size for ${filePath}`)
	}
	if (size > maxBytes) {
		throw new Error(`[file-too-large] file is ${size} bytes, max ${maxBytes}`)
	}

	// Step 2 — cat for content
	let catResult: {stdout: string; stderr: string; exitCode: number}
	try {
		catResult = await execCapture(container, ['cat', '--', filePath])
	} catch (err: any) {
		wrap404(containerName, err)
	}

	if (catResult!.exitCode !== 0) {
		const detail = (catResult!.stderr || catResult!.stdout).trim() || `exit ${catResult!.exitCode}`
		throw new Error(`[read-failed] ${detail}`)
	}

	return {content: catResult!.stdout, size}
}

/**
 * Write a file inside a container via `container.putArchive`.
 *
 * Builds a single-file tar in memory using `archiver` and uploads it to the
 * file's parent directory. Binary- and multiline-safe (unlike `echo >`).
 *
 * Throws `[dir-not-found]` if the parent directory does not exist.
 */
export async function writeFile(
	containerName: string,
	filePath: string,
	content: string | Buffer,
): Promise<void> {
	assertAbsolute(filePath)

	const container = docker.getContainer(containerName)

	const dir = posixPath.dirname(filePath)
	const base = posixPath.basename(filePath)
	if (!base) {
		throw new Error(`[bad-path] Cannot write to path without filename: ${filePath}`)
	}

	const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8')

	// Build tar in memory.
	const archive = archiver('tar')
	const tarChunks: Buffer[] = []
	const collector = new PassThrough()
	collector.on('data', (chunk: Buffer) => tarChunks.push(chunk))
	archive.pipe(collector)
	archive.append(body, {name: base, mode: 0o644})
	await archive.finalize()
	// Ensure any remaining data has flushed.
	await new Promise<void>((resolve) => {
		if ((collector as any).writableEnded) resolve()
		else collector.on('end', () => resolve())
	})

	const tarBuffer = Buffer.concat(tarChunks)

	try {
		await container.putArchive(tarBuffer, {path: dir})
	} catch (err: any) {
		if (err && err.statusCode === 404) {
			// 404 from putArchive can mean either the container or the target dir
			// is missing — dockerode does not distinguish. Surface as dir-not-found
			// since container-not-found is far less likely after the earlier path
			// validation, but still catch it in wrap404 below for completeness.
			if (err.reason === 'no such container') {
				throw new Error(`[not-found] Container not found: ${containerName}`)
			}
			throw new Error(`[dir-not-found] ${dir}`)
		}
		throw err
	}
}

/**
 * Download a file or directory as a tar stream.
 *
 * For a file path, returns a single-entry tar. For a directory path, returns
 * a multi-entry tar of the whole tree. The REST endpoint streams this directly
 * to the HTTP response without buffering in memory.
 *
 * Throws `[not-found]` if the path (or container) does not exist.
 */
export async function downloadArchive(
	containerName: string,
	path: string,
): Promise<NodeJS.ReadableStream> {
	assertAbsolute(path)

	const container = docker.getContainer(containerName)

	try {
		const stream = (await container.getArchive({path})) as unknown as NodeJS.ReadableStream
		return stream
	} catch (err: any) {
		if (err && err.statusCode === 404) {
			throw new Error(`[not-found] ${path}`)
		}
		throw err
	}
}

/**
 * Delete a file or directory inside a container via `rm` / `rm -rf`.
 *
 * Refuses `/` and empty paths even when `recursive` is true — belt-and-braces.
 *
 * Non-recursive deletes fail loudly on non-empty directories with `[delete-failed]`.
 */
export async function deleteFile(
	containerName: string,
	path: string,
	recursive: boolean,
): Promise<void> {
	assertAbsolute(path)

	const trimmed = path.trim()
	if (trimmed === '' || trimmed === '/') {
		throw new Error('[bad-path] refuses to delete root')
	}

	const container = docker.getContainer(containerName)

	let result: {stdout: string; stderr: string; exitCode: number}
	try {
		result = await execCapture(
			container,
			recursive ? ['rm', '-rf', '--', path] : ['rm', '--', path],
		)
	} catch (err: any) {
		wrap404(containerName, err)
	}

	if (result!.exitCode !== 0) {
		const detail = (result!.stderr || result!.stdout).trim() || `exit ${result!.exitCode}`
		throw new Error(`[delete-failed] ${detail}`)
	}
}
