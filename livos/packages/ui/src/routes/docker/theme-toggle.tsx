// Phase 24-02 — Theme toggle button for the StatusBar.
//
// Cycles light → dark → system → light on click. Shows the active mode's
// icon (sun / moon / laptop). Backed by useDockerTheme() in read-only mode
// (no rootRef passed) — DockerApp's own useDockerTheme(rootRef) call is
// what actually mounts the dark class on the docker-app root. setMode
// writes localStorage; theme.ts's same-tab event listener flips DockerApp's
// instance immediately.

import {type Icon, IconDeviceLaptop, IconMoon, IconSun} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

import {type ThemeMode, useDockerTheme} from './theme'

const NEXT: Record<ThemeMode, ThemeMode> = {light: 'dark', dark: 'system', system: 'light'}
const ICON: Record<ThemeMode, Icon> = {
	light: IconSun,
	dark: IconMoon,
	system: IconDeviceLaptop,
}
const TITLE: Record<ThemeMode, string> = {
	light: 'Light theme — click for dark',
	dark: 'Dark theme — click for system',
	system: 'System theme — click for light',
}

export function ThemeToggle() {
	const {mode, setMode} = useDockerTheme()
	const Icon = ICON[mode]
	return (
		<button
			type='button'
			onClick={() => setMode(NEXT[mode])}
			aria-label={TITLE[mode]}
			title={TITLE[mode]}
			className={cn(
				'inline-flex size-8 items-center justify-center rounded-md',
				'text-zinc-600 hover:bg-zinc-200/60',
				'dark:text-zinc-400 dark:hover:bg-zinc-800/60',
			)}
		>
			<Icon size={16} />
		</button>
	)
}
