/**
 * Memory Management — View, search, and delete AI memories and conversation history.
 *
 * Two tabs:
 * - Memories: stored AI memory entries with client-side search and per-item delete
 * - Conversations: conversation turns across all channels with channel filter, search, and delete
 */

import React, {useState} from 'react'
import {
	TbBrain,
	TbHistory,
	TbTrash,
	TbSearch,
	TbWorld,
	TbBrandTelegram,
	TbBrandWhatsapp,
	TbBrandDiscord,
	TbMessage,
} from 'react-icons/tb'
import {Loader2} from 'lucide-react'

import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS = [
	{id: 'all', label: 'All'},
	{id: 'web', label: 'Web', icon: TbWorld},
	{id: 'telegram', label: 'Telegram', icon: TbBrandTelegram},
	{id: 'whatsapp', label: 'WhatsApp', icon: TbBrandWhatsapp},
	{id: 'discord', label: 'Discord', icon: TbBrandDiscord},
] as const

function channelIcon(channel: string) {
	switch (channel?.toLowerCase()) {
		case 'web':
			return TbWorld
		case 'telegram':
			return TbBrandTelegram
		case 'whatsapp':
			return TbBrandWhatsapp
		case 'discord':
			return TbBrandDiscord
		case 'slack':
			return TbMessage
		default:
			return TbMessage
	}
}

function formatRelativeTime(timestamp: string | number): string {
	const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMin = Math.floor(diffMs / 60_000)
	const diffHr = Math.floor(diffMs / 3_600_000)
	const diffDays = Math.floor(diffMs / 86_400_000)

	if (diffMin < 1) return 'just now'
	if (diffMin < 60) return `${diffMin}m ago`
	if (diffHr < 24) return `${diffHr}h ago`
	if (diffDays < 7) return `${diffDays}d ago`
	return date.toLocaleDateString()
}

