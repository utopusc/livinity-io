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

/** Live step-by-step indicator — human-readable descriptions, like Claude Code */
function StatusIndicator({conversationId, isLoading}: {conversationId: string; isLoading: boolean}) {
	const statusQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId},
		{
			enabled: isLoading,
			refetchInterval: isLoading ? 500 : false,
		},
	)
	const elapsed = useElapsed(isLoading)

	if (!isLoading) return null

	const steps: string[] = (statusQuery.data as any)?.steps ?? []
	const activeTool: string | undefined = (statusQuery.data as any)?.tool
	const isExecuting = !!activeTool

	// Show last 8 steps
	const visibleSteps = steps.slice(-8)

	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base px-4 py-3'>
			<div className='space-y-1.5'>
				{/* Completed steps */}
				{visibleSteps.map((step, i) => {
					const isCurrent = i === visibleSteps.length - 1 && isExecuting
					return (
						<div
							key={i}
							className={cn(
								'flex items-center gap-2.5 text-caption',
								isCurrent ? 'text-text-primary' : 'text-text-tertiary',
							)}
						>
							{isCurrent ? (
								<IconLoader2 size={12} className='flex-shrink-0 animate-spin text-violet-400' />
							) : (
								<IconCheck size={12} className='flex-shrink-0 text-green-500' />
							)}
							<span className={isCurrent ? 'text-text-primary' : 'text-text-tertiary'}>{step}</span>
							{isCurrent && (
								<span className='ml-auto flex-shrink-0 text-caption-sm text-text-tertiary'>{elapsed}s</span>
							)}
						</div>
					)
				})}

				{/* Thinking indicator when no tool is active */}
				{(!isExecuting || steps.length === 0) && (
					<div className='flex items-center gap-2.5 text-caption text-text-secondary'>
						<IconLoader2 size={12} className='flex-shrink-0 animate-spin text-violet-400' />
						<span>Düşünüyor...</span>
						<span className='ml-auto text-caption-sm text-text-tertiary'>{elapsed}s</span>
					</div>
				)}
			</div>
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

			{/* View switcher */}
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
					Skills
				</button>
			</div>

			{/* Conversation list */}
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
	// Use a request ID to prevent stale responses from old requests being shown
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

	useEffect(() => {
		if (conversationQuery.data) {
			setMessages(conversationQuery.data.messages)
		}
	}, [conversationQuery.data])

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({behavior: 'smooth'})
	}, [messages, isLoading])

	/** Stop the currently running agent — invalidates the active request ID */
	const handleStop = useCallback(() => {
		activeRequestRef.current = 0 // invalidate any in-flight request
		setIsLoading(false)
		setMessages((prev) => [
			...prev,
			{
				id: `msg_${Date.now()}_stopped`,
				role: 'assistant',
				content: '_Durduruldu._',
				timestamp: Date.now(),
			},
		])
		inputRef.current?.focus()
	}, [])

	const handleSend = useCallback(async () => {
		const text = input.trim()
		if (!text || isLoading) return

		// Assign a unique ID to this request
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

			// Ignore result if this request was superseded (stopped or new message sent)
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
				<div className='relative flex min-h-0 min-w-0 flex-1 flex-col'>
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

					{/* Input */}
					<div className='flex-shrink-0 border-t border-border-default bg-surface-base p-3 md:p-4'>
						<div className='mx-auto flex max-w-3xl items-end gap-3'>
							<textarea
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={isLoading ? 'Düşünüyor...' : 'Liv\'e mesaj yaz...'}
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
							{isLoading ? (
								<button
									onClick={handleStop}
									className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md border border-red-500/40 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20'
									title='Durdur'
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
