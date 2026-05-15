import {useEffect, useRef, useState} from 'react'
import {motion} from 'framer-motion'
import {useNavigate} from 'react-router-dom'
import {TbLogout, TbPalette, TbPencil, TbRefresh} from 'react-icons/tb'

import {trpcReact} from '@/trpc/trpc'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useLinkToDialog} from '@/utils/dialog'
import {useUserName} from '@/hooks/use-user-name'
import {onWindowDragDrop, useWindowDragState} from '@/providers/window-drag-state'
import {cn} from '@/shadcn-lib/utils'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {AnimatedInputError, Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'
import {t} from '@/utils/i18n'

/**
 * v36 LivOS Design Port — TopBar v2 (Phase 130-05 + 130-06 expand).
 *
 * Reference: `Downloads/topbar.html` (user-supplied 2026-05-15).
 *
 * COMPACT state (default, max-width 720px):
 *   Left   — avatar + name pill (click → dropdown).
 *   Center — brand donut (40×40 round button, donut mark 24×24).
 *   Right  — live clock + "Istanbul · 18°C" location row.
 *
 * EXPANDED state (max-width 1180px, ~550ms ease-out):
 *   The bar widens and reveals six nav-launcher pills on either side of
 *   the brand donut:
 *     Home · Apps · Files       — left of logo
 *     Liv  · Storage · Settings — right of logo
 *   Each link opens its corresponding dock window via windowManager
 *   (window-only paradigm preserved per feedback_livos_window_logic).
 *
 * Trigger: hovering THE LOGO toggles expansion; cursor leaving the
 * whole bar collapses it again. This way once expanded the user can
 * use the revealed nav links without the bar snapping shut. Per
 * 2026-05-15 user direction ("Logonun uzerine geldigimde buyumesi
 * gerekiyordu ... genislemesi").
 *
 * Reuses the old DockProfile dropdown actions (ChangeName + ChangeIcon
 * popups) inline so the entry point and the destination both move with
 * the avatar.
 */

const ANIMAL_EMOJIS = [
	'🦊', '🐼', '🦄', '🐸', '🦁', '🐧', '🦋', '🐬', '🦉', '🐺', '🦈', '🐮',
	'🐯', '🐰', '🦜', '🐻', '🦒', '🐙', '🦝', '🐨', '🦩', '🐵', '🦕', '🐢',
]

export function TopBar() {
	const isMobile = useIsMobile()
	if (isMobile) return null
	return <TopBarDesktop />
}

function TopBarDesktop() {
	const navigate = useNavigate()
	const linkToDialog = useLinkToDialog()
	const {user} = useCurrentUser()

	const userQ = trpcReact.user.get.useQuery()
	const userName = userQ.data?.name || user?.name || 'User'
	// User shape varies between legacy single-user (no `id`) and multi-user
	// modes; fall back to the avatar-storage default for legacy mode.
	const userId = (userQ.data as {id?: string} | undefined)?.id ?? 'default'
	const initial = (userName.trim().charAt(0) || 'L').toUpperCase()

	const [menuOpen, setMenuOpen] = useState(false)
	const [showChangeName, setShowChangeName] = useState(false)
	const [showChangeIcon, setShowChangeIcon] = useState(false)
	const profileWrapRef = useRef<HTMLDivElement>(null)
	const dropZoneRef = useRef<HTMLDivElement>(null)

	// Phase 130-08: bar only expands while a window is being dragged. Logo
	// hover no longer triggers expansion per user direction 2026-05-15
	// ("eger elimde pencereyi surukluyor isem genislesin").
	const dragState = useWindowDragState()
	const isExpanded = dragState.isDragging
	const [isDragOverShelf, setIsDragOverShelf] = useState(false)

	// Pinned-windows shelf — persisted to localStorage so refresh keeps the
	// shelf intact. Future phase reads this array to keep the actual
	// WindowState alive even when the UI is reloaded.
	const [pinnedWindowIds, setPinnedWindowIds] = useState<string[]>(() => {
		if (typeof window === 'undefined') return []
		try {
			const raw = window.localStorage.getItem('liv:topbar:pinnedWindows')
			return raw ? JSON.parse(raw) : []
		} catch {
			return []
		}
	})
	useEffect(() => {
		if (typeof window === 'undefined') return
		window.localStorage.setItem('liv:topbar:pinnedWindows', JSON.stringify(pinnedWindowIds))
	}, [pinnedWindowIds])

	// Hit-test cursor against the drop-zone rect while a drag is active so
	// the shelf can highlight when the user is hovering inside it.
	useEffect(() => {
		if (!dragState.isDragging) {
			setIsDragOverShelf(false)
			return
		}
		const onMove = (e: MouseEvent) => {
			const rect = dropZoneRef.current?.getBoundingClientRect()
			if (!rect) return
			const inside = e.clientX >= rect.left && e.clientX <= rect.right
				&& e.clientY >= rect.top && e.clientY <= rect.bottom
			setIsDragOverShelf(inside)
		}
		document.addEventListener('mousemove', onMove)
		return () => document.removeEventListener('mousemove', onMove)
	}, [dragState.isDragging])

	// Drop subscriber: when the user releases over the shelf, pin.
	useEffect(() => {
		const unsubscribe = onWindowDragDrop((event) => {
			const rect = dropZoneRef.current?.getBoundingClientRect()
			if (!rect) return
			const inside = event.clientX >= rect.left && event.clientX <= rect.right
				&& event.clientY >= rect.top && event.clientY <= rect.bottom
			if (inside && !pinnedWindowIds.includes(event.windowId)) {
				setPinnedWindowIds((prev) => [...prev, event.windowId])
			}
		})
		return unsubscribe
	}, [pinnedWindowIds])

	useEffect(() => {
		if (!menuOpen) return
		const handler = (e: MouseEvent) => {
			if (profileWrapRef.current && !profileWrapRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [menuOpen])

	const unpinWindow = (windowId: string) => {
		setPinnedWindowIds((prev) => prev.filter((id) => id !== windowId))
	}

	const menuItems: Array<
		| {icon: typeof TbPencil; label: string; action: () => void; danger?: boolean}
		| {divider: true}
	> = [
		{icon: TbPencil, label: 'Change name', action: () => { setMenuOpen(false); setShowChangeName(true) }},
		{icon: TbPalette, label: 'Change icon', action: () => { setMenuOpen(false); setShowChangeIcon(true) }},
		{divider: true},
		{icon: TbRefresh, label: 'Restart', action: () => { setMenuOpen(false); navigate(linkToDialog('restart')) }},
		{icon: TbLogout, label: 'Log out', action: () => { setMenuOpen(false); navigate(linkToDialog('logout')) }, danger: true},
	]

	return (
		<>
			<motion.div
				initial={{translateY: -40, opacity: 0}}
				animate={{translateY: 0, opacity: 1}}
				transition={{type: 'spring', stiffness: 280, damping: 24, delay: 0.1}}
				className='pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-6 pt-[18px]'
				role='banner'
				aria-label='Top bar'
			>
				<nav
					className={cn(
						'pointer-events-auto grid h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-full border bg-card-bg/78 px-3.5 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55',
						// Compact 580px ➜ expanded 1180px. Slower 1400ms duration per
						// user request 2026-05-15 ("cok hizli genisliyor biraz yavas
						// genislesin"). Triggered only while a window is dragged;
						// the center column swaps the brand donut for the pinned-
						// windows drop-zone during expansion.
						'transition-[max-width,border-color,box-shadow] duration-[1400ms] ease-out-v36',
						isExpanded
							? 'max-w-[1180px] border-line-strong shadow-[0_18px_50px_-28px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_50px_-20px_rgba(0,0,0,0.6)]'
							: 'max-w-[580px] border-line shadow-none',
					)}
					aria-label='Top bar'
				>
					{/* LEFT — profile (pill enlarged so the hover bg wraps the
					    avatar + name with breathing room equal to the text height). */}
					<div className='flex min-w-0 items-center justify-start'>
						<div ref={profileWrapRef} className='relative min-w-0'>
							<button
								type='button'
								onClick={() => setMenuOpen((open) => !open)}
								className='inline-flex max-w-full items-center gap-2.5 rounded-full px-2 py-2 text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
								aria-haspopup='menu'
								aria-expanded={menuOpen}
							>
								<span
									className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white'
									style={{
										background: 'linear-gradient(135deg, #ff8a65, #f06292)',
										boxShadow: '0 4px 12px -4px rgba(240, 98, 146, 0.5)',
										letterSpacing: '-0.01em',
									}}
									aria-hidden='true'
								>
									{initial}
								</span>
								<span className='truncate pr-2 text-[14px] font-medium tracking-[-0.005em]'>
									{userName}
								</span>
							</button>

							{menuOpen && (
								<motion.div
									initial={{opacity: 0, y: -8, scale: 0.97}}
									animate={{opacity: 1, y: 0, scale: 1}}
									transition={{duration: 0.12}}
									className='absolute left-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-line bg-card-bg/95 py-1.5 backdrop-blur-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]'
									role='menu'
								>
									<div className='flex items-center gap-2.5 px-3.5 pb-2 pt-2'>
										<span
											className='grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white'
											style={{
												background: 'linear-gradient(135deg, #ff8a65, #f06292)',
												boxShadow: '0 6px 18px -6px rgba(240, 98, 146, 0.55)',
											}}
											aria-hidden='true'
										>
											{initial}
										</span>
										<div className='min-w-0'>
											<p className='truncate text-[13px] font-semibold text-[color:var(--fg)]'>{userName}</p>
											<p className='text-[11px] text-[color:var(--fg-faint)]'>Admin</p>
										</div>
									</div>
									<div className='mx-3 my-1 h-px bg-line' />
									{menuItems.map((item, i) => {
										if ('divider' in item) return <div key={i} className='mx-3 my-1 h-px bg-line' />
										const Icon = item.icon
										return (
											<button
												key={i}
												type='button'
												onClick={item.action}
												className={`flex w-full items-center gap-2.5 px-3.5 py-[7px] text-left text-[13px] font-medium transition-colors ${
													item.danger
														? 'text-red-500 hover:bg-red-500/10'
														: 'text-[color:var(--fg-dim)] hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
												}`}
												role='menuitem'
											>
												<Icon className='h-[15px] w-[15px] shrink-0' />
												{item.label}
											</button>
										)
									})}
								</motion.div>
							)}
						</div>
					</div>

					{/* CENTER — collapsed: brand donut (purely decorative now, no
					    longer triggers expand). Expanded (while user drags a
					    window): pinned-windows drop-zone shelf. */}
					<div className='flex min-w-0 items-center justify-center'>
						{!isExpanded ? (
							<div className='flex items-center justify-center'>
								<span
									aria-hidden='true'
									className='relative inline-block h-6 w-6 rounded-full bg-[color:var(--fg)]'
								>
									<span
										className='absolute rounded-full bg-[color:var(--bg)]'
										style={{inset: 7}}
									/>
								</span>
							</div>
						) : (
							<div
								ref={dropZoneRef}
								className={cn(
									'flex min-h-[44px] w-full max-w-[640px] items-center justify-center gap-2 rounded-full border border-dashed px-3 transition-colors',
									isDragOverShelf
										? 'border-[color:var(--fg)] bg-[color:var(--bg-2)]'
										: 'border-line',
								)}
							>
								{pinnedWindowIds.length === 0 ? (
									<span className='select-none whitespace-nowrap text-[12px] font-medium text-[color:var(--fg-faint)]'>
										Drag here to pin
									</span>
								) : (
									<div className='flex items-center gap-1.5 overflow-x-auto'>
										{pinnedWindowIds.map((id) => (
											<PinnedWindowChip key={id} windowId={id} onUnpin={() => unpinWindow(id)} />
										))}
									</div>
								)}
							</div>
						)}
					</div>

					{/* RIGHT — clock + location (always visible). */}
					<div className='flex items-center justify-end pr-1.5'>
						<ClockWithLocation />
					</div>
				</nav>
			</motion.div>

			<ChangeNamePopup open={showChangeName} onOpenChange={setShowChangeName} />
			<ChangeIconPopup open={showChangeIcon} onOpenChange={setShowChangeIcon} userId={userId} />
		</>
	)
}

// ── Pinned-window chip ──────────────────────────────────────────────

/**
 * Visual chip representing a pinned window in the TopBar drop-zone. The
 * pinned window itself stays live in the window manager (or, longer-term,
 * in a persistent shelf that survives a page reload). The chip just shows
 * the user it's still there + offers an unpin affordance on hover.
 *
 * Phase 130-07 ships this as a stub: it surfaces the windowId verbatim
 * (truncated). Follow-up phase wires it to a real WindowState lookup so
 * the chip can display the app icon + title + a live frame thumbnail.
 */
function PinnedWindowChip({windowId, onUnpin}: {windowId: string; onUnpin: () => void}) {
	return (
		<div className='group flex items-center gap-1.5 rounded-full border border-line bg-[color:var(--bg-2)] py-1 pl-2 pr-1 text-[11px] font-medium text-[color:var(--fg)]'>
			<span className='max-w-[140px] truncate'>{windowId.slice(0, 12)}</span>
			<button
				type='button'
				onClick={onUnpin}
				className='grid h-5 w-5 place-items-center rounded-full text-[color:var(--fg-faint)] transition-colors hover:bg-[color:var(--bg)] hover:text-[color:var(--fg)]'
				aria-label='Unpin window'
				title='Unpin'
			>
				<svg viewBox='0 0 16 16' className='h-3 w-3' aria-hidden='true'>
					<path d='M4 4l8 8M12 4L4 12' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' />
				</svg>
			</button>
		</div>
	)
}

// ── Clock ───────────────────────────────────────────────────────────

function ClockWithLocation() {
	const [now, setNow] = useState(() => new Date())

	useEffect(() => {
		// Tick every 30s — we only display HH:MM so per-second is wasteful.
		const id = window.setInterval(() => setNow(new Date()), 30_000)
		return () => window.clearInterval(id)
	}, [])

	const hh = String(now.getHours()).padStart(2, '0')
	const mm = String(now.getMinutes()).padStart(2, '0')

	// 24-hour format, no AM/PM. Location/weather was a hardcoded
	// "Istanbul · 18°C" stub — removed 2026-05-15 ("konumu dogru degil").
	// A real geolocation + weather hook can land in a follow-up phase.
	return (
		<div className='flex items-center rounded-xl px-2.5 py-1 leading-none transition-colors hover:bg-[color:var(--bg-2)]'>
			<span className='whitespace-nowrap font-mono text-[15px] font-medium tracking-[-0.01em] text-[color:var(--fg)] tabular-nums'>
				{hh}:{mm}
			</span>
		</div>
	)
}

// ── Change Name Popup (ported from dock-profile.tsx) ────────────────

function ChangeNamePopup({open, onOpenChange}: {open: boolean; onOpenChange: (v: boolean) => void}) {
	const {name, setName, handleSubmit, formError, isLoading} = useUserName({
		onSuccess: () => onOpenChange(false),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent asChild>
					<form onSubmit={handleSubmit}>
						<fieldset disabled={isLoading} className='flex flex-col gap-5'>
							<DialogHeader>
								<DialogTitle>{t('change-name', {defaultValue: 'Change name'})}</DialogTitle>
							</DialogHeader>
							<Input
								placeholder={t('change-name.input-placeholder', {defaultValue: 'Your name'})}
								value={name}
								onValueChange={setName}
							/>
							<div className='-my-2.5'>
								<AnimatedInputError>{formError}</AnimatedInputError>
							</div>
							<DialogFooter>
								<Button type='submit' size='dialog' variant='primary'>
									{t('confirm', {defaultValue: 'Confirm'})}
								</Button>
								<Button type='button' size='dialog' onClick={() => onOpenChange(false)}>
									{t('cancel', {defaultValue: 'Cancel'})}
								</Button>
							</DialogFooter>
						</fieldset>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

// ── Change Icon Popup (ported from dock-profile.tsx) ────────────────

function ChangeIconPopup({open, onOpenChange, userId}: {open: boolean; onOpenChange: (v: boolean) => void; userId: string}) {
	const currentEmoji = localStorage.getItem(`livinity-avatar-${userId}`) || null
	const [selectedEmoji, setSelectedEmoji] = useState<string | null>(currentEmoji)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Choose your avatar</DialogTitle>
					</DialogHeader>
					<div className='grid grid-cols-6 gap-2 py-2'>
						{ANIMAL_EMOJIS.map((emoji) => (
							<button
								key={emoji}
								onClick={() => setSelectedEmoji(emoji)}
								className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-all ${
									selectedEmoji === emoji
										? 'bg-brand/10 ring-2 ring-brand scale-110'
										: 'hover:bg-surface-1 hover:scale-105'
								}`}
							>
								{emoji}
							</button>
						))}
					</div>
					<DialogFooter>
						<Button
							size='dialog'
							variant='primary'
							disabled={!selectedEmoji}
							onClick={() => {
								if (selectedEmoji) {
									localStorage.setItem(`livinity-avatar-${userId}`, selectedEmoji)
									window.dispatchEvent(new StorageEvent('storage', {key: `livinity-avatar-${userId}`, newValue: selectedEmoji}))
								}
								onOpenChange(false)
							}}
						>
							Save
						</Button>
						<Button size='dialog' onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
