// Ported from Suna: app/(dashboard)/dashboard/page.tsx
// Substitutions:
//   'use client' removed
//   useRouter -> useNavigate (react-router-dom)
//   ChatInput (Suna) -> MockComposer (visual-only, no-op Send)
//   BillingError/BillingErrorAlert -> removed (no billing in LivOS)
//   useInitiateAgentWithInvalidation -> removed (Stage 2 wires SSE)
//   useAccounts -> removed
//   useModal -> removed
//   AgentSelector -> simplified (shows "Liv" as static text for visual parity)
//   Examples/suggestions -> removed (Stage 2)
//   ModalProviders -> removed
//   localStorage PENDING_PROMPT_KEY logic -> removed

import React, {useState, Suspense} from 'react'
import {Menu, Send, Paperclip, Mic, ChevronDown} from 'lucide-react'
import {useSidebar} from './ui/sidebar'
import {Button} from './ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'
import {Skeleton} from './ui/skeleton'

// Local mobile hook
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )
  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

// Stage 1a mock composer — visual only, Send is no-op
function MockComposer({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  placeholder: string
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative flex flex-col rounded-xl border border-input bg-background shadow-sm">
      <textarea
        className="min-h-[60px] w-full resize-none bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
      />
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
            <Paperclip className="h-4 w-4" />
            <span className="sr-only">Attach file</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
            <Mic className="h-4 w-4" />
            <span className="sr-only">Voice input</span>
          </Button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Worker
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <Button
          size="icon"
          className="h-8 w-8"
          type="button"
          disabled={loading || !value.trim()}
          onClick={onSubmit}
        >
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  )
}

function DashboardContent() {
  const [inputValue, setInputValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isMobile = useIsMobile()
  const {setOpenMobile} = useSidebar()

  const secondaryGradient =
    'bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent'

  const handleSubmit = async () => {
    if (!inputValue.trim() || isSubmitting) return
    // Stage 1a: no-op — Stage 2 wires SSE agent stream
    console.log('[Stage 1a] Submit no-op:', inputValue)
    setInputValue('')
  }

  return (
    <>
      <div className="flex flex-col h-screen w-full">
        {isMobile && (
          <div className="absolute top-4 left-4 z-10">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setOpenMobile(true)}
                >
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open menu</TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[650px] max-w-[90%]">
          <div className="flex flex-col items-center text-center w-full">
            <div className="flex items-center gap-1">
              <h1 className="tracking-tight text-4xl text-muted-foreground leading-tight">
                Hey, I am
              </h1>
              <span
                className={cn(
                  'tracking-tight text-4xl font-semibold leading-tight cursor-pointer',
                  secondaryGradient,
                )}
              >
                Liv
              </span>
            </div>
            <p className="tracking-tight text-3xl font-normal text-muted-foreground/80 mt-2">
              What would you like to do today?
            </p>
          </div>

          <div
            className={cn(
              'w-full mt-6 mb-2',
              'max-w-full',
              'sm:max-w-3xl',
            )}
          >
            <MockComposer
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              loading={isSubmitting}
              placeholder="Describe what you need help with..."
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full w-full">
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div
              className={cn(
                'flex flex-col items-center text-center w-full space-y-8',
                'max-w-[850px] sm:max-w-full sm:px-4',
              )}
            >
              <Skeleton className="h-10 w-40 sm:h-8 sm:w-32" />
              <Skeleton className="h-7 w-56 sm:h-6 sm:w-48" />
              <Skeleton className="w-full h-[100px] rounded-xl sm:h-[80px]" />
              <div className="block sm:hidden lg:block w-full">
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}