function formatDateTime(timestamp: number): string {
	const date = new Date(timestamp * 1000)
	return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

export function MemorySection() {
	const isMobile = useIsMobile()

	return (
		<div className='space-y-4'>
			<p className='text-sm text-white/50'>
				View and manage what the AI remembers about you. Search through conversation history from all channels.
			</p>
			<Tabs defaultValue='memories' className='w-full'>
				<TabsList className={cn('bg-white/5', isMobile && 'w-full')}>
					<TabsTrigger value='memories' className='flex items-center gap-1.5'>
						<TbBrain className='size-4' />
						Memories
					</TabsTrigger>
					<TabsTrigger value='conversations' className='flex items-center gap-1.5'>
						<TbHistory className='size-4' />
						Conversations
					</TabsTrigger>
				</TabsList>
				<TabsContent value='memories'>
					<MemoriesTab />
				</TabsContent>
				<TabsContent value='conversations'>
					<ConversationsTab />
				</TabsContent>
			</Tabs>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Memories Tab
// ─────────────────────────────────────────────────────────────────────────────

function MemoriesTab() {
	const [search, setSearch] = useState('')
	const utils = trpcReact.useUtils()

	const memoriesQ = trpcReact.ai.memoryList.useQuery()
	const deleteMut = trpcReact.ai.memoryDelete.useMutation({
		onSuccess: () => {
			utils.ai.memoryList.invalidate()
		},
	})

	const memories = memoriesQ.data?.memories || []
	const filtered = search
		? memories.filter((m: any) => m.content?.toLowerCase().includes(search.toLowerCase()))
		: memories

	if (memoriesQ.isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='size-5 animate-spin text-white/40' />
			</div>
		)
	}

	return (
		<div className='space-y-3 pt-3'>
			{/* Search */}
			<div className='relative'>
				<TbSearch className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40' />
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Search memories...'
					className='pl-9 bg-white/5 border-white/10'
				/>
			</div>

			{/* Memory List */}
			{filtered.length === 0 ? (
				<div className='flex flex-col items-center justify-center py-12 text-white/40'>
					<TbBrain className='size-8 mb-2' />
					<p className='text-sm'>
						{search ? 'No memories match your search.' : 'No memories stored yet. Chat with the AI to build memory.'}
					</p>
				</div>
			) : (
				<div className='space-y-2'>
					{filtered.map((memory: any) => (
						<div
							key={memory.id}
							className='group flex items-start gap-3 rounded-lg bg-white/5 p-3 hover:bg-white/[0.08] transition-colors'
						>
							<div className='flex-1 min-w-0'>
								<p className='text-sm text-white/80 break-words'>
									{memory.content?.length > 200
										? `${memory.content.slice(0, 200)}...`
										: memory.content}
								</p>
								<p className='mt-1 text-xs text-white/40'>
									{memory.createdAt ? formatDateTime(memory.createdAt) : 'Unknown date'}
								</p>
							</div>
							<button
								onClick={() => deleteMut.mutate({id: memory.id})}
								disabled={deleteMut.isPending}
								className={cn(
									'shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center',
									'rounded-md text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors',
									'opacity-0 group-hover:opacity-100 focus:opacity-100',
									deleteMut.isPending && 'opacity-50 pointer-events-none',
								)}
								title='Delete memory'
							>
								<TbTrash className='size-4' />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversations Tab
// ─────────────────────────────────────────────────────────────────────────────

function ConversationsTab() {
	const [channelFilter, setChannelFilter] = useState<string>('all')
	const [searchQuery, setSearchQuery] = useState('')
	const [activeSearch, setActiveSearch] = useState('')
	const [offset, setOffset] = useState(0)
	const isMobile = useIsMobile()
	const utils = trpcReact.useUtils()

	const LIMIT = 50

	// Main list query
	const turnsQ = trpcReact.ai.conversationTurnsList.useQuery(
		{
			limit: LIMIT,
			offset,
			...(channelFilter !== 'all' ? {channel: channelFilter} : {}),
		},
		{enabled: !activeSearch},
	)

	// Search query (only when user has actively searched)
	const searchQ = trpcReact.ai.conversationTurnsSearch.useQuery(
		{
			query: activeSearch,
			...(channelFilter !== 'all' ? {channel: channelFilter} : {}),
			limit: 50,
		},
		{enabled: !!activeSearch},
	)

	const deleteMut = trpcReact.ai.conversationTurnsDelete.useMutation({
		onSuccess: () => {
			utils.ai.conversationTurnsList.invalidate()
			if (activeSearch) {
				utils.ai.conversationTurnsSearch.invalidate()
			}
		},
	})

	const handleSearch = () => {
		if (searchQuery.trim()) {
			setActiveSearch(searchQuery.trim())
			setOffset(0)
		}
	}

	const handleClearSearch = () => {
		setSearchQuery('')
		setActiveSearch('')
		setOffset(0)
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSearch()
		}
	}

	const handleChannelChange = (channel: string) => {
		setChannelFilter(channel)
		setOffset(0)
	}

	// Decide which data to show
	const isSearching = !!activeSearch
	const turns = isSearching ? (searchQ.data?.results || []) : (turnsQ.data?.turns || [])
	const total = isSearching ? turns.length : (turnsQ.data?.total || 0)
	const isLoading = isSearching ? searchQ.isLoading : turnsQ.isLoading
	const hasMore = !isSearching && (offset + LIMIT) < total

	return (
		<div className='space-y-3 pt-3'>
			{/* Search */}
			<div className='flex gap-2'>
				<div className='relative flex-1'>
					<TbSearch className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40' />
					<Input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder='Search conversations...'
						className='pl-9 bg-white/5 border-white/10'
					/>
				</div>
				{activeSearch ? (
					<Button variant='secondary' size='sm' onClick={handleClearSearch} className='shrink-0'>
						Clear
					</Button>
				) : (
					<Button variant='secondary' size='sm' onClick={handleSearch} className='shrink-0' disabled={!searchQuery.trim()}>
						Search
					</Button>
				)}
			</div>

			{/* Channel Filter */}
			<div className={cn('flex gap-1.5 flex-wrap', isMobile && 'gap-1')}>
				{CHANNELS.map((ch) => (
					<button
						key={ch.id}
						onClick={() => handleChannelChange(ch.id)}
						className={cn(
							'flex items-center gap-1 px-3 py-1 rounded-full text-xs transition-colors',
							channelFilter === ch.id
								? 'bg-white/20 text-white'
								: 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70',
						)}
					>
						{'icon' in ch && ch.icon && React.createElement(ch.icon, {className: 'size-3'})}
						{ch.label}
					</button>
				))}
			</div>

			{/* Loading */}
			{isLoading && (
				<div className='flex items-center justify-center py-12'>
					<Loader2 className='size-5 animate-spin text-white/40' />
				</div>
			)}

			{/* Turns List */}
			{!isLoading && turns.length === 0 && (
				<div className='flex flex-col items-center justify-center py-12 text-white/40'>
					<TbHistory className='size-8 mb-2' />
					<p className='text-sm'>
						{activeSearch
							? 'No conversations match your search.'
							: 'No conversation history yet.'}
					</p>
				</div>
			)}

			{!isLoading && turns.length > 0 && (
				<div className='space-y-2'>
					{turns.map((turn: any) => {
						const ChannelIcon = channelIcon(turn.channel)
						const isUser = turn.role === 'user'
						const content = turn.content || ''
						const preview = content.length > 150 ? `${content.slice(0, 150)}...` : content

						return (
							<div
								key={turn.id}
								className='group flex items-start gap-3 rounded-lg bg-white/5 p-3 hover:bg-white/[0.08] transition-colors'
							>
								{/* Channel Icon */}
								<div className='shrink-0 mt-0.5'>
									<ChannelIcon className='size-4 text-white/40' />
								</div>

								{/* Content */}
								<div className='flex-1 min-w-0'>
									<div className='flex items-center gap-2 mb-1'>
										<span className='text-xs text-white/50 capitalize'>
											{turn.channel || 'unknown'}
										</span>
										<span
											className={cn(
												'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
												isUser
													? 'bg-blue-500/20 text-blue-400'
													: 'bg-green-500/20 text-green-400',
											)}
										>
											{isUser ? 'User' : 'AI'}
										</span>
										<span className='text-[10px] text-white/30'>
											{turn.created_at || turn.createdAt
												? formatRelativeTime(turn.created_at || turn.createdAt)
												: ''}
										</span>
									</div>
									<p className='text-sm text-white/70 break-words'>{preview}</p>
								</div>

								{/* Delete */}
								<button
									onClick={() => deleteMut.mutate({id: typeof turn.id === 'number' ? turn.id : Number(turn.id)})}
									disabled={deleteMut.isPending}
									className={cn(
										'shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center',
										'rounded-md text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors',
										'opacity-0 group-hover:opacity-100 focus:opacity-100',
										deleteMut.isPending && 'opacity-50 pointer-events-none',
									)}
									title='Delete conversation turn'
								>
									<TbTrash className='size-4' />
								</button>
							</div>
						)
					})}

					{/* Load More */}
					{hasMore && (
						<div className='flex justify-center pt-2'>
							<Button
								variant='secondary'
								size='sm'
								onClick={() => setOffset((prev) => prev + LIMIT)}
								disabled={turnsQ.isFetching}
							>
								{turnsQ.isFetching ? (
									<Loader2 className='size-4 animate-spin mr-1.5' />
								) : null}
								Load more ({total - offset - LIMIT} remaining)
							</Button>
						</div>
					)}
				</div>
			)}

			{/* Search result count */}
			{isSearching && !isLoading && turns.length > 0 && (
				<p className='text-xs text-white/40 text-center'>
					Found {turns.length} result{turns.length !== 1 ? 's' : ''}
				</p>
			)}
		</div>
	)
}
