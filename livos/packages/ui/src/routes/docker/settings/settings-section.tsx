// Phase 29 Plan 29-02 — Docker Settings section (DOC-17).
//
// Top-level surface mounted at /docker/settings. shadcn Tabs primitive
// switches between two child views:
//   - Environments tab — cross-imported from settings/_components/
//     environments-section.tsx (Phase 22), unchanged. Lets users add/edit/
//     remove Docker environments without leaving the Docker app.
//   - Appearance tab — theme toggle (Phase 24-02 useDockerTheme; DOC-19
//     verification surface) + sidebar density radio (DOC-17).
//
// The global Livinity Settings page at /settings stays untouched.

import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'

import {AppearanceTab} from './appearance-tab'
import {EnvironmentsTab} from './environments-tab'

export function SettingsSection() {
	return (
		<div className='flex h-full flex-col overflow-hidden'>
			<div className='border-b border-zinc-200 px-6 py-4 dark:border-zinc-800'>
				<h2 className='text-lg font-semibold text-zinc-900 dark:text-zinc-100'>Settings</h2>
				<p className='mt-1 text-sm text-zinc-500 dark:text-zinc-400'>
					Manage Docker environments + appearance preferences.
				</p>
			</div>
			<Tabs defaultValue='environments' className='flex flex-1 flex-col overflow-hidden px-6 pt-4'>
				<TabsList className='self-start'>
					<TabsTrigger value='environments'>Environments</TabsTrigger>
					<TabsTrigger value='appearance'>Appearance</TabsTrigger>
				</TabsList>
				<TabsContent value='environments' className='flex-1 overflow-y-auto pb-6'>
					<EnvironmentsTab />
				</TabsContent>
				<TabsContent value='appearance' className='flex-1 overflow-y-auto pb-6'>
					<AppearanceTab />
				</TabsContent>
			</Tabs>
		</div>
	)
}
