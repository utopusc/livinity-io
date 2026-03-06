import {AnimatePresence, motion} from 'framer-motion'
import {IconType} from 'react-icons'
import {TbDownload, TbFileText, TbFolder, TbMusic, TbPhoto, TbVideo} from 'react-icons/tb'

import {SidebarItem} from '@/features/files/components/sidebar/sidebar-item'
import {useFavorites} from '@/features/files/hooks/use-favorites'
import {useNavigate} from '@/features/files/hooks/use-navigate'
import {useIsFilesReadOnly} from '@/features/files/providers/files-capabilities-context'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {t} from '@/utils/i18n'

const FAVORITE_ICON_MAP: Record<string, {icon: IconType; bg: string; color: string}> = {
	Downloads: {icon: TbDownload, bg: 'bg-green-100', color: 'text-green-600'},
	Documents: {icon: TbFileText, bg: 'bg-sky-100', color: 'text-sky-600'},
	Photos: {icon: TbPhoto, bg: 'bg-pink-100', color: 'text-pink-600'},
	Videos: {icon: TbVideo, bg: 'bg-rose-100', color: 'text-rose-600'},
	Music: {icon: TbMusic, bg: 'bg-purple-100', color: 'text-purple-600'},
}
const DEFAULT_FAVORITE = {icon: TbFolder, bg: 'bg-neutral-200', color: 'text-neutral-500'}

export function SidebarFavorites({favorites}: {favorites: (string | null)[]}) {
	const {navigateToDirectory, currentPath} = useNavigate()
	const {removeFavorite} = useFavorites()
	const isReadOnly = useIsFilesReadOnly()

	return (
		<AnimatePresence initial={false}>
			{favorites.map((favoritePath: string | null) => {
				if (!favoritePath) return null
				const name = favoritePath.split('/').pop() || favoritePath
				const iconInfo = FAVORITE_ICON_MAP[name] || DEFAULT_FAVORITE

				return (
					<motion.div
						key={`sidebar-favorite-${favoritePath}`}
						initial={{opacity: 0, height: 0}}
						animate={{opacity: 1, height: 'auto'}}
						exit={{opacity: 0, height: 0}}
						transition={{duration: 0.2}}
					>
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<div>
									<SidebarItem
										item={{
											name: name,
											path: favoritePath,
											type: 'directory',
										}}
										isActive={currentPath === favoritePath}
										onClick={() => navigateToDirectory(favoritePath)}
										icon={iconInfo.icon}
										iconBg={iconInfo.bg}
										iconColor={iconInfo.color}
									/>
								</div>
							</ContextMenuTrigger>
							{!isReadOnly ? (
								<ContextMenuContent>
									<ContextMenuItem onClick={() => removeFavorite({path: favoritePath})}>
										{t('files-action.remove-favorite')}
									</ContextMenuItem>
								</ContextMenuContent>
							) : null}
						</ContextMenu>
					</motion.div>
				)
			})}
		</AnimatePresence>
	)
}
