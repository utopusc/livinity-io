import {TbClock} from 'react-icons/tb'

import {SidebarItem} from '@/features/files/components/sidebar/sidebar-item'
import {RECENTS_PATH} from '@/features/files/constants'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {useIsFilesReadOnly} from '@/features/files/providers/files-capabilities-context'
import {t} from '@/utils/i18n'

export function SidebarRecents() {
	const {navigateToDirectory, currentPath} = useNavigate()
	const isReadOnly = useIsFilesReadOnly()

	return (
		<SidebarItem
			item={{
				name: t('files-sidebar.recents'),
				path: RECENTS_PATH,
				type: 'directory',
			}}
			isActive={currentPath === RECENTS_PATH}
			onClick={() => navigateToDirectory(RECENTS_PATH)}
			disabled={isReadOnly}
			icon={TbClock}
			iconBg='bg-amber-100'
			iconColor='text-amber-600'
		/>
	)
}
