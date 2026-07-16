import {motion} from 'framer-motion'
import {useEffect, useRef, useState} from 'react'
import {RiErrorWarningFill} from 'react-icons/ri'
import {useNavigate} from 'react-router-dom'

import {BackupDeviceIcon} from '@/features/backups/components/backup-device-icon'
import {getDeviceNameFromPath} from '@/features/backups/utils/backup-location-helpers'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useSystemDisk} from '@/hooks/use-disk'
import {useNotifications} from '@/hooks/use-notifications'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

function NotificationContent({children}: {children: string}) {
	const contentRef = useRef<HTMLDivElement>(null)
	const [isExpanded, setIsExpanded] = useState(false)
	const [showReadMore, setShowReadMore] = useState(false)

	useEffect(() => {
		if (!contentRef.current) return
		const el = contentRef.current
		const WIGGLE_ROOM = 20
		setShowReadMore(el.scrollHeight > el.clientHeight + WIGGLE_ROOM)
	}, [children])

	return (
		<div className='flex flex-col gap-2'>
			<motion.div
				ref={contentRef}
				initial={false}
				animate={{
					height: isExpanded ? 'auto' : '3em',
				}}
				transition={{
					duration: 0.4,
					ease: [0.32, 0.72, 0, 1],
				}}
				className='overflow-hidden'
				style={{
					WebkitMaskImage:
						isExpanded || !showReadMore ? undefined : 'linear-gradient(to bottom, black, black, transparent)',
				}}
			>
				<div className={cn('text-sm')}>
					{children.split('\n').map((paragraph, index) => (
						<AlertDialogDescription key={index} className={`${index > 0 ? 'mt-4' : ''} text-text-secondary`}>
							{paragraph}
						</AlertDialogDescription>
					))}
				</div>
			</motion.div>
			{showReadMore && (
				<button
					onClick={() => setIsExpanded(true)}
					className='self-center text-xs font-medium text-brand transition-opacity duration-300 hover:opacity-80'
					style={{
						opacity: isExpanded ? 0 : 1,
						pointerEvents: isExpanded ? 'none' : 'auto',
					}}
				>
					{t('read-more')}
				</button>
			)}
		</div>
	)
}

type NotificationContent = {
	title: string
	description: string
	icon?: React.ReactNode
	action?: React.ReactNode
}

/**
 * Parses backup notification ID to extract repository ID if present.
 * Format: "backups-failing" (legacy) or "backups-failing:<repo-id>" (new)
 * TODO: remove support for legacy "backups-failing" notification format
 * that was used in LivOS 1.5 beta 1 and beta 2 (with no repo ID).
 */
function parseBackupNotificationId(notification: string): {repoId: string | null} {
	if (notification.startsWith('backups-failing:') && notification.includes(':')) {
		return {repoId: notification.split(':')[1]}
	}
	return {repoId: null}
}

/**
 * Handles backup-failing notifications by fetching repo details
 * and generating appropriate content with device-specific information.
 */
function getBackupFailingContent(
	notification: string,
	backupRepositoriesQuery: {data?: Array<{id: string; path: string}>},
	onGoToBackups: () => void,
	onClearNotification: () => void,
): NotificationContent {
	const {repoId} = parseBackupNotificationId(notification)

	// Find repository details if we have a repo ID
	const repository = repoId ? backupRepositoriesQuery.data?.find((r) => r.id === repoId) : null

	// Get device name from path if available
	const deviceName = repository?.path ? getDeviceNameFromPath(repository.path) : null

	const actionButtons = (
		<>
			<Button variant='default' size='dialog' onClick={onClearNotification} tabIndex={-1}>
				{t('ok')}
			</Button>
			<AlertDialogAction variant='primary' onClick={onGoToBackups} tabIndex={0}>
				{t('notifications.backups-failing.go-to-backups')}
			</AlertDialogAction>
		</>
	)

	// Use specific content when we have repository details
	if (repository && deviceName) {
		return {
			title: t('notifications.backups-failing.title'),
			description: t('notifications.backups-failing-location.description', {location: deviceName}),
			icon: (
				<div className='relative'>
					<BackupDeviceIcon path={repository.path} className='size-14 opacity-90' />
					<div className='absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-[#FF9500]'>
						<RiErrorWarningFill className='size-5 text-black' />
					</div>
				</div>
			),
			action: actionButtons,
		}
	}

	// Fall back to generic message for legacy format or when repo not found
	return {
		title: t('notifications.backups-failing.title'),
		description: t('notifications.backups-failing.description'),
		action: actionButtons,
	}
}

