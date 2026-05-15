import {motion} from 'framer-motion'

import {AvatarGradient, getInitials} from '@/components/avatar-gradient'
import {LivinityBrand} from '@/components/livinity-brand'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useIsMobile} from '@/hooks/use-is-mobile'

/**
 * v36 LivOS Design Port — TopBar (Phase 130-02).
 *
 * Desktop-only top bar pinned to `top: 0`. Provides:
 *   Left  — gradient avatar with the current user's initial + Livinity brand
 *           (donut mark + wordmark) inspired by the livinity.io landing nav,
 *           scaled down for OS chrome.
 *   Right — future slots (notifications, search, theme) — empty for v36.
 *
 * Glass formula matches the dock so the two pieces of chrome rhyme. Hidden on
 * mobile per useIsMobile to keep the limited viewport free for content.
 *
 * Profile relocation: this replaces the `<DockProfile />` previously docked
 * bottom-left. The avatar's user menu wiring (log out / switch / settings)
 * will follow in a follow-up patch — for v36, the avatar is presentational.
 */
export function TopBar() {
	const isMobile = useIsMobile()
	const {user} = useCurrentUser()

	if (isMobile) return null

	const displayName = user?.name ?? 'Livinity'
	const initials = getInitials(displayName)

	return (
		<motion.div
			initial={{translateY: -40, opacity: 0}}
			animate={{translateY: 0, opacity: 1}}
			transition={{type: 'spring', stiffness: 280, damping: 24, delay: 0.1}}
			className='fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between gap-3 px-4 bg-card-bg/50 dark:bg-black/55 contrast-more:bg-neutral-700 backdrop-blur-3xl backdrop-saturate-150 contrast-more:backdrop-blur-none border-b border-white/60 dark:border-white/10'
			role='banner'
			aria-label='Top bar'
		>
			<div className='flex items-center gap-3'>
				<AvatarGradient initials={initials} size='sm' />
				<LivinityBrand size='sm' />
			</div>
			<div className='flex items-center gap-2'>
				{/* Reserved slot for future widgets (search, notifications, theme). */}
			</div>
		</motion.div>
	)
}
