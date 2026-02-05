import {motion, Variant} from 'framer-motion'
import {useLocation} from 'react-router-dom'

import {useApps} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'

import {AppGrid} from './app-grid/app-grid'
import {AppIconConnected} from './app-icon'
import {Search} from './desktop-misc'
import {DockSpacer} from './dock'
import {Header} from './header'

export function DesktopContent({onSearchClick}: {onSearchClick?: () => void}) {
	const {pathname} = useLocation()

	const getQuery = trpcReact.user.get.useQuery()
	const name = getQuery.data?.name

	const {userApps, isLoading} = useApps()

	if (isLoading) return null
	if (!userApps) return null
	if (!name) return null

	type DesktopVariant = 'default' | 'overlayed'
	const variant: DesktopVariant = pathname === '/' ? 'default' : 'overlayed'

	const variants: Record<DesktopVariant, Variant> = {
		default: {
			opacity: 1,
		},
		overlayed: {
			translateY: 0,
			opacity: 0,
			transition: {
				duration: 0,
			},
		},
	}

	return (
		<motion.div
			className='flex h-full w-full select-none flex-col items-center justify-between'
			variants={variants}
			animate={variant}
			initial={{opacity: 1}}
			transition={{duration: 0.15, ease: 'easeOut'}}
		>
			<div className='pt-6 md:pt-8' />
			<Header userName={name} />
			<div className='pt-6 md:pt-8' />
			<div className='flex w-full grow overflow-hidden'>
				<AppGrid
					apps={userApps.map((app, i) => (
						<motion.div
							key={app.id}
							layout
							initial={{
								opacity: 0,
								scale: 0.75,
							}}
							animate={{
								opacity: 1,
								scale: 1,
							}}
							exit={{
								opacity: 0,
								scale: 0.75,
							}}
							transition={{
								delay: i * 0.01,
								duration: 0.2,
								ease: 'easeOut',
							}}
						>
							<AppIconConnected appId={app.id} />
						</motion.div>
					))}
				/>
			</div>
			<Search onClick={onSearchClick} />
			<div className='pt-6' />
			<DockSpacer />
		</motion.div>
	)
}
