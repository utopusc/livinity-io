// Phase 100-04 — WebAppWatchDrawer.
//
// V33-MULTI-04 / G-100-D D2: minimal scaffold. Mounted by
// webapp-stream-window.tsx inside the right-side <Sheet> drawer when
// `openDrawer === 'watch'`. Phase 96 listeners react to the parent's
// `WEBAPP_MODE_CHANGE_EVENT` dispatch (fired in the parent's
// `toggleDrawer`); the drawer body is a UI affordance only.

export interface WebAppWatchDrawerProps {
	webappId: string
}

export function WebAppWatchDrawer({webappId: _webappId}: WebAppWatchDrawerProps) {
	return (
		<div className='flex h-full w-full flex-col bg-surface-base'>
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3'>
				<h2 className='text-sm font-medium text-text-primary'>Watch</h2>
			</div>
			<div className='flex-1 overflow-y-auto p-4 text-caption-sm text-text-secondary'>
				<p>Watch mode is active. Mouse + keyboard input is observed but not recorded.</p>
			</div>
		</div>
	)
}

export default WebAppWatchDrawer
