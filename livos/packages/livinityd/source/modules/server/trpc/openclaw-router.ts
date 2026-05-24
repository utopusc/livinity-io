/**
 * Phase 206 — `openclaw.*` tRPC namespace.
 *
 * Thin wrapper around the openclaw 2026.5.20 native CLI (verified live on
 * Mini PC 2026-05-24). Replaces Phase 204's `provider.config.*` gateway env
 * file approach which the running openclaw agent never reads.
 *
 * Procedures (all adminProcedure-gated; all added to httpOnlyPaths in
 * ./common.ts so they survive `systemctl restart livos` mid-call):
 *
 *   - openclaw.providers.list      (query)    → ProviderInfo[]
 *   - openclaw.models.list         (query)    → ModelInfo[]
 *   - openclaw.auth.status         (query)    → AuthStatus
 *   - openclaw.auth.setApiKey      (mutation) → {profileId, path, restarted}
 *   - openclaw.auth.logout         (mutation) → {removed}
 *   - openclaw.config.setDefaultModel (mutation) → {ok, model}
 *
 * OAuth flows are NOT in this router — they are routed through the existing
 * `auth.xai.*` namespace (Phase 195) for xAI today; a generic `auth.flow.*`
 * surface for other providers is deferred to Plan 206-02 (separate file
 * `auth-flow-service.ts`).
 *
 * D-206-DI: factory pattern matches chromeMaster + xaiAuth + providerConfig.
 * Production livinityd boot constructs the router via `createOpenclawCliRouter()`
 * and wires it via `setProductionAppRouter()`. The default exported stub
 * throws `PRECONDITION_FAILED` + `OPENCLAW_CLI_UNAVAILABLE` on any call.
 *
 * INV-204-04 carry-forward — raw API keys NEVER returned in `auth.status`
 * response or `providers.list` response; `setApiKey` accepts the raw key on
 * the request side, persists, redacts before returning.
 */

import {z} from 'zod'
import {TRPCError} from '@trpc/server'

import {adminProcedure, router} from './trpc.js'
import {
	execOpenclawCli,
	parseJsonLines,
	parseJsonObject,
	OpenclawExecError,
	OpenclawNotInstalledError,
	OpenclawTimeoutError,
} from '../../openclaw-cli/cli-spawner.js'
import {
	previewKey,
	readAuthProfiles,
	removeProfileForProvider,
	setApiKeyProfile,
	type AuthProfilesPathOpts,
} from '../../openclaw-cli/auth-profiles-store.js'
import {
	bridgeFromOpencode,
	resolveOpencodeAuthPath,
} from '../../openclaw-cli/opencode-bridge.js'

// ─── Wire-format types (mirror openclaw CLI JSON output) ─────────────────────

export interface ProviderInfo {
	provider: string
	count: number
	defaults: string[]
	available: boolean
	configured: boolean
	selected: boolean
}

export interface ModelInfo {
	id: string
	name?: string
	provider: string
	contextWindow?: number
	reasoning?: boolean
	input?: string[]
}

export interface AuthStatus {
	configPath?: string
	agentDir?: string
	defaultModel?: string | null
	resolvedDefault?: string | null
	fallbacks?: string[]
	auth?: {
		storePath?: string
		providersWithOAuth?: string[]
		missingProvidersInUse?: string[]
		runtimeAuthRoutes?: Array<{
			provider: string
			runtime?: string
			authProvider?: string
			status: 'configured' | 'missing' | string
			effective?: unknown
		}>
		shellEnvFallback?: {enabled: boolean; appliedKeys?: string[]}
	}
}

// ─── Provider allow-list (defense-in-depth on shell-spawn arg validation) ────

/**
 * Allow-list for provider names sent to the CLI. The CLI itself rejects
 * unknown providers, but we validate at the tRPC seam too so a typo on the
 * client doesn't reach exec() with a weird argv. Maintained as a regex
 * instead of an enum because openclaw's provider catalog is large (35+) and
 * evolves with each release — we want forward-compat without a release
 * dependency.
 */
const PROVIDER_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/

const providerIdSchema = z.string().regex(PROVIDER_ID_REGEX, {
	message: 'provider id must be lowercase alphanumeric with hyphens (e.g. "openrouter", "openai-codex")',
})

/** Loose model id schema — provider/model or just model-id. */
const modelIdSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9._:\-\/@]+$/, {
	message: 'model id contains disallowed characters',
})

// ─── Dependency injection shape ──────────────────────────────────────────────

