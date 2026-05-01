/**
 * Phase 47 Plan 02 — diagnostics module barrel.
 *
 * Re-exports the public API surface of the Wave-2 diagnostic source files
 * (`capabilities.ts` for FR-TOOL-01/02; Wave-3 + Wave-4 will add
 * `model-identity.ts` and `app-health.ts` siblings) and adds two thin
 * convenience wrappers — `diagnoseRegistry()` + `flushAndResync(opts)` —
 * so `routes.ts` (Wave 5) gets a tidy facade instead of having to deal with
 * the `realDiagnoseRegistry` / `realFlushAndResync` factory objects directly.
 *
 * Pattern mirrors `livos/packages/livinityd/source/modules/fail2ban-admin/index.ts`
 * exactly (the 5-file module shape).
 */

// ── Re-export factories + types from capabilities.ts ────────────────────────
export {
	BUILT_IN_TOOL_IDS,
	DiagnosticsClientError,
	makeDiagnoseRegistry,
	makeFlushAndResync,
	realDiagnoseRegistry,
	realFlushAndResync,
	type AuditRow,
	type DiagnoseRegistryResult,
	type DiagnosticsErrorKind,
	type FlushAndResyncResult,
	type FlushScope,
	type PgPoolLike,
	type PreconditionEvaluator,
	type RedisLike,
	type RedisPipelineLike,
} from './capabilities.js'

// ── Re-export factories + types from model-identity.ts (Phase 47 Plan 03) ──
export {
	makeDiagnoseModelIdentity,
	realDiagnoseModelIdentity,
	type DiagnoseModelIdentityResult,
	type ExecFileFn as ModelIdentityExecFileFn,
	type FetchFn as ModelIdentityFetchFn,
	type ModelIdentityDeps,
	type ModelIdentityVerdict,
} from './model-identity.js'

// ── Thin convenience wrappers ──────────────────────────────────────────────
import {realDiagnoseRegistry, realFlushAndResync} from './capabilities.js'
import type {DiagnoseRegistryResult, FlushAndResyncResult, FlushScope} from './capabilities.js'
import {realDiagnoseModelIdentity} from './model-identity.js'
import type {DiagnoseModelIdentityResult} from './model-identity.js'

/**
 * High-level facade for the FR-TOOL-01 diagnostic. Routes.ts (Wave 5)
 * imports this as `import {diagnoseRegistry} from './diagnostics/index.js'`.
 */
export async function diagnoseRegistry(): Promise<DiagnoseRegistryResult> {
	return realDiagnoseRegistry.diagnose()
}

/**
 * High-level facade for the FR-TOOL-02 atomic-swap resync. Defaults `scope`
 * to `'builtins'` (the Phase-47 surface — Wave 5 RegistryCard never invokes
 * `scope: 'all'` in v29.4).
 */
export async function flushAndResync(opts: {
	scope?: FlushScope
	actorUserId?: string
}): Promise<FlushAndResyncResult> {
	return realFlushAndResync.run({
		scope: opts.scope ?? 'builtins',
		actorUserId: opts.actorUserId,
	})
}

/**
 * High-level facade for the FR-MODEL-01 / FR-MODEL-02 6-step diagnostic.
 * Plan 47-04's adminProcedure consumes this. The wrapper exists to give
 * routes.ts a single shape to import (rather than dealing with
 * `realDiagnoseModelIdentity.diagnose()` directly).
 */
export async function diagnoseModelIdentity(): Promise<DiagnoseModelIdentityResult> {
	return realDiagnoseModelIdentity.diagnose()
}
