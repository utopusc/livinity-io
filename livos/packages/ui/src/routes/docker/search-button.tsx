// Phase 24-02 placeholder replaced in Phase 29 Plan 29-01 (DOC-18).
//
// Click → opens the cmd+k command palette (same modal as the keyboard
// shortcut). The palette itself mounts at the DockerApp tree root via
// <CommandPalette />, so this button is just a thin trigger.

import {IconSearch} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

import {usePaletteStore} from './palette/use-palette-store'

export function SearchButton() {
	return (
		<button
			type='button'
			onClick={() => usePaletteStore.getState().openPalette()}
			aria-label='Search (⌘K command palette)'
			title='Search (⌘K command palette)'
			className={cn(
				'inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs',
				'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50',
				'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800',
			)}
		>
			<IconSearch size={14} />
			<span className='hidden sm:inline'>Search</span>
			<kbd className='hidden rounded border border-zinc-300 bg-zinc-100 px-1 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 sm:inline-block'>
				⌘K
			</kbd>
		</button>
	)
}
