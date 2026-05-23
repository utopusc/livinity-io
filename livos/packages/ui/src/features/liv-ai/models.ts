// Phase 199-04 — Liv AI model registry (frontend).
//
// Static 4-item literal mirroring the backend allow-list at
// `livos/packages/livinityd/source/modules/mastra/provider-router.ts`
// (`ALLOWED_XAI_MODELS` + `LIV_AI_MODEL_LABELS`). Backend is the source of
// truth; this literal exists for:
//
//   1. Synchronous render before the `mastra.agent.listAvailableModels`
//      tRPC query resolves (offline / first-paint).
//   2. Per-item lucide icons (`Icon` field) — the backend catalogue carries
//      only `{id, name, description}`; icons are a UI concern.
//   3. Type narrowing — consumers of `LivAiModelId` get a 4-id string
//      union for free.
//
// **Drift-lock (T-199-08):** `models.test.ts` imports `ALLOWED_XAI_MODELS`
// from the backend at test time and asserts set-equality on ids. If a future
// plan widens the backend list without bumping this literal, the test
// fails CI and forces a sync.

import {Brain, Crown, Sparkles, Zap} from 'lucide-react'
import type {LucideIcon} from 'lucide-react'

// P199 UAT hot-fix: list rebuilt from a live `GET https://api.x.ai/v1/models`
// against the operator's account. `grok-4.20-0309-fast` does not exist on this
// subscription — calls 404'd with "model … does not exist or your team does
// not have access to it". Real models for this account:
//   - grok-4.20-0309-non-reasoning  (chat default)
//   - grok-4.20-0309-reasoning      (think)
//   - grok-4.20-multi-agent-0309    (multi-agent)
//   - grok-4.3                       (latest)
export const LIV_AI_MODELS = [
	{
		id: 'grok-4.20-0309-non-reasoning',
		name: 'Grok 4.20',
		description: 'Fast non-reasoning. Default.',
		Icon: Zap,
	},
	{
		id: 'grok-4.20-0309-reasoning',
		name: 'Grok 4.20 Think',
		description: 'Multi-step reasoning (slower).',
		Icon: Brain,
	},
	{
		id: 'grok-4.20-multi-agent-0309',
		name: 'Grok 4.20 Multi-Agent',
		description: 'Advanced multi-agent orchestration.',
		Icon: Sparkles,
	},
	{
		id: 'grok-4.3',
		name: 'Grok 4.3',
		description: 'Latest. Reasoning + tool use.',
		Icon: Crown,
	},
] as const satisfies ReadonlyArray<{
	id: string
	name: string
	description: string
	Icon: LucideIcon
}>

export type LivAiModelId = (typeof LIV_AI_MODELS)[number]['id']

// D-199-07 — default model id. Rotated from `grok-4.20-0309-fast` (didn't
// exist on the account) to `grok-4.20-0309-non-reasoning` per P199 UAT.
export const DEFAULT_LIV_AI_MODEL_ID: LivAiModelId = 'grok-4.20-0309-non-reasoning'
