// Phase 174-05 — Bottom-left Settings gear footer slot.
//
// Stubbed onClick — Phase 183 wires this to open the Settings dock window.
// Phase 175 mounts this component inside SidebarTree (or the dock window
// chrome) when replacing the Phase 168 SessionSidebar mount point.
//
// a11y: aria-label='Settings' baseline; the icon-only button needs a name
// for screen readers. If Phase 183 retargets the gear to a different panel,
// the aria-label must be updated to match the actual destination.

import {Settings} from 'lucide-react'

export interface SidebarFooterProps {
	/** Stub callback — Phase 183 supplies the real open-settings dispatcher. */
	onOpenSettings?: () => void
}

export function SidebarFooter({onOpenSettings}: SidebarFooterProps) {
	return (
		<div className='flex items-center justify-start border-t border-line p-2'>
			<button
				type='button'
				aria-label='Settings'
				className='rounded p-1.5 text-text-secondary hover:bg-surface-2'
				onClick={() => onOpenSettings?.()}
			>
				<Settings size={18} />
			</button>
		</div>
	)
}
