import {IconType} from 'react-icons'

import {Droppable} from '@/features/files/components/shared/drag-and-drop'
import {FileItemIcon} from '@/features/files/components/shared/file-item-icon'
import {RECENTS_PATH} from '@/features/files/constants'
import {formatItemName} from '@/features/files/utils/format-filesystem-name'
import {useIsMobile} from '@/hooks/use-is-mobile'
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
	const isMobile = useIsMobile()
	return (
		<Droppable
			id={`sidebar-${item.path}`}
			path={item.path}
			className={cn(
				'group flex w-full rounded-xl text-[13px] transition-all duration-200',
				disabled
					? 'cursor-default opacity-50'
					: 'hover:bg-neutral-100/80',
				isActive && !disabled
					? 'bg-neutral-100 font-semibold text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
					: disabled
						? 'text-neutral-400'
						: 'text-neutral-500 hover:text-neutral-800',
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
				className={cn('flex w-full items-center gap-2.5 px-2', isMobile ? 'py-2.5' : 'py-[7px]', disabled && 'cursor-default')}
			>
				{Icon ? (
					<div className={cn(
						'flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg transition-transform duration-200',
						iconBg || 'bg-neutral-200',
						!disabled && 'group-hover:scale-105',
					)}>
						<Icon className={cn('h-3.5 w-3.5', iconColor || 'text-neutral-600')} strokeWidth={2.5} />
					</div>
				) : (
					<FileItemIcon item={{...item, modified: 0, size: 0, operations: []}} className='h-5 w-5' />
				)}
				<span className='truncate'>{formatItemName({name: item.name, maxLength: 21})}</span>
			</button>
		</Droppable>
	)
}
