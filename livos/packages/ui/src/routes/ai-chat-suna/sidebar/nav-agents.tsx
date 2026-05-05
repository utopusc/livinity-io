// Ported from Suna: components/sidebar/nav-agents.tsx
// Substitutions:
//   'use client' removed
//   usePathname/useRouter -> useLocation/useNavigate (react-router-dom)
//   next/link -> Link from react-router-dom
//   useProjects/useThreads/useDeleteThread/useDeleteMultipleThreads -> mock data
//   useQueryClient/react-query -> removed
//   ShareModal/DeleteConfirmationDialog/useDeleteOperation -> stubs (Stage 2)
//   Checkbox -> removed (not needed for visual Stage 1a)
// Stage 1a: renders mock threads list; delete/share actions are no-ops

import {useState, useRef} from 'react'
import {
  ArrowUpRight,
  MoreHorizontal,
  Trash2,
  Plus,
  MessagesSquare,
  Loader2,
  Share2,
  X,
  Check,
} from 'lucide-react'
import {toast} from 'sonner'
import {useLocation, useNavigate, Link} from 'react-router-dom'

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
import {Button} from '../ui/button'
import {MOCK_THREADS, type MockThread} from '../lib/mock-data'

export function NavAgents() {
  const {isMobile, state} = useSidebar()
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const [selectedThreads, setSelectedThreads] = useState<Set<string>>(new Set())

  const combinedThreads: MockThread[] = MOCK_THREADS

  // Toggle thread selection for multi-select
  const toggleThreadSelection = (threadId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    setSelectedThreads((prev) => {
      const newSelection = new Set(prev)
      if (newSelection.has(threadId)) {
        newSelection.delete(threadId)
      } else {
        newSelection.add(threadId)
      }
      return newSelection
    })
  }

  const selectAllThreads = () => {
    const allThreadIds = combinedThreads.map((thread) => thread.threadId)
    setSelectedThreads(new Set(allThreadIds))
  }

  const deselectAllThreads = () => {
    setSelectedThreads(new Set())
  }

  const handleThreadClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    threadId: string,
    url: string,
  ) => {
    if (selectedThreads.has(threadId)) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    setLoadingThreadId(threadId)
    // Stage 1a: no-op navigation
    setTimeout(() => setLoadingThreadId(null), 300)
  }

  const handleDeleteThread = (threadId: string, threadName: string) => {
    // Stage 1a: no-op
    toast.info(`Delete: ${threadName} (wired in Stage 2)`)
  }

  const handleMultiDelete = () => {
    // Stage 1a: no-op
    toast.info(`Delete ${selectedThreads.size} conversations (wired in Stage 2)`)
  }

  return (
    <SidebarGroup>
      <div className="flex justify-between items-center">
        <SidebarGroupLabel>Tasks</SidebarGroupLabel>
        {state !== 'collapsed' ? (
          <div className="flex items-center space-x-1">
            {selectedThreads.size > 0 ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={deselectAllThreads}
                  className="h-7 w-7"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={selectAllThreads}
                  disabled={selectedThreads.size === combinedThreads.length}
                  className="h-7 w-7"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleMultiDelete}
                  className="h-7 w-7 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Link
                      to="/dashboard"
                      className="text-muted-foreground hover:text-foreground h-7 w-7 flex items-center justify-center rounded-md"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="sr-only">New Agent</span>
                    </Link>
                  </div>
                </TooltipTrigger>
                <TooltipContent>New Agent</TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : null}
      </div>

      <SidebarMenu className="overflow-y-auto max-h-[calc(100vh-200px)] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        {state === 'collapsed' && (
          <SidebarMenuItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SidebarMenuButton asChild>
                    <Link to="/dashboard" className="flex items-center">
                      <Plus className="h-4 w-4" />
                      <span>New Agent</span>
                    </Link>
                  </SidebarMenuButton>
                </div>
              </TooltipTrigger>
              <TooltipContent>New Agent</TooltipContent>
            </Tooltip>
          </SidebarMenuItem>
        )}

        {combinedThreads.length > 0 ? (
          <>
            {combinedThreads.map((thread) => {
              const isActive = location.pathname?.includes(thread.threadId) || false
              const isThreadLoading = loadingThreadId === thread.threadId
              const isSelected = selectedThreads.has(thread.threadId)

              return (
                <SidebarMenuItem key={`thread-${thread.threadId}`} className="group">
                  {state === 'collapsed' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <SidebarMenuButton
                            asChild
                            className={
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : isSelected
                                  ? 'bg-primary/10'
                                  : ''
                            }
                          >
                            <Link
                              to={thread.url}
                              onClick={(e) =>
                                handleThreadClick(e, thread.threadId, thread.url)
                              }
                            >
                              {isThreadLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MessagesSquare className="h-4 w-4" />
                              )}
                              <span>{thread.projectName}</span>
                            </Link>
                          </SidebarMenuButton>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>{thread.projectName}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <div className="relative">
                      <SidebarMenuButton
                        asChild
                        className={`relative ${
                          isActive
                            ? 'bg-accent text-accent-foreground font-medium'
                            : isSelected
                              ? 'bg-primary/10'
                              : ''
                        }`}
                      >
                        <Link
                          to={thread.url}
                          onClick={(e) =>
                            handleThreadClick(e, thread.threadId, thread.url)
                          }
                          className="flex items-center"
                        >
                          <div className="flex items-center group/icon relative">
                            {isThreadLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <MessagesSquare
                                  className={`h-4 w-4 transition-opacity duration-150 ${
                                    isSelected
                                      ? 'opacity-0'
                                      : 'opacity-100 group-hover/icon:opacity-0'
                                  }`}
                                />

                                <div
                                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
                                    isSelected
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover/icon:opacity-100'
                                  }`}
                                  onClick={(e) =>
                                    toggleThreadSelection(thread.threadId, e)
                                  }
                                >
                                  <div
                                    className={`h-4 w-4 border rounded cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-center ${
                                      isSelected
                                        ? 'bg-primary border-primary'
                                        : 'border-muted-foreground/30 bg-background'
                                    }`}
                                  >
                                    {isSelected && (
                                      <Check className="h-3 w-3 text-primary-foreground" />
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                          <span className="ml-2">{thread.projectName}</span>
                        </Link>
                      </SidebarMenuButton>
                    </div>
                  )}
                  {state !== 'collapsed' && !isSelected && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          showOnHover
                          className="group-hover:opacity-100"
                          onClick={() => {
                            document.body.style.pointerEvents = 'auto'
                          }}
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
                            toast.info('Share (wired in Stage 2)')
                          }}
                        >
                          <Share2 className="text-muted-foreground" />
                          <span>Share Chat</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a
                            href={thread.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ArrowUpRight className="text-muted-foreground" />
                            <span>Open in New Tab</span>
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            handleDeleteThread(thread.threadId, thread.projectName)
                          }
                        >
                          <Trash2 className="text-muted-foreground" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </SidebarMenuItem>
              )
            })}
          </>
        ) : (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/70">
              <MessagesSquare className="h-4 w-4" />
              <span>No tasks yet</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
