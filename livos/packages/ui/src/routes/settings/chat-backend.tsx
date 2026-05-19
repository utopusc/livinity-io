// Phase 165-02 — Chat backend selector settings page.
//
// Routes `/settings/chat-backend` to ChatBackendPanel (the affordance
// defined in modules/settings/). Wires v34 vault vs legacy chat path
// + default-model picker.

import {ChatBackendPanel} from '@/modules/settings/ChatBackendPanel'

import {SettingsPageLayout} from './_components/settings-page-layout'
import {SettingsPageHeader} from '@/components/settings-page-header'

export default function ChatBackendPage() {
	return (
		<SettingsPageLayout
			title='Chat backend'
			description='Pick the chat engine + default model.'
			hideHeader
		>
			<SettingsPageHeader
				eyebrow='07 · Chat'
				title='Pick the backend'
				titleAccent='and the default model.'
				sub='Vault mode loads Claude Code with your /home/bruce/livinity-vault. Legacy is the pre-v34 path.'
			/>
			<div className='h-6' />
			<div className='px-1'>
				<ChatBackendPanel />
			</div>
		</SettingsPageLayout>
	)
}
