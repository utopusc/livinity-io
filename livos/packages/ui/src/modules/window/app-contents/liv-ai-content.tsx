/**
 * Phase 197-06 — Liv AI window content.
 *
 * Mounted by window-content.tsx's switch on appId='LIVINITY_liv-ai'.
 * Operator clicks the Liv AI icon in the Dock → window-manager opens a
 * window → this component renders the chat surface.
 */

import {LivAiChatWindow} from '@/features/liv-ai/liv-ai-chat-window'

export default function LivAiContent() {
	return <LivAiChatWindow />
}
