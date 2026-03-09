import {AnimatePresence, motion} from 'framer-motion'
import {createContext, SetStateAction, useCallback, useContext, useEffect, useRef, useState} from 'react'
import {useKey} from 'react-use'
import {TbArrowUp, TbChevronDown, TbChevronRight, TbSparkles, TbTool} from 'react-icons/tb'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {trpcReact} from '@/trpc/trpc'
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

// ── SVG blob filter (same as Spotlight) ────────────────

const SVGFilter = () => (
	<svg width='0' height='0'>
		<filter id='ai-blob'>
			<feGaussianBlur stdDeviation='10' in='SourceGraphic' />
			<feColorMatrix values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9' result='blob' />
			<feBlend in='SourceGraphic' in2='blob' />
		</filter>
	</svg>
)

// ── Animated placeholder ───────────────────────────────

const AI_PLACEHOLDERS = [
	'Ask Liv anything...',
	'What can I help with?',
	'Run a command, check status...',
	'Install an app, manage files...',
]

function AiPlaceholder({text, className}: {text: string; className?: string}) {
	return (
		<motion.div layout className={cn('pointer-events-none absolute z-10 flex items-center text-neutral-400', className)}>
			<AnimatePresence mode='popLayout'>
				<motion.p
					layoutId={`ai-placeholder-${text}`}
					key={`ai-placeholder-${text}`}
					initial={{opacity: 0, y: 10, filter: 'blur(5px)'}}
					animate={{opacity: 1, y: 0, filter: 'blur(0px)'}}
					exit={{opacity: 0, y: -10, filter: 'blur(5px)'}}
					transition={{duration: 0.2, ease: 'easeOut'}}
				>
					{text}
				</motion.p>
			</AnimatePresence>
		</motion.div>
	)
}

// ── Thinking dots (gooey blob animation) ───────────────

