// livos/packages/ui/src/routes/settings/local-access.tsx
// Phase 104 plan 104-05 — Settings -> Local Access route entry.
import {LocalSetupWizard} from '@/features/local-setup/LocalSetupWizard'

import {SettingsPageLayout} from './_components/settings-page-layout'
import {SettingsPageHeader} from '@/components/settings-page-header'

export default function LocalAccessRoute() {
	return (
		<SettingsPageLayout title='Local Access' description='Configure how LivOS is reachable on your LAN.' hideHeader>
			<SettingsPageHeader
				eyebrow='04 · Network'
				title='Reach LivOS on your'
				titleAccent='local network.'
				sub='Pair a phone or laptop with your LivOS hardware over Wi-Fi. Connections never leave your LAN — no relay, no third-party server.'
			/>
			<div className='h-6' />
			<LocalSetupWizard />
		</SettingsPageLayout>
	)
}
