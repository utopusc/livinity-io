import {useCallback, useEffect, useRef, useState} from 'react'

import {DEFAULT_DATA, TOTAL, etaSeconds, type OnboardingData} from '@/features/onboarding-flow/constants'
import {HelpBubble, ParallaxOrbs, SoundProvider, useSound} from '@/features/onboarding-flow/effects'
import {ResumeBanner} from '@/features/onboarding-flow/resume-banner'
import {Step} from '@/features/onboarding-flow/step'
import {AccountStep} from '@/features/onboarding-flow/steps/account-step'
import {ConnectAiStep} from '@/features/onboarding-flow/steps/connect-ai-step'
import {DoneStep} from '@/features/onboarding-flow/steps/done-step'
import {PersonalizeStep} from '@/features/onboarding-flow/steps/personalize-step'
import {WallpaperStep} from '@/features/onboarding-flow/steps/wallpaper-step'
import {WelcomeStep} from '@/features/onboarding-flow/steps/welcome-step'
import {TopBar} from '@/features/onboarding-flow/top-bar'
import {useStepper} from '@/features/onboarding-flow/use-stepper'

const STORAGE_KEY = 'livos.onb.state'

// Phase 135-D — dev-helper: ?step=N seeds activeStep. Tree-shaken in prod.
function getInitialStepFromUrl(): number {
	if (!import.meta.env.DEV) return 0
	const raw = new URLSearchParams(window.location.search).get('step')
	const n = raw == null ? NaN : Number.parseInt(raw, 10)
	if (Number.isFinite(n) && n >= 0 && n < TOTAL) return n
	return 0
}

function readResume(): {idx: number; data: OnboardingData} | null {
	try {
		const saved = localStorage.getItem(STORAGE_KEY)
		if (!saved) return null
		const obj = JSON.parse(saved) as {idx?: number; data?: Partial<OnboardingData>}
		if (typeof obj?.idx !== 'number' || obj.idx <= 0 || obj.idx >= TOTAL) return null
		return {idx: obj.idx, data: {...DEFAULT_DATA, ...(obj.data ?? {})}}
	} catch {
		return null
	}
}

