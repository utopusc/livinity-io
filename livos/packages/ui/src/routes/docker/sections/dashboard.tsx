// Phase 25 Plan 25-01 — Dashboard section (DOC-04).
//
// Replaces the Phase 24 'Coming in Phase 25' placeholder with a multi-env
// health card grid. Plan 25-02 will layer filter chips ABOVE the grid and a
// Top-CPU panel BELOW it — keeping this file as a thin wrapper means 25-02
// can drop additions in without restructuring.

import {EnvCardGrid} from '../dashboard/env-card-grid'

export function Dashboard() {
	return (
		<div className='flex h-full flex-col overflow-y-auto'>
			<EnvCardGrid />
		</div>
	)
}
