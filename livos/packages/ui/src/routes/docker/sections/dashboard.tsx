// Phase 25 Plan 25-01 — Dashboard section (DOC-04).
// Plan 25-02 — TagFilterChips above EnvCardGrid (DOC-06); TopCpuPanel ships
// in Task 3 below the grid.
//
// Layout (top → bottom):
//   1. <TagFilterChips />  — chip row, single-select filter (hidden when no
//                            env has tags yet).
//   2. <EnvCardGrid />     — responsive multi-env health card grid.
//   3. <TopCpuPanel />     — top-10 cross-env containers by CPU% (Task 3).

import {EnvCardGrid} from '../dashboard/env-card-grid'
import {TagFilterChips} from '../dashboard/tag-filter-chips'

export function Dashboard() {
	return (
		<div className='flex h-full flex-col overflow-y-auto'>
			<TagFilterChips />
			<EnvCardGrid />
		</div>
	)
}
