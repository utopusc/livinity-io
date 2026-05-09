// Phase 100-04 — WebAppAutoDrawer.
//
// V33-MULTI-04 / G-100-D D2: minimal scaffold. Mounted by
// webapp-stream-window.tsx inside the right-side <Sheet> drawer when
// `openDrawer === 'auto'`. Phase 97 listeners react to the parent's
// `WEBAPP_MODE_CHANGE_EVENT` dispatch (fired in the parent's
// `toggleDrawer`); the drawer body is a UI affordance only.

export interface WebAppAutoDrawerProps {
	webappId: string
}

export function WebAppAutoDrawer({webappId: _webappId}: WebAppAutoDrawerProps) {
	return (
		<div className='flex h-full w-full flex-col bg-surface-base'>
			<div className='flex shrink-0 items-center justify-between border-b border-border-default px-4 py-3'>
				<h2 className='text-sm font-medium text-text-primary'>Auto</h2>
			</div>
			<div className='flex-1 overflow-y-auto p-4 text-caption-sm text-text-secondary'>
				<p>Auto mode runs the agent against this WebApp. Click the Chat icon to provide a goal.</p>
			</div>
		</div>
	)
}

export default WebAppAutoDrawer
