import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'

interface SettingsToggleRowProps {
	title: string
	description?: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	disabled?: boolean
	className?: string
}

export function SettingsToggleRow({title, description, checked, onCheckedChange, disabled, className}: SettingsToggleRowProps) {
	return (
		<div className={cn('flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4', className)}>
			<div className='mr-3 flex-1'>
				<div className='text-body font-medium'>{title}</div>
				{description && <div className='mt-1 text-caption text-text-secondary'>{description}</div>}
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
		</div>
	)
}
