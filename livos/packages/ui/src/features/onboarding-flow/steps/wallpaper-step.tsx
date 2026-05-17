import {useEffect, useState} from 'react'

import {animatedWallpaperIds, animatedWallpapers} from '@/components/animated-wallpapers'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'
import {trpcReact} from '@/trpc/trpc'

import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

/* =========================================================
   WallpaperStep — Phase 135-G rewrite per user direction
   2026-05-17: "wallpaper kismini neden tema bolumunden
   ayarlamiyorsun?" Uses the same registry + tRPC mutation as
   the Settings wallpaper picker (animatedWallpapers +
   user.set). No more 6 mock tiles — the wizard now offers
   exactly the wallpapers LivOS actually ships.
   ========================================================= */

function fmtTime(d: Date): string {
	const hh = String(d.getHours()).padStart(2, '0')
	const mm = String(d.getMinutes()).padStart(2, '0')
	return `${hh}:${mm}`
}

function useNow(): string {
	const [t, setT] = useState(() => fmtTime(new Date()))
	useEffect(() => {
		const tk = setInterval(() => setT(fmtTime(new Date())), 30 * 1000)
		return () => clearInterval(tk)
	}, [])
	return t
}

type Props = {
	data: OnboardingData
	setData: (next: OnboardingData) => void
	onContinue: () => void
	onBack: () => void
}

export function WallpaperStep({data, setData, onContinue, onBack}: Props) {
	const now = useNow()

	// Real wallpaper IDs from the registry. LivOS currently ships ['fluid'].
	// As more wallpapers are added to animatedWallpapers, they automatically
	// appear here without further wizard changes.
	const ids = animatedWallpaperIds
	const selectedId = ids.includes(data.wallpaper as (typeof ids)[number])
		? (data.wallpaper as (typeof ids)[number])
		: ids[0]
	const selected = animatedWallpapers[selectedId]
	const PreviewComponent = selected.component

	// Real wallpaper persistence — same mutation Settings uses (user.set with wallpaper).
	const userSetMut = trpcReact.user.set.useMutation()
	const utils = trpcReact.useUtils()
	const onPick = (id: (typeof ids)[number]) => {
		setData({...data, wallpaper: id})
		if (!localStorage.getItem(JWT_LOCAL_STORAGE_KEY)) return
		userSetMut.mutate(
			{wallpaper: id},
			{
				onSuccess: () => {
					utils.user.get.invalidate()
					utils.user.wallpaper.invalidate()
				},
			},
		)
	}

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 20}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>03 · Make it yours</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Choose a <em>wallpaper</em>
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Live preview shows how your dashboard will look. Change anytime in Settings.
				</p>
			</div>

			{/* Live preview — renders the actual wallpaper component LivOS uses.
			    Same component as the dashboard background; what you see is what you get. */}
			<div className='wp-preview fade-up d1'>
				<div
					className='wp-preview-bg'
					style={{
						position: 'relative',
						overflow: 'hidden',
						borderRadius: 16,
						aspectRatio: '16 / 7',
					}}
				>
					<PreviewComponent className='absolute inset-0' />
					<div
						className='wp-preview-topbar'
						style={{
							position: 'relative',
							zIndex: 1,
							color: 'var(--fg)',
							padding: 14,
							display: 'flex',
							justifyContent: 'space-between',
						}}
					>
						<div className='wp-preview-brand'>
							<span className='wp-preview-mark'></span>
							<span className='wp-preview-name'>{data.name || 'Bruce'}</span>
						</div>
						<div className='wp-preview-clock'>
							<div className='wp-preview-time'>{now}</div>
						</div>
					</div>
				</div>
			</div>

			{/* Tile grid — one tile per real wallpaper. LivOS currently ships 1
			    (fluid). The tile preview is the actual rendered component, so the
			    thumbnail is honest. Click commits via user.set mutation. */}
			<div
				className='wallpaper-grid fade-up d2'
				style={{
					gridTemplateColumns: `repeat(${Math.min(ids.length, 3)}, minmax(0, 1fr))`,
				}}
			>
				{ids.map((id) => {
					const def = animatedWallpapers[id]
					const TileComponent = def.component
					const on = id === selectedId
					return (
						<button
							key={id}
							className={`wallpaper-tile ${on ? 'on' : ''}`}
							onClick={() => onPick(id)}
							aria-label={`Select ${def.name} wallpaper`}
							style={{position: 'relative', overflow: 'hidden'}}
						>
							<TileComponent className='absolute inset-0' />
							<span className='check' style={{position: 'absolute', top: 8, right: 8, zIndex: 2}}>
								<Icon name='check' size={12} />
							</span>
							<span
								className='name'
								style={{position: 'absolute', left: 8, bottom: 8, zIndex: 2, color: 'white'}}
							>
								{def.name}
							</span>
						</button>
					)
				})}
			</div>

			{ids.length === 1 && (
				<p
					style={{
						fontSize: 12,
						color: 'var(--fg-mute)',
						textAlign: 'center',
						margin: 0,
					}}
				>
					More wallpapers coming in a future release. You can change anytime from Settings.
				</p>
			)}

			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				continueLabel='Continue'
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
