import {type ComponentType} from 'react'

import {cn} from '@/shadcn-lib/utils'

interface SettingsInfoCardProps {
	icon?: ComponentType<{className?: string}>
	title: string
	description?: string
	children?: React.ReactNode
	variant?: 'default' | 'success' | 'warning' | 'danger'
	className?: string
}

export function SettingsInfoCard({icon: Icon, title, description, children, variant = 'default', className}: SettingsInfoCardProps) {
	return (
		<div
			className={cn(
				'rounded-radius-md border p-4',
				variant === 'default' && 'border-border-default bg-surface-base',
				variant === 'success' && 'border-green-500/30 bg-green-500/10',
				variant === 'warning' && 'border-orange-500/30 bg-orange-500/10',
				variant === 'danger' && 'border-red-500/20 bg-red-500/5',
				className,
			)}
		>
			<div className='flex items-center gap-3'>
				{Icon && (
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<Icon className='h-icon-md w-icon-md text-text-secondary' />
					</div>
				)}
				<div className='flex-1'>
					<div className='text-body font-medium'>{title}</div>
					{description && <div className='text-caption text-text-secondary'>{description}</div>}
				</div>
				{children}
			</div>
		</div>
	)
}
