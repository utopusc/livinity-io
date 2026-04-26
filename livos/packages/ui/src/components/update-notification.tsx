import {useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {TbDownload} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'
import {formatDistanceToNow, parseISO} from 'date-fns'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useSoftwareUpdate} from '@/hooks/use-software-update'

// Phase 30 UPD-04 — desktop-only "new update available" card.
// SHA-keyed dismissal (NOT boolean) so a NEWER commit re-shows the card after
// a prior "Later" click. Mirrors install-prompt-banner.tsx for animation +
// localStorage pattern; differs in: dismissal granularity (SHA vs boolean),
// trigger source (useSoftwareUpdate vs beforeinstallprompt), position
// (bottom-right vs bottom-center), platform (desktop vs mobile).
const DISMISSED_KEY = 'livos:update-notification:dismissed-sha'

function safeFormatRelative(iso: string): string {
	// Defensive — bad backend ISO must not crash the desktop UI.
	try {
		return formatDistanceToNow(parseISO(iso), {addSuffix: true})
	} catch {
		return ''
	}
}

export function UpdateNotification() {
	const isMobile = useIsMobile()
	const {state, latestVersion} = useSoftwareUpdate()
	const navigate = useNavigate()
	const [dismissedSha, setDismissedSha] = useState<string | null>(() =>
		typeof localStorage !== 'undefined' ? localStorage.getItem(DISMISSED_KEY) : null,
	)

	// Visibility: desktop only, update-available, has SHA, not the SHA we already dismissed.
	const visible =
		!isMobile &&
		state === 'update-available' &&
		!!latestVersion?.sha &&
		latestVersion.sha !== dismissedSha

	const handleLater = () => {
		if (!latestVersion?.sha) return
		localStorage.setItem(DISMISSED_KEY, latestVersion.sha)
		setDismissedSha(latestVersion.sha)
	}

	const handleUpdate = () => {
		// Navigate to the existing confirm dialog — that route owns the actual
		// system.update mutation. The notification only surfaces availability.
		navigate('/settings/software-update/confirm')
	}

	return (
		<AnimatePresence>
			{visible && latestVersion && (
				<motion.div
					initial={{opacity: 0, y: 20}}
					animate={{opacity: 1, y: 0}}
					exit={{opacity: 0, y: 20}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg'
					role='dialog'
					aria-label='Software update available'
				>
					<div className='flex items-center gap-2'>
						<TbDownload className='h-5 w-5 text-blue-600' />
						<span className='font-semibold text-zinc-900'>New update available</span>
					</div>
					<div className='flex flex-col gap-1'>
						<p className='text-sm text-zinc-600'>
							<span className='font-mono'>{latestVersion.shortSha}</span>
							{' — '}
							{latestVersion.message.split('\n')[0].slice(0, 80)}
						</p>
						<p className='text-xs text-zinc-400'>
							{latestVersion.author}
							{latestVersion.committedAt && `, ${safeFormatRelative(latestVersion.committedAt)}`}
						</p>
					</div>
					<div className='flex items-center gap-2'>
						<button
							onClick={handleUpdate}
							className='flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95'
						>
							Update
						</button>
						<button
							onClick={handleLater}
							className='rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 active:scale-95'
						>
							Later
						</button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
