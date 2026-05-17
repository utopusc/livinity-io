import {useEffect, useState} from 'react'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'
import {trpcReact} from '@/trpc/trpc'

import type {OnboardingData} from '../constants'
import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'

const WALLPAPERS = [
	{id: 'fluid', name: 'Fluid', cls: 'wp-fluid animated'},
	{id: 'graphite', name: 'Graphite', cls: 'wp-graphite'},
	{id: 'aurora', name: 'Aurora', cls: 'wp-aurora'},
	{id: 'sand', name: 'Sand', cls: 'wp-sand'},
	{id: 'paper', name: 'Paper', cls: 'wp-paper'},
	{id: 'mono', name: 'Mono', cls: 'wp-mono'},
]

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
	const selected = WALLPAPERS.find((w) => w.id === data.wallpaper) || WALLPAPERS[0]
	const now = useNow()

	// Phase 137-03 — persist the onboarding wallpaper choice to the backend.
	// LivOS currently only renders 'fluid' (see animated-wallpapers.tsx); the
	// other 5 IDs are stored as a preference for future use once more
	// wallpapers ship. Fire-and-forget — Continue is not gated on the write.
	// Phase 137-FIX — gate on JWT presence to avoid 401 spam if user reaches
	// this step unauthed (shouldn't happen in normal flow since AccountStep
	// registers + logs in, but defensive).
	const setPref = trpcReact.preferences.set.useMutation()
	const persist = (id: string) => {
		if (!localStorage.getItem(JWT_LOCAL_STORAGE_KEY)) return
		setPref.mutate({key: 'onboarding_wallpaper', value: id})
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

			<div className='wp-preview fade-up d1'>
				<div className={`wp-preview-bg ${selected.cls}`}>
					<div className='wp-preview-topbar'>
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

			<div className='wallpaper-grid fade-up d2'>
				{WALLPAPERS.map((wp) => (
					<button
						key={wp.id}
						className={`wallpaper-tile ${wp.cls} ${data.wallpaper === wp.id ? 'on' : ''}`}
						onClick={() => {
							setData({...data, wallpaper: wp.id})
							persist(wp.id)
						}}
						aria-label={`Select ${wp.name} wallpaper`}
					>
						<span className='check'>
							<Icon name='check' size={12} />
						</span>
						<span className='name'>{wp.name}</span>
					</button>
				))}
			</div>
			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				continueLabel='Continue'
				hint='↵ to continue · esc for back'
			/>
		</div>
	)
}
