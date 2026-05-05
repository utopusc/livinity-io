// v32 Chat Route — top-level orchestrator (Phase 88: SSE wired).
//
// This route coexists with /ai-chat (legacy) and is accessible at /ai-chat-v2
// for dev preview during Wave 4. P90 will make this the default /ai-chat.
//
// History:
//   - P81 stood up the file with mock streaming + 5 mock messages
//   - P82 shipped the ToolCallPanel API but left it unmounted here
//   - P88 (this file) replaces the mock with real SSE via useLivAgentStream,
//     mounts ToolCallPanel, adds the AgentSelector, consumes status_detail
//     chunks, and listens for `liv-sidebar-toggled` to shift layout.
//
// Constraint surface (per phase 88 CONTEXT):
//   - ZERO changes to v32/types.ts (P81 lane)
//   - ZERO changes to ToolCallPanel.tsx (P82 lane)
//   - ZERO changes to views/ (P83 lane)
//   - ZERO changes to mcp/ components (P84 lane)
//   - ZERO changes to liv/packages/core/ (sacred SHA gate)
//   - ZERO references to the legacy WebSocket hook (verified by grep guard)

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'

import {ThemeToggle} from '@/components/theme-toggle'
import {useLivAgentStream} from '@/lib/use-liv-agent-stream'
import {cn} from '@/shadcn-lib/utils'

import type {Agent} from '../../agents/agents-api'
import {AgentSelector} from './AgentSelector'
import {ChatComposer} from './ChatComposer'
import {MessageThread} from './MessageThread'
import {StatusDetailCard} from './StatusDetailCard'
import {ToolCallPanel} from './ToolCallPanel'
import {
	isStreamActive,
	sseSnapshotsToV32List,
	sseStateToChatMessages,
	streamStatusToAgentStatus,
} from './lib/sse-adapter'
import {shouldAutoOpen} from './lib/is-visual-tool'
import type {Attachment, ChatMessage} from './types'

// ---------------------------------------------------------------------------
// Stable per-mount conversation id — v32 has no persistence layer yet
// ---------------------------------------------------------------------------

