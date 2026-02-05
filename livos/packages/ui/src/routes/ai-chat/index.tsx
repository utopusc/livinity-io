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
	IconRobot,
	IconUser,
	IconBrain,
	IconLoader2,
	IconPlug,
} from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {trpcReact} from '@/trpc/trpc'

const McpPanel = lazy(() => import('./mcp-panel'))

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

function ToolCallDisplay({toolCall}: {toolCall: ToolCall}) {
	const [expanded, setExpanded] = useState(false)

	return (
		<div className='my-1 rounded-lg border border-white/10 bg-white/5 text-xs'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5'
			>
				{expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
				<IconTool size={14} className='text-blue-400' />
				<span className='font-mono font-medium text-blue-400'>{toolCall.tool}</span>
				<span className={`ml-auto text-[10px] ${toolCall.result.success ? 'text-green-400' : 'text-red-400'}`}>
					{toolCall.result.success ? 'OK' : 'FAIL'}
				</span>
			</button>
			{expanded && (
				<div className='border-t border-white/10 px-3 py-2'>
					<div className='mb-1 text-[10px] uppercase text-white/40'>Params</div>
					<pre className='mb-2 overflow-x-auto whitespace-pre-wrap text-white/60'>
						{JSON.stringify(toolCall.params, null, 2)}
					</pre>
					<div className='mb-1 text-[10px] uppercase text-white/40'>Output</div>
					<pre className='max-h-40 overflow-auto whitespace-pre-wrap text-white/60'>
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
		<div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
			{!isUser && (
				<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-blue-500/30'>
					<IconBrain size={18} className='text-violet-400' />
				</div>
			)}
			<div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
				<div
					className={`rounded-2xl px-4 py-3 ${
						isUser ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/90'
					}`}
				>
					{isUser ? (
						<p className='whitespace-pre-wrap text-sm'>{message.content}</p>
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
				<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20'>
					<IconUser size={18} className='text-white/80' />
				</div>
			)}
		</div>
	)
}

/** Dynamic status indicator that shows what Liv is doing */
function StatusIndicator({conversationId, isLoading}: {conversationId: string; isLoading: boolean}) {
	const statusQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId},
		{
			enabled: isLoading,
			refetchInterval: isLoading ? 600 : false,
		},
	)

	if (!isLoading) return null

	const statusText = statusQuery.data?.status || 'Connecting to Liv...'
	const toolName = statusQuery.data?.tool

	// Map tool names to friendly descriptions
	const getStatusIcon = () => {
		if (!toolName) return <IconLoader2 size={14} className='animate-spin text-violet-400' />
		if (toolName.includes('memory')) return <IconBrain size={14} className='animate-pulse text-purple-400' />
		if (toolName.includes('shell')) return <IconTool size={14} className='animate-pulse text-orange-400' />
		if (toolName.includes('docker')) return <IconTool size={14} className='animate-pulse text-blue-400' />
		return <IconTool size={14} className='animate-pulse text-blue-400' />
	}

	return (
		<div className='flex items-center gap-2.5 rounded-xl bg-white/5 px-4 py-2.5 text-sm'>
			{getStatusIcon()}
			<span className='text-white/50'>{statusText}</span>
		</div>
	)
}

type SidebarView = 'chat' | 'mcp'

function ConversationSidebar({
	conversations,
	activeId,
	onSelect,
	onNew,
	onDelete,
	activeView,
	onViewChange,
}: {
	conversations: Array<{id: string; title: string; updatedAt: number; messageCount: number}>
	activeId: string | null
	onSelect: (id: string) => void
	onNew: () => void
	onDelete: (id: string) => void
	activeView: SidebarView
	onViewChange: (view: SidebarView) => void
}) {
	return (
		<div className='flex h-full w-64 flex-shrink-0 flex-col border-r border-white/10 bg-black/20'>
			<div className='flex items-center justify-between border-b border-white/10 p-4'>
				<div className='flex items-center gap-2'>
					<div className='flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-blue-500/30'>
						<IconBrain size={14} className='text-violet-400' />
					</div>
					<h2 className='text-sm font-semibold text-white/80'>Liv AI</h2>
				</div>
				<button
					onClick={onNew}
					className='rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white'
					title='New conversation'
				>
					<IconPlus size={18} />
				</button>
			</div>

			{/* View switcher */}
			<div className='flex border-b border-white/10'>
				<button
					onClick={() => onViewChange('chat')}
					className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
						activeView === 'chat' ? 'border-b-2 border-violet-500 text-white' : 'text-white/40 hover:text-white/60'
					}`}
				>
					<IconMessageCircle size={14} />
					Chat
				</button>
				<button
					onClick={() => onViewChange('mcp')}
					className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
						activeView === 'mcp' ? 'border-b-2 border-violet-500 text-white' : 'text-white/40 hover:text-white/60'
					}`}
				>
					<IconPlug size={14} />
					MCP
				</button>
			</div>

			{/* Conversation list (only in chat view) */}
			{activeView === 'chat' && (
				<div className='flex-1 overflow-y-auto overflow-x-hidden p-2'>
					{conversations.length === 0 && (
						<p className='px-2 py-8 text-center text-xs text-white/30'>No conversations yet</p>
					)}
					{conversations.map((conv) => (
						<button
							key={conv.id}
							onClick={() => onSelect(conv.id)}
							className={`group mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
								activeId === conv.id ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
							}`}
						>
							<IconMessageCircle size={16} className='flex-shrink-0' />
							<span className='flex-1 truncate text-xs'>{conv.title}</span>
							<button
								onClick={(e) => {
									e.stopPropagation()
									onDelete(conv.id)
								}}
								className='hidden rounded p-0.5 text-white/40 hover:text-red-400 group-hover:block'
							>
								<IconTrash size={14} />
							</button>
						</button>
					))}
				</div>
			)}

			{/* MCP view - sidebar filler */}
			{activeView === 'mcp' && (
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
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)

	const activeConversationId = searchParams.get('conv') || `conv_${Date.now()}`

	// Queries
	const conversationsQuery = trpcReact.ai.listConversations.useQuery(undefined, {
		refetchInterval: 10_000,
	})
	const conversationQuery = trpcReact.ai.getConversation.useQuery(
		{id: activeConversationId},
		{enabled: !!searchParams.get('conv')},
	)
	const sendMutation = trpcReact.ai.send.useMutation()
	const deleteMutation = trpcReact.ai.deleteConversation.useMutation()

	// Sync messages from query
	useEffect(() => {
		if (conversationQuery.data) {
			setMessages(conversationQuery.data.messages)
		}
	}, [conversationQuery.data])

	// Auto-scroll
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({behavior: 'smooth'})
	}, [messages, isLoading])

	const handleSend = useCallback(async () => {
		const text = input.trim()
		if (!text || isLoading) return

		setInput('')
		setIsLoading(true)

		// Add user message optimistically
		const userMsg: Message = {
			id: `msg_${Date.now()}_user`,
			role: 'user',
			content: text,
			timestamp: Date.now(),
		}
		setMessages((prev) => [...prev, userMsg])

		// Ensure conversation ID is in URL
		if (!searchParams.get('conv')) {
			setSearchParams({conv: activeConversationId})
		}

		try {
			const result = await sendMutation.mutateAsync({
				conversationId: activeConversationId,
				message: text,
			})

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
			setIsLoading(false)
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

	return (
		<div className='flex h-full overflow-hidden'>
			{/* Sidebar - independently scrollable */}
			<ConversationSidebar
				conversations={conversationsQuery.data || []}
				activeId={searchParams.get('conv')}
				onSelect={(id) => {
					setSearchParams({conv: id})
					setActiveView('chat')
				}}
				onNew={handleNewConversation}
				onDelete={handleDeleteConversation}
				activeView={activeView}
				onViewChange={setActiveView}
			/>

			{/* Main content area */}
			{activeView === 'chat' ? (
				/* Chat area - independently scrollable */
				<div className='flex min-h-0 flex-1 flex-col'>
					{/* Messages - scrollable */}
					<div className='min-h-0 flex-1 overflow-y-auto p-6'>
						{messages.length === 0 ? (
							<div className='flex h-full flex-col items-center justify-center text-white/30'>
								<div className='mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
									<IconBrain size={32} className='text-violet-400' />
								</div>
								<h3 className='mb-2 text-lg font-medium text-white/50'>Liv</h3>
								<p className='max-w-md text-center text-sm text-white/30'>
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
											className='rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/40 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white/60'
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
									<StatusIndicator conversationId={activeConversationId} isLoading={isLoading} />
								)}
								<div ref={messagesEndRef} />
							</div>
						)}
					</div>

					{/* Input - fixed at bottom */}
					<div className='border-t border-white/10 bg-black/20 p-4'>
						<div className='mx-auto flex max-w-3xl items-end gap-3'>
							<textarea
								ref={inputRef}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder='Message Liv...'
								rows={1}
								className='flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25'
								style={{maxHeight: '120px'}}
								onInput={(e) => {
									const target = e.target as HTMLTextAreaElement
									target.style.height = 'auto'
									target.style.height = Math.min(target.scrollHeight, 120) + 'px'
								}}
							/>
							<button
								onClick={handleSend}
								disabled={!input.trim() || isLoading}
								className='flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600'
							>
								<IconSend size={18} />
							</button>
						</div>
					</div>
				</div>
			) : (
				/* MCP Panel */
				<div className='flex-1 overflow-hidden'>
					<Suspense
						fallback={
							<div className='flex h-full items-center justify-center'>
								<IconLoader2 size={24} className='animate-spin text-white/30' />
							</div>
						}
					>
						<McpPanel />
					</Suspense>
				</div>
			)}
		</div>
	)
}
