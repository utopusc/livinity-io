// Phase 168-02 — Single session row. Presentational — mutation callbacks
// are owned by SessionSidebar (Task 4) and passed in via props. The row
// itself does NOT call tRPC; it just emits onSelect / onRename / onDelete.
//
// XSS safety: session title rendered via React text children only — never
// via React's raw-HTML escape hatch (T-168-02-01 mitigation).

import {useState} from 'react'
import {clsx} from 'clsx'

// Local CcPtySession minimum-shape interface. The source of truth lives in
// livos/packages/livinityd/source/modules/cc-pty/types.ts; redeclaring here
// avoids a cross-package type import from livinityd (UI package does not
// depend on livinityd internals — D-V35 D-NEW-DEPS rule).
export interface CcPtySession {
	id: string
	title?: string
	createdAt: number
	lastAttachedAt: number
	lastMessageAt: number
}

export interface SessionItemProps {
	session: CcPtySession
	active: boolean
	attachedElsewhere?: boolean // Phase 168-04 toggles this
	onSelect: () => void
	onRename: (title: string) => void
	onDelete: () => void
}

function formatRelative(ms: number, now: number = Date.now()): string {
	if (!ms) return 'never'
	const diff = Math.max(0, now - ms)
	if (diff < 60_000) return 'just now'
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
	return `${Math.floor(diff / 86_400_000)}d ago`
}

export function SessionItem({
	session,
	active,
	attachedElsewhere = false,
	onSelect,
	onRename,
	onDelete,
}: SessionItemProps) {
	const [menuOpen, setMenuOpen] = useState(false)
	const [editing, setEditing] = useState(false)
	const lastActivity = Math.max(
		session.lastMessageAt,
		session.lastAttachedAt,
		session.createdAt,
	)

	if (editing) {
		return (
			<div className='w-full px-2 py-2'>
				<input
					autoFocus
					defaultValue={session.title ?? ''}
					aria-label='Rename session'
					className='w-full rounded border border-border bg-bg-secondary px-2 py-1 text-sm'
					onBlur={(e) => {
						const v = e.currentTarget.value.trim()
						if (v) onRename(v)
						setEditing(false)
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							const v = e.currentTarget.value.trim()
							if (v) onRename(v)
							setEditing(false)
						} else if (e.key === 'Escape') {
							setEditing(false)
						}
					}}
				/>
			</div>
		)
	}

	return (
		<div
			data-active={active ? 'true' : 'false'}
			className={clsx(
				'group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition',
				active
					? 'border border-primary bg-bg-secondary'
					: 'border border-transparent hover:bg-bg-secondary',
			)}
		>
			<button
				type='button'
				onClick={onSelect}
				className='flex-1 truncate text-left'
				aria-label='Open session'
			>
				<div className='flex items-center gap-2'>
					<span className='truncate font-medium'>{session.title ?? '(Untitled)'}</span>
					{attachedElsewhere && (
						<span
							aria-label='Session attached in another tab'
							title='Open in another tab'
							className='h-2 w-2 rounded-full bg-yellow-500'
						/>
					)}
				</div>
				<div className='truncate text-xs text-text-secondary'>
					{formatRelative(lastActivity)}
				</div>
			</button>
			<div className='relative'>
				<button
					type='button'
					aria-label='Session actions'
					onClick={() => setMenuOpen((v) => !v)}
					className='rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-bg'
				>
					⋯
				</button>
				{menuOpen && (
					<div
						role='menu'
						className='absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-border bg-bg-secondary shadow-lg'
					>
						<button
							type='button'
							role='menuitem'
							onClick={() => {
								setMenuOpen(false)
								setEditing(true)
							}}
							className='block w-full px-3 py-1.5 text-left text-sm hover:bg-bg'
						>
							Rename
						</button>
						<button
							type='button'
							role='menuitem'
							onClick={() => {
								setMenuOpen(false)
								if (
									window.confirm(
										`Delete session "${session.title ?? 'Untitled'}"?`,
									)
								) {
									onDelete()
								}
							}}
							className='block w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-bg'
						>
							Delete
						</button>
					</div>
				)}
			</div>
		</div>
	)
}
