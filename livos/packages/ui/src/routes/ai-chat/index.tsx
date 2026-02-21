import {useCallback, useEffect, useRef, useState, Suspense, lazy} from 'react'
import {useSearchParams} from 'react-router-dom'
import {
	IconMessageCircle,
	IconPlus,
	IconSend,
	IconTrash,
	IconTool,
	IconChevronDown,
	IconChevronRight,
	IconUser,
	IconBrain,
	IconLoader2,
	IconPlug,
	IconMenu2,
	IconPuzzle,
	IconCheck,
	IconPlayerStop,
	IconTerminal2,
	IconMicrophone,
	IconCode,
} from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {formatDistanceToNow} from 'date-fns'

import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {Drawer, DrawerContent} from '@/shadcn-components/ui/drawer'

const McpPanel = lazy(() => import('./mcp-panel'))
const SkillsPanel = lazy(() => import('./skills-panel'))
const VoiceButton = lazy(() => import('./voice-button').then((m) => ({default: m.VoiceButton})))
const CanvasPanel = lazy(() => import('./canvas-panel').then((m) => ({default: m.CanvasPanel})))

type ToolCall = {
	tool: string
	params: Record<string, unknown>
	result: {success: boolean; output: string}
}

type Message = {
	id: string
	role: 'user' | 'assistant'
	content: string
	toolCalls?: ToolCall[]
	timestamp: number
}

/** Strip mcp__servername__ prefix for display */
function formatToolName(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

function ToolCallDisplay({toolCall}: {toolCall: ToolCall}) {
	const [expanded, setExpanded] = useState(false)
	const short = formatToolName(toolCall.tool)

	return (
		<div className='my-1 rounded-radius-sm border border-border-default bg-surface-base text-caption'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-1'
			>
				{expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
				<IconTool size={14} className='text-blue-400' />
				<span className='font-mono font-medium text-blue-400'>{short}</span>
				<span className={cn('ml-auto text-caption-sm', toolCall.result.success ? 'text-green-400' : 'text-red-400')}>
					{toolCall.result.success ? 'OK' : 'FAIL'}
				</span>
			</button>
			{expanded && (
				<div className='border-t border-border-default px-3 py-2'>
					<div className='mb-1 text-caption-sm uppercase text-text-tertiary'>Params</div>
					<pre className='mb-2 overflow-x-auto whitespace-pre-wrap text-text-secondary'>
						{JSON.stringify(toolCall.params, null, 2)}
					</pre>
					<div className='mb-1 text-caption-sm uppercase text-text-tertiary'>Output</div>
					<pre className='max-h-40 overflow-auto whitespace-pre-wrap text-text-secondary'>
						{toolCall.result.output.slice(0, 2000)}
					</pre>
				</div>
			)}
		</div>
	)
}

function ChatMessage({message}: {message: Message}) {
	const isUser = message.role === 'user'

	return (
		<div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
			{!isUser && (
				<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30'>
					<IconBrain size={18} className='text-violet-400' />
				</div>
			)}
			<div className={cn('max-w-[80%]', isUser && 'order-first')}>
				<div
					className={cn('rounded-radius-xl px-4 py-3',
						isUser ? 'bg-brand text-white' : 'bg-surface-2 text-text-primary border-l-2 border-brand/30'
					)}
				>
					{isUser ? (
						<p className='whitespace-pre-wrap text-body'>{message.content}</p>
					) : (
						<div className='prose prose-sm prose-invert max-w-none'>
							<ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
						</div>
					)}
				</div>
				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className='mt-2 space-y-1'>
						{message.toolCalls.map((tc, i) => (
							<ToolCallDisplay key={i} toolCall={tc} />
						))}
					</div>
				)}
			</div>
			{isUser && (
				<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-3'>
					<IconUser size={18} className='text-text-primary' />
				</div>
			)}
		</div>
	)
}

