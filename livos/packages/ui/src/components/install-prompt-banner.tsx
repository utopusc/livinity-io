import {useEffect, useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {TbShare, TbX} from 'react-icons/tb'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useIsStandalone} from '@/hooks/use-is-standalone'

const DISMISSED_KEY = 'liv:install-prompt-dismissed'

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>
}

export function InstallPromptBanner() {
	const isMobile = useIsMobile()
	const isStandalone = useIsStandalone()
	const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
	const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
	const [isIos] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window))

	useEffect(() => {
		const handler = (e: Event) => {
			e.preventDefault()
			setDeferredPrompt(e as BeforeInstallPromptEvent)
		}
		window.addEventListener('beforeinstallprompt', handler)
		return () => window.removeEventListener('beforeinstallprompt', handler)
	}, [])

	const handleInstall = async () => {
		if (!deferredPrompt) return
		await deferredPrompt.prompt()
		const {outcome} = await deferredPrompt.userChoice
		if (outcome === 'accepted') {
			dismiss()
		}
		setDeferredPrompt(null)
	}

	const dismiss = () => {
		localStorage.setItem(DISMISSED_KEY, '1')
		setDismissed(true)
	}

	// Visibility: mobile only, not standalone, not dismissed, and platform has install path
	const visible = isMobile && !isStandalone && !dismissed && (!!deferredPrompt || isIos)

	return (
		<AnimatePresence>
			{visible && (
				<motion.div
					initial={{y: 100, opacity: 0}}
					animate={{y: 0, opacity: 1}}
					exit={{y: 100, opacity: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='fixed bottom-[72px] left-4 right-4 z-[70] flex items-center gap-3 rounded-xl border border-border-default bg-surface-base p-3 shadow-lg'
				>
					<img
						src='/favicon/android-chrome-192x192.png'
						alt='Livinity'
						className='h-10 w-10 shrink-0 rounded-xl'
					/>

					<div className='min-w-0 flex-1'>
						<p className='text-[13px] font-semibold leading-tight text-text-primary'>
							Add Livinity to Home Screen
						</p>
						{isIos ? (
							<p className='mt-0.5 flex items-center gap-1 text-[11px] leading-tight text-text-secondary'>
								Tap <TbShare className='inline-block h-3.5 w-3.5' /> then &ldquo;Add to Home Screen&rdquo;
							</p>
						) : (
							<p className='mt-0.5 text-[11px] leading-tight text-text-secondary'>
								Install for a full-screen experience
							</p>
						)}
					</div>

					{/* Android install button */}
					{deferredPrompt && !isIos && (
						<button
							onClick={handleInstall}
							className='shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white active:scale-95'
						>
							Install
						</button>
					)}

					{/* Dismiss button */}
					<button
						onClick={dismiss}
						className='shrink-0 rounded-full p-1 text-text-tertiary active:scale-90'
						aria-label='Dismiss install prompt'
					>
						<TbX className='h-4 w-4' />
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
