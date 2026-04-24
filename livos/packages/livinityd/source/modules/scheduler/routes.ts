// Phase 20 — Scheduler tRPC routes (admin-only).
//
// Five routes under adminProcedure:
//   listJobs              (query)    — UI list of all built-in + user jobs
//   upsertJob             (mutation) — insert or update; for backup jobs,
//                                      encrypts creds into Redis vault and
//                                      strips them from the PG row
//   deleteJob             (mutation) — DB row + cascade-delete creds
//   runNow                (mutation) — fire job immediately, bypass cron
//   testBackupDestination (mutation) — dry-run probe upload (1KB file)
//
// All mutations call ctx.livinityd.scheduler.reload() so cron registrations
// reflect the new state without a daemon restart.

import {TRPCError} from '@trpc/server'
import * as cron from 'node-cron'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {testDestination, type BackupDestination} from './backup.js'
import {getBackupSecretStore} from './backup-secrets.js'
import {deleteJob as deleteJobRow, insertJob, listJobs as listAllJobs, updateJob} from './store.js'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const cronSchedule = z
	.string()
	.min(1)
	.max(100)
	.refine((s) => cron.validate(s), {message: 'Invalid cron expression'})

const s3DestSchema = z.object({
	type: z.literal('s3'),
	endpoint: z.string().url().optional(),
	region: z.string().min(1).max(64),
	bucket: z.string().min(1).max(255),
	prefix: z.string().max(255).optional(),
	accessKeyId: z.string().min(1).max(255),
	forcePathStyle: z.boolean().optional(),
})

const sftpDestSchema = z.object({
	type: z.literal('sftp'),
	host: z.string().min(1).max(255),
	port: z.number().int().min(1).max(65535),
	username: z.string().min(1).max(64),
	remotePath: z.string().min(1).max(1024),
	authMethod: z.enum(['password', 'privateKey']),
})

const localDestSchema = z.object({
	type: z.literal('local'),
	path: z.string().min(1).max(1024).startsWith('/'),
})

const destinationSchema = z.discriminatedUnion('type', [s3DestSchema, sftpDestSchema, localDestSchema])

const credsSchema = z.record(z.string().min(1), z.string()).optional()

const backupConfigSchema = z.object({
	volumeName: z.string().min(1).max(255),
	destination: destinationSchema,
	retention: z.object({keepLast: z.number().int().min(1).max(365)}).optional(),
})

// upsert input: id optional (insert) or required (update). name+schedule+type
// are always required. creds only meaningful for backup jobs (ignored otherwise).
const upsertSchema = z.object({
	id: z.string().uuid().optional(),
	name: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, 'Name must start with alphanumeric and contain only [a-zA-Z0-9_.-]'),
	schedule: cronSchedule,
	type: z.enum(['image-prune', 'container-update-check', 'git-stack-sync', 'volume-backup']),
	config: z.union([backupConfigSchema, z.record(z.unknown())]).optional(),
	enabled: z.boolean().default(true),
	creds: credsSchema,
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default router({
	// List all jobs — built-in + user-created. Includes last_run / next_run.
	listJobs: adminProcedure.query(async () => {
		return listAllJobs()
	}),

	// Insert new or update existing. For backup jobs, encrypts and stores creds
	// in Redis vault; the PG row never sees the secrets. Triggers
	// scheduler.reload() so cron registrations update immediately.
	upsertJob: adminProcedure.input(upsertSchema).mutation(async ({ctx, input}) => {
		try {
			const config = (input.config ?? {}) as Record<string, unknown>

			let savedId: string
			if (input.id) {
				const updated = await updateJob(input.id, {
					name: input.name,
					schedule: input.schedule,
					config,
					enabled: input.enabled,
				})
				if (!updated) throw new TRPCError({code: 'NOT_FOUND', message: 'Job not found'})
				savedId = updated.id
			} else {
				const created = await insertJob({
					name: input.name,
					schedule: input.schedule,
					type: input.type,
					config,
					enabled: input.enabled,
				})
				savedId = created.id
			}

			// For backup jobs, store creds in encrypted Redis vault (NEVER in PG)
			if (input.type === 'volume-backup' && input.creds && Object.keys(input.creds).length > 0) {
				await getBackupSecretStore().setCreds(savedId, input.creds)
			}

			// Refresh cron registrations so changes take effect without a restart
			await ctx.livinityd.scheduler.reload()
			return {id: savedId}
		} catch (err: any) {
			if (err instanceof TRPCError) throw err
			// PG unique constraint violation on `name`
			if (err?.code === '23505') {
				throw new TRPCError({
					code: 'CONFLICT',
					message: `Job name '${input.name}' is already in use`,
				})
			}
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err?.message || 'Failed to upsert job',
			})
		}
	}),

	deleteJob: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({ctx, input}) => {
			try {
				const ok = await deleteJobRow(input.id)
				if (!ok) throw new TRPCError({code: 'NOT_FOUND', message: 'Job not found'})
				// Cascade-delete creds (no-op if none)
				await getBackupSecretStore().deleteAll(input.id)
				await ctx.livinityd.scheduler.reload()
				return {success: true}
			} catch (err: any) {
				if (err instanceof TRPCError) throw err
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err?.message || 'Failed to delete job',
				})
			}
		}),

	runNow: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({ctx, input}) => {
			return ctx.livinityd.scheduler.runNow(input.id)
		}),

	testBackupDestination: adminProcedure
		.input(
			z.object({
				destination: destinationSchema,
				creds: z.record(z.string(), z.string()),
			}),
		)
		.mutation(async ({input}) => {
			const result = await testDestination({
				destination: input.destination as BackupDestination,
				creds: input.creds,
			})
			if (!result.success) {
				throw new TRPCError({code: 'BAD_REQUEST', message: result.error})
			}
			return result
		}),
})
