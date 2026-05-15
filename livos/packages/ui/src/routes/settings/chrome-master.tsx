// Phase 102-07 — Chrome Master Login settings page (D-102-MASTER-LOGIN-UI).
//
// Routes `/settings/chrome-master` and the embedded settings-content panel
// to `MasterChromeLogin` (the affordance defined in modules/settings/).
// Persistent login state for all per-app WebApp Chrome instances flows
// from a single master profile at /opt/livos/data/chrome-master/, populated
// by the user via the action button rendered here.

import {MasterChromeLogin} from '@/modules/settings/master-chrome-login'

import {SettingsPageLayout} from './_components/settings-page-layout'
import {SettingsPageHeader} from '@/components/settings-page-header'

export default function ChromeMasterPage() {
	return (
		<SettingsPageLayout
			title='Chrome Profile'
			description='Log into Google once. All WebApp browsers inherit this profile.'
			hideHeader
		>
			<SettingsPageHeader
				eyebrow='06 · Chrome'
				title='One Google sign-in,'
				titleAccent='shared by every WebApp.'
				sub='Log into Google once on the master profile. Every WebApp browser window inherits the cookies — Gmail, Calendar, Drive all work without re-auth.'
			/>
			<div className='h-6' />
			<div className='px-1'>
				<MasterChromeLogin />
			</div>
		</SettingsPageLayout>
	)
}
