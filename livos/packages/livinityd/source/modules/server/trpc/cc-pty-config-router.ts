/**
 * Phase 182-03 — cc-pty-config-router.ts
 *
 * Three adminProcedure-gated procedures for CC PTY session configuration:
 *   - ccPty.getConfig  (query)    — reads 7 liv:config:cc_pty_* Redis keys, returns defaults
 *   - ccPty.setConfig  (mutation) — writes partial subset of Redis keys
 *   - ccPty.validatePaths (query) — checks filesystem existence + writability of paths
 *
 * All 3 paths added to httpOnlyPaths in common.ts.
 * Path traversal guard active in validatePaths (rejects '..' paths).
 */

import {z} from 'zod'
import * as fs from 'node:fs/promises'

import {router, adminProcedure} from './trpc.js'

// ── Redis key prefix ──────────────────────────────────────────────────────────

const REDIS_PREFIX = 'liv:config:cc_pty_'

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
	skip_perms: true,
	default_cwd: '/home/bruce/liv',
	idle_h: 24,
	max_sessions: 10,
	allowed_paths: '/home/bruce/liv\n/home/bruce',
	force_terminal_phone: false,
	default_model: 'claude-opus-4-7',
} as const

// ── Schema ────────────────────────────────────────────────────────────────────

export const ccPtyConfigSchema = z.object({
	skip_perms: z.boolean(),
	default_cwd: z.string().max(512),
	idle_h: z.number().int().min(1).max(168),
	max_sessions: z.number().int().min(1).max(50),
	allowed_paths: z.string().max(4096),
	force_terminal_phone: z.boolean(),
	default_model: z.enum(['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']),
})

// ── Router ────────────────────────────────────────────────────────────────────

const ccPtyConfigRouter = router({
	getConfig: adminProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.redis
		const [sp, cwd, idle, maxS, paths, ftp, model] = await Promise.all([
			redis.get(REDIS_PREFIX + 'skip_perms'),
			redis.get(REDIS_PREFIX + 'default_cwd'),
			redis.get(REDIS_PREFIX + 'idle_h'),
			redis.get(REDIS_PREFIX + 'max_sessions'),
			redis.get(REDIS_PREFIX + 'allowed_paths'),
			redis.get(REDIS_PREFIX + 'force_terminal_phone'),
			redis.get(REDIS_PREFIX + 'default_model'),
		])
		return {
			skip_perms: sp !== null ? sp === 'true' : DEFAULTS.skip_perms,
			default_cwd: cwd ?? DEFAULTS.default_cwd,
			idle_h: idle !== null ? parseInt(idle, 10) : DEFAULTS.idle_h,
			max_sessions: maxS !== null ? parseInt(maxS, 10) : DEFAULTS.max_sessions,
			allowed_paths: paths ?? DEFAULTS.allowed_paths,
			force_terminal_phone: ftp !== null ? ftp === 'true' : DEFAULTS.force_terminal_phone,
			default_model: (model as (typeof DEFAULTS.default_model) | null) ?? DEFAULTS.default_model,
		}
	}),

	setConfig: adminProcedure
		.input(ccPtyConfigSchema.partial())
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.redis
			const writes: Array<[string, string]> = []
			if (input.skip_perms !== undefined) writes.push([REDIS_PREFIX + 'skip_perms', String(input.skip_perms)])
			if (input.default_cwd !== undefined) writes.push([REDIS_PREFIX + 'default_cwd', input.default_cwd])
			if (input.idle_h !== undefined) writes.push([REDIS_PREFIX + 'idle_h', String(input.idle_h)])
			if (input.max_sessions !== undefined) writes.push([REDIS_PREFIX + 'max_sessions', String(input.max_sessions)])
			if (input.allowed_paths !== undefined) writes.push([REDIS_PREFIX + 'allowed_paths', input.allowed_paths])
			if (input.force_terminal_phone !== undefined) writes.push([REDIS_PREFIX + 'force_terminal_phone', String(input.force_terminal_phone)])
			if (input.default_model !== undefined) writes.push([REDIS_PREFIX + 'default_model', input.default_model])
			if (writes.length > 0) {
				const pipeline = redis.pipeline()
				for (const [k, v] of writes) pipeline.set(k, v)
				await pipeline.exec()
			}
		}),

	validatePaths: adminProcedure
		.input(z.object({paths: z.array(z.string().max(512)).max(50)}))
		.query(async ({input}) => {
			const results = await Promise.all(
				input.paths.map(async (p) => {
					// Path traversal guard: reject paths containing '..'
					if (p.includes('..')) return {path: p, exists: false, writable: false}
					let exists = false
					let writable = false
					try {
						await fs.access(p, fs.constants.F_OK)
						exists = true
						try {
							await fs.access(p, fs.constants.W_OK)
							writable = true
						} catch {
							// exists but not writable
						}
					} catch {
						// does not exist
					}
					return {path: p, exists, writable}
				}),
			)
			return {results}
		}),
})

export default ccPtyConfigRouter
