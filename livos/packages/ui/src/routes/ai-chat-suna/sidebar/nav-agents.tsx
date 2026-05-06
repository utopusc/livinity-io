// v32-redo Stage 2b — sidebar conversations list. Real data via
// trpc.conversations.list, real delete via trpc.conversations.delete,
// click-to-open via the ChatRouter context (no URL routing — see
// lib/chat-router.tsx for rationale).
//
// Multi-select machinery (checkbox per row + bulk delete) was on the
// Stage 1a port but is dropped here for 2b — single delete via the row
// dropdown is sufficient. Can return in 2c+ if UAT asks for it.
//
// Substitutions vs original Suna source:
//   'use client' removed
//   useProjects/useThreads/useDeleteThread -> trpc.conversations.{list,delete}
//   ShareModal -> dropped (Stage 1a port already stubbed it)
//   DeleteConfirmationDialog -> simple toast confirmation flow
//   next/link -> nothing (we don't navigate; we update internal state)

import {useMemo, useState} from 'react'
import {
	MoreHorizontal,
	Trash2,
	Plus,
	MessagesSquare,
	Loader2,
	Share2,
} from 'lucide-react'
import {toast} from 'sonner'
import {formatDistanceToNow} from 'date-fns'

import {trpcReact} from '@/trpc/trpc'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '../ui/sidebar'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/shadcn-components/ui/tooltip'
import {useChatRouter} from '../lib/chat-router'

function relativeTime(date: Date | string): string {
	const d = date instanceof Date ? date : new Date(date)
	if (Number.isNaN(d.getTime())) return ''
	try {
		return formatDistanceToNow(d, {addSuffix: true})
	} catch {
		return ''
	}
}

export function NavAgents() {
	const {isMobile, state} = useSidebar()
	const {selectedConversationId, selectConversation, clearSelection} = useChatRouter()
	const utils = trpcReact.useUtils()

	const conversationsQuery = trpcReact.conversations.list.useQuery(undefined, {
		// Keep the sidebar fresh after composer activity bumps updated_at.
		// 30s is generous — appendMessage explicitly invalidates.
		refetchOnWindowFocus: true,
		staleTime: 30_000,
	})

	const deleteMutation = trpcReact.conversations.delete.useMutation({
		onSuccess: async (_data, variables) => {
			// If the deleted conversation was open, drop the selection so the
			// dashboard hero re-renders.
			if (selectedConversationId === variables.conversationId) {
				clearSelection()
			}
			await utils.conversations.list.invalidate()
			toast.success('Conversation deleted')
		},
		onError: (err) => {
			toast.error(`Delete failed: ${err.message}`)
		},
	})

	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

	const conversations = useMemo(
		() => conversationsQuery.data ?? [],
		[conversationsQuery.data],
	)

	const handleSelect = (conversationId: string) => {
		selectConversation(conversationId)
	}

	const handleDelete = (conversationId: string) => {
		setPendingDeleteId(conversationId)
		deleteMutation.mutate(
			{conversationId},
			{
				onSettled: () => setPendingDeleteId(null),
			},
		)
	}

	return (
		<SidebarGroup>
			<div className="flex justify-between items-center">
				<SidebarGroupLabel>Tasks</SidebarGroupLabel>
				{state !== 'collapsed' ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={clearSelection}
								className="text-muted-foreground hover:text-foreground h-7 w-7 flex items-center justify-center rounded-md"
							>
								<Plus className="h-4 w-4" />
								<span className="sr-only">New conversation</span>
							</button>
						</TooltipTrigger>
						<TooltipContent>New conversation</TooltipContent>
					</Tooltip>
				) : null}
			</div>

			<SidebarMenu className="overflow-y-auto max-h-[calc(100vh-200px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
				{state === 'collapsed' && (
					<SidebarMenuItem>
						<Tooltip>
							<TooltipTrigger asChild>
								<SidebarMenuButton onClick={clearSelection}>
									<Plus className="h-4 w-4" />
									<span>New conversation</span>
								</SidebarMenuButton>
							</TooltipTrigger>
							<TooltipContent>New conversation</TooltipContent>
						</Tooltip>
					</SidebarMenuItem>
				)}

				{conversationsQuery.isLoading ? (
					<SidebarMenuItem>
						<SidebarMenuButton className="text-sidebar-foreground/70">
							<Loader2 className="h-4 w-4 animate-spin" />
							<span>Loading…</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : conversations.length === 0 ? (
					<SidebarMenuItem>
						<SidebarMenuButton className="text-sidebar-foreground/70 whitespace-normal h-auto py-2">
							<MessagesSquare className="h-4 w-4 shrink-0" />
							<span className="text-xs leading-snug">
								No conversations yet — start one with the composer below.
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : (
					conversations.map((conv) => {
						const isActive = selectedConversationId === conv.id
						const isDeleting = pendingDeleteId === conv.id
						return (
							<SidebarMenuItem key={`conv-${conv.id}`} className="group">
								{state === 'collapsed' ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<SidebarMenuButton
												onClick={() => handleSelect(conv.id)}
												className={isActive ? 'bg-accent text-accent-foreground' : ''}
											>
												{isDeleting ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<MessagesSquare className="h-4 w-4" />
												)}
												<span>{conv.title}</span>
											</SidebarMenuButton>
										</TooltipTrigger>
										<TooltipContent>{conv.title}</TooltipContent>
									</Tooltip>
								) : (
									<SidebarMenuButton
										onClick={() => handleSelect(conv.id)}
										className={`flex items-center gap-2 ${
											isActive ? 'bg-accent text-accent-foreground font-medium' : ''
										}`}
									>
										{isDeleting ? (
											<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
										) : (
											<MessagesSquare className="h-4 w-4 shrink-0" />
										)}
										<span className="flex-1 truncate text-left">{conv.title}</span>
										<span className="text-[10px] text-muted-foreground shrink-0">
											{relativeTime(conv.updatedAt)}
										</span>
									</SidebarMenuButton>
								)}
								{state !== 'collapsed' && (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<SidebarMenuAction
												showOnHover
												className="group-hover:opacity-100"
											>
												<MoreHorizontal />
												<span className="sr-only">More</span>
											</SidebarMenuAction>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											className="w-56 rounded-lg"
											side={isMobile ? 'bottom' : 'right'}
											align={isMobile ? 'end' : 'start'}
										>
											<DropdownMenuItem
												onClick={() => {
													toast.info('Sharing comes in a later stage')
												}}
											>
												<Share2 className="text-muted-foreground" />
												<span>Share Chat</span>
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem onClick={() => handleDelete(conv.id)}>
												<Trash2 className="text-muted-foreground" />
												<span>Delete</span>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</SidebarMenuItem>
						)
					})
				)}
			</SidebarMenu>
		</SidebarGroup>
	)
}
