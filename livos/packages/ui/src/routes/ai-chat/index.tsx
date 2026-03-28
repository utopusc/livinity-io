import {useCallback, useEffect, useRef, useState, Suspense, lazy} from 'react'
import {useSearchParams} from 'react-router-dom'
import {
	IconMessageCircle,
	IconPlus,
	IconTrash,
	IconBrain,
	IconLoader2,
	IconPlug,
	IconMenu2,
	IconPuzzle,
	IconCode,
	IconScreenshot,
	IconDeviceDesktop,
} from '@tabler/icons-react'
import {formatDistanceToNow} from 'date-fns'

import {AnimatedGroup} from '@/components/motion-primitives/animated-group'
import {TextEffect} from '@/components/motion-primitives/text-effect'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useAgentSocket, type ChatMessage, type AgentStatus} from '@/hooks/use-agent-socket'
import {Drawer, DrawerContent} from '@/shadcn-components/ui/drawer'

import {ChatMessageItem} from './chat-messages'
import {ChatInput} from './chat-input'

const McpPanel = lazy(() => import('./mcp-panel'))
const SkillsPanel = lazy(() => import('./skills-panel'))
const CanvasPanel = lazy(() => import('./canvas-panel').then((m) => ({default: m.CanvasPanel})))
const ComputerUsePanel = lazy(() => import('./computer-use-panel').then((m) => ({default: m.ComputerUsePanel})))

type SidebarView = 'chat' | 'mcp' | 'skills'

