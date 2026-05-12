// livos/packages/ui/src/routes/settings/local-access.tsx
// Phase 104 plan 104-05 — Settings -> Local Access route entry.
import {LocalSetupWizard} from '@/features/local-setup/LocalSetupWizard'

import {SettingsPageLayout} from './_components/settings-page-layout'

export default function LocalAccessRoute() {
	return (
		<SettingsPageLayout title='Local Access' description='Configure how LivOS is reachable on your LAN.'>
			<LocalSetupWizard />
		</SettingsPageLayout>
	)
}
