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
import {useDebouncedCallback} from '@/features/onboarding-flow/use-debounced-callback'
import {useStepper} from '@/features/onboarding-flow/use-stepper'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'
import {trpcReact} from '@/trpc/trpc'

const STORAGE_KEY = 'livos.onb.state'
const BACKEND_RESUME_KEY = 'onboarding_state'

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

	// Persist on every change. localStorage path is the always-available fallback
	// (covers unauth steps 0-1 before AccountStep registers + logs in). Backend
	// path (137-04) hydrates once the user is logged in and survives device
	// switch: a /onboarding visit on another browser with the same account
	// resumes mid-wizard.
	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({idx: stepper.idx, data}))
		} catch {}
	}, [stepper.idx, data])

	// Phase 137-04 — backend resume: read once on mount when logged in.
	const isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem(JWT_LOCAL_STORAGE_KEY)
	const backendResumeQ = trpcReact.preferences.get.useQuery(
		{keys: [BACKEND_RESUME_KEY]},
		{enabled: isLoggedIn, retry: false, staleTime: Infinity},
	)
	const backendHydratedRef = useRef(false)
	useEffect(() => {
		if (backendHydratedRef.current) return
		if (!backendResumeQ.isSuccess) return
		backendHydratedRef.current = true
		const raw = (backendResumeQ.data as Record<string, unknown> | undefined)?.[BACKEND_RESUME_KEY]
		if (typeof raw !== 'string' || raw.length === 0) return
		try {
			const parsed = JSON.parse(raw) as {idx?: number; data?: Partial<OnboardingData>}
			if (typeof parsed.idx === 'number' && parsed.idx > 0 && parsed.idx < TOTAL) {
				// Only hydrate if backend has further-along progress than local state.
				if (parsed.idx > stepper.idx) {
					setData((prev) => ({...prev, ...(parsed.data ?? {})}))
					stepper.go(parsed.idx)
				}
			}
		} catch {}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [backendResumeQ.isSuccess, backendResumeQ.data])

	// Write debounced (500ms) — drag-fast slider + rapid step taps don't spam the network.
	const setBackendResume = trpcReact.preferences.set.useMutation()
	const writeBackendResume = useDebouncedCallback((idx: number, snap: OnboardingData) => {
		if (!isLoggedIn) return
		setBackendResume.mutate({key: BACKEND_RESUME_KEY, value: JSON.stringify({idx, data: snap})})
	}, 500)
	useEffect(() => {
		writeBackendResume(stepper.idx, data)
	}, [stepper.idx, data, writeBackendResume])

	// Phase 137-05 — Done cleanup. Clear backend resume key before navigating
	// to dashboard so a fresh login on the same account doesn't re-resume the
	// wizard. localStorage cleared inline at the DoneStep onEnter handler.
	const deleteBackendResume = trpcReact.preferences.delete.useMutation()

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
									// Best-effort backend cleanup (don't block navigation on it).
									deleteBackendResume.mutate({key: BACKEND_RESUME_KEY})
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

export default function SetupWizardV2() {
	return (
		<SoundProvider>
			<WizardInner />
		</SoundProvider>
	)
}
