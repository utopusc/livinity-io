import {useState, useRef, useEffect} from 'react'
import {motion, useSpring, useTransform, type MotionValue} from 'framer-motion'
import {useNavigate} from 'react-router-dom'
import {
	TbLogout,
	TbRefresh,
	TbUsers,
	TbPencil,
	TbPalette,
} from 'react-icons/tb'

import {Orb} from '@/components/ui/orb'
import {trpcReact} from '@/trpc/trpc'
import {useLinkToDialog} from '@/utils/dialog'
import {useUserName} from '@/hooks/use-user-name'
import {t} from '@/utils/i18n'
import {Dialog, DialogPortal, DialogContent, DialogHeader, DialogTitle, DialogFooter} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {AnimatedInputError} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'

interface DockProfileProps {
	mouseX: MotionValue<number>
	iconSize: number
	iconSizeZoomed: number
}

// Animal emoji list for icon picker
const ANIMAL_EMOJIS = ['🦊', '🐼', '🦄', '🐸', '🦁', '🐧', '🦋', '🐬', '🦉', '🐺', '🦈', '🐮', '🐯', '🐰', '🦜', '🐻', '🦒', '🐙', '🦝', '🐨', '🦩', '🐵', '🦕', '🐢']

export function DockProfile({mouseX, iconSize, iconSizeZoomed}: DockProfileProps) {
	const ref = useRef<HTMLDivElement>(null)
	const [menuOpen, setMenuOpen] = useState(false)
	const [showChangeName, setShowChangeName] = useState(false)
	const [showChangeIcon, setShowChangeIcon] = useState(false)
	const navigate = useNavigate()
	const linkToDialog = useLinkToDialog()

	const userQ = trpcReact.user.get.useQuery()
	const userName = userQ.data?.name || 'User'
	const userId = userQ.data?.id || 'default'

	const distance = useTransform(mouseX, (val) => {
		const bounds = ref.current?.getBoundingClientRect() ?? {x: 0, width: 0}
		return val - bounds.x - bounds.width / 2
	})

	const springOpts = {mass: 0.08, stiffness: 170, damping: 16}
	const widthSync = useTransform(distance, [-140, 0, 140], [iconSize, iconSizeZoomed, iconSize])
	const width = useSpring(widthSync, springOpts)

	useEffect(() => {
		if (!menuOpen) return
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false)
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [menuOpen])

	const menuItems: Array<{icon: typeof TbPencil; label: string; action: () => void; danger?: boolean} | {divider: true}> = [
		{icon: TbPencil, label: 'Change name', action: () => { setMenuOpen(false); setShowChangeName(true) }},
		{icon: TbPalette, label: 'Change icon', action: () => { setMenuOpen(false); setShowChangeIcon(true) }},
		{divider: true},
		{icon: TbRefresh, label: 'Restart', action: () => { setMenuOpen(false); navigate(linkToDialog('restart')) }},
		{icon: TbLogout, label: 'Log out', action: () => { setMenuOpen(false); navigate(linkToDialog('logout')) }, danger: true},
	]

	return (
		<>
			<div ref={ref} className='relative'>
				<motion.div
					style={{width, height: width}}
					className='flex cursor-pointer items-center justify-center'
					onClick={() => setMenuOpen(!menuOpen)}
				>
					<Orb state='breathe' className='h-full w-full' userId={userId} initials={userName.charAt(0).toUpperCase()} />
				</motion.div>

				{menuOpen && (
					<motion.div
						initial={{opacity: 0, y: 8, scale: 0.96}}
						animate={{opacity: 1, y: 0, scale: 1}}
						transition={{duration: 0.12}}
						className='absolute bottom-full left-0 mb-3 w-52 overflow-hidden rounded-2xl border border-border-subtle py-1.5 shadow-2xl'
						style={{
							background: 'rgba(255, 255, 255, 0.92)',
							backdropFilter: 'blur(24px)',
							WebkitBackdropFilter: 'blur(24px)',
							boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
						}}
					>
						<div className='flex items-center gap-2.5 px-3.5 pb-2 pt-2'>
							<div className='h-9 w-9 shrink-0'>
								<Orb state='idle' className='h-full w-full' userId={userId} initials={userName.charAt(0).toUpperCase()} />
							</div>
							<div className='min-w-0'>
								<p className='truncate text-[13px] font-semibold text-text-primary'>{userName}</p>
								<p className='text-[11px] text-text-tertiary'>Admin</p>
							</div>
						</div>

						<div className='mx-3 my-1 h-px bg-border-subtle' />

						{menuItems.map((item, i) => {
							if ('divider' in item) return <div key={i} className='mx-3 my-1 h-px bg-border-subtle' />
							const Icon = item.icon
							return (
								<button
									key={i}
									onClick={item.action}
									className={`flex w-full items-center gap-2.5 px-3.5 py-[7px] text-left text-[13px] font-medium transition-colors ${
										item.danger
											? 'text-red-500 hover:bg-red-50'
											: 'text-text-secondary hover:bg-surface-1 hover:text-text-primary'
									}`}
								>
									<Icon className='h-[15px] w-[15px] shrink-0' />
									{item.label}
								</button>
							)
						})}
					</motion.div>
				)}
			</div>

			{/* Change Name Dialog */}
			<ChangeNamePopup open={showChangeName} onOpenChange={setShowChangeName} />

			{/* Change Icon Dialog */}
			<ChangeIconPopup open={showChangeIcon} onOpenChange={setShowChangeIcon} userId={userId} />
		</>
	)
}

// ── Change Name Popup ────────────────────────────────────

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
							<Input placeholder={t('change-name.input-placeholder', {defaultValue: 'Your name'})} value={name} onValueChange={setName} />
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

// ── Change Icon Popup ────────────────────────────────────

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
									// Force re-render by dispatching storage event
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
