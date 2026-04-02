import {Suspense} from 'react'
import {AnimatePresence, motion} from 'framer-motion'

import {Loading} from '@/components/ui/loading'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {WindowAppContent} from '@/modules/window/window-content'

import {useMobileApp} from './mobile-app-context'
import {useMobileBack} from './use-mobile-back'
import {MobileNavBar} from './mobile-nav-bar'

export function MobileAppRenderer() {
	const {activeApp, closeApp} = useMobileApp()
	const isMobile = useIsMobile()
	useMobileBack()

	if (!isMobile) return null

	return (
		<AnimatePresence>
			{activeApp && (
				<motion.div
					key={activeApp.appId}
					className='fixed inset-0 z-50 flex flex-col bg-white'
					initial={{x: '100%'}}
					animate={{x: 0}}
					exit={{x: '100%'}}
					transition={{type: 'tween', duration: 0.25, ease: [0.32, 0.72, 0, 1]}}
				>
					<MobileNavBar title={activeApp.title} onBack={closeApp} />
					<div className='flex-1 min-h-0 overflow-x-hidden overflow-y-auto' style={{paddingBottom: '60px'}}>
						<Suspense fallback={<Loading />}>
							<WindowAppContent appId={activeApp.appId} initialRoute={activeApp.route} />
						</Suspense>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
