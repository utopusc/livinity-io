// Phase 102-07 — Chrome Master Login settings page (D-102-MASTER-LOGIN-UI).
//
// Routes `/settings/chrome-master` and the embedded settings-content panel
// to `MasterChromeLogin` (the affordance defined in modules/settings/).
// Persistent login state for all per-app WebApp Chrome instances flows
// from a single master profile at /opt/livos/data/chrome-master/, populated
// by the user via the action button rendered here.

import {MasterChromeLogin} from '@/modules/settings/master-chrome-login'

import {SettingsPageLayout} from './_components/settings-page-layout'

export default function ChromeMasterPage() {
	return (
		<SettingsPageLayout
			title='Chrome Profile'
			description='Log into Google once. All WebApp browsers inherit this profile.'
		>
			<div className='px-1'>
				<MasterChromeLogin />
			</div>
		</SettingsPageLayout>
	)
}
