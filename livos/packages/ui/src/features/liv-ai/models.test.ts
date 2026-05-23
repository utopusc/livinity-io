// Phase 199-04 — models.ts contract + backend drift-lock.
//
// 5 cases:
//   1. LIV_AI_MODELS.length === 4
//   2. id order matches D-199-06 spec
//   3. DEFAULT_LIV_AI_MODEL_ID === 'grok-4.20-0309-non-reasoning' (D-199-07)
//   4. each model carries a truthy `Icon` (lucide forwardRef)
//   5. **DRIFT-LOCK (T-199-08 / T-199-04-01):** cross-package import of
//      `ALLOWED_XAI_MODELS` from the backend; set-equality on ids.
//
// Cross-package import precedent: `src/features/onboarding-flow/constants.ts`
// already imports `Region` from
// `../../../../livinityd/source/modules/locale/region-suggestion`. From
// `src/features/liv-ai/` the relative path is the same (4 ups → packages root
// → livinityd/source/...).
//
// If a future toolchain change blocks this cross-package vitest import, the
// fallback (documented in the plan) is an inline `EXPECTED_BACKEND_IDS`
// literal + REGRESSION-LOCK comment. We use the live import first because it
// is strictly stronger.

import {describe, expect, it} from 'vitest'

import {ALLOWED_XAI_MODELS} from '../../../../livinityd/source/modules/mastra/provider-router'

import {DEFAULT_LIV_AI_MODEL_ID, LIV_AI_MODELS, type LivAiModelId} from './models'

describe('LIV_AI_MODELS registry (Phase 199-04)', () => {
	it('Test 1: ships exactly 4 entries (D-199-06)', () => {
		expect(LIV_AI_MODELS).toHaveLength(3)
	})

	it('Test 2: id order matches the live-xAI chat-completion-capable list (P200-B drops multi-agent)', () => {
		expect(LIV_AI_MODELS.map((m) => m.id)).toEqual([
			'grok-4.20-0309-non-reasoning',
			'grok-4.20-0309-reasoning',
			'grok-4.3',
		])
	})

	it('Test 3: DEFAULT_LIV_AI_MODEL_ID is the non-reasoning variant (P199-UAT)', () => {
		expect(DEFAULT_LIV_AI_MODEL_ID).toBe('grok-4.20-0309-non-reasoning')
		// And the default must be one of the registered ids — type-level
		// guarantee, but assert at runtime too so a future stray rename of
		// the literal would fail loudly.
		const ids = LIV_AI_MODELS.map((m) => m.id) as readonly string[]
		expect(ids.includes(DEFAULT_LIV_AI_MODEL_ID)).toBe(true)
	})

	it('Test 4: every entry carries a truthy lucide `Icon` reference', () => {
		for (const m of LIV_AI_MODELS) {
			// lucide-react icons are forwardRef components — `object` (with
			// `$$typeof`) or `function` depending on toolchain. Both are truthy.
			expect(m.Icon).toBeTruthy()
			const t = typeof m.Icon
			expect(t === 'function' || t === 'object').toBe(true)
		}
	})

	it('Test 5: DRIFT-LOCK — UI ids set-equal backend ALLOWED_XAI_MODELS (T-199-08)', () => {
		const uiIds = LIV_AI_MODELS.map((m) => m.id).slice().sort()
		const backendIds = (ALLOWED_XAI_MODELS as readonly string[]).slice().sort()

		// Set-equality via sorted-array compare. Stricter than subset — if
		// either side drifts (UI references a model the backend rejects, OR
		// the backend ships a model the UI doesn't know how to render), this
		// test fails and forces an explicit sync.
		expect(uiIds).toEqual(backendIds)
	})
})

describe('LivAiModelId type (Phase 199-04)', () => {
	it('narrows to the 4 registered ids at compile time', () => {
		// Compile-time guarantee: assigning a value outside the union is a
		// TS error. Runtime touch keeps the symbol "used" so the type-only
		// import survives tree-shaking inspectors.
		const a: LivAiModelId = 'grok-4.20-0309-non-reasoning'
		expect(a).toBe('grok-4.20-0309-non-reasoning')
	})
})
