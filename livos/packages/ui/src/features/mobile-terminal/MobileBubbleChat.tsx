// Phase 181-04 — MobileBubbleChat
//
// Phone bubble UI connected to /ws/cc-pty.
// Renders CC PTY stdout lines as chat bubbles (role=assistant).
// Single textarea + send button sends input to PTY as stdin+'\r'.
// ANSI escape sequences stripped for readable bubble display (T-181-04-05).
//
// JWT auth: appends ?token=<jwt> from localStorage (same pattern as CcTerminal).
// Input guard: goes through CcPtyWsClient.sendStdin which enforces MAX_STDIN_BYTES (T-181-04-04).

import {useState, useEffect, useRef, useCallback} from 'react'
import type {JSX} from 'react'
import {CcPtyWsClient} from '@/features/cc-terminal/terminal-ws-client'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

// Strip common ANSI escape sequences for readable bubble display
const ANSI_RE = /\x1b\[[0-9;]*[mGKHFJABCDsu]/g

interface Bubble {
	id: string
	role: 'user' | 'assistant'
	text: string
}

function wsUrl(): string {
	const base = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/cc-pty`
	const jwt = typeof localStorage !== 'undefined' ? localStorage.getItem(JWT_LOCAL_STORAGE_KEY) : null
	return jwt ? `${base}?token=${encodeURIComponent(jwt)}` : base
}

interface MobileBubbleChatProps {
	sessionId: string
	className?: string
}

export function MobileBubbleChat({sessionId, className}: MobileBubbleChatProps): JSX.Element {
	const [bubbles, setBubbles] = useState<Bubble[]>([])
	const [input, setInput] = useState('')
	const wsRef = useRef<CcPtyWsClient | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const ws = new CcPtyWsClient({
			url: wsUrl(),
			sessionId,
			onStdout: (text) => {
				const clean = text.replace(ANSI_RE, '').replace(/\r/g, '')
				if (!clean) return
				setBubbles((prev) => [
					...prev,
					{id: `${Date.now()}-${Math.random()}`, role: 'assistant', text: clean},
				])
			},
			onAttached: () => {
				/* session ready */
			},
			onError: (msg) => {
				setBubbles((prev) => [
					...prev,
					{id: `err-${Date.now()}`, role: 'assistant', text: `[error] ${msg}`},
				])
			},
		})
		wsRef.current = ws
		return () => {
			ws.detach()
		}
	}, [sessionId])

	// Auto-scroll to bottom on new bubbles
	useEffect(() => {
		try {
			scrollRef.current?.scrollTo?.({top: scrollRef.current.scrollHeight, behavior: 'smooth'})
		} catch {
			/* jsdom polyfill may not support scrollTo with options */
		}
	}, [bubbles])

	const submit = useCallback(() => {
		const text = input.trim()
		if (!text) return
		wsRef.current?.sendStdin(text + '\r')
		setBubbles((prev) => [
			...prev,
			{id: `user-${Date.now()}`, role: 'user', text},
		])
		setInput('')
	}, [input])

	return (
		<div
			className={`flex h-full flex-col bg-bg ${className ?? ''}`}
			data-testid='mobile-bubble-chat'
		>
			{/* Bubble scroll area */}
			<div ref={scrollRef} className='flex-1 overflow-y-auto p-3 space-y-2'>
				{bubbles.map((b) => (
					<div
						key={b.id}
						data-role={b.role}
						className={[
							'max-w-[85%] rounded-xl px-3 py-2 text-sm font-mono whitespace-pre-wrap',
							b.role === 'user'
								? 'ml-auto bg-primary text-primary-foreground'
								: 'mr-auto bg-muted text-foreground',
						].join(' ')}
					>
						{b.text}
					</div>
				))}
			</div>
			{/* Input bar */}
			<div className='flex gap-2 border-t border-border p-2'>
				<textarea
					className='flex-1 resize-none rounded-md bg-input px-3 py-2 text-sm outline-none min-h-[2.5rem] max-h-24'
					placeholder='Type a command...'
					value={input}
					rows={1}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							submit()
						}
					}}
				/>
				<button
					className='rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground'
					onClick={submit}
				>
					Send
				</button>
			</div>
		</div>
	)
}
