// Ported from Suna: components/sidebar/sidebar-left.tsx
// Substitutions:
//   'use client' removed
//   next/link -> Link from react-router-dom
//   usePathname -> useLocation (react-router-dom)
//   createClient/supabase -> mock user from MOCK_USER
//   @/hooks/use-mobile -> local inline (in sidebar.tsx)
//   @/components/ui/badge -> inline Badge from shadcn-components
//   Agent Playground / Marketplace nav items retained (visual only)

import * as React from 'react'
import {Link} from 'react-router-dom'
import {useLocation} from 'react-router-dom'
import {Bot, Menu, Store} from 'lucide-react'

import {NavAgents} from './nav-agents'
import {NavUserWithTeams} from './nav-user-with-teams'
import {KortixLogo} from './kortix-logo'
import {CTACard} from './cta'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '../ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'
import {MOCK_USER} from '../lib/mock-data'

// Inline Badge for "New" tag (avoids importing Suna's specific Badge variant)
function NewBadge() {
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors bg-primary text-primary-foreground border-transparent">
      New
    </span>
  )
}

export function SidebarLeft({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const {state, setOpen, setOpenMobile} = useSidebar()
  const location = useLocation()

  // Determine mobile from CSS media query (useIsMobile is inside SidebarProvider context)
  const [isMobileLocal, setIsMobileLocal] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )
  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setIsMobileLocal(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const user = {
    name: MOCK_USER.display_name,
    email: MOCK_USER.email,
    avatar: MOCK_USER.avatar,
  }

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault()
        setOpen(!state.startsWith('expanded'))

        window.dispatchEvent(
          new CustomEvent('sidebar-left-toggled', {
            detail: {expanded: !state.startsWith('expanded')},
          }),
        )
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state, setOpen])

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-0 bg-background/95 backdrop-blur-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
      {...props}
    >
      <SidebarHeader className="px-2 py-2">
        <div className="flex h-[40px] items-center px-1 relative">
          <Link to="/dashboard">
            <KortixLogo />
          </Link>
          {state !== 'collapsed' && (
            <div className="ml-2 transition-all duration-200 ease-in-out whitespace-nowrap">
              {/* brand name intentionally blank — logo only */}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {state !== 'collapsed' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarTrigger className="h-8 w-8" />
                </TooltipTrigger>
                <TooltipContent>Toggle sidebar (CMD+B)</TooltipContent>
              </Tooltip>
            )}
            {isMobileLocal && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setOpenMobile(true)}
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent"
                  >
                    <Menu className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Open menu</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="[&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <SidebarGroup>
          <Link to="/agents">
            <SidebarMenuButton
              className={cn({
                'bg-primary/10 font-medium': location.pathname === '/agents',
              })}
            >
              <Bot className="h-4 w-4 mr-2" />
              <span className="flex items-center justify-between w-full">
                Agent Playground
                <NewBadge />
              </span>
            </SidebarMenuButton>
          </Link>

          <Link to="/marketplace">
            <SidebarMenuButton
              className={cn({
                'bg-primary/10 font-medium': location.pathname === '/marketplace',
              })}
            >
              <Store className="h-4 w-4 mr-2" />
              <span className="flex items-center justify-between w-full">
                Marketplace
                <NewBadge />
              </span>
            </SidebarMenuButton>
          </Link>
        </SidebarGroup>
        <NavAgents />
      </SidebarContent>
      {state !== 'collapsed' && (
        <div className="px-3 py-2">
          <CTACard />
        </div>
      )}
      <SidebarFooter>
        {state === 'collapsed' && (
          <div className="mt-2 flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="h-8 w-8" />
              </TooltipTrigger>
              <TooltipContent>Expand sidebar (CMD+B)</TooltipContent>
            </Tooltip>
          </div>
        )}
        <NavUserWithTeams user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
