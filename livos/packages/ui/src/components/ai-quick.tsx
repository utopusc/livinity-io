import * as DialogPrimitive from '@radix-ui/react-dialog'
import {createContext, SetStateAction, useCallback, useContext, useRef, useState} from 'react'
import {useKey} from 'react-use'
import {
	IconBrain,
	IconSend,
	IconLoader2,
	IconTool,
	IconChevronDown,
	IconChevronRight,
	IconX,
} from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {trpcReact} from '@/trpc/trpc'
import {Dialog} from '@/shadcn-components/ui/dialog'
import {cn} from '@/shadcn-lib/utils'

// ── Types ──────────────────────────────────────────────

type ToolCall = {
	tool: string
	params: Record<string, unknown>
	result: {success: boolean; output: string}
}

// ── Context ────────────────────────────────────────────

const AiQuickContext = createContext<{
	open: boolean
	setOpen: (value: SetStateAction<boolean>) => void
} | null>(null)

export function useAiQuickOpen() {
	const ctx = useContext(AiQuickContext)
	if (!ctx) throw new Error('useAiQuickOpen must be used within AiQuickProvider')

	useKey(
		(e) => e.key === 'l' && (e.metaKey || e.ctrlKey),
		(e) => {
			e.preventDefault()
			ctx.setOpen((open) => !open)
		},
	)

	return ctx
}

export function AiQuickProvider({children}: {children: React.ReactNode}) {
	const [open, setOpen] = useState(false)
	return <AiQuickContext.Provider value={{open, setOpen}}>{children}</AiQuickContext.Provider>
}

// ── Tool Call Display ──────────────────────────────────

function MiniToolCall({toolCall}: {toolCall: ToolCall}) {
	const [expanded, setExpanded] = useState(false)
	return (
		<div className='rounded-lg border border-white/10 bg-white/5 text-xs'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5'
			>
				{expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
				<IconTool size={12} className='text-blue-400' />
				<span className='font-mono text-blue-400'>{toolCall.tool}</span>
				<span className={`ml-auto text-[10px] ${toolCall.result.success ? 'text-green-400' : 'text-red-400'}`}>
					{toolCall.result.success ? 'OK' : 'FAIL'}
				</span>
			</button>
			{expanded && (
				<div className='border-t border-white/10 px-3 py-2'>
					<pre className='max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-white/50'>
						{toolCall.result.output.slice(0, 1500)}
					</pre>
				</div>
			)}
		</div>
	)
}

// ── Main Dialog ────────────────────────────────────────

export function AiQuickDialog() {
	const {open, setOpen} = useAiQuickOpen()
	const [input, setInput] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [response, setResponse] = useState<string | null>(null)
	const [toolCalls, setToolCalls] = useState<ToolCall[]>([])
	const [conversationId] = useState(() => `quick_${Date.now()}`)
	const inputRef = useRef<HTMLInputElement>(null)

	const sendMutation = trpcReact.ai.send.useMutation()
	const statusQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId},
		{enabled: isLoading, refetchInterval: isLoading ? 600 : false},
	)

	const statusText = statusQuery.data?.status || 'Thinking...'

	const handleSend = useCallback(async () => {
		const text = input.trim()
		if (!text || isLoading) return

		setIsLoading(true)
		setResponse(null)
		setToolCalls([])

		try {
			const result = await sendMutation.mutateAsync({
				conversationId,
				message: text,
			})
			setResponse(result.content)
			setToolCalls(result.toolCalls || [])
		} catch (error: any) {
			setResponse(`Error: ${error.message}`)
		} finally {
			setIsLoading(false)
		}
	}, [input, isLoading, conversationId, sendMutation])

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSend()
		}
		if (e.key === 'Escape') {
			setOpen(false)
		}
	}

	const handleClose = () => {
		setOpen(false)
		// Reset after animation
		setTimeout(() => {
			setInput('')
			setResponse(null)
			setToolCalls([])
			setIsLoading(false)
		}, 200)
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogPrimitive.DialogOverlay
				className={cn(
					'fixed inset-0 z-[999] bg-black/30 backdrop-blur-xl contrast-more:backdrop-blur-none',
					'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				)}
			/>
			<DialogPrimitive.Content
				onOpenAutoFocus={(e) => {
					e.preventDefault()
					inputRef.current?.focus()
				}}
				className={cn(
					'fixed left-[50%] z-[999] translate-x-[-50%]',
					'top-4 lg:top-[10%]',
					'w-full max-w-[calc(100%-40px)] sm:max-w-[640px]',
					'rounded-2xl border border-white/10 bg-neutral-900/95 shadow-2xl shadow-black/50',
					'data-[state=open]:animate-in data-[state=closed]:animate-out',
					'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
					'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
					'data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0',
					'overflow-hidden',
				)}
			>
				{/* Input area */}
				<div className='flex items-center gap-3 border-b border-white/10 px-4 py-3'>
					<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30'>
						<IconBrain size={16} className='text-violet-400' />
					</div>
					<input
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder='Ask Liv anything...'
						disabled={isLoading}
						className='flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none disabled:opacity-50'
						autoComplete='off'
					/>
					{input.trim() && !isLoading && (
						<button
							onClick={handleSend}
							className='flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500'
						>
							<IconSend size={14} />
						</button>
					)}
					{!isLoading && (
						<button
							onClick={handleClose}
							className='flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/10 hover:text-white/60'
						>
							<IconX size={14} />
						</button>
					)}
				</div>

				{/* Status / Loading */}
				{isLoading && (
					<div className='flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5'>
						<IconLoader2 size={14} className='animate-spin text-violet-400' />
						<span className='text-xs text-white/40'>{statusText}</span>
					</div>
				)}

				{/* Response area */}
				{response && (
					<div className='max-h-[60vh] overflow-y-auto'>
						{/* Tool calls */}
						{toolCalls.length > 0 && (
							<div className='space-y-1 border-b border-white/10 px-4 py-3'>
								{toolCalls.map((tc, i) => (
									<MiniToolCall key={i} toolCall={tc} />
								))}
							</div>
						)}

						{/* AI Response */}
						<div className='px-4 py-4'>
							<div className='prose prose-sm prose-invert max-w-none text-sm'>
								<ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
							</div>
						</div>
					</div>
				)}

				{/* Footer hint */}
				{!response && !isLoading && (
					<div className='flex items-center gap-4 px-4 py-2.5 text-[11px] text-white/20'>
						<span>
							<kbd className='rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]'>
								Enter
							</kbd>{' '}
							to send
						</span>
						<span>
							<kbd className='rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px]'>
								Esc
							</kbd>{' '}
							to close
						</span>
						<span className='ml-auto'>Powered by Liv AI</span>
					</div>
				)}
			</DialogPrimitive.Content>
		</Dialog>
	)
}
