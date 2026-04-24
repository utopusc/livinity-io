// Phase 20 — Volume backup handler + destination uploaders.
//
// Streams `tar czf - /data` from an ephemeral alpine:latest container (the
// volume is mounted read-only at /data) directly into the destination
// uploader. The full archive is NEVER staged on the host filesystem.
//
// Three destinations:
//   - s3:    @aws-sdk/lib-storage Upload (auto multipart for >5MB streams)
//   - sftp:  ssh2-sftp-client put(stream, remoteFile)
//   - local: write to host directory
//
// Credentials (s3 secretAccessKey, sftp password / privateKey / passphrase)
// live in Redis via backup-secrets.ts — they NEVER touch
// scheduled_jobs.config_json (PG row).

import {createWriteStream} from 'node:fs'
import {mkdir, unlink} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {PassThrough, Readable} from 'node:stream'

import {DeleteObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {Upload} from '@aws-sdk/lib-storage'
import Dockerode from 'dockerode'
import SFTPClient from 'ssh2-sftp-client'

import {getBackupSecretStore} from './backup-secrets.js'
import type {BuiltInJobHandler, JobRunResult} from './types.js'

const docker = new Dockerode({socketPath: '/var/run/docker.sock'})

// =========================================================================
// Types — destination configs as stored in scheduled_jobs.config_json
// (credentials live in Redis via backup-secrets, NOT here)
// =========================================================================

export interface S3DestinationConfig {
	type: 's3'
	endpoint?: string                  // for non-AWS S3-compatible (R2, B2, MinIO)
	region: string                     // 'auto' for R2
	bucket: string
	prefix?: string                    // e.g. "livinity-backups/"
	accessKeyId: string                // public — stored in config_json
	forcePathStyle?: boolean           // true for MinIO
	// secretAccessKey lives in Redis under field 'secretAccessKey'
}

export interface SftpDestinationConfig {
	type: 'sftp'
	host: string
	port: number                       // default 22
	username: string
	remotePath: string                 // directory; filename is appended
	authMethod: 'password' | 'privateKey'
	// password OR (privateKey + optional passphrase) live in Redis
}

export interface LocalDestinationConfig {
	type: 'local'
	path: string                       // host directory, e.g. /opt/livos/data/backups
}

export type BackupDestination = S3DestinationConfig | SftpDestinationConfig | LocalDestinationConfig

export interface BackupJobConfig {
	volumeName: string
	destination: BackupDestination
	retention?: {keepLast: number}
}

// =========================================================================
// alpine:latest helper container — streams `tar czf - /data` to stdout.
// AutoRemove guarantees the container is gone after the run.
// =========================================================================

async function ensureAlpineImage(): Promise<void> {
	try {
		await docker.getImage('alpine:latest').inspect()
		return
	} catch (err: any) {
		if (err?.statusCode !== 404 && err?.reason !== 'no such image') throw err
	}
	await new Promise<void>((resolve, reject) => {
		docker.pull('alpine:latest', (err: any, stream: any) => {
			if (err) return reject(err)
			docker.modem.followProgress(stream, (e: any) => (e ? reject(e) : resolve()))
		})
	})
}

/**
 * Run `tar czf - data` inside an ephemeral alpine container with the volume
 * mounted read-only at /data. Returns a Readable stream of the tar.gz bytes.
 *
 * On non-zero exit (failed tar), the returned stream is destroyed with an
 * error containing the captured stderr. Caller should propagate the error
 * via try/catch around the upload.
 */
async function streamVolumeAsTarGz(volumeName: string): Promise<{stream: Readable}> {
	await ensureAlpineImage()
	const container = await docker.createContainer({
		Image: 'alpine:latest',
		Cmd: ['tar', 'czf', '-', '-C', '/', 'data'],
		AttachStdout: true,
		AttachStderr: true,
		Tty: false,
		HostConfig: {
			Binds: [`${volumeName}:/data:ro`],
			AutoRemove: true,
		},
	})
	const muxStream = await container.attach({stream: true, stdout: true, stderr: true, hijack: true})
	await container.start()

	// Demux: dockerode multiplexes stdout/stderr with 8-byte frame headers.
	const stdout = new PassThrough()
	const stderr = new PassThrough()
	docker.modem.demuxStream(muxStream, stdout, stderr)

	// When the underlying mux stream closes, end stdout so the consumer
	// (e.g. lib-storage Upload) sees EOF.
	muxStream.on('end', () => {
		stdout.end()
		stderr.end()
	})
	muxStream.on('error', (err) => stdout.destroy(err))

	// Drain stderr to a buffer so we can include it in errors.
	const stderrChunks: Buffer[] = []
	stderr.on('data', (c: Buffer) => stderrChunks.push(c))

	// When the container exits non-zero, propagate as a stream error.
	container
		.wait()
		.then((res: any) => {
			if (res?.StatusCode !== 0) {
				const errText = Buffer.concat(stderrChunks).toString('utf-8').slice(0, 500)
				stdout.destroy(new Error(`[backup-tar-failed] alpine tar exit ${res?.StatusCode}: ${errText}`))
			}
		})
		.catch((err) => stdout.destroy(err))

	return {stream: stdout}
}

// =========================================================================
// Destination uploaders — consume the tar.gz stream
// =========================================================================

async function uploadToS3(
	stream: Readable,
	key: string,
	cfg: S3DestinationConfig,
	secretAccessKey: string,
): Promise<void> {
	const client = new S3Client({
		region: cfg.region,
		endpoint: cfg.endpoint,
		forcePathStyle: cfg.forcePathStyle,
		credentials: {accessKeyId: cfg.accessKeyId, secretAccessKey},
	})
	// lib-storage Upload handles multipart (>5MB) automatically.
	const upload = new Upload({
		client,
		params: {Bucket: cfg.bucket, Key: key, Body: stream, ContentType: 'application/gzip'},
	})
	await upload.done()
}

async function uploadToSftp(
	stream: Readable,
	remoteFile: string,
	cfg: SftpDestinationConfig,
	creds: Record<string, string>,
): Promise<void> {
	const sftp = new SFTPClient()
	const connectOpts: any = {host: cfg.host, port: cfg.port, username: cfg.username}
	if (cfg.authMethod === 'password') {
		connectOpts.password = creds.password
	} else {
		connectOpts.privateKey = creds.privateKey
		if (creds.passphrase) connectOpts.passphrase = creds.passphrase
	}
	try {
		await sftp.connect(connectOpts)
		await sftp.put(stream, remoteFile)
	} finally {
		await sftp.end().catch(() => {})
	}
}

async function uploadToLocal(
	stream: Readable,
	cfg: LocalDestinationConfig,
	filename: string,
): Promise<string> {
	const fullPath = join(cfg.path, filename)
	await mkdir(dirname(fullPath), {recursive: true})
	await new Promise<void>((resolve, reject) => {
		const ws = createWriteStream(fullPath)
		stream.on('error', reject)
		ws.on('error', reject)
		ws.on('finish', resolve)
		stream.pipe(ws)
	})
	return fullPath
}

// =========================================================================
// volumeBackupHandler — registered into BUILT_IN_HANDLERS['volume-backup']
// =========================================================================

export const volumeBackupHandler: BuiltInJobHandler = async (job, ctx): Promise<JobRunResult> => {
	const config = job.config as unknown as BackupJobConfig
	if (!config?.volumeName || !config?.destination) {
		return {status: 'failure', error: 'Backup job missing volumeName or destination config'}
	}

	const creds = await getBackupSecretStore().getCreds(job.id)
	const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
	const filename = `${config.volumeName}-${ts}.tar.gz`

	ctx.logger.log(`[scheduler/backup] starting ${config.volumeName} -> ${config.destination.type}`)

	let stream: Readable
	try {
		const out = await streamVolumeAsTarGz(config.volumeName)
		stream = out.stream
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		return {status: 'failure', error: `Failed to start tar stream: ${msg}`}
	}

	try {
		if (config.destination.type === 's3') {
			const secret = creds.secretAccessKey
			if (!secret) return {status: 'failure', error: 'Missing S3 secretAccessKey in vault'}
			const key = (config.destination.prefix ?? '') + filename
			await uploadToS3(stream, key, config.destination, secret)
			return {
				status: 'success',
				output: {filename, destination: 's3', bucket: config.destination.bucket, key},
			}
		}
		if (config.destination.type === 'sftp') {
			const remoteFile = config.destination.remotePath.replace(/\/$/, '') + '/' + filename
			await uploadToSftp(stream, remoteFile, config.destination, creds)
			return {status: 'success', output: {filename, destination: 'sftp', remoteFile}}
		}
		if (config.destination.type === 'local') {
			const fullPath = await uploadToLocal(stream, config.destination, filename)
			return {status: 'success', output: {filename, destination: 'local', path: fullPath}}
		}
		return {status: 'failure', error: 'Unknown destination type'}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		return {status: 'failure', error: msg}
	}
}

// =========================================================================
// testDestination — dry-run probe used by scheduler.testBackupDestination
//
// Uploads a 1KB probe file (livinity-probe-<ts>.txt) and (for s3/sftp)
// deletes it after, returning latency in ms + bytes uploaded.
// =========================================================================

export async function testDestination(input: {
	destination: BackupDestination
	creds: Record<string, string>
}): Promise<{success: true; latencyMs: number; bytesUploaded: number} | {success: false; error: string}> {
	const probe = Buffer.from('livinity-backup-probe\n')
	const filename = `livinity-probe-${Date.now()}.txt`
	const t0 = Date.now()

	try {
		if (input.destination.type === 's3') {
			const secret = input.creds.secretAccessKey
			if (!secret) return {success: false, error: 'Missing secretAccessKey'}
			const cfg = input.destination
			const client = new S3Client({
				region: cfg.region,
				endpoint: cfg.endpoint,
				forcePathStyle: cfg.forcePathStyle,
				credentials: {accessKeyId: cfg.accessKeyId, secretAccessKey: secret},
			})
			const key = (cfg.prefix ?? '') + filename
			await new Upload({
				client,
				params: {Bucket: cfg.bucket, Key: key, Body: Readable.from(probe)},
			}).done()
			// Best-effort delete probe
			await client.send(new DeleteObjectCommand({Bucket: cfg.bucket, Key: key})).catch(() => {})
		} else if (input.destination.type === 'sftp') {
			const cfg = input.destination
			const remoteFile = cfg.remotePath.replace(/\/$/, '') + '/' + filename
			await uploadToSftp(Readable.from(probe), remoteFile, cfg, input.creds)
			// Best-effort delete probe with a fresh connection
			try {
				const sftp = new SFTPClient()
				const opts: any = {host: cfg.host, port: cfg.port, username: cfg.username}
				if (cfg.authMethod === 'password') opts.password = input.creds.password
				else {
					opts.privateKey = input.creds.privateKey
					if (input.creds.passphrase) opts.passphrase = input.creds.passphrase
				}
				await sftp.connect(opts)
				await sftp.delete(remoteFile).catch(() => {})
				await sftp.end().catch(() => {})
			} catch {
				// Probe was uploaded successfully; failing to delete it is non-fatal.
			}
		} else if (input.destination.type === 'local') {
			await uploadToLocal(Readable.from(probe), input.destination, filename)
			await unlink(join(input.destination.path, filename)).catch(() => {})
		} else {
			return {success: false, error: 'Unknown destination type'}
		}
		return {success: true, latencyMs: Date.now() - t0, bytesUploaded: probe.length}
	} catch (err) {
		return {success: false, error: err instanceof Error ? err.message : String(err)}
	}
}
