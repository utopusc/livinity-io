import {ReactNode} from 'react'
import {TbTrash} from 'react-icons/tb'

import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'

import {removeDesktopWidget} from '../desktop-content'
import {WidgetMeta, getWidgetCatalogEntry} from './widget-types'

interface WidgetContextMenuProps {
	widget: WidgetMeta
	onUpdateConfig: (widgetId: string, config: Record<string, unknown>) => void
	children: ReactNode
}

export function WidgetContextMenu({widget, onUpdateConfig, children}: WidgetContextMenuProps) {
	const entry = getWidgetCatalogEntry(widget.type)
	const variants = entry?.variants

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				{variants && variants.length > 0 && (
					<>
						{variants.map((v) => {
							const isActive = Object.entries(v.configPatch).every(
								([key, val]) => widget.config?.[key] === val,
							)
							return (
								<ContextMenuItem
									key={v.key}
									onSelect={() => onUpdateConfig(widget.id, {...(widget.config ?? {}), ...v.configPatch})}
								>
									<span className={isActive ? 'font-semibold' : ''}>{v.label}</span>
									{isActive && <span className='ml-auto text-xs text-gray-400'>&#10003;</span>}
								</ContextMenuItem>
							)
						})}
						<ContextMenuSeparator />
					</>
				)}
				<ContextMenuItem className='text-red-500 focus:text-red-500' onSelect={() => removeDesktopWidget(widget.id)}>
					<TbTrash className='mr-2 h-4 w-4' /> Remove Widget
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}