export interface OpenclawCliRouterDeps {
	/** Override binary path (tests). Otherwise auto-resolved. */
	openclawBinaryPath?: string
	/** Override state dir (tests). Otherwise read from OPENCLAW_STATE_DIR env. */
	stateDir?: string
	/** Override agent id (tests). Defaults to 'main'. */
	agentId?: string
	/**
	 * Optional restart hook fired after setApiKey / logout so the gateway
	 * picks up the new auth-profiles.json. The openclaw gateway already
	 * watches the file (auto-reload per upstream Probe A6 from Phase 205-01),
	 * so this hook is best-effort defense-in-depth — not required for
	 * correctness.
	 */
	onProvidersChanged?: () => Promise<void> | void
	/** Optional logger; falls back to console.warn on non-fatal errors. */
	logger?: {
		debug?: (...args: unknown[]) => void
		info?: (...args: unknown[]) => void
		warn?: (...args: unknown[]) => void
		error?: (...args: unknown[]) => void
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pathOpts(deps: OpenclawCliRouterDeps): AuthProfilesPathOpts {
	return {
		stateDir: deps.stateDir,
		agentId: deps.agentId,
	}
}

function mapCliError(err: unknown): TRPCError {
	if (err instanceof OpenclawNotInstalledError) {
		return new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message:
				'openclaw CLI is not installed or not reachable from livinityd. Check $OPENCLAW_BIN or the pnpm bin path.',
		})
	}
	if (err instanceof OpenclawTimeoutError) {
		return new TRPCError({
			code: 'TIMEOUT',
			message: `openclaw CLI call timed out: ${err.message}`,
		})
	}
	if (err instanceof OpenclawExecError) {
		return new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: `openclaw CLI returned an error: ${err.message}${
				err.stderr ? ` — stderr: ${err.stderr.slice(0, 200)}` : ''
			}`,
		})
	}
	if (err instanceof Error) {
		return new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message})
	}
	return new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		message: 'Unknown openclaw CLI error',
	})
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createOpenclawCliRouter(deps: OpenclawCliRouterDeps = {}) {
	const env = deps.stateDir
		? {...process.env, OPENCLAW_STATE_DIR: deps.stateDir}
		: undefined

	return router({
		providers: router({
			/**
			 * List all providers known to the openclaw catalog with their
			 * configured/selected state. Single call to
			 * `openclaw capability model providers`.
			 */
			list: adminProcedure.query(async () => {
				try {
					const {stdout} = await execOpenclawCli({
						args: ['capability', 'model', 'providers'],
						openclawBinaryPath: deps.openclawBinaryPath,
						env,
					})
					return parseJsonLines<ProviderInfo>(stdout)
				} catch (err) {
					throw mapCliError(err)
				}
			}),
		}),

		models: router({
			/**
			 * List all models known to the openclaw catalog (35+ providers
			 * × varying model counts; OpenRouter alone is 265 models). The
			 * `models.list` openclaw subcommand has no `view:'all'` flag
			 * (verified live 2026-05-24 — only --json) and already returns
			 * the full catalog. The "OpenRouter hidden in picker" upstream
			 * bug (#58106) is gateway-side and does not affect this CLI
			 * path.
			 */
			list: adminProcedure.query(async () => {
				try {
					const {stdout} = await execOpenclawCli({
						args: ['capability', 'model', 'list'],
						openclawBinaryPath: deps.openclawBinaryPath,
						env,
					})
					return parseJsonLines<ModelInfo>(stdout)
				} catch (err) {
					throw mapCliError(err)
				}
			}),
		}),

		auth: router({
			/**
			 * Read the current auth state for all providers. Returns the
			 * default model, agent dir, store path, and per-provider
			 * `configured`/`missing` status. Never includes raw keys.
			 */
			status: adminProcedure.query(async () => {
				try {
					const {stdout} = await execOpenclawCli({
						args: ['capability', 'model', 'auth', 'status'],
						openclawBinaryPath: deps.openclawBinaryPath,
						env,
					})
					return parseJsonObject<AuthStatus>(stdout)
				} catch (err) {
					throw mapCliError(err)
				}
			}),

			/**
			 * Persist a raw API key for a provider directly into the
			 * `<state>/agents/<id>/agent/auth-profiles.json` file. The
			 * openclaw gateway watches this file (Phase 205-01 Probe A6) so
			 * no explicit restart is required — but we still fire the
			 * `onProvidersChanged` hook for defense-in-depth.
			 *
			 * INV-204-04 — raw key is NEVER echoed back; response carries
			 * only a redacted preview.
			 */
			setApiKey: adminProcedure
				.input(
					z.object({
						provider: providerIdSchema,
						key: z.string().min(1).max(8192),
					}),
				)
				.mutation(async ({input}) => {
					try {
						const {path: profilePath, profileId} = await setApiKeyProfile(
							input.provider,
							input.key,
							pathOpts(deps),
						)
						let restarted = false
						if (deps.onProvidersChanged) {
							try {
								await deps.onProvidersChanged()
								restarted = true
							} catch (e) {
								deps.logger?.warn?.(
									'openclaw.auth.setApiKey onProvidersChanged hook failed',
									e,
								)
							}
						}
						return {
							ok: true as const,
							profileId,
							profilePath,
							preview: previewKey(input.key),
							restarted,
						}
					} catch (err) {
						throw mapCliError(err)
					}
				}),

			/**
			 * Remove the `<provider>:default` profile from
			 * auth-profiles.json. Idempotent — silently returns `removed:
			 * false` if the profile was already absent.
			 *
			 * Uses the CLI's `auth logout --provider X --json` so any
			 * side-effects the CLI maintains (caches, token revocation
			 * calls) are honoured. Falls back to direct file edit if the
			 * CLI call fails (defense-in-depth for the case where the CLI
			 * binary has changed shape between releases).
			 */
			logout: adminProcedure
				.input(z.object({provider: providerIdSchema}))
				.mutation(async ({input}) => {
					let cliOk = false
					try {
						await execOpenclawCli({
							args: [
								'capability',
								'model',
								'auth',
								'logout',
								'--provider',
								input.provider,
								'--json',
							],
							openclawBinaryPath: deps.openclawBinaryPath,
							env,
						})
						cliOk = true
					} catch (err) {
						deps.logger?.warn?.(
							`openclaw.auth.logout CLI failed for ${input.provider}; falling back to direct file edit`,
							err,
						)
					}
					try {
						const {removed} = await removeProfileForProvider(
							input.provider,
							pathOpts(deps),
						)
						if (deps.onProvidersChanged) {
							try {
								await deps.onProvidersChanged()
							} catch (e) {
								deps.logger?.warn?.(
									'openclaw.auth.logout onProvidersChanged hook failed',
									e,
								)
							}
						}
						return {ok: true as const, removed, cliOk}
					} catch (err) {
						throw mapCliError(err)
					}
				}),
		}),

		config: router({
			/**
			 * Set the workspace-wide default model. Writes to
			 * `agents.defaults.model.primary` in `openclaw.json` via the
			 * native `openclaw config set` subcommand.
			 *
			 * Use a quoted strict-JSON string so model ids with `/` (e.g.
			 * `openrouter/anthropic/claude-3-haiku`) survive the CLI's
			 * argparse path.
			 */
			setDefaultModel: adminProcedure
				.input(z.object({model: modelIdSchema}))
				.mutation(async ({input}) => {
					try {
						await execOpenclawCli({
							args: [
								'config',
								'set',
								'agents.defaults.model.primary',
								JSON.stringify(input.model),
								'--strict-json',
							],
							openclawBinaryPath: deps.openclawBinaryPath,
							env,
						})
						if (deps.onProvidersChanged) {
							try {
								await deps.onProvidersChanged()
							} catch (e) {
								deps.logger?.warn?.(
									'openclaw.config.setDefaultModel onProvidersChanged hook failed',
									e,
								)
							}
						}
						return {ok: true as const, model: input.model}
					} catch (err) {
						throw mapCliError(err)
					}
				}),

			/**
			 * Read the current default-model state (mirrors a subset of
			 * `auth.status`). Lightweight version for the composer to call
			 * without pulling the full auth surface.
			 */
			getDefaultModel: adminProcedure.query(async () => {
				try {
					const {stdout} = await execOpenclawCli({
						args: ['capability', 'model', 'auth', 'status'],
						openclawBinaryPath: deps.openclawBinaryPath,
						env,
					})
					const status = parseJsonObject<AuthStatus>(stdout)
					return {
						defaultModel: status.defaultModel ?? null,
						resolvedDefault: status.resolvedDefault ?? null,
					}
				} catch (err) {
					throw mapCliError(err)
				}
			}),
		}),

		/**
		 * Bridge opencode auth entries into openclaw auth-profiles.json.
		 *
		 * The Phase 195 xAI OAuth flow (auth.xai.start) lands tokens in
		 * opencode's own auth.json which the openclaw agent does NOT read.
		 * This procedure reads opencode's auth.json, converts each entry
		 * to openclaw's api_key shape (Bearer-compatible — xAI accepts the
		 * OAuth access token under both API key and Bearer headers
		 * interchangeably), and merges into auth-profiles.json.
		 *
		 * Call this AFTER `auth.xai.waitForCompletion` succeeds. Providers
		 * filter is optional — when omitted, every entry in opencode's
		 * auth.json is bridged.
		 *
		 * Known limitation: the bridged entry is a snapshot of the
		 * current OAuth access token. When opencode's TokenRefresher
		 * rotates the token, the bridged copy goes stale. Operators on
		 * long sessions should re-run the bridge before ~24h or paste a
		 * permanent xAI API key directly. (Phase 207 carry-over: wire
		 * a refresh-event subscriber so the bridge auto-refreshes.)
		 */
		bridgeFromOpencode: adminProcedure
			.input(
				z.object({
					providers: z.array(providerIdSchema).optional(),
					opencodeAuthPath: z.string().optional(),
				}),
			)
			.mutation(async ({input}) => {
				try {
					const result = await bridgeFromOpencode({
						...pathOpts(deps),
						providers: input.providers,
						opencodeAuthPath: input.opencodeAuthPath,
					})
					if (deps.onProvidersChanged) {
						try {
							await deps.onProvidersChanged()
						} catch (e) {
							deps.logger?.warn?.(
								'openclaw.auth.bridgeFromOpencode onProvidersChanged hook failed',
								e,
							)
						}
					}
					return {
						ok: true as const,
						bridged: result.bridged,
						skipped: result.skipped,
						profilePath: result.profilePath,
						opencodeAuthPath: result.opencodeAuthPath,
					}
				} catch (err) {
					throw mapCliError(err)
				}
			}),

		/**
		 * Read opencode auth.json metadata (without raw tokens) so the UI
		 * can show "bridgeable" hints. Returns the list of providers that
		 * exist in opencode's store, so the xAI card can render "Bridge
		 * existing xAI OAuth" CTA when applicable.
		 */
		opencodeProviders: adminProcedure.query(async () => {
			try {
				const path = resolveOpencodeAuthPath()
				const fs = await import('node:fs/promises')
				try {
					const raw = await fs.readFile(path, 'utf8')
					const parsed = JSON.parse(raw)
					if (parsed && typeof parsed === 'object') {
						return {
							path,
							providers: Object.entries(parsed as Record<string, {type?: string}>).map(
								([provider, entry]) => ({
									provider,
									type: entry?.type ?? 'unknown',
								}),
							),
						}
					}
				} catch (err: unknown) {
					const code = (err as NodeJS.ErrnoException).code
					if (code !== 'ENOENT') throw err
				}
				return {path, providers: []}
			} catch (err) {
				throw mapCliError(err)
			}
		}),

		/**
		 * Direct read of auth-profiles.json for diagnostic / migration use.
		 * Returns the parsed file with raw keys REDACTED to previews. Used
		 * by the diagnostic banner in the Providers tab.
		 */
		profiles: router({
			list: adminProcedure.query(async () => {
				try {
					const file = await readAuthProfiles(pathOpts(deps))
					const redacted = Object.entries(file.profiles).map(
						([profileId, profile]) => ({
							profileId,
							provider: profile.provider,
							type: profile.type,
							preview:
								profile.type === 'api_key'
									? previewKey(profile.key)
									: 'oauth',
						}),
					)
					return {version: file.version, profiles: redacted}
				} catch (err) {
					if (err instanceof Error) {
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: `Failed to read auth profiles: ${err.message}`,
						})
					}
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: 'Failed to read auth profiles',
					})
				}
			}),
		}),
	})
}

