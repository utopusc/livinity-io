import {WidgetMeta} from './widget-types'
import {ClockWidget} from './clock-widget'
import {SystemInfoCompactWidget} from './system-info-compact-widget'
import {SystemInfoDetailedWidget} from './system-info-detailed-widget'
import {QuickNotesWidget} from './quick-notes-widget'
import {AppStatusWidget} from './app-status-widget'
import {TopAppsWidget} from './top-apps-widget'
import {WidgetContainer} from './widget-container'

export function WidgetRenderer({widget}: {widget: WidgetMeta}) {
	switch (widget.type) {
		case 'clock':
			return <ClockWidget config={widget.config} />
		case 'system-info-compact':
			return <SystemInfoCompactWidget />
		case 'system-info-detailed':
			return <SystemInfoDetailedWidget />
		case 'quick-notes':
			return <QuickNotesWidget widgetId={widget.id} />
		case 'app-status':
			return <AppStatusWidget />
		case 'top-apps':
			return <TopAppsWidget />
		default:
			return (
				<WidgetContainer>
					<div className='flex h-full w-full items-center justify-center text-xs text-gray-400'>
						Unknown widget
					</div>
				</WidgetContainer>
			)
	}
}