/** Elapsed seconds counter */
function useElapsed(active: boolean) {
	const [elapsed, setElapsed] = useState(0)
	const startRef = useRef(Date.now())

	useEffect(() => {
		if (!active) {
			setElapsed(0)
			startRef.current = Date.now()
			return
		}
		startRef.current = Date.now()
		const id = setInterval(() => {
			setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
		}, 1000)
		return () => clearInterval(id)
	}, [active])

	return elapsed
}

/** Live progress indicator: descriptions + terminal stream while running, gone when done */
function StatusIndicator({conversationId, isLoading}: {conversationId: string; isLoading: boolean}) {
	const statusQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId},
		{
			enabled: isLoading,
			refetchInterval: isLoading ? 500 : false,
		},
	)
	const elapsed = useElapsed(isLoading)
	const terminalRef = useRef<HTMLDivElement>(null)

	const steps: string[] = (statusQuery.data as any)?.steps ?? []
	const commands: string[] = (statusQuery.data as any)?.commands ?? []
	const activeTool: string | undefined = (statusQuery.data as any)?.tool
	const isExecuting = !!activeTool

	// Auto-scroll terminal to bottom when new commands arrive
	useEffect(() => {
		if (terminalRef.current) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight
		}
	}, [commands.length])

	if (!isLoading) return null

	const visibleSteps = steps.slice(-6)

	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base overflow-hidden'>
			{/* Descriptions */}
			<div className='px-4 py-3 space-y-2'>
				{/* Thinking state */}
				{(!isExecuting || steps.length === 0) && (
					<div className='flex items-start gap-2.5 text-body-sm text-text-secondary'>
						<IconLoader2 size={14} className='mt-0.5 flex-shrink-0 animate-spin text-violet-400' />
						<span>Thinking...</span>
						<span className='ml-auto flex-shrink-0 text-caption text-text-tertiary'>{elapsed}s</span>
					</div>
				)}

				{/* Step descriptions */}
				{visibleSteps.map((step, i) => {
					const isCurrent = i === visibleSteps.length - 1 && isExecuting
					return (
						<div
							key={i}
							className={cn('flex items-start gap-2.5 text-body-sm leading-relaxed',
								isCurrent ? 'text-text-primary' : 'text-text-tertiary'
							)}
						>
							{isCurrent ? (
								<IconLoader2 size={14} className='mt-0.5 flex-shrink-0 animate-spin text-violet-400' />
							) : (
								<IconCheck size={14} className='mt-0.5 flex-shrink-0 text-green-500' />
							)}
							<span className='flex-1'>{step}</span>
							{isCurrent && (
								<span className='ml-2 flex-shrink-0 text-caption text-text-tertiary'>{elapsed}s</span>
							)}
						</div>
					)
				})}
			</div>

			{/* Terminal — only visible when there are commands */}
			{commands.length > 0 && (
				<div className='border-t border-border-default bg-[#0d0d0d]'>
					<div className='flex items-center gap-2 border-b border-white/5 px-3 py-1.5'>
						<IconTerminal2 size={12} className='text-text-tertiary' />
						<span className='text-caption-sm text-text-tertiary'>Running</span>
						<span className='ml-auto flex items-center gap-1 text-caption-sm text-green-500'>
							<span className='inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500' />
							live
						</span>
					</div>
					<div
						ref={terminalRef}
						className='max-h-28 overflow-y-auto px-3 py-2 font-mono text-caption'
					>
						{commands.map((cmd, i) => {
							const isLast = i === commands.length - 1
							return (
								<div key={i} className={cn('flex items-center gap-2', isLast && isExecuting ? 'text-green-400' : 'text-text-tertiary')}>
									<span className={isLast && isExecuting ? 'text-green-600' : 'text-text-tertiary/50'}>›</span>
									<span className='truncate'>{cmd}</span>
									{isLast && isExecuting && (
										<span className='ml-0.5 animate-pulse text-green-400'>▌</span>
									)}
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}

type SidebarView = 'chat' | 'mcp' | 'skills'

function ConversationSidebar({
	conversations,
	activeId,
	onSelect,
	onNew,
	onDelete,
	activeView,
	onViewChange,
	className,
}: {
	conversations: Array<{id: string; title: string; updatedAt: number; messageCount: number}>
	activeId: string | null
	onSelect: (id: string) => void
	onNew: () => void
	onDelete: (id: string) => void
	activeView: SidebarView
	onViewChange: (view: SidebarView) => void
	className?: string
}) {
	return (
		<div className={cn('flex h-full w-64 flex-shrink-0 flex-col border-r border-border-default bg-surface-base', className)}>
			<div className='flex items-center justify-between border-b border-border-default p-4'>
				<div className='flex items-center gap-2'>
					<div className='flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30'>
						<IconBrain size={14} className='text-violet-400' />
					</div>
					<h2 className='text-body font-semibold text-text-primary'>Liv AI</h2>
				</div>
				<button
					onClick={onNew}
					className='rounded-radius-sm p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
					title='New conversation'
				>
					<IconPlus size={18} />
				</button>
			</div>

			<div className='flex border-b border-border-default'>
				<button
					onClick={() => onViewChange('chat')}
					className={cn('flex flex-1 items-center justify-center gap-1.5 py-2.5 text-caption font-medium transition-colors',
						activeView === 'chat' ? 'border-b-2 border-brand text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
					)}
				>
					<IconMessageCircle size={14} />
					Chat
				</button>
				<button
					onClick={() => onViewChange('mcp')}
					className={cn('flex flex-1 items-center justify-center gap-1.5 py-2.5 text-caption font-medium transition-colors',
						activeView === 'mcp' ? 'border-b-2 border-brand text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
					)}
				>
					<IconPlug size={14} />
					MCP
				</button>
				<button
					onClick={() => onViewChange('skills')}
					className={cn('flex flex-1 items-center justify-center gap-1.5 py-2.5 text-caption font-medium transition-colors',
						activeView === 'skills' ? 'border-b-2 border-brand text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
					)}
				>
					<IconPuzzle size={14} />
					LivHub
				</button>
			</div>

			{activeView === 'chat' && (
				<div className='flex-1 overflow-y-auto overflow-x-hidden p-2'>
					{conversations.length === 0 && (
						<p className='px-2 py-8 text-center text-caption text-text-tertiary'>No conversations yet</p>
					)}
					{conversations.map((conv) => (
						<button
							key={conv.id}
							onClick={() => onSelect(conv.id)}
							className={cn('group mb-1 flex w-full items-center gap-2 rounded-radius-sm px-3 py-2.5 text-left transition-colors',
								activeId === conv.id ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
							)}
						>
							<IconMessageCircle size={16} className='flex-shrink-0' />
							<div className='min-w-0 flex-1'>
								<span className='block truncate text-body-sm'>{conv.title}</span>
								<span className='text-caption-sm text-text-tertiary'>
									{formatDistanceToNow(conv.updatedAt, {addSuffix: true})}
								</span>
							</div>
							<button
								onClick={(e) => {
									e.stopPropagation()
									onDelete(conv.id)
								}}
								className='hidden rounded p-0.5 text-text-tertiary hover:text-red-400 group-hover:block'
							>
								<IconTrash size={14} />
							</button>
						</button>
					))}
				</div>
			)}

			{(activeView === 'mcp' || activeView === 'skills') && (
				<div className='flex-1' />
			)}
		</div>
	)
}

export default function AiChat() {
	const [searchParams, setSearchParams] = useSearchParams()
	const [input, setInput] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [messages, setMessages] = useState<Message[]>([])
	const [activeView, setActiveView] = useState<SidebarView>('chat')
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const activeRequestRef = useRef<number>(0)
	const isMobile = useIsMobile()

	const activeConversationId = searchParams.get('conv') || `conv_${Date.now()}`

	const conversationsQuery = trpcReact.ai.listConversations.useQuery(undefined, {
		refetchInterval: 10_000,
	})
	const conversationQuery = trpcReact.ai.getConversation.useQuery(
		{id: activeConversationId},
		{enabled: !!searchParams.get('conv')},
	)
	const sendMutation = trpcReact.ai.send.useMutation()
	const deleteMutation = trpcReact.ai.deleteConversation.useMutation()

	// Canvas state
	const [canvasArtifact, setCanvasArtifact] = useState<{
		id: string; type: string; title: string; content: string; version: number;
	} | null>(null)
	const [canvasMinimized, setCanvasMinimized] = useState(false)

	// Poll for canvas artifacts while AI is loading
	const canvasQuery = trpcReact.ai.listCanvasArtifacts.useQuery(
		{conversationId: activeConversationId},
		{
			enabled: isLoading,
			refetchInterval: isLoading ? 1000 : false,
		},
	)

	// One-time fetch when conversation is loaded (for re-opening conversations with canvas)
	const canvasLoadQuery = trpcReact.ai.listCanvasArtifacts.useQuery(
		{conversationId: activeConversationId},
		{
			enabled: !!searchParams.get('conv') && !isLoading,
			refetchInterval: false,
			staleTime: 30000,
		},
	)

	useEffect(() => {
		if (conversationQuery.data) {
			setMessages(conversationQuery.data.messages)
		}
	}, [conversationQuery.data])

	// Update canvas artifact when polling returns data
	useEffect(() => {
		if (canvasQuery.data && Array.isArray(canvasQuery.data) && canvasQuery.data.length > 0) {
			const latest = canvasQuery.data[0] as any
			setCanvasArtifact({
				id: latest.id,
				type: latest.type,
				title: latest.title,
				content: latest.content,
				version: latest.version,
			})
		}
	}, [canvasQuery.data])

	// Update canvas artifact when loading existing conversation
	useEffect(() => {
		if (canvasLoadQuery.data && Array.isArray(canvasLoadQuery.data) && canvasLoadQuery.data.length > 0) {
			const latest = canvasLoadQuery.data[0] as any
			setCanvasArtifact({
				id: latest.id,
				type: latest.type,
				title: latest.title,
				content: latest.content,
				version: latest.version,
			})
		}
	}, [canvasLoadQuery.data])

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({behavior: 'smooth'})
	}, [messages, isLoading])

	const handleStop = useCallback(() => {
		activeRequestRef.current = 0
		setIsLoading(false)
		setMessages((prev) => [
			...prev,
			{
				id: `msg_${Date.now()}_stopped`,
				role: 'assistant',
				content: '_Stopped._',
				timestamp: Date.now(),
			},
		])
		inputRef.current?.focus()
	}, [])

	const handleSend = useCallback(async () => {
		const text = input.trim()
		if (!text || isLoading) return

		const reqId = Date.now()
		activeRequestRef.current = reqId

		setInput('')
		setIsLoading(true)

		const userMsg: Message = {
			id: `msg_${reqId}_user`,
			role: 'user',
			content: text,
			timestamp: reqId,
		}
		setMessages((prev) => [...prev, userMsg])

		if (!searchParams.get('conv')) {
			setSearchParams({conv: activeConversationId})
		}

		try {
			const result = await sendMutation.mutateAsync({
				conversationId: activeConversationId,
				message: text,
			})

			if (activeRequestRef.current !== reqId) return

			setMessages((prev) => [
				...prev,
				{
					id: result.id,
					role: 'assistant',
					content: result.content,
					toolCalls: result.toolCalls,
					timestamp: result.timestamp,
				},
			])
			conversationsQuery.refetch()
		} catch (error: any) {
			if (activeRequestRef.current !== reqId) return
			setMessages((prev) => [
				...prev,
				{
					id: `msg_${Date.now()}_error`,
					role: 'assistant',
					content: `Error: ${error.message}`,
					timestamp: Date.now(),
				},
			])
		} finally {
			if (activeRequestRef.current === reqId) {
				setIsLoading(false)
			}
			inputRef.current?.focus()
		}
	}, [input, isLoading, activeConversationId, searchParams, setSearchParams, sendMutation, conversationsQuery])

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			handleSend()
		}
	}

	const handleNewConversation = () => {
		setMessages([])
		setCanvasArtifact(null)
		setCanvasMinimized(false)
		setSearchParams({conv: `conv_${Date.now()}`})
		setActiveView('chat')
	}

	const handleDeleteConversation = async (id: string) => {
		await deleteMutation.mutateAsync({id})
		if (id === activeConversationId) {
			handleNewConversation()
		}
		conversationsQuery.refetch()
	}

	const sidebarProps = {
		conversations: conversationsQuery.data || [],
		activeId: searchParams.get('conv'),
		onSelect: (id: string) => {
			setSearchParams({conv: id})
			setActiveView('chat')
			setSidebarOpen(false)
		},
		onNew: () => {
			handleNewConversation()
			setSidebarOpen(false)
		},
		onDelete: handleDeleteConversation,
		activeView,
		onViewChange: setActiveView,
	}

	return (
		<div className='flex h-full overflow-hidden'>
			{!isMobile && <ConversationSidebar {...sidebarProps} />}

			{isMobile && (
				<Drawer open={sidebarOpen} onOpenChange={setSidebarOpen}>
					<DrawerContent fullHeight withScroll>
						<ConversationSidebar {...sidebarProps} className='w-full border-r-0 bg-transparent' />
					</DrawerContent>
				</Drawer>
			)}

			{activeView === 'chat' && (
				<div className='relative flex min-h-0 min-w-0 flex-1'>
					{/* Chat area */}
					<div className={cn(
						'flex min-h-0 flex-col',
						canvasArtifact && !canvasMinimized && !isMobile ? 'w-1/2 min-w-[360px]' : 'flex-1',
					)}>
						{isMobile && (
							<div className='flex-shrink-0 border-b border-border-default bg-surface-base px-4 py-3'>
								<div className='flex items-center justify-between'>
									<button
										onClick={() => setSidebarOpen(true)}
										className='flex h-11 w-11 items-center justify-center rounded-radius-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
									>
										<IconMenu2 size={20} />
									</button>
									<span className='text-body font-semibold text-text-primary'>Liv AI</span>
									<button
										onClick={handleNewConversation}
										className='flex h-11 w-11 items-center justify-center rounded-radius-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
									>
										<IconPlus size={18} />
									</button>
								</div>
							</div>
						)}

						<div className='flex-1 overflow-y-auto overscroll-contain p-3 md:p-6'>
							{messages.length === 0 ? (
								<div className='flex h-full flex-col items-center justify-center text-text-tertiary'>
									<div className='mb-6 flex h-16 w-16 items-center justify-center rounded-radius-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
										<IconBrain size={32} className='text-violet-400' />
									</div>
									<h3 className='mb-2 text-heading-sm font-medium text-text-secondary'>Liv</h3>
									<p className='max-w-md text-center text-body text-text-tertiary'>
										Your autonomous AI assistant. I can manage your server, Docker containers, run commands,
										create subagents, schedule tasks, and more.
									</p>
									<div className='mt-6 flex flex-wrap justify-center gap-2'>
										{[
											'Show system health',
											'List subagents',
											'Check Docker containers',
											'Search memory',
										].map((suggestion) => (
											<button
												key={suggestion}
												onClick={() => {
													setInput(suggestion)
													inputRef.current?.focus()
												}}
												className='rounded-radius-md border border-border-default bg-surface-base px-3 py-1.5 text-caption text-text-tertiary transition-colors hover:border-border-emphasis hover:bg-surface-1 hover:text-text-secondary'
											>
												{suggestion}
											</button>
										))}
									</div>
								</div>
							) : (
								<div className='mx-auto max-w-3xl space-y-4'>
									{messages.map((msg) => (
										<ChatMessage key={msg.id} message={msg} />
									))}
									{isLoading && (
										<StatusIndicator
											conversationId={activeConversationId}
											isLoading={isLoading}
										/>
									)}
									<div ref={messagesEndRef} />
								</div>
							)}
						</div>

						<div className='flex-shrink-0 border-t border-border-default bg-surface-base p-3 md:p-4'>
							<div className='mx-auto flex max-w-3xl items-end gap-3'>
								<textarea
									ref={inputRef}
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={handleKeyDown}
									placeholder={isLoading ? 'Working...' : 'Message Liv...'}
									disabled={isLoading}
									rows={1}
									className='flex-1 resize-none rounded-radius-md border border-border-default bg-surface-1 px-4 py-3 text-body text-text-primary placeholder-text-tertiary outline-none transition-colors focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20 disabled:opacity-50'
									style={{maxHeight: '120px'}}
									onInput={(e) => {
										const target = e.target as HTMLTextAreaElement
										target.style.height = 'auto'
										target.style.height = Math.min(target.scrollHeight, 120) + 'px'
									}}
								/>
								<Suspense fallback={null}>
									<VoiceButton
										disabled={isLoading}
										onTranscript={(text) => {
											// Display voice transcript as a user message for visual feedback
											const voiceMsg: Message = {
												id: `msg_${Date.now()}_voice`,
												role: 'user',
												content: text,
												timestamp: Date.now(),
											}
											setMessages((prev) => [...prev, voiceMsg])
										}}
									/>
								</Suspense>
								{isLoading ? (
									<button
										onClick={handleStop}
										className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md border border-red-500/40 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20'
										title='Stop'
									>
										<IconPlayerStop size={18} />
									</button>
								) : (
									<button
										onClick={handleSend}
										disabled={!input.trim()}
										className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md bg-brand text-white transition-colors hover:bg-brand-lighter disabled:opacity-40 disabled:hover:bg-brand'
									>
										<IconSend size={18} />
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Canvas panel — desktop split-pane */}
					{canvasArtifact && !canvasMinimized && !isMobile && (
						<Suspense fallback={<div className='flex w-1/2 items-center justify-center'><IconLoader2 size={24} className='animate-spin text-text-tertiary' /></div>}>
							<div className='w-1/2 min-w-[360px]'>
								<CanvasPanel
									artifact={canvasArtifact}
									onClose={() => setCanvasMinimized(true)}
								/>
							</div>
						</Suspense>
					)}

					{/* Canvas panel — mobile full overlay */}
					{canvasArtifact && !canvasMinimized && isMobile && (
						<Suspense fallback={null}>
							<div className='fixed inset-0 z-50 bg-surface-base'>
								<CanvasPanel
									artifact={canvasArtifact}
									onClose={() => setCanvasMinimized(true)}
								/>
							</div>
						</Suspense>
					)}

					{/* Minimized canvas indicator */}
					{canvasArtifact && canvasMinimized && (
						<button
							onClick={() => setCanvasMinimized(false)}
							className='absolute right-4 top-4 z-10 flex items-center gap-2 rounded-radius-lg border border-border-default bg-surface-1 px-3 py-2 text-body-sm font-medium text-text-secondary shadow-elevation-1 transition-all hover:bg-surface-2 hover:text-text-primary'
						>
							<IconCode size={16} className='text-cyan-400' />
							{canvasArtifact.title}
						</button>
					)}
				</div>
			)}

			{activeView === 'mcp' && (
				<div className='flex-1 overflow-hidden'>
					<Suspense fallback={<div className='flex h-full items-center justify-center'><IconLoader2 size={24} className='animate-spin text-text-tertiary' /></div>}>
						<McpPanel />
					</Suspense>
				</div>
			)}
			{activeView === 'skills' && (
				<div className='flex-1 overflow-hidden'>
					<Suspense fallback={<div className='flex h-full items-center justify-center'><IconLoader2 size={24} className='animate-spin text-text-tertiary' /></div>}>
						<SkillsPanel />
					</Suspense>
				</div>
			)}
		</div>
	)
}
