// Ported from Suna: components/sidebar/search-search.tsx
// Substitutions:
//   'use client' removed
//   useRouter/usePathname -> useNavigate/useLocation (react-router-dom)
//   next/link -> Link from react-router-dom
//   useProjects/useAllThreads -> MOCK_THREADS
//   date-fns format -> local date formatting
//   react-query -> removed

import * as React from 'react'
import {useState, useEffect, useCallback} from 'react'
import {Search, X, FileText, Loader2} from 'lucide-react'
import {useLocation, Link} from 'react-router-dom'

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '../ui/sidebar'
import {MOCK_THREADS, type MockThread} from '../lib/mock-data'

type ThreadWithProject = {
  threadId: string
  projectId: string
  projectName: string
  url: string
  updatedAt: string
}

function formatDateDisplay(updatedAt: string): string {
  const updatedDate = new Date(updatedAt)
  const now = new Date()
  if (now.toDateString() === updatedDate.toDateString()) return 'Today'
  const yesterday = new Date(Date.now() - 86400000)
  if (yesterday.toDateString() === updatedDate.toDateString()) return 'Yesterday'
  return updatedDate.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
}

export function SidebarSearch() {
  const [query, setQuery] = useState('')
  const [filteredThreads, setFilteredThreads] = useState<ThreadWithProject[]>(MOCK_THREADS)
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null)
  const location = useLocation()
  const {state} = useSidebar()

  const filterThreads = useCallback(
    (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setFilteredThreads(MOCK_THREADS)
        return
      }
      const q = searchQuery.toLowerCase()
      setFilteredThreads(
        MOCK_THREADS.filter((thread) =>
          thread.projectName.toLowerCase().includes(q),
        ),
      )
    },
    [],
  )

  useEffect(() => {
    filterThreads(query)
  }, [query, filterThreads])

  useEffect(() => {
    setLoadingThreadId(null)
  }, [location.pathname])

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

  const handleThreadClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    threadId: string,
    url: string,
  ) => {
    e.preventDefault()
    setLoadingThreadId(threadId)
    // Stage 1a: no-op
    setTimeout(() => setLoadingThreadId(null), 300)
  }

  return (
    <SidebarGroup>
      <div className="flex items-center px-2 pt-3 pb-2">
        <div className="relative w-full">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="sidebar-search-input"
            type="text"
            placeholder="Search..."
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

      <SidebarGroupLabel>
        {query ? 'Search Results' : 'Recent'}
      </SidebarGroupLabel>
      <SidebarMenu className="overflow-y-auto max-h-[calc(100vh-270px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {filteredThreads.length > 0 ? (
          filteredThreads.map((thread, index) => {
            const isActive = location.pathname?.includes(thread.threadId) || false
            const isThreadLoading = loadingThreadId === thread.threadId
            const dateDisplay = formatDateDisplay(thread.updatedAt)

            return (
              <SidebarMenuItem key={`thread-${thread.threadId}-${index}`}>
                <SidebarMenuButton
                  asChild
                  className={
                    isActive ? 'bg-accent text-accent-foreground font-medium' : ''
                  }
                >
                  <Link
                    to={thread.url}
                    onClick={(e) =>
                      handleThreadClick(e, thread.threadId, thread.url)
                    }
                    className="flex items-center justify-between w-full"
                  >
                    <div className="flex items-center">
                      {isThreadLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{thread.projectName}</span>
                    </div>
                    <span className="ml-2 text-xs text-muted-foreground shrink-0">
                      {dateDisplay}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })
        ) : (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/70">
              <FileText className="h-4 w-4" />
              <span>{query ? 'No results found' : 'No agents yet'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
