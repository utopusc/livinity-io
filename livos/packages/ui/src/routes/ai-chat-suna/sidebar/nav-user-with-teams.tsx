// Ported from Suna: components/sidebar/nav-user-with-teams.tsx
// Substitutions:
//   'use client' removed
//   useRouter/next/navigation -> useNavigate (react-router-dom)
//   next/link -> Link from react-router-dom
//   useAccounts -> removed (single mock user, no team switcher)
//   useTheme/next-themes -> removed (Theme item removed per user spec)
//   createClient/supabase -> removed (logout removed per user spec)
//   Dialog/NewTeamForm -> removed (no team creation in Stage 1a)
// Profile menu items (ONLY per spec):
//   General: Knowledge Base, Usage, Integrations, Settings
//   Advanced: Local .Env Manager
// REMOVED per explicit user instruction: Plan, Billing, Theme, Log out, team switcher

import * as React from 'react'
import {
  BookOpen,
  BarChart2,
  Plug,
  Settings,
  Key,
  ChevronsUpDown,
} from 'lucide-react'

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
import {MOCK_USER} from '../lib/mock-data'

export function NavUserWithTeams({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const {isMobile} = useSidebar()

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

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
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{MOCK_USER.tier}</span>
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
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{MOCK_USER.tier}</span>
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
