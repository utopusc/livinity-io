// Phase 165-02 — Autonomous agents settings page.
//
// Routes `/settings/autonomous-agents` to AutonomousAgentsPanel (the affordance
// defined in modules/settings/). Surfaces Phase 164's scheduler + budget gate
// to the admin: editable daily cap, per-agent toggle / Run Now / last-run cells.

import {AutonomousAgentsPanel} from '@/modules/settings/AutonomousAgentsPanel'

import {SettingsPageLayout} from './_components/settings-page-layout'
import {SettingsPageHeader} from '@/components/settings-page-header'

export default function AutonomousAgentsPage() {
	return (
		<SettingsPageLayout
			title='Autonomous agents'
			description='Schedule, toggle, and budget your livos-agents/* runs.'
			hideHeader
		>
			<SettingsPageHeader
				eyebrow='07 · Autonomous'
				title='Run agents on a schedule,'
				titleAccent='within a daily budget.'
				sub='Each agent is a vault/livos-agents/<name>.md file with YAML frontmatter (schedule, model, max budget, max turns). Toggle, Run Now, or set the Mini PC daily cap.'
			/>
			<div className='h-6' />
			<div className='px-1'>
				<AutonomousAgentsPanel />
			</div>
		</SettingsPageLayout>
	)
}
