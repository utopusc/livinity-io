// Phase 24-01 — Docker app sidebar.
//
// Custom Tailwind-based sidebar primitive (no shadcn Sidebar exists in this
// repo — see 24-CONTEXT.md). 12 entries, collapsible to icon-only via the
// header chevron, active highlighting from the section store. Tooltips
// surface section labels when collapsed (Radix Tooltip — already a dep).
//
// SECTION_META is the single declaration site mapping SectionId → icon +
// label + comingPhase. Adding a section means: extend SectionId, append to
// SECTION_IDS, add a SECTION_META entry here, add a section component, add
// the switch case in DockerApp's SectionView. The compiler enforces all
// four touchpoints.

import {
	IconActivity,
	IconBox,
	IconChevronLeft,
	IconChevronRight,
	IconClock,
	IconCloudDownload,
	IconDatabase,
	IconLayoutDashboard,
	IconLogs,
	IconNetwork,
	IconPhoto,
	IconSettings,
	IconStack2,
	IconTerminal2,
	type Icon,
} from '@tabler/icons-react'

import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'

import {useSidebarDensity} from './sidebar-density'
import {
	SECTION_IDS,
	type SectionId,
	useDockerSection,
	useSetDockerSection,
	useSidebarCollapsed,
	useToggleSidebar,
} from './store'

type SectionMetaEntry = {
	icon: Icon
	label: string
	/** Phase that ships the real implementation — surfaced in placeholder copy + future tooltip. */
	comingPhase: number
}

export const SECTION_META: Record<SectionId, SectionMetaEntry> = {
	dashboard: {icon: IconLayoutDashboard, label: 'Dashboard', comingPhase: 25},
	containers: {icon: IconBox, label: 'Containers', comingPhase: 26},
	logs: {icon: IconLogs, label: 'Logs', comingPhase: 28},
	shell: {icon: IconTerminal2, label: 'Shell', comingPhase: 29},
	stacks: {icon: IconStack2, label: 'Stacks', comingPhase: 27},
	images: {icon: IconPhoto, label: 'Images', comingPhase: 26},
	volumes: {icon: IconDatabase, label: 'Volumes', comingPhase: 26},
	networks: {icon: IconNetwork, label: 'Networks', comingPhase: 26},
	registry: {icon: IconCloudDownload, label: 'Registry', comingPhase: 29},
	activity: {icon: IconActivity, label: 'Activity', comingPhase: 28},
	schedules: {icon: IconClock, label: 'Schedules', comingPhase: 27},
	settings: {icon: IconSettings, label: 'Settings', comingPhase: 29},
}

export function Sidebar() {
	const section = useDockerSection()
	const setSection = useSetDockerSection()
	const collapsed = useSidebarCollapsed()
	const toggle = useToggleSidebar()
	const density = useSidebarDensity((s) => s.density)

	return (
		<aside
			className={cn(
				'flex h-full flex-col border-r border-zinc-200 bg-zinc-50 transition-[width] duration-150',
				'dark:border-zinc-800 dark:bg-zinc-950',
				collapsed ? 'w-14' : 'w-56',
			)}
		>
			<div className='flex h-12 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800'>
				{!collapsed && (
					<span className='text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400'>Docker</span>
				)}
				<button
					type='button'
					onClick={toggle}
					aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					className='ml-auto rounded p-1 text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800'
				>
					{collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
				</button>
			</div>
			<nav className='flex-1 overflow-y-auto py-2'>
				<TooltipProvider delayDuration={300}>
					{SECTION_IDS.map((id) => {
						const meta = SECTION_META[id]
						const Icon = meta.icon
						const active = section === id
						const button = (
							<button
								type='button'
								onClick={() => setSection(id)}
								aria-current={active ? 'page' : undefined}
								className={cn(
									'flex w-full items-center gap-3 px-3 text-sm transition-colors',
									density === 'compact' ? 'py-1' : 'py-2',
									active
										? 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
										: 'text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60',
									collapsed && 'justify-center px-0',
								)}
							>
								<Icon size={18} className='shrink-0' />
								{!collapsed && <span className='truncate'>{meta.label}</span>}
							</button>
						)
						if (!collapsed) {
							return <div key={id}>{button}</div>
						}
						return (
							<Tooltip key={id}>
								<TooltipTrigger asChild>{button}</TooltipTrigger>
								<TooltipContent side='right'>{meta.label}</TooltipContent>
							</Tooltip>
						)
					})}
				</TooltipProvider>
			</nav>
		</aside>
	)
}