// ─── Default empty-injection stub ────────────────────────────────────────────

/**
 * Default exported router — every procedure throws `PRECONDITION_FAILED` +
 * `OPENCLAW_CLI_UNAVAILABLE` until livinityd boot swaps in a real factory
 * build via `setProductionAppRouter()`. Mirrors the chromeMaster / xaiAuth /
 * providerConfig empty-injection pattern.
 */
function makeStubProc() {
	return adminProcedure.query(() => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'OPENCLAW_CLI_UNAVAILABLE — livinityd boot has not wired the openclaw CLI router yet',
		})
	})
}

function makeStubMutation() {
	return adminProcedure.mutation(() => {
		throw new TRPCError({
			code: 'PRECONDITION_FAILED',
			message: 'OPENCLAW_CLI_UNAVAILABLE — livinityd boot has not wired the openclaw CLI router yet',
		})
	})
}

export const openclawCliRouter = router({
	providers: router({list: makeStubProc()}),
	models: router({list: makeStubProc()}),
	auth: router({
		status: makeStubProc(),
		setApiKey: makeStubMutation(),
		logout: makeStubMutation(),
	}),
	config: router({
		setDefaultModel: makeStubMutation(),
		getDefaultModel: makeStubProc(),
	}),
	profiles: router({list: makeStubProc()}),
})
