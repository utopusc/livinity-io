// Phase 26 Plan 26-01 — Resource action button.
//
// Ported verbatim from routes/server-control/index.tsx:202-235. The legacy
// file still has its copy because ImagesTab + <TabsContent value='containers'>
// still use it locally; both copies remain until Plan 27 deletes the legacy
// file wholesale.

import {cn} from '@/shadcn-lib/utils'

export function ActionButton({
	icon: Icon,
	onClick,
	disabled,
	color,
	title,
}: {
	icon: React.ComponentType<{size?: number}>
	onClick: () => void
	disabled?: boolean
	color: 'emerald' | 'amber' | 'blue' | 'red'
	title: string
}) {
	const colorClasses = {
		emerald: 'hover:bg-emerald-500/20 hover:text-emerald-400',
		amber: 'hover:bg-amber-500/20 hover:text-amber-400',
		blue: 'hover:bg-blue-500/20 hover:text-blue-400',
		red: 'hover:bg-red-500/20 hover:text-red-400',
	}

	return (
		<button
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				'rounded-lg p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-text-tertiary transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
				colorClasses[color],
			)}
		>
			<Icon size={16} />
		</button>
	)
}
