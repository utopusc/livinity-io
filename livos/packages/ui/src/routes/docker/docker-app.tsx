// Phase 24-01 — DockerApp top-level shell.
//
// Mounts the Sidebar (left) + main pane (right). The active section is
// looked up via the zustand store, then SectionView fans out to the matching
// placeholder component. Plan 24-02 mounts the StatusBar as the first child
// of <main> (above SectionView), so this file's <main> structure is the
// integration surface for that plan.
//
// The SectionView switch is exhaustive — TypeScript narrows SectionId so a
// missing case is a compile error. This is what guarantees every entry in
// SECTION_IDS / SECTION_META has a matching component file.
//
// useDockerTheme(rootRef) scopes the dark/light class to the docker-app root
// (NOT document.documentElement), so other LivOS surfaces continue to render
// in light mode regardless of the user's docker-app preference.

import {useRef} from 'react'

import {Activity} from './sections/activity'
import {Containers} from './sections/containers'
import {Dashboard} from './sections/dashboard'
import {Images} from './sections/images'
import {Logs} from './sections/logs'
import {Networks} from './sections/networks'
import {Registry} from './sections/registry'
import {Schedules} from './sections/schedules'
import {Settings} from './sections/settings'
import {Shell} from './sections/shell'
import {Stacks} from './sections/stacks'
import {Volumes} from './sections/volumes'
import {Sidebar} from './sidebar'
import {useDockerSection, type SectionId} from './store'
import {useDockerTheme} from './theme'

export function DockerApp() {
	const rootRef = useRef<HTMLDivElement>(null)
	// Mounts the dark/light class on rootRef when theme.resolved changes.
	useDockerTheme(rootRef)
	const section = useDockerSection()

	return (
		<div
			ref={rootRef}
			className='flex size-full bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100'
		>
			<Sidebar />
			<main className='flex min-w-0 flex-1 flex-col overflow-hidden'>
				{/* Plan 24-02 mounts <StatusBar /> here as the first child of <main>. */}
				<div className='min-h-0 flex-1 overflow-auto'>
					<SectionView section={section} />
				</div>
			</main>
		</div>
	)
}

function SectionView({section}: {section: SectionId}) {
	switch (section) {
		case 'dashboard':
			return <Dashboard />
		case 'containers':
			return <Containers />
		case 'logs':
			return <Logs />
		case 'shell':
			return <Shell />
		case 'stacks':
			return <Stacks />
		case 'images':
			return <Images />
		case 'volumes':
			return <Volumes />
		case 'networks':
			return <Networks />
		case 'registry':
			return <Registry />
		case 'activity':
			return <Activity />
		case 'schedules':
			return <Schedules />
		case 'settings':
			return <Settings />
	}
}
