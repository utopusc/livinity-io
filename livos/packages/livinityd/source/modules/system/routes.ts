import os from 'node:os'
import {setTimeout} from 'node:timers/promises'

import {TRPCError} from '@trpc/server'
import {z} from 'zod'
import {$} from 'execa'
import fse from 'fs-extra'
import stripAnsi from 'strip-ansi'

import type {ProgressStatus} from '../apps/schema.js'
import {performReset, getResetStatus} from './factory-reset.js'
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

import {privateProcedure, publicProcedure, router} from '../server/trpc/trpc.js'

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
	factoryReset: privateProcedure
		.input(
			z.object({
				password: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			if (!(await ctx.user.validatePassword(input.password))) {
				throw new TRPCError({code: 'UNAUTHORIZED', message: 'Invalid password'})
			}
			systemStatus = 'resetting'
			let success = false
			try {
				success = await performReset(ctx.livinityd)
				if (success) {
					await setTimeout(1000)
					await ctx.livinityd.stop()
					await reboot()
				}
			} finally {
				if (!success) systemStatus = 'running'
			}
			return success
		}),
	// Public because we delete the user too and want to continue to get status updates
	getFactoryResetStatus: publicProcedure.query((): ProgressStatus | undefined => {
		return getResetStatus()
	}),
})
