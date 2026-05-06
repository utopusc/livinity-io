// v32-redo Stage 2b — dashboard hero ("empty state" before any
// conversation is selected). The mock composer is gone — we use the real
// Composer, which on first send creates a conversation row and triggers
// selectConversation, causing index.tsx to swap to <ThreadPage />.
//
// Substitutions vs original Suna source:
//   'use client' removed
//   useRouter -> useChatRouter (internal context, no URL change)
//   ChatInput -> Composer (./composer.tsx, real SSE wiring)
//   BillingError/BillingErrorAlert -> removed (no billing in LivOS)
//   useInitiateAgentWithInvalidation -> Composer handles via useLivAgentStream
//   useAccounts -> removed
//   useModal -> removed
//   AgentSelector -> simplified ("Liv" as static text — agent picker comes in 2c)
//   Examples / suggestions / ModalProviders -> removed (Stage 2c+)
//   PENDING_PROMPT_KEY -> removed (no localStorage relay)

import React, {Suspense} from 'react'
import {Menu} from 'lucide-react'

import {useSidebar} from './ui/sidebar'
import {Button} from './ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'
import {Skeleton} from './ui/skeleton'

import {Composer} from './composer'

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

function DashboardContent() {
	const isMobile = useIsMobile()
	const {setOpenMobile} = useSidebar()

	const secondaryGradient =
		'bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent'

	return (
		<div className="flex flex-col h-screen w-full items-center justify-center relative">
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

			<div className="flex flex-col items-center text-center w-[650px] max-w-[90%]">
				<div className="flex items-center gap-1">
					<h1 className="tracking-tight text-4xl text-muted-foreground leading-tight">
						Hey, I am
					</h1>
					<span
						className={cn(
							'tracking-tight text-4xl font-semibold leading-tight',
							secondaryGradient,
						)}
					>
						Liv
					</span>
				</div>
				<p className="tracking-tight text-3xl font-normal text-muted-foreground/80 mt-2">
					What would you like to do today?
				</p>

				<div className="w-full mt-6 mb-2">
					<Composer
						conversationId={null}
						placeholder="Describe what you need help with…"
					/>
				</div>
			</div>
		</div>
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
