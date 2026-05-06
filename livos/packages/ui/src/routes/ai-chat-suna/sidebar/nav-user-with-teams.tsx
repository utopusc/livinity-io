// v32-redo Stage 2b — bottom-of-sidebar profile button.
//
// Reads the logged-in LivOS user via useCurrentUser() (trpc.user.get).
// No tier badge (LivOS has no tier concept), no email line (the trpc
// payload doesn't carry an email field — only username + display name).
//
// Profile menu items are unchanged from Stage 1a per explicit user spec:
//   General: Knowledge Base, Usage, Integrations, Settings
//   Advanced: Local .Env Manager
// (Plan, Billing, Theme, Logout, Team-switcher remain removed.)

import * as React from 'react'
import {
	BookOpen,
	BarChart2,
	Plug,
	Settings,
	Key,
	ChevronsUpDown,
} from 'lucide-react'

import {useCurrentUser} from '@/hooks/use-current-user'

import {Avatar, AvatarFallback, AvatarImage} from '../ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '../ui/sidebar'

function getInitials(name: string): string {
	const trimmed = name.trim()
	if (!trimmed) return '?'
	return trimmed
		.split(/\s+/)
		.map((part) => part.charAt(0))
		.join('')
		.toUpperCase()
		.substring(0, 2)
}

export function NavUserWithTeams() {
	const {isMobile} = useSidebar()
	const {user, username, isLoading} = useCurrentUser()

	// `name` from trpc.user.get is the canonical display name (DB display_name
	// in multi-user mode, YAML name in legacy mode). `username` is the URL-
	// safe handle (only present in multi-user mode — `useCurrentUser` exposes
	// it at the top level). Fall back to username if display name is empty
	// (uncommon but possible for early-onboarding users).
	const displayName =
		(user?.name && String(user.name).trim()) ||
		username ||
		(isLoading ? '…' : 'Account')

	const initials = getInitials(displayName)
	const showHandle = Boolean(username && username !== displayName)

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src="" alt={displayName} />
								<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{displayName}</span>
								{showHandle ? (
									<span className="truncate text-xs text-muted-foreground">
										@{username}
									</span>
								) : null}
							</div>
							<ChevronsUpDown className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? 'bottom' : 'top'}
						align="start"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src="" alt={displayName} />
									<AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{displayName}</span>
									{showHandle ? (
										<span className="truncate text-xs text-muted-foreground">
											@{username}
										</span>
									) : null}
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />

						{/* General section */}
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							General
						</DropdownMenuLabel>
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<a href="#">
									<BookOpen className="h-4 w-4" />
									Knowledge Base
								</a>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<a href="#">
									<BarChart2 className="h-4 w-4" />
									Usage
								</a>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<a href="#">
									<Plug className="h-4 w-4" />
									Integrations
								</a>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<a href="#">
									<Settings className="h-4 w-4" />
									Settings
								</a>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />

						{/* Advanced section */}
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							Advanced
						</DropdownMenuLabel>
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<a href="#">
									<Key className="h-4 w-4" />
									Local .Env Manager
								</a>
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
