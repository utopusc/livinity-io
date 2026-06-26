import {useState} from 'react'
import {AnimatePresence, motion} from 'framer-motion'
import {RiArrowUpCircleFill} from 'react-icons/ri'
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
						className='fixed bottom-4 right-4 z-[80] flex w-80 flex-col gap-4 overflow-hidden rounded-2xl border border-border-default bg-card-bg px-5 py-4 text-text-primary shadow-2xl'
						role='dialog'
						aria-label='Software update available'
					>
						<div className='flex items-center gap-3'>
							<span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand'>
								<RiArrowUpCircleFill className='h-5 w-5' />
							</span>
							<span className='text-[15px] font-semibold tracking-tight text-text-primary'>New update available</span>
						</div>
						<div className='flex flex-col gap-1'>
							<p className='text-sm text-text-secondary'>
								<span className='font-mono'>{versionLabel}</span>
								{' — '}
								{latestVersion.message.split('\n')[0].slice(0, 80)}
							</p>
							<p className='text-xs text-text-tertiary'>
								{latestVersion.author}
								{latestVersion.committedAt && `, ${safeFormatRelative(latestVersion.committedAt)}`}
							</p>
						</div>
						<div className='flex items-center gap-2'>
							<button
								onClick={handleUpdate}
								className='flex-1 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-lighter active:scale-95'
							>
								Update
							</button>
							<button
								onClick={handleLater}
								className='rounded-full border border-border-default px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-2 active:scale-95'
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
