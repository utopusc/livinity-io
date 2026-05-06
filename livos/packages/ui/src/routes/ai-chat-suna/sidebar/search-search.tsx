// v32-redo Stage 2b — sidebar search field. Reads real conversations via
// trpc.conversations.list, filters client-side on title.toLowerCase().
// Click handler routes through the ChatRouter context (no URL change —
// see lib/chat-router.tsx).
//
// Currently NOT mounted in sidebar-left.tsx. Kept alive (and now wired to
// real data) so a future stage can mount it without further plumbing.
//
// Substitutions vs original Suna source:
//   'use client' removed
//   useProjects/useAllThreads -> trpc.conversations.list
//   next/link -> nothing (selectConversation, no navigate)
//   date-fns format -> formatDistanceToNow

import * as React from 'react'
import {useEffect, useMemo, useState} from 'react'
import {Search, X, FileText, Loader2} from 'lucide-react'
import {formatDistanceToNow} from 'date-fns'

import {trpcReact} from '@/trpc/trpc'

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from '../ui/sidebar'
import {useChatRouter} from '../lib/chat-router'

function formatDateDisplay(updatedAt: Date | string): string {
	const updatedDate =
		updatedAt instanceof Date ? updatedAt : new Date(updatedAt)
	if (Number.isNaN(updatedDate.getTime())) return ''
	const now = new Date()
	if (now.toDateString() === updatedDate.toDateString()) return 'Today'
	const yesterday = new Date(Date.now() - 86_400_000)
	if (yesterday.toDateString() === updatedDate.toDateString()) return 'Yesterday'
	// For older items the relative-time variant is friendlier than a raw date.
	try {
		return formatDistanceToNow(updatedDate, {addSuffix: true})
	} catch {
		return updatedDate.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		})
	}
}

export function SidebarSearch() {
	const [query, setQuery] = useState('')
	const {selectedConversationId, selectConversation} = useChatRouter()

	const conversationsQuery = trpcReact.conversations.list.useQuery(undefined, {
		staleTime: 30_000,
	})

	const filtered = useMemo(() => {
		const all = conversationsQuery.data ?? []
		const q = query.trim().toLowerCase()
		if (!q) return all
		return all.filter((c) => c.title.toLowerCase().includes(q))
	}, [conversationsQuery.data, query])

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
				e.preventDefault()
				document.getElementById('sidebar-search-input')?.focus()
			}
		}
		document.addEventListener('keydown', down)
		return () => document.removeEventListener('keydown', down)
	}, [])

	return (
		<SidebarGroup>
			<div className="flex items-center px-2 pt-3 pb-2">
				<div className="relative w-full">
					<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						id="sidebar-search-input"
						type="text"
						placeholder="Search…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 pl-8 pr-8
                      text-sm transition-colors placeholder:text-muted-foreground
                      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					/>
					{query && (
						<button
							onClick={() => setQuery('')}
							className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm
                        opacity-70 hover:opacity-100 focus:outline-none"
						>
							<X className="h-4 w-4" />
							<span className="sr-only">Clear</span>
						</button>
					)}
				</div>
			</div>

			<SidebarGroupLabel>{query ? 'Search Results' : 'Recent'}</SidebarGroupLabel>
			<SidebarMenu className="overflow-y-auto max-h-[calc(100vh-270px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
				{conversationsQuery.isLoading ? (
					<SidebarMenuItem>
						<SidebarMenuButton className="text-sidebar-foreground/70">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span>Loading…</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : filtered.length > 0 ? (
					filtered.map((conv) => {
						const isActive = selectedConversationId === conv.id
						const dateDisplay = formatDateDisplay(conv.updatedAt)

						return (
							<SidebarMenuItem key={`search-conv-${conv.id}`}>
								<SidebarMenuButton
									onClick={() => selectConversation(conv.id)}
									className={`flex items-center justify-between w-full ${
										isActive ? 'bg-accent text-accent-foreground font-medium' : ''
									}`}
								>
									<div className="flex items-center min-w-0">
										<FileText className="mr-2 h-4 w-4 shrink-0" />
										<span className="truncate">{conv.title}</span>
									</div>
									<span className="ml-2 text-xs text-muted-foreground shrink-0">
										{dateDisplay}
									</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						)
					})
				) : (
					<SidebarMenuItem>
						<SidebarMenuButton className="text-sidebar-foreground/70">
							<FileText className="h-4 w-4" />
							<span>{query ? 'No results found' : 'No conversations yet'}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				)}
			</SidebarMenu>
		</SidebarGroup>
	)
}
