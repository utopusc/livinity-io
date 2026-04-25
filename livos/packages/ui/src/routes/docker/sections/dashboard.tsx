// Phase 25 Plan 25-01 — Dashboard section (DOC-04).
// Plan 25-02 — TagFilterChips (DOC-06) + TopCpuPanel (DOC-05).
//
// Layout (top → bottom):
//   1. <TagFilterChips />  — chip row, single-select filter (hidden when no
//                            env has tags yet).
//   2. <EnvCardGrid />     — responsive multi-env health card grid (filtered
//                            by the chip row's active selection).
//   3. <TopCpuPanel />     — top-10 cross-env containers by CPU% with
//                            Logs / Shell / Restart quick-action chips per
//                            row. Refreshes every 5s.

import {EnvCardGrid} from '../dashboard/env-card-grid'
import {TagFilterChips} from '../dashboard/tag-filter-chips'
import {TopCpuPanel} from '../dashboard/top-cpu-panel'

export function Dashboard() {
	return (
		<div className='flex h-full flex-col overflow-y-auto'>
			<TagFilterChips />
			<EnvCardGrid />
			<TopCpuPanel />
		</div>
	)
}