function WizardInner() {
	const sound = useSound()
	const urlStep = getInitialStepFromUrl()
	const resume = urlStep === 0 ? readResume() : null
	const [resumeOffered, setResumeOffered] = useState<boolean>(!!resume)
	const [pendingResume, setPendingResume] = useState<boolean>(!!resume)
	const initialIdx = urlStep || (pendingResume ? 0 : resume?.idx ?? 0)
	const initialData: OnboardingData = resume?.data ?? {...DEFAULT_DATA}

	const stepper = useStepper(TOTAL, initialIdx)
	const [data, setData] = useState<OnboardingData>(initialData)
	const [labelChanging, setLabelChanging] = useState(false)

	// Persist on every change (resume backing — backend handoff comes in 135-F).
	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({idx: stepper.idx, data}))
		} catch {}
	}, [stepper.idx, data])

	// body.step-N drives per-step ambient orb color shifts (CSS in 135-A).
	useEffect(() => {
		const prevClasses = document.body.className.split(/\s+/).filter((c) => !c.startsWith('step-'))
		document.body.className = [...prevClasses, `step-${stepper.idx}`].join(' ').trim()
	}, [stepper.idx])

	// Step name fade animation + transition sound.
	const prevStepRef = useRef(stepper.idx)
	useEffect(() => {
		if (prevStepRef.current === stepper.idx) return
		setLabelChanging(true)
		const t = setTimeout(() => setLabelChanging(false), 60)
		prevStepRef.current = stepper.idx
		sound.play(stepper.dir === 'back' ? 'back' : 'next')
		return () => clearTimeout(t)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [stepper.idx])

	// Keyboard nav: Enter advances, Esc backs.
	useEffect(() => {
		const tryAdvance = () => {
			const btn = document.querySelector<HTMLButtonElement>(
				'.onb-step.is-active .btn-primary:not(:disabled)',
			)
			if (btn) btn.click()
		}
		const onKey = (e: KeyboardEvent) => {
			const inField = (e.target as HTMLElement | null)?.closest('input, textarea, select')
			if (inField) {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault()
					tryAdvance()
				}
				return
			}
			if (e.key === 'Enter') {
				e.preventDefault()
				tryAdvance()
			} else if (e.key === 'Escape') {
				e.preventDefault()
				stepper.back()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [stepper])

	const handleResume = useCallback(() => {
		const saved = readResume()
		if (saved) stepper.go(saved.idx)
		setPendingResume(false)
		setTimeout(() => setResumeOffered(false), 400)
	}, [stepper])
	const handleStartOver = useCallback(() => {
		try {
			localStorage.removeItem(STORAGE_KEY)
		} catch {}
		setData({...DEFAULT_DATA})
		setPendingResume(false)
		setResumeOffered(false)
	}, [])

	const eta = etaSeconds(stepper.idx)

	return (
		<>
			<div className='onb-ambient' aria-hidden='true'>
				<div className='onb-ambient-orb a' />
				<div className='onb-ambient-orb b' />
				<div className='onb-ambient-orb c' />
			</div>
			<ParallaxOrbs />
			<HelpBubble />

			<div className='onb-stage'>
				<TopBar stepper={stepper} labelChanging={labelChanging} eta={eta} />

				{resumeOffered && pendingResume && (
					<div style={{display: 'grid', placeItems: 'center', padding: '12px 0 0'}}>
						<ResumeBanner onResume={handleResume} onStartOver={handleStartOver} />
					</div>
				)}

				<div className='onb-stage-body'>
					<div className='onb-card'>
						<Step stepIndex={0} current={stepper.idx} prev={stepper.prev} dir={stepper.dir}>
							<WelcomeStep
								onStart={stepper.next}
								lang={data.lang}
								setLang={(l) => setData({...data, lang: l})}
							/>
						</Step>
						<Step stepIndex={1} current={stepper.idx} prev={stepper.prev} dir={stepper.dir}>
							<AccountStep data={data} setData={setData} onContinue={stepper.next} onBack={stepper.back} />
						</Step>
						<Step stepIndex={2} current={stepper.idx} prev={stepper.prev} dir={stepper.dir}>
							<WallpaperStep data={data} setData={setData} onContinue={stepper.next} onBack={stepper.back} />
						</Step>
						<Step stepIndex={3} current={stepper.idx} prev={stepper.prev} dir={stepper.dir}>
							<PersonalizeStep
								data={data}
								setData={setData}
								onContinue={stepper.next}
								onSkip={stepper.next}
								onBack={stepper.back}
							/>
						</Step>
						<Step stepIndex={4} current={stepper.idx} prev={stepper.prev} dir={stepper.dir}>
							<ConnectAiStep
								isActive={stepper.idx === 4}
								onContinue={() => {
									sound.play('success')
									stepper.next()
								}}
								onSkip={stepper.next}
								onBack={stepper.back}
							/>
						</Step>
						<Step stepIndex={5} current={stepper.idx} prev={stepper.prev} dir={stepper.dir}>
							<DoneStep
								data={data}
								isActive={stepper.idx === 5}
								onEnter={() => {
									try {
										localStorage.removeItem(STORAGE_KEY)
									} catch {}
									window.location.href = '/'
								}}
							/>
						</Step>
					</div>
				</div>

				<div></div>
			</div>
		</>
	)
}

function PlaceholderStep({title}: {title: string}) {
	return (
		<div className='fade-up' style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='onb-eyebrow'>STEP</div>
			<h1 className='onb-title'>
				{title} <em>step</em>
			</h1>
			<p className='onb-sub'>Wiring coming in 135-E..J. Use the segmented bar to navigate.</p>
		</div>
	)
}

export default function SetupWizardV2() {
	return (
		<SoundProvider>
			<WizardInner />
		</SoundProvider>
	)
}