/**
 * Fallback handler for unknown notification types.
 */
function getDefaultNotificationContent(notification: string): NotificationContent {
	return {
		title: 'Notification',
		description: notification,
	}
}

export function Notifications() {
	// Hooks and state
	const {notifications, clearNotification} = useNotifications()
	const navigate = useNavigate()

	// MED-04: the 'disk-critical' notification id carries no tier, but the disk
	// alert fires at two tiers (warning <1GB, critical <100MB). Read the live
	// system-disk state so the dialog copy reflects the tier that actually fired —
	// a mere warning must not read "critically low". If the reading is unavailable
	// we fall back to the more urgent critical wording (fail-loud).
	const {isDiskLow: diskIsLow, isDiskFull: diskIsFull} = useSystemDisk()

	// Determine if we need to query backup repositories
	// TODO: remove support for legacy "backups-failing" notification format
	// that was used in LivOS 1.5 beta 1 and beta 2 (with no repo ID)
	const hasBackupNotification = notifications.some((n) => n === 'backups-failing' || n.startsWith('backups-failing:'))

	// Query backup repositories (only when needed)
	const backupRepositoriesQuery = trpcReact.backups.getRepositories.useQuery(undefined, {
		enabled: hasBackupNotification,
	})

	// Backups-v2 P0 + Phase 313 SMART: these are ADMIN-actionable only (their CTAs
	// lead to admin-gated screens/mutations, and a self-test is adminProcedure).
	// Non-admins must neither see them nor be able to snooze them away from the
	// admin — filter WITHOUT clearing, so the notification stays queued for the
	// admin's session. Entries are BASE KINDS (no ':'-suffix); the membership test
	// below collapses any suffixed id to its base kind first.
	const ADMIN_ONLY_NOTIFICATIONS = [
		'backups-engine-unavailable',
		'backups-not-configured',
		'update-failed',
		'disk-critical',
		'smart-failing',
		'smart-unavailable',
		'smart-permission-denied',
		// Phase 326 HW-01 — UPS power alerts (ups-watch job): admin-actionable host
		// power events, gated the same way as the disk/SMART host alerts.
		'ups-power-loss',
		'ups-power-restored',
	]
	const {isAdmin, isLoading: isLoadingUser} = useCurrentUser()
	const canSeeAdminNotifications = !isLoadingUser && isAdmin

	// Phase 30 hot-patch round 3: WhatsNewModal removed (Umbrel-leftover content).
	// `livos-updated` notification is silently cleared — the new
	// `<UpdateNotification />` desktop card already conveys "you just updated" via its
	// commit message, and the bottom-right card disappears once .deployed-sha == HEAD.
	const standardNotifications = notifications
		.filter((n) => n !== 'livos-updated')
		// WARNING-3: collapse any ':'-suffixed id to its base kind before the
		// admin-gate membership test — the SMART scan raises smart-failing:<deviceId>
		// / smart-unavailable:<deviceId> (suffixed), so a bare list entry would never
		// match and a non-admin would still see them. Same prefix-collapse the
		// backend uses in channel-types.ts floorKey (id.split(':')[0]). The bare
		// entries (backups-*, update-failed, disk-critical, smart-permission-denied)
		// carry no ':', so split is a no-op and they stay gated exactly as before.
		.filter((n) => canSeeAdminNotifications || !ADMIN_ONLY_NOTIFICATIONS.includes(n.split(':')[0]))
	const showWhatsNew = notifications.includes('livos-updated')

	useEffect(() => {
		if (showWhatsNew) {
			clearNotification('livos-updated')
		}
	}, [showWhatsNew, clearNotification])

	// Get notification content based on notification type
	const getNotificationContent = (notification: string): NotificationContent => {
		// Handle backup-failing notifications (both legacy and new format with repo ID)
		if (notification === 'backups-failing' || notification.startsWith('backups-failing:')) {
			const onGoToBackups = () => {
				clearNotification(notification)
				navigate('/settings/backups/configure')
			}
			const onClearNotification = () => {
				clearNotification(notification)
			}
			return getBackupFailingContent(notification, backupRepositoriesQuery, onGoToBackups, onClearNotification)
		}

		// Backups-v2 P0: the kopia engine is missing/outdated — nothing can back
		// up until an update fixes it. Surfaced instead of the old silent no-op.
		if (notification === 'backups-engine-unavailable') {
			return {
				title: 'Backups are not working',
				description:
					'The backup engine on this device is missing or outdated, so no backups can run.\nUpdate LivOS from Settings → Software Update — the engine is installed automatically with the update.',
				action: (
					<>
						<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
							{t('ok')}
						</Button>
						<AlertDialogAction
							variant='primary'
							onClick={() => {
								clearNotification(notification)
								navigate('/settings')
							}}
							tabIndex={0}
						>
							Open Settings
						</AlertDialogAction>
					</>
				),
			}
		}

		// Backups-v2 P0: weekly reminder that the box has no backup destination.
		// Dismissing snoozes it — the backend re-adds it after a week without one.
		if (notification === 'backups-not-configured') {
			return {
				title: 'This device is not backed up',
				description:
					"No backup location is set up, so your apps, files and settings aren't protected yet.\nConnect a USB drive or a network share (NAS) and set up automatic backups — it takes about a minute.",
				action: (
					<>
						<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
							Remind me later
						</Button>
						<AlertDialogAction
							variant='primary'
							onClick={() => {
								clearNotification(notification)
								navigate('/settings/backups/setup')
							}}
							tabIndex={0}
						>
							Set up backups
						</AlertDialogAction>
					</>
				),
			}
		}

		// Default fallback for unknown notifications
		// Phase 310-04 (ALERT-02) — a system update failed; the box may be in a
		// partially-updated state. Critical, admin-only. Mirrors the
		// backups-engine-unavailable block shape.
		if (notification === 'update-failed') {
			return {
				title: t('notifications.update-failed.title'),
				description: t('notifications.update-failed.description'),
				action: (
					<>
						<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
							{t('ok')}
						</Button>
						<AlertDialogAction
							variant='primary'
							onClick={() => {
								clearNotification(notification)
								navigate('/settings')
							}}
							tabIndex={0}
						>
							Open Settings
						</AlertDialogAction>
					</>
				),
			}
		}

		// Phase 310-04 (ALERT-02) — disk space low (server-side scheduled check).
		// Critical/warning, admin-only. MED-04: reflect the ACTUAL tier — only the
		// warning tier (low but not full) softens the copy; anything else (full, or
		// an unavailable reading) keeps the urgent "critically low" wording.
		if (notification === 'disk-critical') {
			const isWarningTier = diskIsLow && !diskIsFull
			return {
				title: isWarningTier ? t('notifications.disk-low.title') : t('notifications.disk-critical.title'),
				description: isWarningTier
					? t('notifications.disk-low.description')
					: t('notifications.disk-critical.description'),
				action: (
					<>
						<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
							{t('ok')}
						</Button>
						<AlertDialogAction
							variant='primary'
							onClick={() => {
								clearNotification(notification)
								navigate('/settings')
							}}
							tabIndex={0}
						>
							Open Settings
						</AlertDialogAction>
					</>
				),
			}
		}

		// Phase 326-05 (HW-01) — UPS mains power lost (running on battery). Admin-only,
		// raised by the ups-watch scheduler job. upsmon (not this alert) owns shutdown.
		if (notification === 'ups-power-loss') {
			return {
				title: t('notifications.ups-power-loss.title'),
				description: t('notifications.ups-power-loss.description'),
				action: (
					<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={0}>
						{t('ok')}
					</Button>
				),
			}
		}

		// Phase 326-05 (HW-01) — UPS mains power restored (back on utility power).
		if (notification === 'ups-power-restored') {
			return {
				title: t('notifications.ups-power-restored.title'),
				description: t('notifications.ups-power-restored.description'),
				action: (
					<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={0}>
						{t('ok')}
					</Button>
				),
			}
		}

			// Phase 313-04 (SMART-01/SMART-03) — a drive is predicted to fail
			// (SATA Backblaze-5 / NVMe critical). Admin-only, per-device id
			// (smart-failing:<deviceId>) → deep-link to Settings > Storage.
			if (notification === 'smart-failing' || notification.startsWith('smart-failing:')) {
				return {
					title: t('notifications.smart-failing.title'),
					description: t('notifications.smart-failing.description'),
					action: (
						<>
							<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
								{t('ok')}
							</Button>
							<AlertDialogAction
								variant='primary'
								onClick={() => {
									clearNotification(notification)
									navigate('/settings/storage')
								}}
								tabIndex={0}
							>
								Open Storage settings
							</AlertDialogAction>
						</>
					),
				}
			}

			// Phase 313-04 (SMART-04) — SMART could not be read for a drive (e.g. a
			// USB bridge that doesn't pass SMART through). Admin-only, per-device id
			// (smart-unavailable:<deviceId>). Honest — NOT a failure claim.
			if (notification === 'smart-unavailable' || notification.startsWith('smart-unavailable:')) {
				return {
					title: t('notifications.smart-unavailable.title'),
					description: t('notifications.smart-unavailable.description'),
					action: (
						<>
							<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
								{t('ok')}
							</Button>
							<AlertDialogAction
								variant='primary'
								onClick={() => {
									clearNotification(notification)
									navigate('/settings/storage')
								}}
								tabIndex={0}
							>
								Open Storage settings
							</AlertDialogAction>
						</>
					),
				}
			}

			// Phase 331-03 (FIX-03) — the installed Jellyfin catalog template carries an
			// explicit non-GPU permissions list, so the MEDIA-02 GPU preconfig was
			// respected-but-skipped. Informational (the never-silent arm); deep-links to
			// the app page where the operator can toggle GPU access manually.
			if (notification === 'jellyfin-catalog-gpu-preconfig-skipped') {
				return {
					title: t('notifications.jellyfin-catalog-gpu-preconfig-skipped.title'),
					description: t('notifications.jellyfin-catalog-gpu-preconfig-skipped.description'),
					action: (
						<>
							<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
								{t('ok')}
							</Button>
							<AlertDialogAction
								variant='primary'
								onClick={() => {
									clearNotification(notification)
									navigate('/app-store/jellyfin')
								}}
								tabIndex={0}
							>
								{t('notifications.jellyfin-catalog-gpu-preconfig-skipped.open-app')}
							</AlertDialogAction>
						</>
					),
				}
			}

			// Phase 313-04 (SMART-04) — smartctl reads were denied (the privileged
			// sudoers grant is missing on this box). Bare, system-level id. Admin-only.
			if (notification === 'smart-permission-denied') {
				return {
					title: t('notifications.smart-permission-denied.title'),
					description: t('notifications.smart-permission-denied.description'),
					action: (
						<>
							<Button variant='default' size='dialog' onClick={() => clearNotification(notification)} tabIndex={-1}>
								{t('ok')}
							</Button>
							<AlertDialogAction
								variant='primary'
								onClick={() => {
									clearNotification(notification)
									navigate('/settings/storage')
								}}
								tabIndex={0}
							>
								Open Storage settings
							</AlertDialogAction>
						</>
					),
				}
			}

			return getDefaultNotificationContent(notification)
	}

	return (
		<>
			{standardNotifications.map((notification) => {
				const content = getNotificationContent(notification)
				return (
					<AlertDialog key={notification} open={true}>
						<AlertDialogContent>
							<AlertDialogHeader>
								{content.icon && <div className='flex items-center justify-center py-2'>{content.icon}</div>}
								<AlertDialogTitle>{content.title}</AlertDialogTitle>
								<NotificationContent>{content.description}</NotificationContent>
							</AlertDialogHeader>
							<AlertDialogFooter>
								{content.action || (
									<AlertDialogAction variant='primary' onClick={() => clearNotification(notification)} tabIndex={0}>
										{t('ok')}
									</AlertDialogAction>
								)}
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				)
			})}
		</>
	)
}
