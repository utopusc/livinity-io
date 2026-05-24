/**
 * Phase 204-01 — `provider.config.*` tRPC router.
 *
 * Backs the `/settings → Providers` tab (Plan 204-02). Three adminProcedure-
 * gated routes:
 *
 *   - provider.config.list   → ProviderRow[]           (redacted; INV-204-04)
 *   - provider.config.set    → {provider, key}         → {ok, envFilePath, restartTriggered, restartRequired}
 *   - provider.config.delete → {provider}              → {ok, envFilePath, restartTriggered, restartRequired}
 *
 * Locks honoured:
 *   D-204-01 — Redis hash `liv:provider:keys` via ProviderKeyStore.
 *   D-204-03 — z.enum(PROVIDER_ENUM) gates input; unknown providers rejected.
 *   D-204-04 — On every set/delete: env-file write → restart hook → return.
 *   D-204-11 — Logger lines + error messages NEVER include the raw key.
 *   INV-204-04 — list() returns only the redacted preview.
 *   INV-204-08 — Adds 3 paths to httpOnlyPaths; no other routing mutations.
 *
 * Factory-DI pattern mirrors mcp-config-router.ts: livinityd boot supplies
 * a real `createProviderConfigRouter({keyStore, envFileWriter, restartHook,
 * logger})` build via setProductionAppRouter. The empty-injection stub
 * throws PRECONDITION_FAILED + PROVIDER_CONFIG_UNAVAILABLE on every call
 * until that injection lands.
 */

import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from './trpc.js'
import {
	PROVIDER_ENUM,
	type ProviderKeyStore,
	type ProviderName,
	type ProviderRow,
	redactKey,
} from '../../provider/key-store.js'
import {
	InvalidKeyFormatError,
	KEY_SHAPE_REGEX,
	type EnvFileWriter,
} from '../../provider/env-file-writer.js'
import type {RestartHook} from '../../provider/restart-hook.js'

// ── Schemas ──────────────────────────────────────────────────────────────

const ProviderSchema = z.enum(PROVIDER_ENUM as readonly [ProviderName, ...ProviderName[]])

/**
 * KEY_SHAPE_REGEX matches the writer's own shape gate so a value that the
 * writer would later reject never even hits Redis (T-204-04 fail-fast).
 *
 * The min(8) + regex combine: regex enforces 8-500 chars + charset, but zod
 * emits a clean message when the input is too short (vs the regex's terse
 * pattern-mismatch).
 */
const KeySchema = z
	.string()
	.trim()
	.min(8, 'INVALID_KEY_FORMAT: key must be at least 8 characters')
	.max(500, 'INVALID_KEY_FORMAT: key must be at most 500 characters')
	.regex(
		KEY_SHAPE_REGEX,
		'INVALID_KEY_FORMAT: key may only contain letters, digits, dot, dash, underscore',
	)

const SetInput = z.object({
	provider: ProviderSchema,
	key: KeySchema,
})

const DeleteInput = z.object({
	provider: ProviderSchema,
})

// ── Public response shapes ────────────────────────────────────────────────

export interface ProviderConfigListResponse {
	providers: ProviderRow[]
}

export interface ProviderConfigMutationResponse {
	ok: true
	envFilePath: string
	restartTriggered: boolean
	restartRequired: boolean
	restartReason?: string
}

// ── Factory deps ──────────────────────────────────────────────────────────

