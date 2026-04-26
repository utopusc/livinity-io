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
// Hot-patch: Docker app is locked to light theme — useDockerTheme is no longer
// mounted, so the `dark` class never gets attached to the docker-app root.

import {CommandPalette} from './palette/command-palette'
import {useCmdK} from './palette/use-cmd-k'
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
import {StatusBar} from './status-bar'
import {useDockerSection, type SectionId} from './store'

export function DockerApp() {
	// Plan 29-01 — install global cmd+k / ctrl+k listener for the entire
	// DockerApp lifetime (DOC-18).
	useCmdK()
	const section = useDockerSection()

	return (
		<div
			className='flex size-full bg-white text-zinc-900'
		>
			<Sidebar />
			<main className='flex min-w-0 flex-1 flex-col overflow-hidden'>
				{/* Plan 24-02: persistent top StatusBar (sticky 48px, matches Sidebar header h-12). */}
				<StatusBar />
				<div className='min-h-0 flex-1 overflow-auto'>
					<SectionView section={section} />
				</div>
			</main>
			{/* Plan 29-01 — single instance of the cmd+k palette. Radix Dialog uses a
			    portal so the DOM position is non-essential; mounting at the root
			    keeps it alive whenever the DockerApp tree is mounted. */}
			<CommandPalette />
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
