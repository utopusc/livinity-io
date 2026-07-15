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
import {CronExpressionParser} from 'cron-parser'
import cronstrue from 'cronstrue'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {testDestination, type BackupDestination} from './backup.js'
import {getBackupSecretStore} from './backup-secrets.js'
import {deleteJob as deleteJobRow, insertJob, listJobs as listAllJobs, updateJob} from './store.js'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Phase 329 APPS-04 (D-15): validate the cron expression with cron-parser's
// STRICT mode — which is far stricter than node-cron's lax `cron.validate`
// (strict rejects out-of-range fields, unresolvable aliases, AND an ambiguous
// dayOfMonth+dayOfWeek combination). cron-parser strict requires exactly 6
// fields (seconds-first), but the scheduler's UI + all built-in jobs use the
// standard 5-field (minute-first) convention, so a 5-field expression is
// normalized to 6 by prepending a `0` seconds field for VALIDATION ONLY — the
// original expression is what gets stored and run by node-cron. A 6-field
// (seconds-included) expression is validated as-is.
function assertValidCron(expr: string): void {
	const trimmed = expr.trim()
	const fieldCount = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
	const normalized = fieldCount === 5 ? `0 ${trimmed}` : trimmed
	// Throws on any invalid/ambiguous expression — caught by the zod superRefine.
	CronExpressionParser.parse(normalized, {strict: true})
}

// Human-readable preview (D-15) — e.g. "At 03:00 AM, only on Sunday". Falls back
// to the raw expression if cronstrue cannot describe it (already cron-validated).
function describeCron(expr: string): string {
	try {
		return cronstrue.toString(expr.trim())
	} catch {
		return expr.trim()
	}
}

const cronSchedule = z
	.string()
	.min(1)
	.max(100)
	.superRefine((s, ctx) => {
		try {
			assertValidCron(s)
		} catch (err) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: err instanceof Error ? err.message : 'Invalid cron expression',
			})
		}
	})

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

// Phase 329 APPS-04 (D-12/D-13): custom-command config. The command + args are
// stored as a binary + argv[] literal (NEVER a shell string) — the handler runs
// them with execa's shell option OFF, as the livinityd process user (non-root).
// `timeoutSec` is a MANDATORY bounded timeout (default 300s, hard-capped 3600s)
// so a hung child is always killed. Secrets are an env-var-NAME convention (UI
// help copy, 329-08) — the stored command/args must never contain literal
// secrets; here we only enforce the shape.
const customCommandConfigSchema = z.object({
	command: z.string().min(1).max(1024),
	args: z.array(z.string().max(4096)).max(128).default([]),
	timeoutSec: z.number().int().min(1).max(3600).default(300),
	workingDir: z.string().max(1024).optional(),
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
	type: z.enum(['image-prune', 'container-update-check', 'git-stack-sync', 'volume-backup', 'custom-command']),
	config: z.union([backupConfigSchema, customCommandConfigSchema, z.record(z.unknown())]).optional(),
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
			// D-15: return the cronstrue human-readable preview alongside the id so
			// the Add/Edit dialog can echo "runs at ..." without re-deriving it.
			return {id: savedId, schedulePreview: describeCron(input.schedule)}
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
