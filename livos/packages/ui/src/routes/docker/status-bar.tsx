// Round 2 hot-patch — Docker app top StatusBar (minimal).
//
// Sticky 48px-tall header rendered as the FIRST child of <main> in DockerApp.
// Layout (left → right):
//   [EnvironmentSelector] ┄ flex-1 ┄ [Search ⌘K] [AlertsBell]
//
// All system stat pills + Live indicator have moved to the sticky bottom
// StatusFooter (status-footer.tsx). Keep this header tiny so the Docker app's
// top edge breathes and the active section gets the maximum vertical pixels.

import {AlertsBell} from '@/routes/docker/_components/ai-alerts-bell'
import {EnvironmentSelector} from '@/routes/docker/_components/environment-selector'
import {cn} from '@/shadcn-lib/utils'

import {SearchButton} from './search-button'

export function StatusBar() {
	return (
		<header
			className={cn(
				'sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/95 px-3 backdrop-blur',
				'dark:border-zinc-800 dark:bg-zinc-900/95',
			)}
		>
			<EnvironmentSelector />
			<div className='flex flex-1' />
			<div className='flex shrink-0 items-center gap-1'>
				<SearchButton />
				<AlertsBell />
			</div>
		</header>
	)
}