function ThinkingDots() {
	return (
		<div className='flex items-center gap-1.5 px-1'>
			{[0, 1, 2].map((i) => (
				<motion.div
					key={i}
					className='h-2 w-2 rounded-full bg-violet-400'
					animate={{scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4]}}
					transition={{duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut'}}
				/>
			))}
		</div>
	)
}

// ── Tool call chip ─────────────────────────────────────

function ToolCallChip({toolCall}: {toolCall: ToolCall}) {
	const [expanded, setExpanded] = useState(false)
	return (
		<div className='rounded-xl border border-neutral-200/60 bg-white'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-neutral-50'
			>
				{expanded ? <TbChevronDown className='h-3 w-3' /> : <TbChevronRight className='h-3 w-3' />}
				<TbTool className='h-3 w-3 text-violet-500' />
				<span className='font-mono text-violet-600'>{toolCall.tool}</span>
				<span className={cn('ml-auto text-[11px] font-medium', toolCall.result.success ? 'text-emerald-500' : 'text-red-400')}>
					{toolCall.result.success ? 'done' : 'failed'}
				</span>
			</button>
			{expanded && (
				<div className='border-t border-neutral-200/60 px-3 py-2'>
					<pre className='max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-neutral-500'>
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
	const [placeholderIndex, setPlaceholderIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)

	const sendMutation = trpcReact.ai.send.useMutation()
	const statusQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId},
		{enabled: isLoading, refetchInterval: isLoading ? 600 : false},
	)

	const statusText = statusQuery.data?.status || 'Thinking...'

	// Focus input when opening
	useEffect(() => {
		if (open) setTimeout(() => inputRef.current?.focus(), 50)
	}, [open])

	// Rotate placeholder text
	useEffect(() => {
		if (!open || input) return
		const interval = setInterval(() => {
			setPlaceholderIndex((i) => (i + 1) % AI_PLACEHOLDERS.length)
		}, 3000)
		return () => clearInterval(interval)
	}, [open, input])

	// Close on Escape
	useEffect(() => {
		if (!open) return
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				handleClose()
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [open])

	const handleSend = useCallback(async () => {
		const text = input.trim()
		if (!text || isLoading) return

		setIsLoading(true)
		setResponse(null)
		setToolCalls([])

		try {
			const result = await sendMutation.mutateAsync({conversationId, message: text})
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
	}

	const handleClose = () => {
		setOpen(false)
		setTimeout(() => {
			setInput('')
			setResponse(null)
			setToolCalls([])
			setIsLoading(false)
			setPlaceholderIndex(0)
		}, 300)
	}

	const hasContent = isLoading || response

	return (
		<AnimatePresence mode='wait'>
			{open && (
				<motion.div
					initial={{opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: -10}}
					animate={{opacity: 1, filter: 'blur(0px)', scaleX: 1, scaleY: 1, y: 0}}
					exit={{opacity: 0, filter: 'blur(20px)', scaleX: 1.3, scaleY: 1.1, y: 10}}
					transition={{stiffness: 550, damping: 50, type: 'spring'}}
					className='fixed inset-0 z-[999] flex flex-col items-center justify-start pt-[12vh]'
					onClick={handleClose}
				>
					<SVGFilter />

					{/* Backdrop */}
					<motion.div
						className='fixed inset-0 bg-black/5 backdrop-blur-sm'
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
					/>

					{/* Blob wrapper — same gooey effect as Spotlight */}
					<div
						onClick={(e) => e.stopPropagation()}
						style={{filter: 'url(#ai-blob)'}}
						className={cn(
							'z-20 flex w-full max-w-2xl items-center justify-end gap-4 group',
							'[&>div]:rounded-full [&>div]:bg-white/95 [&>div]:text-neutral-800 [&>div]:backdrop-blur-2xl',
							'[&_svg]:stroke-[1.4]',
						)}
					>
						<AnimatePresence mode='popLayout'>
							<motion.div
								layoutId='ai-input-container'
								transition={{layout: {duration: 0.5, type: 'spring', bounce: 0.2}}}
								style={{borderRadius: '24px'}}
								className='relative z-10 flex h-full w-full flex-col items-center justify-start overflow-hidden border border-neutral-200/60 shadow-[0_8px_40px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.03)]'
							>
								{/* Input row — matches Spotlight exactly */}
								<div className='flex h-14 w-full items-center justify-start gap-3 px-5'>
									<motion.div
										layoutId='ai-icon'
										className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500'
									>
										<TbSparkles className='h-3.5 w-3.5 text-white' strokeWidth={2} />
									</motion.div>
									<div className='relative flex-1 text-xl'>
										{!input && <AiPlaceholder text={AI_PLACEHOLDERS[placeholderIndex]} />}
										<motion.input
											ref={inputRef}
											layout='position'
											type='text'
											value={input}
											onChange={(e) => setInput(e.target.value)}
											onKeyDown={handleKeyDown}
											disabled={isLoading}
											className='w-full bg-transparent text-neutral-800 outline-none disabled:opacity-60'
											autoComplete='off'
										/>
									</div>
									<AnimatePresence>
										{input.trim() && !isLoading && (
											<motion.button
												initial={{scale: 0, opacity: 0}}
												animate={{scale: 1, opacity: 1}}
												exit={{scale: 0, opacity: 0}}
												transition={{type: 'spring', stiffness: 500, damping: 25}}
												onClick={handleSend}
												className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors hover:bg-neutral-700'
											>
												<TbArrowUp className='h-4 w-4' strokeWidth={2.5} />
											</motion.button>
										)}
									</AnimatePresence>
								</div>

								{/* Loading state */}
								{isLoading && (
									<motion.div
										layout
										initial={{opacity: 0}}
										animate={{opacity: 1}}
										className='flex w-full items-center gap-3 border-t border-neutral-200/60 bg-neutral-50/80 px-5 py-3'
									>
										<ThinkingDots />
										<span className='text-[13px] text-neutral-400'>{statusText}</span>
									</motion.div>
								)}

								{/* Response area */}
								{response && (
									<motion.div
										layout
										initial={{opacity: 0}}
										animate={{opacity: 1}}
										transition={{duration: 0.2}}
										className='flex max-h-[50vh] w-full flex-col overflow-y-auto border-t border-neutral-200/60 bg-neutral-50/80'
									>
										{/* Tool calls */}
										{toolCalls.length > 0 && (
											<div className='space-y-1.5 border-b border-neutral-200/60 px-4 py-3'>
												{toolCalls.map((tc, i) => (
													<ToolCallChip key={i} toolCall={tc} />
												))}
											</div>
										)}

										{/* AI response markdown */}
										<div className='px-5 py-4'>
											<div className='prose prose-sm prose-neutral max-w-none text-[14px] leading-relaxed prose-headings:text-neutral-800 prose-p:text-neutral-700 prose-code:rounded prose-code:bg-neutral-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-xl prose-pre:bg-neutral-100'>
												<ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
											</div>
										</div>
									</motion.div>
								)}

								{/* Footer — only when idle */}
								{!hasContent && (
									<motion.div
										layout
										className='flex w-full items-center gap-4 border-t border-neutral-200/60 bg-neutral-50/80 px-5 py-2 text-[11px] text-neutral-400'
									>
										<span>
											<kbd className='rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-500'>
												Enter
											</kbd>{' '}
											send
										</span>
										<span>
											<kbd className='rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-500'>
												Esc
											</kbd>{' '}
											close
										</span>
										<span className='ml-auto flex items-center gap-1.5 font-medium text-neutral-400'>
											<TbSparkles className='h-3 w-3' />
											Liv AI
										</span>
									</motion.div>
								)}
							</motion.div>

							{/* Thinking bubble — morphs out of the pill like Spotlight shortcuts */}
							{isLoading && (
								<motion.div
									key='thinking-bubble'
									layout
									initial={{scale: 0.7, x: -64}}
									animate={{scale: 1, x: 0}}
									exit={{scale: 0.7, x: -64}}
									transition={{duration: 0.8, type: 'spring', bounce: 0.2}}
									className='flex aspect-square size-14 items-center justify-center rounded-full'
								>
									<motion.div
										animate={{rotate: 360}}
										transition={{duration: 3, repeat: Infinity, ease: 'linear'}}
										className='flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500'
									>
										<TbSparkles className='h-4 w-4 text-white' strokeWidth={2} />
									</motion.div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
