// v32-redo Stage 2b-fix — dashboard hero ("empty state" before any
// conversation is selected). Same Suna-styled shell ("Hey, I am Liv"
// gradient + tagline) as Stage 2b, but the composer is now the LEGACY
// LivComposer wrapped by composer.tsx. First send creates a conversation
// row and flips the chat-router to the new id, causing index.tsx to swap
// to <ThreadPage />.

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

// Local mobile hook (kept inline so dashboard remains usable outside the
// SidebarProvider context, e.g. in isolated component tests).
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
	const {setOpenMobile, open, toggleSidebar} = useSidebar()

	const secondaryGradient =
		'bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent'

	return (
		<div className="flex flex-col h-screen w-full items-center justify-center relative">
			{/* Top-left toggle: mobile uses the sheet; desktop toggles the
			    offcanvas sidebar back into view when it has been hidden. */}
			{(isMobile || !open) && (
				<div className="absolute top-4 left-4 z-10">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								onClick={() => {
									if (isMobile) setOpenMobile(true)
									else toggleSidebar()
								}}
							>
								<Menu className="h-4 w-4" />
								<span className="sr-only">Open sidebar</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Open sidebar</TooltipContent>
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
					<Composer conversationId={null} />
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
