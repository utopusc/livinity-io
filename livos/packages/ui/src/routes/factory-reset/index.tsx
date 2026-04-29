import {EnsureLoggedIn} from '@/modules/auth/ensure-logged-in'

import {FactoryResetModal} from './_components/factory-reset-modal'

// Phase 38 Plan 03 — replaces the legacy multi-route password gate. The
// explicit-list modal IS the consent surface; the BarePage progress overlay
// is wired via GlobalSystemStateProvider's `resetting` status cover (Plan 04).
export default function FactoryReset() {
	return (
		<EnsureLoggedIn>
			<FactoryResetModal />
		</EnsureLoggedIn>
	)
}
