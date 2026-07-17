import {TbUsersGroup} from 'react-icons/tb'

import {SidebarItem} from '@/features/files/components/sidebar/sidebar-item'
import {SHARED_PATH} from '@/features/files/constants'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ACLUI-01 (336) — the Files sidebar "Shared with me" entry targeting the
// synthetic `/Shared` web nav root (the cross-user paths granted to this user
// via file_acls). A MINIMAL single nav item (like SidebarPool): clicking it
// navigates to `/Shared`, whose backend listing returns one folder per grant.
//
// Render-on-live gate: `/Shared` ALWAYS lists successfully (an empty root when
// the user has no grants), so — unlike SidebarPool which gates on isSuccess —
// this gates on a NON-EMPTY listing, so the section stays hidden until the user
// actually has at least one grant. retry:false + a short staleTime keep it cheap.
export function SidebarShared() {
	const {data} = trpcReact.files.list.useQuery(
		{path: SHARED_PATH},
		{retry: false, refetchOnWindowFocus: false, staleTime: 15_000},
	)
	const {navigateToDirectory, currentPath} = useNavigate()

	// Hidden until the user has ≥1 granted path (SC3 — never a dead/empty entry).
	if (!data || (data.files?.length ?? 0) === 0) return null

	return (
		<SidebarItem
			item={{name: t('files-sidebar.shared-with-me'), path: SHARED_PATH, type: 'directory'}}
			isActive={currentPath === SHARED_PATH}
			onClick={() => navigateToDirectory(SHARED_PATH)}
			icon={TbUsersGroup}
			iconBg='bg-emerald-100'
			iconColor='text-emerald-600'
		/>
	)
}
