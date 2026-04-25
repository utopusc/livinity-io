// Phase 29 Plan 29-02 — Docker > Settings > Environments tab (DOC-17).
//
// Cross-imports EnvironmentsSection from the Phase 22 Settings page.
// Component is the SAME instance — both surfaces (legacy /settings >
// Environments and the new in-Docker /docker/settings > Environments)
// render identical content during the v28-final overlap window. Phase 30+
// may move it under routes/docker/_components/ and slim the legacy
// Settings entry to a redirect; out of scope for v28.0.

import {EnvironmentsSection} from '@/routes/settings/_components/environments-section'

export function EnvironmentsTab() {
	return (
		<div className='py-4'>
			<EnvironmentsSection />
		</div>
	)
}
