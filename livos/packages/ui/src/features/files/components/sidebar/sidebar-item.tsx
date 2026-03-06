import {IconType} from 'react-icons'

import {Droppable} from '@/features/files/components/shared/drag-and-drop'
import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {RECENTS_PATH} from '@/features/files/constants'
import {formatItemName} from '@/features/files/utils/format-filesystem-name'
import {cn} from '@/shadcn-lib/utils'

type SidebarItem = {
	name: string
	path: string
	type: 'directory'
}

export interface SidebarItemProps {
	item: SidebarItem
	isActive: boolean
	onClick: () => void
	disabled?: boolean
	icon?: IconType
	iconBg?: string
	iconColor?: string
}

export function SidebarItem({item, isActive, onClick, disabled = false, icon: Icon, iconBg, iconColor}: SidebarItemProps) {
	return (
		<Droppable
			id={`sidebar-${item.path}`}
			path={item.path}
			className={cn(
				'flex w-full rounded-lg text-[13px] transition-all duration-150',
				disabled
					? 'cursor-default opacity-50'
					: 'hover:bg-neutral-100',
				isActive && !disabled
					? 'bg-neutral-100 font-medium text-neutral-900'
					: disabled
						? 'text-neutral-400'
						: 'text-neutral-600 hover:text-neutral-900',
			)}
			disabled={disabled || item.path === RECENTS_PATH}
		>
			<button
				onClick={() => {
					if (disabled) return
					onClick()
				}}
				aria-disabled={disabled}
				disabled={disabled}
				className={cn('flex w-full items-center gap-2.5 px-2 py-[6px]', disabled && 'cursor-default')}
			>
				{Icon ? (
					<div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', iconBg || 'bg-neutral-200')}>
						<Icon className={cn('h-3.5 w-3.5', iconColor || 'text-neutral-600')} />
					</div>
				) : (
					<FileItemIcon item={{...item, modified: 0, size: 0, operations: []}} className='h-5 w-5' />
				)}
				<span className='truncate'>{formatItemName({name: item.name, maxLength: 21})}</span>
			</button>
		</Droppable>
	)
}
