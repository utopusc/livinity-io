// Phase 199-04 — Liv AI model registry (frontend).
//
// Phase 201-04 — Ported 1:1 from livos/packages/ui/src/features/liv-ai/
//   models.ts. No path remap (pure module).
//
// Static literal mirroring the backend allow-list at
// `livos/packages/livinityd/source/modules/mastra/provider-router.ts`
// (`ALLOWED_XAI_MODELS` + `LIV_AI_MODEL_LABELS`). Backend is the source of
// truth; this literal exists for:
//
//   1. Synchronous render before the `mastra.agent.listAvailableModels`
//      tRPC query resolves (offline / first-paint).
//   2. Per-item lucide icons.
//   3. Type narrowing — consumers of `LivAiModelId` get a string union for free.

import { Brain, Crown, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// P199 UAT hot-fix — verified against live `GET https://api.x.ai/v1/models`.
export const LIV_AI_MODELS = [
  {
    id: "grok-4.20-0309-non-reasoning",
    name: "Grok 4.20",
    description: "Fast non-reasoning. Default.",
    Icon: Zap,
  },
  {
    id: "grok-4.20-0309-reasoning",
    name: "Grok 4.20 Think",
    description: "Multi-step reasoning (slower).",
    Icon: Brain,
  },
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    description: "Latest. Reasoning + tool use.",
    Icon: Crown,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  Icon: LucideIcon;
}>;

export type LivAiModelId = (typeof LIV_AI_MODELS)[number]["id"];

// D-199-07 — default model id.
export const DEFAULT_LIV_AI_MODEL_ID: LivAiModelId =
  "grok-4.20-0309-non-reasoning";