function makeConversationId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return `v32-${crypto.randomUUID()}`
	}
	return `v32-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

// ---------------------------------------------------------------------------
// Route component
// ---------------------------------------------------------------------------

export default function AiChatV32() {
	// One conversationId per mount; resets if the user remounts the route.
	const [conversationId] = useState(makeConversationId)

	const {messages: sseMessages, snapshots, status, currentStatus, sendMessage, stop} =
		useLivAgentStream({conversationId})

	// Composer-controlled input.
	const [input, setInput] = useState('')

	// Agent selector state — id is the addressable target for future
	// "+ MCP" install. Currently NOT sent to /api/agent/start (backend does
	// not accept agentId yet — see CONTEXT D-88-04).
	const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
		undefined,
	)
	const [selectedAgent, setSelectedAgent] = useState<Agent | undefined>(undefined)

	const handleAgentChange = useCallback(
		(agentId: string, agent: Agent | undefined) => {
			setSelectedAgentId(agentId)
			setSelectedAgent(agent)
		},
		[],
	)

	// Project SSE shapes → v32 thread shapes.
	const v32Messages: ChatMessage[] = useMemo(
		() => sseStateToChatMessages(sseMessages, snapshots, status),
		[sseMessages, snapshots, status],
	)

	// Tool calls in v32 shape (sorted by startedAt) — feeds ToolCallPanel.
	const liveToolCalls = useMemo(
		() => sseSnapshotsToV32List(snapshots),
		[snapshots],
	)

	// ── Tool panel ──────────────────────────────────────────────────────
	const [panelOpen, setPanelOpen] = useState(false)
	const prevAutoOpenRef = useRef(false)

	// V32-MIGRATE-03 — auto-open the panel when the latest tool snapshot is
	// visual, only on the false→true transition (D-88-05 guard prevents
	// re-opening after the user manually closes mid-run).
	useEffect(() => {
		const next = shouldAutoOpen(liveToolCalls)
		if (next && !prevAutoOpenRef.current) {
			setPanelOpen(true)
		}
		prevAutoOpenRef.current = next
	}, [liveToolCalls])

	// V32-MIGRATE-05 — listen for the panel's toggle event so we can shift
	// the thread max-width (room for the 480px panel + 2rem gutter).
	const [threadShifted, setThreadShifted] = useState(false)
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<{open: boolean}>).detail
			setThreadShifted(Boolean(detail?.open))
		}
		window.addEventListener('liv-sidebar-toggled', handler as EventListener)
		return () =>
			window.removeEventListener('liv-sidebar-toggled', handler as EventListener)
	}, [])

	// ── Stream error toast ──────────────────────────────────────────────
	const lastErrorRef = useRef<string | null>(null)
	useEffect(() => {
		if (status !== 'error') {
			lastErrorRef.current = null
			return
		}
		// Pull error message off the last assistant message OR fall back.
		const last = sseMessages[sseMessages.length - 1]
		const msg = last?.text || 'Agent stream failed.'
		if (msg !== lastErrorRef.current) {
			lastErrorRef.current = msg
			toast.error('Agent error', {description: msg.slice(0, 240)})
		}
	}, [status, sseMessages])

	// ── liv-last-assistant localStorage (P89 deferred wire-up) ─────────
	// Phase 90 — P89's keyboard hook reads this localStorage key on Cmd+Shift+C
	// to copy the last assistant message. We write the latest completed
	// assistant content here so the keyboard shortcut has fresh data.
	const lastWrittenAssistantIdRef = useRef<string | null>(null)
	useEffect(() => {
		// Walk backward to the most recent assistant message.
		for (let i = v32Messages.length - 1; i >= 0; i--) {
			const m = v32Messages[i]
			if (m.role !== 'assistant') continue
			if (m.status !== 'complete') return // still streaming — wait for completion
			if (m.id === lastWrittenAssistantIdRef.current) return // already wrote this one
			try {
				localStorage.setItem('liv-last-assistant', m.content)
				lastWrittenAssistantIdRef.current = m.id
			} catch {
				// localStorage may be unavailable (SSR, private mode quota) — best-effort only
			}
			return
		}
	}, [v32Messages])

	// ── Composer submit / stop ─────────────────────────────────────────
	const isStreaming = isStreamActive(status)

	const handleSubmit = useCallback(
		(_attachments: Attachment[]) => {
			const text = input.trim()
			if (!text) return
			// Note (D-88-04): selectedAgentId is captured locally for forward
			// compatibility but NOT sent to backend yet — useLivAgentStream's
			// sendMessage shape is `(text)` and the underlying POST currently
			// rejects extra body fields silently.
			void sendMessage(text)
			setInput('')
		},
		[input, sendMessage],
	)

	const handleStop = useCallback(() => {
		void stop()
	}, [stop])

	// ── Inject status_detail card into the thread ───────────────────────
	// We don't mutate v32Messages directly — MessageThread reads
	// `message.toolCalls` and `message.status === 'streaming'` to drive the
	// streaming caret. The status_detail card lives in our own slot that
	// renders alongside the thread.
	//
	// Strategy: render the StatusDetailCard inside an absolutely-positioned
	// hint above the composer when we're actively streaming AND we have a
	// payload. This keeps it visible without modifying MessageThread (P81 lane).
	const showStatusCard = currentStatus !== null && isStreaming

	return (
		<div
			className='flex h-full flex-col bg-liv-background'
			role='main'
			aria-label='AI Chat v2'
		>
			{/* Top bar — agent selector + dev preview banner */}
			<div className='flex-shrink-0 border-b border-liv-border bg-liv-card px-4 py-2'>
				<div
					className={cn(
						'mx-auto flex items-center justify-between gap-3 transition-all duration-300',
						threadShifted ? 'max-w-[calc(100%-480px-2rem)]' : 'max-w-3xl',
					)}
				>
					<div className='flex items-center gap-3'>
						<span className='text-sm font-semibold text-liv-foreground'>
							Liv Agent v2
						</span>
						<AgentSelector
							value={selectedAgentId}
							onChange={handleAgentChange}
							disabled={isStreaming}
						/>
					</div>
					{/* Phase 90 — P89 deferred wire-up: ThemeToggle mounts in the v32
					    chat header. P89 deferred this to avoid a merge race with P88. */}
					<div className='flex items-center gap-2'>
						<span className='rounded-full bg-liv-accent px-2 py-0.5 text-xs text-liv-muted-foreground'>
							dev preview · SSE wired (P88)
						</span>
						<ThemeToggle className='ml-1' />
					</div>
				</div>
			</div>

			{/* Message thread — flex-1 scrolls, width shrinks when panel open */}
			<MessageThread
				messages={v32Messages}
				agentName={selectedAgent?.name ?? 'Liv Default'}
				agentEmoji={selectedAgent?.avatar ?? ''}
				onSuggest={(prompt) => setInput(prompt)}
				className={cn(
					'flex-1 transition-all duration-300',
					threadShifted ? '[&>div]:max-w-[calc(100%-480px-2rem)]' : '',
				)}
			/>

			{/* Composer — fixed at bottom, shifts with panel */}
			<div
				className={cn(
					'flex-shrink-0 border-t border-liv-border bg-liv-background transition-all duration-300',
					threadShifted ? 'pr-[calc(480px+2rem)]' : '',
				)}
			>
				{/* Status detail hint — sits above composer when streaming */}
				{showStatusCard && currentStatus && (
					<div
						className={cn(
							'mx-auto flex w-full px-4 pt-2 transition-all duration-300',
							threadShifted ? 'max-w-[calc(100%-480px-2rem)]' : 'max-w-3xl',
						)}
					>
						<StatusDetailCard status={currentStatus} />
					</div>
				)}

				<ChatComposer
					value={input}
					onChange={setInput}
					onSubmit={handleSubmit}
					onStop={handleStop}
					isStreaming={isStreaming}
					agentName={selectedAgent?.name ?? 'Liv Default'}
				/>
			</div>

			{/* Tool call side panel — overlays from right edge */}
			<ToolCallPanel
				toolCalls={liveToolCalls}
				isOpen={panelOpen}
				onClose={() => setPanelOpen(false)}
				agentStatus={streamStatusToAgentStatus(status)}
			/>
		</div>
	)
}
