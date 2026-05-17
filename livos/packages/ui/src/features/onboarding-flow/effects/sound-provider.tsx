import {createContext, useCallback, useContext, useRef, useState, type ReactNode} from 'react'

export type SoundKind = 'click' | 'next' | 'back' | 'type' | 'success' | 'error'

type SoundCtx = {
	enabled: boolean
	play: (kind: SoundKind) => void
	toggle: () => void
}

const SoundContext = createContext<SoundCtx>({enabled: false, play: () => {}, toggle: () => {}})

const STORAGE_KEY = 'livos.onb.sound'

/**
 * Web Audio API UI sound provider. Ported from reference effects.jsx
 * SoundProvider. Pure oscillator-based clicks/chirps — no asset files.
 * Persists enabled state in localStorage; respects autoplay policy (sound
 * stays off until user gesture enables it).
 */
export function SoundProvider({children}: {children: ReactNode}) {
	const [enabled, setEnabled] = useState<boolean>(() => {
		try {
			return localStorage.getItem(STORAGE_KEY) === 'on'
		} catch {
			return false
		}
	})
	const ctxRef = useRef<AudioContext | null>(null)

	const ensure = useCallback(() => {
		if (!ctxRef.current) {
			try {
				const Ctor =
					(window.AudioContext as typeof AudioContext) ??
					((window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext as
						| typeof AudioContext
						| undefined)
				if (Ctor) ctxRef.current = new Ctor()
			} catch {}
		}
		return ctxRef.current
	}, [])

	const play = useCallback(
		(kind: SoundKind) => {
			if (!enabled) return
			const ctx = ensure()
			if (!ctx) return
			const t0 = ctx.currentTime

			const makeOsc = (
				freq: number,
				type: OscillatorType = 'sine',
				dur = 0.12,
				gain = 0.06,
			) => {
				const osc = ctx.createOscillator()
				const g = ctx.createGain()
				osc.type = type
				osc.frequency.value = freq
				g.gain.value = 0
				g.gain.linearRampToValueAtTime(gain, t0 + 0.005)
				g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
				osc.connect(g).connect(ctx.destination)
				osc.start(t0)
				osc.stop(t0 + dur + 0.02)
			}

			if (kind === 'click') makeOsc(1200, 'square', 0.04, 0.04)
			else if (kind === 'next') {
				makeOsc(520, 'sine', 0.18, 0.05)
				setTimeout(() => makeOsc(780, 'sine', 0.18, 0.04), 50)
			} else if (kind === 'back') makeOsc(360, 'sine', 0.18, 0.04)
			else if (kind === 'type') makeOsc(2100 + Math.random() * 800, 'square', 0.012, 0.014)
			else if (kind === 'success') {
				;[523, 659, 784, 1047].forEach((f, i) =>
					setTimeout(() => makeOsc(f, 'sine', 0.32, 0.06), i * 90),
				)
			} else if (kind === 'error') makeOsc(180, 'sawtooth', 0.18, 0.05)
		},
		[enabled, ensure],
	)

	const toggle = useCallback(() => {
		setEnabled((v) => {
			const next = !v
			try {
				localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
			} catch {}
			if (next) {
				const ctx = ensure()
				if (ctx && ctx.state === 'suspended') ctx.resume()
				setTimeout(() => {
					const c = ensure()
					if (!c) return
					const o = c.createOscillator()
					const g = c.createGain()
					o.type = 'sine'
					o.frequency.value = 880
					g.gain.value = 0
					g.gain.linearRampToValueAtTime(0.05, c.currentTime + 0.005)
					g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18)
					o.connect(g).connect(c.destination)
					o.start()
					o.stop(c.currentTime + 0.2)
				}, 10)
			}
			return next
		})
	}, [ensure])

	return <SoundContext.Provider value={{enabled, play, toggle}}>{children}</SoundContext.Provider>
}

export function useSound() {
	return useContext(SoundContext)
}

export function SoundToggle() {
	const {enabled, toggle} = useSound()
	return (
		<button
			className={`fx-sound-toggle ${enabled ? 'on' : ''}`}
			onClick={toggle}
			aria-label={enabled ? 'Disable sounds' : 'Enable sounds'}
			title={enabled ? 'Sounds on' : 'Sounds off'}
		>
			{enabled ? (
				<svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
					<path d='M3 10v4h4l5 4V6L7 10H3z' />
					<path d='M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14' />
				</svg>
			) : (
				<svg viewBox='0 0 24 24' width='14' height='14' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'>
					<path d='M3 10v4h4l5 4V6L7 10H3z' />
					<path d='M22 9l-6 6M16 9l6 6' />
				</svg>
			)}
		</button>
	)
}
