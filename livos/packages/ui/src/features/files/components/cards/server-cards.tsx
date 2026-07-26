import {Plus} from 'lucide-react'

export function AddManuallyCard({onClick, label}: {onClick?: () => void; label: string}) {
	return (
		<div
			className='mx-auto flex h-[110px] w-[125px] cursor-pointer flex-col items-center justify-center rounded-dash border border-dashed border-border-default bg-surface-base p-2 transition-colors hover:border-brand hover:bg-brand/15'
			onClick={onClick}
		>
			<div className='mb-2 flex size-12 items-center justify-center'>
				<div className='flex size-12 items-center justify-center rounded-full bg-surface-1'>
					<div className='flex size-8 items-center justify-center rounded-full bg-surface-2'>
						<Plus className='size-4' />
					</div>
				</div>
			</div>
			<span className='w-full text-center text-12 text-text-secondary' title={label}>
				{label}
			</span>
		</div>
	)
}

export function ServerCard({
	children,
	selected = false,
	// Phase 368.6: a row that exists but cannot be chosen (an internal disk that is
	// not set up yet). Shown rather than hidden, so "where is my second disk?" has
	// an answer on screen instead of an unexplained absence.
	disabled = false,
	onClick,
}: {
	children: React.ReactNode
	selected?: boolean
	disabled?: boolean
	onClick?: () => void
}) {
	return (
		<div
			aria-disabled={disabled || undefined}
			className={`mx-auto flex h-[110px] w-[125px] flex-col items-center justify-center rounded-dash p-2 transition-colors ${
				disabled
					? 'cursor-not-allowed border border-border-default bg-surface-base opacity-50'
					: selected
						? 'cursor-pointer border border-brand bg-brand/15'
						: 'cursor-pointer border border-border-default bg-surface-base hover:bg-surface-1'
			}`}
			onClick={disabled ? undefined : onClick}
		>
			{children}
		</div>
	)
}
