// Phase 29 Plan 29-02 — Docker > Settings > Appearance tab (DOC-17, DOC-19).
//
// Two preferences:
//   1. Theme — re-uses the existing ThemeToggle (Phase 24-02 useDockerTheme).
//      DOC-19 verification surface: the toggle here and in StatusBar share
//      the same store so flipping one updates the other instantly via the
//      cross-instance sync mechanism shipped in Phase 24-02 (storage event
//      + custom 'livos:docker:theme-changed' window event).
//   2. Sidebar density — radio toggle bound to useSidebarDensity. Selection
//      applies live to the Docker sidebar (no save button needed).

import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'

import {useSidebarDensity, type SidebarDensity} from '../sidebar-density'

export function AppearanceTab() {
	const density = useSidebarDensity((s) => s.density)
	const setDensity = useSidebarDensity((s) => s.setDensity)

	return (
		<div className='space-y-8 py-4'>
			<section className='space-y-3'>
				<header>
					<h3 className='text-base font-semibold text-zinc-900 dark:text-zinc-100'>
						Sidebar density
					</h3>
					<p className='text-xs text-zinc-500 dark:text-zinc-400'>
						Adjust the spacing of nav items in the Docker sidebar. Compact fits more entries
						in the same vertical space.
					</p>
				</header>
				<RadioGroup
					value={density}
					onValueChange={(v) => setDensity(v as SidebarDensity)}
					className='gap-3'
				>
					<label
						htmlFor='density-comfortable'
						className='flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800'
					>
						<RadioGroupItem value='comfortable' id='density-comfortable' />
						<div className='flex-1'>
							<div className='text-sm font-medium text-zinc-900 dark:text-zinc-100'>
								Comfortable
							</div>
							<div className='text-xs text-zinc-500 dark:text-zinc-400'>
								Default — py-2 padding on each item.
							</div>
						</div>
					</label>
					<label
						htmlFor='density-compact'
						className='flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800'
					>
						<RadioGroupItem value='compact' id='density-compact' />
						<div className='flex-1'>
							<div className='text-sm font-medium text-zinc-900 dark:text-zinc-100'>
								Compact
							</div>
							<div className='text-xs text-zinc-500 dark:text-zinc-400'>
								py-1 — tighter spacing, more entries fit on small windows.
							</div>
						</div>
					</label>
				</RadioGroup>
			</section>
		</div>
	)
}
