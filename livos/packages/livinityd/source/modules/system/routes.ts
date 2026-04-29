import os from 'node:os'
import fs, {stat as fsStat} from 'node:fs/promises'
import path from 'node:path'
import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import {$} from 'execa'
import fse from 'fs-extra'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import {getResetStatus, performFactoryReset, factoryResetInputSchema} from './factory-reset.js'
import {getUpdateStatus, performUpdate, getLatestRelease, readDeployedSha, resolveVersionLabel} from './update.js'
import {
	getCpuTemperature,
	getSystemDiskUsage,
	getDiskUsage,
	getMemoryUsage,
	getCpuUsage,
	reboot,
	shutdown,
	detectDevice,
	getSystemMemoryUsage,
	getIpAddresses,
	syncDns,
} from './system.js'

import {adminProcedure, privateProcedure, publicProcedure, router} from '../server/trpc/trpc.js'

type SystemStatus = 'running' | 'updating' | 'shutting-down' | 'restarting' | 'migrating' | 'resetting' | 'restoring'
let systemStatus: SystemStatus = 'running'

// Quick hack so we can set system status from migration module until we refactor this
export function setSystemStatus(status: SystemStatus) {
	systemStatus = status
}

export default router({
	online: publicProcedure.query(() => true),
	version: publicProcedure.query(async ({ctx}) => {
		// Phase 30 hot-patch round 8: derive the current version label from the
		// locally-deployed SHA via the same git-tag-aware resolver that
		// `checkUpdate` uses. Falls back to the legacy package.json version when
		// `.deployed-sha` is missing (first boot, never run update.sh).
		const deployedSha = await readDeployedSha()
		const versionLabel = deployedSha
			? await resolveVersionLabel(deployedSha, ctx.livinityd)
			: ctx.livinityd.versionName
		return {
			version: versionLabel,
			name: ctx.livinityd.versionName,
			sha: deployedSha,
			shortSha: deployedSha ? deployedSha.slice(0, 7) : undefined,
		}
	}),
	status: publicProcedure.query(() => systemStatus),
	updateStatus: privateProcedure.query(() => getUpdateStatus()),
	uptime: privateProcedure.query(() => os.uptime()),
	checkUpdate: privateProcedure.query(async ({ctx}) => {
		// Phase 30 UPD-01: GitHub commits API + .deployed-sha comparison.
		// New return shape: {available, sha, shortSha, message, author, committedAt}.
		return await getLatestRelease(ctx.livinityd)
	}),
	getReleaseChannel: privateProcedure.query(async ({ctx}) => {
		return (await ctx.livinityd.store.get('settings.releaseChannel')) || 'stable'
	}),
	setReleaseChannel: privateProcedure
		.input(
			z.object({
				channel: z.enum(['stable', 'beta']),
			}),
		)
		.mutation(async ({ctx, input}) => {
			return ctx.livinityd.store.set('settings.releaseChannel', input.channel)
		}),
	isExternalDns: privateProcedure.query(async ({ctx}) => {
		return await ctx.livinityd.store.get('settings.externalDns', true)
	}),
	setExternalDns: privateProcedure.input(z.boolean()).mutation(async ({ctx, input}) => {
		const previousExternalDns = await ctx.livinityd.store.get('settings.externalDns', true)
		if (previousExternalDns === input) return true
		await ctx.livinityd.store.set('settings.externalDns', input)
		try {
			const success = await syncDns()
			if (!success) throw new Error('Failed to synchronize external DNS setting')
			return true
		} catch (error) {
			await ctx.livinityd.store.set('settings.externalDns', previousExternalDns)
			throw error
		}
	}),
	update: privateProcedure.mutation(async ({ctx}) => {
		// Phase 30 UPD-02: concurrent-update guard (Pitfall #8).
		// Two clicks racing two parallel update.sh runs would corrupt the rsync.
		if (systemStatus === 'updating') {
			throw new TRPCError({code: 'CONFLICT', message: 'Update already in progress'})
		}
		systemStatus = 'updating'
		let success = false
		try {
			success = await performUpdate(ctx.livinityd)
			// Phase 30 UPD-02: NO ctx.livinityd.stop() — would sever the response stream.
			// Phase 30 UPD-02: NO reboot() — update.sh restarts services itself via
			// `systemctl restart livos liv-core liv-worker liv-memory` at the tail.
		} finally {
			// Mark running again whether or not the update succeeded; the UI polls
			// system.status to decide when to refresh. Errors (success=false) are
			// surfaced via getUpdateStatus().error.
			systemStatus = 'running'
		}
		return success
	}),
	// ─────────────────────────────────────────────────────────────────────
	// Phase 33 OBS-02 — list last N deploy history entries
	//   Reads /opt/livos/data/update-history/*.json (Phase 32 schema:
	//   <ts>-rollback.json / <ts>-precheck-fail.json + Phase 33 33-02
	//   adds <ts>-success.json / <ts>-failed.json). Returns the parsed
	//   bodies plus the source filename, sorted newest-first.
	// ─────────────────────────────────────────────────────────────────────
	listUpdateHistory: adminProcedure
		.input(z.object({limit: z.number().int().min(1).max(200).default(50)}))
		.query(async ({input}) => {
			const HISTORY_DIR = '/opt/livos/data/update-history'
			let entries: string[] = []
			try {
				entries = await fs.readdir(HISTORY_DIR)
			} catch (err: any) {
				if (err && err.code === 'ENOENT') return [] // dir absent on dev machines
				throw err
			}
			const jsonFiles = entries.filter((f) => f.endsWith('.json'))
			const records = await Promise.all(
				jsonFiles.map(async (f) => {
					try {
						const raw = await fs.readFile(path.join(HISTORY_DIR, f), 'utf8')
						const parsed = JSON.parse(raw)
						if (typeof parsed?.timestamp !== 'string') return null
						return {filename: f, ...parsed}
					} catch {
						return null // corrupt JSON: skip, don't crash the entire list
					}
				}),
			)
			const valid = records.filter((r): r is NonNullable<typeof r> => r !== null)
			valid.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
			return valid.slice(0, input.limit)
		}),

	// ─────────────────────────────────────────────────────────────────────
	// Phase 33 OBS-03 — read a single deploy log file (tail-500 default,
	//   full content on demand for download). 3-layer filename guard:
	//     1. basename equality (rejects '/' and '\')
	//     2. regex whitelist /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(log|json)$/
	//        (rejects '..foo.log' — leading '.' is forbidden; rejects
	//        '.bash_history' — no .log/.json extension)
	//     3. resolved-path startswith resolved HISTORY_DIR (defense-in-
	//        depth / refactor-safety). Resolving BOTH sides ensures the
	//        comparison works on Windows (path.resolve normalises drive +
	//        separator) — though in production HISTORY_DIR is the literal
	//        POSIX path on the Mini PC.
	// ─────────────────────────────────────────────────────────────────────
	readUpdateLog: adminProcedure
		.input(
			z.object({
				filename: z.string().min(1).max(200),
				full: z.boolean().default(false),
			}),
		)
		.query(async ({input}) => {
			const HISTORY_DIR = '/opt/livos/data/update-history'
			const FILENAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(log|json)$/

			// Layer 1: basename equality — rejects any path separator
			if (path.basename(input.filename) !== input.filename) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
			}
			// Layer 2: regex whitelist — first char must be alnum (rejects
			// '..hidden.log'), only alphanum + . _ - allowed, must end with
			// .log or .json (rejects '.bash_history').
			if (!FILENAME_RE.test(input.filename)) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
			}
			// Layer 3: resolved containment — defense-in-depth for refactor
			// safety. Resolve BOTH sides so the comparison works regardless of
			// host OS (Windows path.resolve injects a drive letter that won't
			// match a hard-coded POSIX prefix string).
			const HISTORY_DIR_RESOLVED = path.resolve(HISTORY_DIR)
			const resolved = path.resolve(HISTORY_DIR_RESOLVED, input.filename)
			if (!resolved.startsWith(HISTORY_DIR_RESOLVED + path.sep) && resolved !== HISTORY_DIR_RESOLVED) {
				throw new TRPCError({code: 'BAD_REQUEST', message: 'Invalid filename'})
			}

			// R-04 size cap: read stat before readFile to prevent a rogue/corrupt log
			// file from exhausting the livinityd heap and crashing the management plane.
			const MAX_LOG_BYTES = 50 * 1024 * 1024 // 50 MB
			try {
				const stat = await fsStat(resolved)
				if (stat.size > MAX_LOG_BYTES) {
					throw new TRPCError({
						code: 'PAYLOAD_TOO_LARGE',
						message: `Log file too large (${Math.round(stat.size / 1048576)}MB, max 50MB)`,
					})
				}
			} catch (err: any) {
				if (err instanceof TRPCError) throw err
				if (err && err.code === 'ENOENT') {
					throw new TRPCError({code: 'NOT_FOUND', message: 'Log file not found'})
				}
				throw err
			}

			let content: string
			try {
				content = await fs.readFile(resolved, 'utf8')
			} catch (err: any) {
				if (err && err.code === 'ENOENT') {
					throw new TRPCError({code: 'NOT_FOUND', message: 'Log file not found'})
				}
				throw err
			}

			if (input.full) return {filename: input.filename, content, truncated: false}

			const lines = content.split('\n')
			const TAIL = 500
			if (lines.length <= TAIL) return {filename: input.filename, content, truncated: false}
			const tail = lines.slice(-TAIL).join('\n')
			return {filename: input.filename, content: tail, truncated: true, totalLines: lines.length}
		}),

	hiddenService: privateProcedure.query(async ({ctx}) => {
		try {
			return await fse.readFile(`${ctx.livinityd.dataDirectory}/tor/data/web/hostname`, 'utf-8')
		} catch (error) {
			ctx.livinityd.logger.error(`Failed to read hidden service for ui`, error)
			return ''
		}
	}),
	device: privateProcedure.query(() => detectDevice()),
	cpuTemperature: privateProcedure.query(() => getCpuTemperature()),
	systemDiskUsage: privateProcedure.query(({ctx}) => getSystemDiskUsage(ctx.livinityd)),
	diskUsage: privateProcedure.query(({ctx}) => getDiskUsage(ctx.livinityd)),
	systemMemoryUsage: privateProcedure.query(({ctx}) => getSystemMemoryUsage()),
	memoryUsage: privateProcedure.query(({ctx}) => getMemoryUsage(ctx.livinityd)),
	cpuUsage: privateProcedure.query(({ctx}) => getCpuUsage(ctx.livinityd)),
	getIpAddresses: privateProcedure.query(() => getIpAddresses()),
	shutdown: privateProcedure.mutation(async ({ctx}) => {
		systemStatus = 'shutting-down'
		await ctx.livinityd.stop()
		await shutdown()

		return true
	}),
	restart: privateProcedure.mutation(async ({ctx}) => {
		systemStatus = 'restarting'
		await ctx.livinityd.stop()
		await reboot()

		return true
	}),
	logs: privateProcedure
		.input(
			z.object({
				type: z.enum(['livos', 'system']),
			}),
		)
		.query(async ({input}) => {
			let process
			if (input.type === 'livos') {
				process = await $`journalctl --unit livinity --unit livinityd-production --unit livinityd --unit ui --lines 1500`
			}
			if (input.type === 'system') {
				process = await $`journalctl --lines 1500`
			}
			return stripAnsi(process!.stdout)
		}),
	//
	// v29.2 Phase 37 — system.factoryReset({preserveApiKey}) replaces the legacy
	// password-gated route. adminProcedure-only; pre-flight checks live inside
	// performFactoryReset (see factory-reset.ts D-RT-04/05). Returns 202-style
	// {accepted, eventPath, snapshotPath} immediately; the actual wipe spawns
	// in a transient systemd-run scope (Plan 03 inserts the spawn at
	// SPAWN_INSERTION_POINT). Registered in httpOnlyPaths in common.ts so the
	// long-running mutation cannot ride the WebSocket (mirror system.update).
	factoryReset: adminProcedure
		.input(factoryResetInputSchema)
		.mutation(async ({ctx, input}) => {
			systemStatus = 'resetting'
			try {
				return await performFactoryReset(ctx.livinityd, input)
			} catch (error) {
				systemStatus = 'running'
				throw error
			}
		}),
	// Public because we delete the user too and want to continue to get status updates
	getFactoryResetStatus: publicProcedure.query((): ProgressStatus | undefined => {
		return getResetStatus()
	}),
})
