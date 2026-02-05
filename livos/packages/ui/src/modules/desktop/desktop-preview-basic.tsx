import {useTimeout} from 'react-use'

import LivinityLogo from '@/assets/livinity-logo'
import {FadeInImg} from '@/components/ui/fade-in-img'
import {greetingMessage} from '@/modules/desktop/greeting-message'
import {systemAppsKeyed, useApps} from '@/providers/apps'
import {useWallpaper, WallpaperId} from '@/providers/wallpaper'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {tw} from '@/utils/tw'

export function DesktopPreviewConnected() {
	const wallpaper = useWallpaper()

	const getQuery = trpcReact.user.get.useQuery()
	const name = getQuery.data?.name

	const {userApps, isLoading} = useApps()

	if (isLoading) return null
	if (!userApps) return null
	if (!name) return null

	return (
		<DesktopPreview
			key={wallpaper.wallpaper.id}
			wallpaperId={wallpaper.wallpaper.id}
			userName={name}
			apps={userApps}
		/>
	)
}

export function DesktopPreview({
	wallpaperId,
	userName,
	apps,
}: {
	wallpaperId?: WallpaperId
	userName: string
	apps?: {name: string; icon: string}[]
}) {
	const appsPerRow = 6
	const appWidth = 28
	const appHeight = 22
	const appRows = 3

	// Delay mounting for performace
	const [show] = useTimeout(300)

	return (
		<div>
			{wallpaperId && (
				<FadeInImg
					key={wallpaperId}
					src={`/wallpapers/generated-small/${wallpaperId}.jpg`}
					className='absolute h-full w-full object-cover object-center'
					style={{
						animation: 'animate-unblur 0.7s',
					}}
				/>
			)}
			{/* <Wallpaper isPreview /> */}
			{show() && (
				<div className='absolute inset-0 flex flex-col items-center duration-700 animate-in fade-in'>
					<div className='h-2.5 flex-1' />
					<Header userName={userName} />
					<div className='h-1 flex-1' />
					<div
						className='grid shrink-0 grid-cols-6 content-start overflow-hidden'
						style={{
							height: appHeight * appRows,
							width: appWidth * appsPerRow,
						}}
					>
						{apps?.map((app, i) => (
							<div
								key={app.name}
								style={{width: appWidth, height: appHeight, animationDelay: `${i * 10 + 100}ms`}}
								className={cn('grid place-items-center', 'duration-200 animate-in fade-in zoom-in-50 fill-mode-both')}
							>
								<div className='flex w-full min-w-0 flex-col items-center'>
									<div className='overflow-hidden rounded-3 bg-white/20'>
										<FadeInImg src={app.icon} className='h-3 w-3' />
									</div>
									<AppLabel>{app.name}</AppLabel>
								</div>
							</div>
						))}
					</div>
					<div className='h-1 flex-1' />
					<div className={dockPreviewClass}>
						<DockItemPreview icon={systemAppsKeyed['LIVINITY_home'].icon} />
						<DockItemPreview icon={systemAppsKeyed['LIVINITY_files'].icon} />
						<DockItemPreview icon={systemAppsKeyed['LIVINITY_settings'].icon} />
						<DockItemPreview icon={systemAppsKeyed['LIVINITY_live-usage'].icon} />
						<DockItemPreview icon={systemAppsKeyed['LIVINITY_app-store'].icon} />
					</div>
					<div className='h-[2px]' />
				</div>
			)}
		</div>
	)
}

function AppLabel({children}: {children: string}) {
	return <div className='mt-[1px] w-full truncate text-center text-[2px] tracking-1'>{children}</div>
}

function DockItemPreview({icon}: {icon: string}) {
	return <FadeInImg src={icon} className='h-3 w-3' />
}

const dockPreviewClass = tw`mx-auto animate-in slide-in-from-bottom-2 flex gap-1 rounded-5 bg-neutral-900/70 p-[3px] shrink-0 border-hpx border-white/10`

function Header({userName}: {userName: string}) {
	return (
		<div className='flex flex-col items-center duration-300 animate-in slide-in-from-bottom-2'>
			<LivinityLogo
				className='w-[20px]'
				// Need to remove `view-transition-name` because it causes the logo to
				// briefly appear over the sheets between page transitions
				ref={(ref) => {
					ref?.style?.removeProperty('view-transition-name')
				}}
			/>
			<div className='text-center text-[9px] font-bold'>{greetingMessage(userName)}</div>
		</div>
	)
}