export interface ProviderConfigRouterDeps {
	keyStore: Pick<ProviderKeyStore, 'set' | 'delete' | 'list'>
	envFileWriter: Pick<EnvFileWriter, 'sync'>
	restartHook: RestartHook
	logger: {
		info(msg: string): void
		warn(msg: string, err?: unknown): void
		error?(msg: string, err?: unknown): void
	}
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createProviderConfigRouter(deps: ProviderConfigRouterDeps) {
	return router({
		// ── list ────────────────────────────────────────────────────────────
		// INV-204-04 — returns only redacted previews. NEVER the raw key.
		list: adminProcedure.query(async (): Promise<ProviderConfigListResponse> => {
			const providers = await deps.keyStore.list()
			return {providers}
		}),

		// ── set ─────────────────────────────────────────────────────────────
		// Flow:
		//   1. keyStore.set (Redis)
		//   2. envFileWriter.sync (regen /etc/default/liv-claw-gateway or fallback)
		//   3. restartHook (sudo systemctl restart — graceful on failure)
		set: adminProcedure
			.input(SetInput)
			.mutation(async ({input}): Promise<ProviderConfigMutationResponse> => {
				try {
					await deps.keyStore.set(input.provider, input.key)
				} catch (err) {
					// INV-204-06 — error message never includes the raw key.
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: `PROVIDER_REDIS_WRITE_FAILED: could not persist key for '${input.provider}' (preview=${redactKey(input.provider, input.key)})`,
						cause: err,
					})
				}

				let envFilePath: string
				try {
					const result = await deps.envFileWriter.sync()
					envFilePath = result.path
				} catch (err) {
					// Writer failure (EACCES on both paths, ENOSPC, etc.).
					// Redis write already succeeded; surface a clean error so
					// the UI can suggest manual recovery.
					if (err instanceof InvalidKeyFormatError) {
						throw new TRPCError({
							code: 'BAD_REQUEST',
							message: err.message,
						})
					}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: `PROVIDER_ENV_WRITE_FAILED: ${err instanceof Error ? err.message : 'unknown error'}`,
						cause: err,
					})
				}

				const restart = await deps.restartHook()
				if (!restart.ok) {
					deps.logger.warn(
						`[provider-config] set ${input.provider} OK but gateway restart failed — operator must SSH and restart manually`,
					)
					return {
						ok: true,
						envFilePath,
						restartTriggered: false,
						restartRequired: true,
						restartReason: restart.reason,
					}
				}

				deps.logger.info(
					`[provider-config] set ${input.provider} OK (env file: ${envFilePath}; gateway restart kicked off)`,
				)
				return {
					ok: true,
					envFilePath,
					restartTriggered: true,
					restartRequired: false,
				}
			}),

		// ── delete ──────────────────────────────────────────────────────────
		// Flow mirrors set minus the keyStore.set step. Idempotent — deleting
		// a missing provider still triggers the env-file regen + restart so
		// the gateway picks up the (now-missing) entry.
		delete: adminProcedure
			.input(DeleteInput)
			.mutation(async ({input}): Promise<ProviderConfigMutationResponse> => {
				try {
					await deps.keyStore.delete(input.provider)
				} catch (err) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: `PROVIDER_REDIS_DELETE_FAILED: could not remove '${input.provider}'`,
						cause: err,
					})
				}

				let envFilePath: string
				try {
					const result = await deps.envFileWriter.sync()
					envFilePath = result.path
				} catch (err) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: `PROVIDER_ENV_WRITE_FAILED: ${err instanceof Error ? err.message : 'unknown error'}`,
						cause: err,
					})
				}

				const restart = await deps.restartHook()
				if (!restart.ok) {
					deps.logger.warn(
						`[provider-config] delete ${input.provider} OK but gateway restart failed`,
					)
					return {
						ok: true,
						envFilePath,
						restartTriggered: false,
						restartRequired: true,
						restartReason: restart.reason,
					}
				}

				deps.logger.info(
					`[provider-config] delete ${input.provider} OK (env file: ${envFilePath}; gateway restart kicked off)`,
				)
				return {
					ok: true,
					envFilePath,
					restartTriggered: true,
					restartRequired: false,
				}
			}),
	})
}

// ── Empty-injection stub ─────────────────────────────────────────────────

const notInjected = (): never => {
	throw new TRPCError({
		code: 'PRECONDITION_FAILED',
		message: 'PROVIDER_CONFIG_UNAVAILABLE: provider-config router not yet injected — livinityd boot did not wire the key store',
	})
}

export const providerConfigRouter = router({
	list: adminProcedure.query(() => notInjected()),
	set: adminProcedure.input(SetInput).mutation(() => notInjected()),
	delete: adminProcedure.input(DeleteInput).mutation(() => notInjected()),
})

export type ProviderConfigRouter = ReturnType<typeof createProviderConfigRouter>
