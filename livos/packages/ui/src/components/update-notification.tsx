import {useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {TbDownload} from 'react-icons/tb'
import {formatDistanceToNow, parseISO} from 'date-fns'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useSoftwareUpdate} from '@/hooks/use-software-update'

import {UpdateConfirmModal} from './update-confirm-modal'

// Phase 30 UPD-04 — desktop-only "new update available" card.
// SHA-keyed dismissal (NOT boolean) so a NEWER commit re-shows the card after
// a prior "Later" click. Mirrors install-prompt-banner.tsx for animation +
// localStorage pattern; differs in: dismissal granularity (SHA vs boolean),
// trigger source (useSoftwareUpdate vs beforeinstallprompt), position
// (bottom-right vs bottom-center), platform (desktop vs mobile).
//
// Hot-patch round 4: "Update" no longer navigates anywhere.
// Round 6: confirm modal is now extracted into <UpdateConfirmModal /> so the
// Settings list-row can reuse the same modal.
const DISMISSED_KEY = 'livos:update-notification:dismissed-sha'

function safeFormatRelative(iso: string): string {
	try {
		return formatDistanceToNow(parseISO(iso), {addSuffix: true})
	} catch {
		return ''
	}
}

export function UpdateNotification() {
	const isMobile = useIsMobile()
	const {state, currentVersion, latestVersion} = useSoftwareUpdate()
	const [dismissedSha, setDismissedSha] = useState<string | null>(() =>
		typeof localStorage !== 'undefined' ? localStorage.getItem(DISMISSED_KEY) : null,
	)
	const [confirmOpen, setConfirmOpen] = useState(false)

	// Phase 30 hot-patch round 8 defense-in-depth: even if checkUpdate's cached
	// response says available=true, the deployed SHA (from system.version) and
	// the latest GitHub HEAD SHA must actually differ for us to show the card.
	// This guards against the brief window after an update where the
	// cache-layer hasn't refetched yet but currentVersion.sha is already
	// fresh (system.version is a separate query and refetches independently).
	const shasDiffer =
		!currentVersion?.sha ||
		!latestVersion?.sha ||
		currentVersion.sha !== latestVersion.sha

	const visible =
		!isMobile &&
		state === 'update-available' &&
		!!latestVersion?.sha &&
		latestVersion.sha !== dismissedSha &&
		shasDiffer

	const handleLater = () => {
		if (!latestVersion?.sha) return
		localStorage.setItem(DISMISSED_KEY, latestVersion.sha)
		setDismissedSha(latestVersion.sha)
	}

	const handleUpdate = () => setConfirmOpen(true)

	const versionLabel = latestVersion?.version || latestVersion?.shortSha

	return (
		<>
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
								<span className='font-mono'>{versionLabel}</span>
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

			<UpdateConfirmModal
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				latestVersion={latestVersion ?? null}
			/>
		</>
	)
}
