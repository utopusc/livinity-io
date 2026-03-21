import {TbTrash} from 'react-icons/tb'

import {SidebarItem} from '@/features/files/components/sidebar/sidebar-item'
import {TRASH_PATH} from '@/features/files/constants'
import {useNavigate} from '@/features/files/hooks/use-navigate'

export function SidebarTrash() {
	const {navigateToDirectory, currentPath} = useNavigate()
	const isTrash = currentPath === TRASH_PATH

	return (
		<SidebarItem
			item={{name: 'Trash', path: TRASH_PATH, type: 'directory'}}
			isActive={isTrash}
			onClick={() => navigateToDirectory(TRASH_PATH)}
			icon={TbTrash}
			iconBg='bg-red-100'
			iconColor='text-red-500'
		/>
	)
}
