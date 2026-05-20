// Phase 168-02 — `+ New Session` button. Disabled while a create mutation
// is in flight (caller passes `loading`).

import {clsx} from 'clsx'

export interface NewSessionButtonProps {
	onClick: () => void
	loading?: boolean
}

export function NewSessionButton({onClick, loading = false}: NewSessionButtonProps) {
	return (
		<button
			type='button'
			onClick={onClick}
			disabled={loading}
			aria-label='Create new session'
			className={clsx(
				'w-full rounded-lg px-3 py-2 text-sm font-medium transition',
				'bg-primary text-bg hover:opacity-90',
				loading && 'cursor-not-allowed opacity-60',
			)}
		>
			{loading ? 'Creating…' : '+ New Session'}
		</button>
	)
}
