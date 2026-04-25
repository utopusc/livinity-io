// Phase 24-02 — Search button placeholder for the StatusBar.
//
// Opens a placeholder Dialog announcing "Coming in Phase 29". The real
// cmd+k command palette is DOC-18 (Plan 29-XX). This button only exists so
// the StatusBar layout is feature-complete and users can see where the
// palette will live.
//
// No keyboard shortcut wired yet (cmd+k is Phase 29's responsibility).

import {useState} from 'react'

import {IconSearch} from '@tabler/icons-react'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {cn} from '@/shadcn-lib/utils'

export function SearchButton() {
	const [open, setOpen] = useState(false)
	return (
		<>
			<button
				type='button'
				onClick={() => setOpen(true)}
				aria-label='Search (cmd+k command palette — Phase 29)'
				title='Search (cmd+k palette — Phase 29)'
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
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Command palette</DialogTitle>
						<DialogDescription>Coming in Phase 29 — DOC-18</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		</>
	)
}
