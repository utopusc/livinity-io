import * as React from 'react'

export function ReviewCard({
	icon,
	label,
	children,
}: {
	icon: React.ReactNode
	label: string
	children?: React.ReactNode
}) {
	return (
		<div className='flex items-center gap-3 rounded-xl border border-border-default bg-surface-base p-4'>
			<div className='flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-1'>{icon}</div>
			<div className='min-w-0 flex-1'>
				<div className='text-[13px] text-text-secondary'>{label}</div>
				<div className='min-w-0 break-words text-sm'>{children}</div>
			</div>
		</div>
	)
}
