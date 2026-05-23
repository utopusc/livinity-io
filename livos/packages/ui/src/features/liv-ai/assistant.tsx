/**
 * Phase 198-02 — Liv AI chat surface via assistant-ui.
 *
 * Wraps the Thread primitive with AssistantRuntimeProvider configured
 * to talk to livinityd's /chat/livAi Express route (Plan 198-01 ships
 * the backend). AssistantChatTransport handles all AI-SDK message
 * stream chunk-to-UI mapping automatically.
 *
 * Plans 198-03..07 layer on:
 *   198-03 — tool renderers (Generative UI for tool calls)
 *   198-04 — HITL Approval Card inline
 *   198-05 — ThreadList sidebar
 *   198-06 — Slash commands + suggested prompts + attachments
 *   198-07 — Empty state + theming + DevTools
 */

import {AssistantRuntimeProvider} from '@assistant-ui/react'
import {
	AssistantChatTransport,
	useChatRuntime,
} from '@assistant-ui/react-ai-sdk'

import {Thread} from '@/components/assistant-ui/thread'

import {ToolRenderers} from './tool-renderers'

export function Assistant() {
	const runtime = useChatRuntime({
		transport: new AssistantChatTransport({
			// Caddy reverse-proxy on Mini PC forwards /chat/* to livinityd:8080
			// unchanged. In local dev (vite proxy at :3000 → :8080), the same
			// path works (Plan 198-01 mounted POST /chat/:agentId on the
			// livinityd Express app behind an inline JWT auth gate).
			api: '/chat/livAi',
			// Send the existing LIVINITY_SESSION JWT cookie so the inline
			// chatAuthGate (Plan 198-01) authenticates the request the same
			// way as the rest of the UI's tRPC traffic.
			credentials: 'include',
		}),
	})

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			{/*
			 * Plan 198-03 — Generative UI tool renderers. Each child is the
			 * return value of `makeAssistantToolUI({toolName, render})` which
			 * registers a per-tool renderer in the runtime's tool registry
			 * via useAssistantToolUI (effect-only; renders null). Must mount
			 * BEFORE <Thread /> so registrations are present when the first
			 * tool-call message part is rendered.
			 */}
			<ToolRenderers />
			<Thread />
		</AssistantRuntimeProvider>
	)
}

export default Assistant
