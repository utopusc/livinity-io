import {AnimatePresence, motion} from 'framer-motion'
import {createContext, SetStateAction, useCallback, useContext, useEffect, useRef, useState} from 'react'
import {useKey} from 'react-use'
import {TbBrain, TbArrowUp, TbLoader2, TbTool, TbChevronDown, TbChevronRight, TbSparkles} from 'react-icons/tb'
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

// ── SVG Liquid Glass Filter ────────────────────────────

const LiquidGlassFilter = () => (
	<svg width='0' height='0'>
		<filter id='ai-liquid-glass' x='-20%' y='-20%' width='140%' height='140%'>
			<feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3' seed='77' result='noise' />
			<feDisplacementMap in='SourceGraphic' in2='noise' scale='6' xChannelSelector='R' yChannelSelector='G' result='displaced' />
			<feGaussianBlur in='displaced' stdDeviation='0.6' result='blurred' />
		</filter>
	</svg>
)

// ── Tool Call Display ──────────────────────────────────

function MiniToolCall({toolCall}: {toolCall: ToolCall}) {
	const [expanded, setExpanded] = useState(false)
	return (
		<div className='rounded-xl border border-white/20 bg-white/20'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[12px] hover:bg-white/15'
			>
				{expanded ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
				<TbTool size={12} className='text-violet-500' />
				<span className='font-mono text-violet-600'>{toolCall.tool}</span>
				<span className={cn('ml-auto text-[11px]', toolCall.result.success ? 'text-emerald-600' : 'text-red-500')}>
					{toolCall.result.success ? 'OK' : 'FAIL'}
				</span>
			</button>
			{expanded && (
				<div className='border-t border-white/20 px-3 py-2'>
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
	const inputRef = useRef<HTMLInputElement>(null)

	const sendMutation = trpcReact.ai.send.useMutation()
	const statusQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId},
		{enabled: isLoading, refetchInterval: isLoading ? 600 : false},
	)

	const statusText = statusQuery.data?.status || 'Thinking...'

	// Focus input when opening
	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 50)
		}
	}, [open])

	// Close on Escape
	useEffect(() => {
		if (!open) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				handleClose()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [open])

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
	}

	const handleClose = () => {
		setOpen(false)
		setTimeout(() => {
			setInput('')
			setResponse(null)
			setToolCalls([])
			setIsLoading(false)
		}, 300)
	}

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
					<LiquidGlassFilter />

					{/* Backdrop */}
					<motion.div
						className='fixed inset-0 bg-black/5 backdrop-blur-sm'
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						exit={{opacity: 0}}
					/>

					{/* Glass container */}
					<motion.div
						onClick={(e) => e.stopPropagation()}
						initial={{scale: 0.95, opacity: 0}}
						animate={{scale: 1, opacity: 1}}
						exit={{scale: 0.95, opacity: 0}}
						transition={{duration: 0.3, type: 'spring', bounce: 0.2}}
						style={{
							borderRadius: '28px',
							filter: 'url(#ai-liquid-glass)',
							backdropFilter: 'blur(50px) saturate(200%)',
							WebkitBackdropFilter: 'blur(50px) saturate(200%)',
						}}
						className={cn(
							'relative z-20 flex w-full max-w-2xl flex-col overflow-hidden',
							'border border-white/40 bg-white/45',
							'shadow-[inset_0_1px_3px_rgba(255,255,255,0.7),inset_0_-1px_3px_rgba(0,0,0,0.08),inset_0_0_20px_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.06)]',
						)}
					>
						{/* Input area */}
						<div className='flex items-center gap-3 px-5 py-3.5'>
							<div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/25 to-blue-500/25'>
								<TbSparkles className='h-4 w-4 text-violet-500' />
							</div>
							<input
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder='Ask Liv anything...'
								disabled={isLoading}
								className='flex-1 bg-transparent text-lg text-neutral-800 placeholder-neutral-400 outline-none disabled:opacity-50'
								autoComplete='off'
							/>
							{input.trim() && !isLoading && (
								<motion.button
									initial={{scale: 0, opacity: 0}}
									animate={{scale: 1, opacity: 1}}
									exit={{scale: 0, opacity: 0}}
									onClick={handleSend}
									className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-white transition-colors hover:bg-neutral-700'
								>
									<TbArrowUp className='h-4 w-4' strokeWidth={2.5} />
								</motion.button>
							)}
						</div>

						{/* Loading status */}
						{isLoading && (
							<motion.div
								initial={{opacity: 0, height: 0}}
								animate={{opacity: 1, height: 'auto'}}
								className='flex items-center gap-2.5 border-t border-white/25 px-5 py-2.5'
							>
								<TbLoader2 className='h-3.5 w-3.5 animate-spin text-violet-500' />
								<span className='text-[12px] text-neutral-500'>{statusText}</span>
							</motion.div>
						)}

						{/* Response area */}
						{response && (
							<motion.div
								initial={{opacity: 0}}
								animate={{opacity: 1}}
								className='max-h-[50vh] overflow-y-auto border-t border-white/25'
							>
								{/* Tool calls */}
								{toolCalls.length > 0 && (
									<div className='space-y-1 border-b border-white/20 px-5 py-3'>
										{toolCalls.map((tc, i) => (
											<MiniToolCall key={i} toolCall={tc} />
										))}
									</div>
								)}

								{/* AI Response */}
								<div className='px-5 py-4'>
									<div className='prose prose-sm max-w-none text-[14px] leading-relaxed text-neutral-700 prose-headings:text-neutral-800 prose-code:rounded prose-code:bg-white/40 prose-code:px-1 prose-code:py-0.5 prose-code:text-violet-600 prose-pre:bg-white/30 prose-pre:backdrop-blur-sm'>
										<ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
									</div>
								</div>
							</motion.div>
						)}

						{/* Footer hint */}
						{!response && !isLoading && (
							<div className='flex items-center gap-4 border-t border-white/20 px-5 py-2 text-[11px] text-neutral-400'>
								<span>
									<kbd className='rounded-md border border-white/30 bg-white/30 px-1.5 py-0.5 font-mono text-[10px]'>
										Enter
									</kbd>{' '}
									to send
								</span>
								<span>
									<kbd className='rounded-md border border-white/30 bg-white/30 px-1.5 py-0.5 font-mono text-[10px]'>
										Esc
									</kbd>{' '}
									to close
								</span>
								<span className='ml-auto flex items-center gap-1'>
									<TbBrain className='h-3 w-3' />
									Liv AI
								</span>
							</div>
						)}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