function ConversationSidebar({
	conversations,
	activeId,
	onSelect,
	onNew,
	onDelete,
	activeView,
	onViewChange,
	activeProvider,
	className,
}: {
	conversations: Array<{id: string; title: string; updatedAt: number; messageCount: number}>
	activeId: string | null
	onSelect: (id: string) => void
	onNew: () => void
	onDelete: (id: string) => void
	activeView: SidebarView
	onViewChange: (view: SidebarView) => void
	activeProvider: string
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
					<span className='rounded-full bg-surface-2 px-2 py-0.5 text-caption-sm font-medium text-text-secondary capitalize'>
						{activeProvider}
					</span>
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
	const [activeView, setActiveView] = useState<SidebarView>('chat')
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const isUserScrolledUpRef = useRef(false)
	const messagesEndRef = useRef<HTMLDivElement>(null)
	const isMobile = useIsMobile()
	const agent = useAgentSocket()
	const utils = trpcReact.useUtils()

	const providersQuery = trpcReact.ai.getProviders.useQuery(undefined, {refetchInterval: 30_000})
	const activeProvider = providersQuery.data?.primaryProvider ?? 'kimi'

	const activeConversationId = searchParams.get('conv') ?? null

	const conversationsQuery = trpcReact.ai.listConversations.useQuery(undefined, {
		refetchInterval: 10_000,
	})
	const deleteMutation = trpcReact.ai.deleteConversation.useMutation()
	const sendMutation = trpcReact.ai.send.useMutation()

	// Canvas state
	const [canvasArtifact, setCanvasArtifact] = useState<{
		id: string; type: string; title: string; content: string; version: number;
	} | null>(null)
	const [canvasMinimized, setCanvasMinimized] = useState(false)

	// Computer use monitoring state
	const [computerUseMinimized, setComputerUseMinimized] = useState(false)

	// Poll for canvas artifacts while agent is streaming
	const canvasQuery = trpcReact.ai.listCanvasArtifacts.useQuery(
		{conversationId: activeConversationId!},
		{
			enabled: !!activeConversationId && agent.isStreaming,
			refetchInterval: agent.isStreaming ? 1000 : false,
		},
	)

	// One-time fetch when conversation is loaded (for re-opening conversations with canvas)
	const canvasLoadQuery = trpcReact.ai.listCanvasArtifacts.useQuery(
		{conversationId: activeConversationId!},
		{
			enabled: !!activeConversationId && !!searchParams.get('conv') && !agent.isStreaming,
			refetchInterval: false,
			staleTime: 30000,
		},
	)

	// Poll chatStatus for computer use session detection
	const computerUseQuery = trpcReact.ai.getChatStatus.useQuery(
		{conversationId: activeConversationId!},
		{
			enabled: !!activeConversationId && agent.isStreaming,
			refetchInterval: agent.isStreaming ? 500 : false,
		},
	)

	const computerUseData = computerUseQuery.data as {
		computerUse?: boolean
		computerUseConsent?: boolean
		screenshot?: string
		actions?: Array<{type: string; x?: number; y?: number; text?: string; key?: string; timestamp: number}>
		paused?: boolean
	} | null

	const isComputerUseActive = !!computerUseData?.computerUse
	const needsConsent = !!computerUseData?.computerUse && !computerUseData?.computerUseConsent
	const grantConsentMutation = trpcReact.ai.grantConsent.useMutation()
	const denyConsentMutation = trpcReact.ai.denyConsent.useMutation()

	// Messages come directly from the agent hook
	const displayMessages = agent.messages

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

	// Detect user scroll-up
	const handleScroll = useCallback(() => {
		const el = scrollContainerRef.current
		if (!el) return
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
		isUserScrolledUpRef.current = distanceFromBottom > 100
	}, [])

	// Auto-scroll when new content arrives (unless user scrolled up)
	useEffect(() => {
		if (!isUserScrolledUpRef.current) {
			messagesEndRef.current?.scrollIntoView({behavior: 'smooth'})
		}
	}, [displayMessages, agent.isStreaming])

	// Refetch conversation list when streaming ends so sidebar updates
	const prevStreamingRef = useRef(false)
	useEffect(() => {
		if (prevStreamingRef.current && !agent.isStreaming) {
			// Streaming just ended — refetch conversation list to show updated sidebar
			conversationsQuery.refetch()
		}
		prevStreamingRef.current = agent.isStreaming
	}, [agent.isStreaming, conversationsQuery])

	// Load conversation messages on mount if URL has ?conv= param (page refresh)
	const initialConvLoaded = useRef(false)
	useEffect(() => {
		const convId = searchParams.get('conv')
		if (convId && !initialConvLoaded.current && agent.isConnected) {
			initialConvLoaded.current = true
			utils.ai.getConversationMessages.fetch({id: convId}).then((result) => {
				if (result?.messages && result.messages.length > 0) {
					agent.loadConversation(result.messages as ChatMessage[], convId)
				}
			}).catch(() => {
				// Conversation not found in Redis — show empty chat (new conversation)
			})
		}
	}, [searchParams, agent.isConnected, utils])

	// Auto-load most recent conversation when no ?conv= URL param
	const autoLoadAttempted = useRef(false)
	useEffect(() => {
		if (autoLoadAttempted.current) return
		if (searchParams.get('conv')) return // URL already has a conversation
		autoLoadAttempted.current = true

		// Priority 1: localStorage last-used conversation
		const lastId = localStorage.getItem('liv:lastConversationId')
		if (lastId) {
			setSearchParams({conv: lastId}, {replace: true})
			return
		}

		// Priority 2: Most recent conversation from backend
		utils.ai.listConversations.fetch().then((convs) => {
			if (convs && convs.length > 0) {
				setSearchParams({conv: convs[0].id}, {replace: true})
			}
		}).catch(() => {
			// No conversations — stay on empty state
		})
	}, [searchParams, setSearchParams, utils])

	// Persist current conversation to localStorage for next visit
	useEffect(() => {
		const convId = searchParams.get('conv')
		if (convId) {
			localStorage.setItem('liv:lastConversationId', convId)
		}
	}, [searchParams])

	const handleStop = useCallback(() => {
		agent.interrupt()
	}, [agent])

	const handleSend = useCallback(async () => {
		const text = input.trim()
		if (!text) return
		setInput('')
		// Reset textarea height after clearing
		const textarea = document.querySelector('textarea')
		if (textarea) textarea.style.height = 'auto'

		if (agent.isConnected && agent.connectionStatus === 'connected') {
			// WebSocket path (new v20.0)
			if (agent.isStreaming) {
				agent.sendFollowUp(text)
			} else {
				agent.sendMessage(text, undefined, activeConversationId || `conv_${Date.now()}`)
			}
		} else {
			// Fallback to tRPC send (legacy path — works without WebSocket)
			try {
				const convId = activeConversationId || `conv_${Date.now()}`
				const result = await sendMutation.mutateAsync({
					conversationId: convId,
					message: text,
				})
				if (result?.message) {
					// Add both user and assistant messages to display
					agent.loadConversation([
						...agent.messages,
						{id: `user_${Date.now()}`, role: 'user', content: text, isStreaming: false},
						{id: `asst_${Date.now()}`, role: 'assistant', content: result.message.content || '', isStreaming: false, toolCalls: []},
					], convId)
				}
			} catch (err: any) {
				console.error('Send failed:', err)
			}
		}
	}, [input, agent, activeConversationId, sendMutation])

	const handleNewConversation = () => {
		const newId = `conv_${Date.now()}`
		agent.clearMessages()
		setCanvasArtifact(null)
		setCanvasMinimized(false)
		setComputerUseMinimized(false)
		setSearchParams({conv: newId})
		localStorage.setItem('liv:lastConversationId', newId)
		setActiveView('chat')
	}

	const handleDeleteConversation = async (id: string) => {
		await deleteMutation.mutateAsync({id})
		if (localStorage.getItem('liv:lastConversationId') === id) {
			localStorage.removeItem('liv:lastConversationId')
		}
		if (id === activeConversationId) {
			handleNewConversation()
		}
		conversationsQuery.refetch()
	}

	const handleSelectConversation = useCallback(async (id: string) => {
		setSearchParams({conv: id})
		localStorage.setItem('liv:lastConversationId', id)
		setActiveView('chat')
		setSidebarOpen(false)

		try {
			const result = await utils.ai.getConversationMessages.fetch({id})
			if (result?.messages) {
				agent.loadConversation(result.messages as ChatMessage[], id)
			}
		} catch (err) {
			console.error('Failed to load conversation:', err)
			// Show empty chat rather than crash
			agent.clearMessages()
		}
	}, [setSearchParams, utils, agent])

	const sidebarProps = {
		conversations: conversationsQuery.data || [],
		activeId: searchParams.get('conv'),
		onSelect: handleSelectConversation,
		onNew: () => {
			handleNewConversation()
			setSidebarOpen(false)
		},
		onDelete: handleDeleteConversation,
		activeView,
		onViewChange: setActiveView,
		activeProvider,
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
						(isComputerUseActive && !computerUseMinimized && !isMobile) || (canvasArtifact && !canvasMinimized && !isMobile)
							? 'w-1/2 min-w-[360px]' : 'flex-1',
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
									<div className='flex items-center gap-2'>
									<span className='text-body font-semibold text-text-primary'>Liv AI</span>
									<span className='rounded-full bg-surface-2 px-2 py-0.5 text-caption-sm font-medium text-text-secondary capitalize'>
										{activeProvider}
									</span>
								</div>
									<button
										onClick={handleNewConversation}
										className='flex h-11 w-11 items-center justify-center rounded-radius-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
									>
										<IconPlus size={18} />
									</button>
								</div>
							</div>
						)}

						{/* WebSocket connection status indicator */}
						<div className='flex items-center gap-2 border-b border-border-default bg-surface-base px-4 py-1.5'>
							<span
								className={cn(
									'inline-block h-2 w-2 rounded-full',
									agent.connectionStatus === 'connected' && 'bg-green-500',
									agent.connectionStatus === 'reconnecting' && 'bg-yellow-500 animate-pulse',
									agent.connectionStatus === 'disconnected' && 'bg-red-500',
								)}
							/>
							<span className='text-caption-sm text-text-tertiary'>
								{agent.connectionStatus === 'connected'
									? 'Agent connected'
									: agent.connectionStatus === 'reconnecting'
										? 'Reconnecting...'
										: 'Agent disconnected'}
							</span>
							{agent.totalCost > 0 && (
								<span
									className='ml-auto text-caption-sm font-mono text-text-tertiary'
									title={agent.usageStats ? `Input: ${agent.usageStats.inputTokens.toLocaleString()} tokens | Output: ${agent.usageStats.outputTokens.toLocaleString()} tokens | ${(agent.usageStats.durationMs / 1000).toFixed(1)}s` : undefined}
								>
									${agent.totalCost.toFixed(4)}
								</span>
							)}
						</div>

						<div
							ref={scrollContainerRef}
							onScroll={handleScroll}
							className='flex-1 overflow-y-auto overscroll-contain p-3 md:p-6'
						>
							{displayMessages.length === 0 ? (
								<div className='flex h-full flex-col items-center justify-center text-text-tertiary'>
									<div className='mb-6 flex h-16 w-16 items-center justify-center rounded-radius-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20'>
										<IconBrain size={32} className='text-violet-400' />
									</div>
									<h3 className='mb-2 text-heading-sm font-medium text-text-secondary'>Liv</h3>
									<TextEffect
										as='p'
										per='word'
										preset='fade'
										className='max-w-md text-center text-body text-text-tertiary'
									>
										Your autonomous AI assistant. I can manage your server, Docker containers, run commands, create subagents, schedule tasks, and more.
									</TextEffect>
									<AnimatedGroup
										preset='blur-slide'
										className='mt-6 flex flex-wrap justify-center gap-2'
									>
										{[
											'Show system health',
											'List subagents',
											'Check Docker containers',
											'Search memory',
										].map((suggestion) => (
											<button
												key={suggestion}
												onClick={() => setInput(suggestion)}
												className='rounded-radius-md border border-border-default bg-surface-base px-3 py-1.5 text-caption text-text-tertiary transition-colors hover:border-border-emphasis hover:bg-surface-1 hover:text-text-secondary'
											>
												{suggestion}
											</button>
										))}
									</AnimatedGroup>
								</div>
							) : (
								<div className='mx-auto max-w-3xl space-y-4'>
									{displayMessages.map((msg, idx) => {
										// Only pass agentStatus to the last message if it's a streaming assistant message
										const isLastStreamingAssistant =
											msg.role === 'assistant' &&
											msg.isStreaming &&
											idx === displayMessages.length - 1
										return (
											<ChatMessageItem
												key={msg.id}
												message={msg}
												agentStatus={isLastStreamingAssistant ? agent.agentStatus : undefined}
											/>
										)
									})}
									<div ref={messagesEndRef} />
								</div>
							)}
						</div>

						<ChatInput
							value={input}
							onChange={setInput}
							onSend={handleSend}
							onStop={handleStop}
							isStreaming={agent.isStreaming}
							isConnected={agent.isConnected}
						/>
					</div>

					{/* Canvas panel -- desktop split-pane (hidden when computer use is active) */}
					{canvasArtifact && !canvasMinimized && !isMobile && !isComputerUseActive && (
						<Suspense fallback={<div className='flex w-1/2 items-center justify-center'><IconLoader2 size={24} className='animate-spin text-text-tertiary' /></div>}>
							<div className='w-1/2 min-w-[360px]'>
								<CanvasPanel
									artifact={canvasArtifact}
									onClose={() => setCanvasMinimized(true)}
								/>
							</div>
						</Suspense>
					)}

					{/* Canvas panel -- mobile full overlay (hidden when computer use is active) */}
					{canvasArtifact && !canvasMinimized && isMobile && !isComputerUseActive && (
						<Suspense fallback={null}>
							<div className='fixed inset-0 z-50 bg-surface-base'>
								<CanvasPanel
									artifact={canvasArtifact}
									onClose={() => setCanvasMinimized(true)}
								/>
							</div>
						</Suspense>
					)}

					{/* Minimized canvas indicator (hidden when computer use is active) */}
					{canvasArtifact && canvasMinimized && !isComputerUseActive && (
						<button
							onClick={() => setCanvasMinimized(false)}
							className='absolute right-4 top-4 z-10 flex items-center gap-2 rounded-radius-lg border border-border-default bg-surface-1 px-3 py-2 text-body-sm font-medium text-text-secondary shadow-elevation-1 transition-all hover:bg-surface-2 hover:text-text-primary'
						>
							<IconCode size={16} className='text-cyan-400' />
							{canvasArtifact.title}
						</button>
					)}

					{/* SEC-01: Consent dialog before computer use starts */}
					{needsConsent && (
						<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'>
							<div className='mx-4 w-full max-w-sm rounded-radius-xl border border-border-default bg-surface-base p-6 shadow-elevation-3'>
								{/* Icon */}
								<div className='mb-4 flex justify-center'>
									<div className='flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10'>
										<IconDeviceDesktop size={24} className='text-amber-500' />
									</div>
								</div>
								{/* Title */}
								<h3 className='mb-2 text-center text-heading-md font-semibold text-text-primary'>
									AI wants to control your device
								</h3>
								{/* Description */}
								<p className='mb-6 text-center text-body-sm text-text-secondary'>
									The AI is requesting permission to use your mouse and keyboard. You can stop control at any time.
								</p>
								{/* Buttons */}
								<div className='flex gap-3'>
									<button
										onClick={() => denyConsentMutation.mutate({conversationId: activeConversationId!})}
										className='flex-1 rounded-radius-lg border border-border-default bg-surface-1 px-4 py-2.5 text-body-sm font-medium text-text-secondary transition-colors hover:bg-surface-2'
									>
										Deny
									</button>
									<button
										onClick={() => grantConsentMutation.mutate({conversationId: activeConversationId!})}
										className='flex-1 rounded-radius-lg bg-accent-primary px-4 py-2.5 text-body-sm font-medium text-white transition-colors hover:bg-accent-primary-hover'
									>
										Allow
									</button>
								</div>
							</div>
						</div>
					)}

					{/* Computer Use Panel -- desktop split-pane (takes priority over canvas) */}
					{isComputerUseActive && !computerUseMinimized && !isMobile && (
						<Suspense fallback={<div className='flex w-1/2 items-center justify-center'><IconLoader2 size={24} className='animate-spin text-text-tertiary' /></div>}>
							<div className='w-1/2 min-w-[360px]'>
								<ComputerUsePanel
									conversationId={activeConversationId!}
									screenshot={computerUseData?.screenshot || null}
									actions={(computerUseData?.actions || []) as any}
									paused={!!computerUseData?.paused}
									onClose={() => setComputerUseMinimized(true)}
								/>
							</div>
						</Suspense>
					)}

					{/* Computer Use Panel -- mobile full overlay */}
					{isComputerUseActive && !computerUseMinimized && isMobile && (
						<Suspense fallback={null}>
							<div className='fixed inset-0 z-50 bg-surface-base'>
								<ComputerUsePanel
									conversationId={activeConversationId!}
									screenshot={computerUseData?.screenshot || null}
									actions={(computerUseData?.actions || []) as any}
									paused={!!computerUseData?.paused}
									onClose={() => setComputerUseMinimized(true)}
								/>
							</div>
						</Suspense>
					)}

					{/* Minimized computer use indicator */}
					{isComputerUseActive && computerUseMinimized && (
						<button
							onClick={() => setComputerUseMinimized(false)}
							className='absolute right-4 top-4 z-10 flex items-center gap-2 rounded-radius-lg border border-border-default bg-surface-1 px-3 py-2 text-body-sm font-medium text-text-secondary shadow-elevation-1 transition-all hover:bg-surface-2 hover:text-text-primary'
						>
							<IconScreenshot size={16} className='text-green-400' />
							Computer Use
							<span className='ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-green-500' />
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
