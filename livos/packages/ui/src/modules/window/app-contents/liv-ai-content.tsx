/**
 * Phase 198-02 — Liv AI window content.
 *
 * Rewired from Phase 197-06 LivAiChatWindow (deleted) to the new
 * assistant-ui Assistant component which wraps AssistantRuntimeProvider
 * + Thread + the upcoming Plans 198-03..07 generative-UI / HITL /
 * ThreadList layers.
 *
 * Mounted by window-content.tsx's switch on appId='LIVINITY_liv-ai'.
 */

import {Assistant} from '@/features/liv-ai/assistant'

export default function LivAiContent() {
	return <Assistant />
}
