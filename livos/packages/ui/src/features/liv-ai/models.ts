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

export const LIV_AI_MODELS = [
	{
		id: 'grok-4.20-0309-fast',
		name: 'Grok 4.20 Fast',
		description: 'Fast non-reasoning. Default.',
		Icon: Zap,
	},
	{
		id: 'grok-4.20-0309-non-reasoning',
		name: 'Grok 4.20',
		description: 'Standard non-reasoning.',
		Icon: Sparkles,
	},
	{
		id: 'grok-4.20-0309-reasoning',
		name: 'Grok 4.20 Think',
		description: 'Multi-step reasoning (slower).',
		Icon: Brain,
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

// D-199-07 — default model id (rotated from 'grok-4.20-0309-non-reasoning'
// pre-Phase 199-02 to the lower-latency `-fast` variant).
export const DEFAULT_LIV_AI_MODEL_ID: LivAiModelId = 'grok-4.20-0309-fast'
