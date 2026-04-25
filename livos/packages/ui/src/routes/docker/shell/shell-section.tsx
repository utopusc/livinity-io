// Phase 29 Plan 29-01 — top-level ShellSection composition (DOC-15).
//
// Composes:
//   - ShellSidebar (left, 240px) — running containers in selected env; click
//     opens a new tab in the main pane.
//   - Tab bar (top of main pane) — horizontal row of tab buttons with X to
//     close; the active tab is highlighted.
//   - ExecTabPane[] (main pane body) — ALL tabs render simultaneously,
//     hidden via display:none for inactive tabs. This is what preserves each
//     session's xterm + WS state across active-tab switches (a remount on
//     every switch would tear down the WS).
//   - Empty state — when no tabs are open, a centered hint nudges the user
//     to click a sidebar entry.
//
// Cross-env tabs (D-06): each ExecTabPane captures envId at mount-time. When
// the global env changes, the sidebar refreshes to the new env's running
// containers, but already-open tabs continue running with their original
// envId. Explicit user action (click X) is required to tear them down. Tabs
// don't display the envId in v1 — typical user has 1 env; if multi-env tabs
// become a power-user pattern we can add an env badge in v29.0+.
//
// Replaces Phase 24 placeholder via the 1-line re-export in
// sections/shell.tsx — same convention as Plan 26-01 / 27-01 / 28-01.

import {IconTerminal2, IconX} from '@tabler/icons-react'

import {useSelectedEnvironmentId} from '@/stores/environment-store'
import {cn} from '@/shadcn-lib/utils'

import {ExecTabPane} from './exec-tab-pane'
import {ShellSidebar} from './shell-sidebar'
import {useExecTabs} from './use-exec-tabs'

// Stable per-tab envId map: each tab remembers the envId it was created with.
// When the global envId changes, existing tabs keep their old envId — the
// sidebar refreshes to the new env's containers but old tabs stream from
// their original env until explicitly closed. We piggyback on ExecTab.id +
// a side-store to keep useExecTabs minimal (it knows nothing about env).
const tabEnvMap = new Map<string, string>()

export function ShellSection() {
	const envId = useSelectedEnvironmentId()
	const tabs = useExecTabs((s) => s.tabs)
	const activeTabId = useExecTabs((s) => s.activeTabId)
	const addTab = useExecTabs((s) => s.addTab)
	const closeTab = useExecTabs((s) => s.closeTab)
	const activateTab = useExecTabs((s) => s.activateTab)

	const onSelectContainer = (name: string) => {
		const id = addTab(name)
		// Capture the envId at tab creation. Cross-env D-06: tabs survive
		// global env switches with their original envId.
		tabEnvMap.set(id, envId)
	}

	const onCloseTab = (id: string) => {
		closeTab(id)
		tabEnvMap.delete(id)
	}

	return (
		<div className='flex h-full'>
			<ShellSidebar onSelect={onSelectContainer} />
			<div className='flex min-w-0 flex-1 flex-col'>
				{/* Tab bar */}
				<div className='flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border-default bg-surface-base px-2'>
					{tabs.length === 0 ? (
						<span className='px-2 text-xs text-text-tertiary'>No open shell tabs</span>
					) : (
						tabs.map((tab) => {
							const isActive = tab.id === activeTabId
							return (
								<div
									key={tab.id}
									className={cn(
										'flex h-7 shrink-0 items-center gap-1 rounded-t-md border-x border-t pl-2 pr-1 text-xs transition-colors',
										isActive
											? 'border-border-default bg-surface-1 text-text-primary'
											: 'border-transparent bg-transparent text-text-secondary hover:bg-surface-1',
									)}
								>
									<button
										type='button'
										onClick={() => activateTab(tab.id)}
										className='max-w-[200px] truncate font-mono'
										aria-current={isActive ? 'true' : undefined}
										aria-label={`Activate ${tab.containerName} session`}
									>
										{tab.containerName}
									</button>
									<button
										type='button'
										onClick={() => onCloseTab(tab.id)}
										aria-label={`Close ${tab.containerName} session`}
										className='rounded p-0.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
									>
										<IconX size={12} />
									</button>
								</div>
							)
						})
					)}
				</div>

				{/* Main pane */}
				<div className='relative min-h-0 flex-1 bg-neutral-950'>
					{tabs.length === 0 ? (
						<div className='flex h-full flex-col items-center justify-center gap-2 text-center'>
							<IconTerminal2 size={32} className='text-text-tertiary' />
							<p className='text-sm text-text-secondary'>
								Click a container in the sidebar to open a shell session.
							</p>
						</div>
					) : (
						// Render ALL tabs simultaneously; display:none hides inactive
						// ones without unmounting (preserves xterm + WS state).
						tabs.map((tab) => (
							<div
								key={tab.id}
								className='absolute inset-0'
								// Visibility is controlled inside ExecTabPane via the isActive
								// prop, but we ALSO toggle the wrapper for keyboard focus
								// containment.
								style={{display: tab.id === activeTabId ? 'block' : 'none'}}
							>
								<ExecTabPane
									containerName={tab.containerName}
									envId={tabEnvMap.get(tab.id) ?? envId}
									isActive={tab.id === activeTabId}
								/>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	)
}
