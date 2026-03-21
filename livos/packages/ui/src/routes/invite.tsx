import {useState, useEffect, useRef, useCallback} from 'react'
import {motion} from 'framer-motion'
import {useNavigate, useParams} from 'react-router-dom'
import {
	TbArrowRight,
	TbArrowLeft,
	TbUser,
	TbPaint,
	TbSparkles,
	TbCheck,
	TbLoader2,
} from 'react-icons/tb'

import {TextEffect} from '@/components/motion-primitives/text-effect'
import {TransitionPanel} from '@/components/motion-primitives/transition-panel'
import {GlowEffect} from '@/components/motion-primitives/glow-effect'
import LivinityLogo from '@/assets/livinity-logo'
import {StepIndicator} from '@/components/ui/step-indicator'
import {LanguageDropdown} from '@/routes/settings/_components/language-dropdown'
import {animatedWallpapers, animatedWallpaperIds} from '@/components/animated-wallpapers'
import {useWallpaper} from '@/providers/wallpaper'
import {Input, Labeled, PasswordInput, AnimatedInputError} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ─── Constants ──────────────────────────────────────────────────

const TOTAL_STEPS = 5

const glassCardStyle = {
	background: 'rgba(255, 255, 255, 0.85)',
	backdropFilter: 'blur(24px)',
	WebkitBackdropFilter: 'blur(24px)',
	boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
} as const

const primaryButtonClass =
	'flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-body font-medium text-white shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const secondaryButtonClass =
	'flex items-center justify-center gap-2 rounded-full bg-surface-1 border border-border-default px-6 py-3 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const skipButtonClass =
	'text-text-tertiary hover:text-text-secondary text-body-sm underline underline-offset-4 transition-colors'

const panelVariants = {
	enter: (direction: number) => ({
		x: direction > 0 ? 80 : -80,
		opacity: 0,
		filter: 'blur(4px)',
	}),
	center: {
		x: 0,
		opacity: 1,
		filter: 'blur(0px)',
	},
	exit: (direction: number) => ({
		x: direction > 0 ? -80 : 80,
		opacity: 0,
		filter: 'blur(4px)',
	}),
}

const panelTransition = {
	type: 'spring',
	stiffness: 300,
	damping: 30,
}

// ─── Step 0: Welcome ────────────────────────────────────────────

function StepWelcome({onNext}: {onNext: () => void}) {
	const buttonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		buttonRef.current?.focus()
	}, [])

	return (
		<div className='flex flex-col items-center gap-6'>
			{/* Logo with glow */}
			<div className='relative'>
				<GlowEffect
					colors={['#06B6D4', '#0891B2', '#22D3EE', '#0E7490']}
					mode='breathe'
					blur='strong'
					scale={1.4}
					duration={4}
				/>
				<motion.div
					initial={{scale: 0.8, opacity: 0}}
					animate={{scale: 1, opacity: 1}}
					transition={{type: 'spring', stiffness: 200, damping: 20, delay: 0.1}}
					className='relative'
				>
					<LivinityLogo className='w-[96px] md:w-[120px]' />
				</motion.div>
			</div>

			{/* Animated title */}
			<div className='flex flex-col items-center gap-2'>
				<TextEffect
					preset='fade-in-blur'
					per='word'
					className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'
					delay={0.3}
				>
					You've been invited
				</TextEffect>
				<motion.p
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: 0.8, duration: 0.5}}
					className='text-center text-body font-medium text-text-secondary md:text-body-lg'
				>
					Set up your account to join this Livinity server
				</motion.p>
			</div>

			{/* Language selector */}
			<motion.div
				initial={{opacity: 0}}
				animate={{opacity: 1}}
				transition={{delay: 1.0, duration: 0.4}}
			>
				<LanguageDropdown />
			</motion.div>

			{/* Get Started button */}
			<motion.div
				initial={{opacity: 0, y: 10}}
				animate={{opacity: 1, y: 0}}
				transition={{delay: 1.2, duration: 0.4}}
			>
				<button ref={buttonRef} onClick={onNext} className={primaryButtonClass}>
					Get Started
					<TbArrowRight size={16} />
				</button>
			</motion.div>
		</div>
	)
}

// ─── Step 1: Create Account ──────────────────────────────────────

interface AccountFields {
	displayName: string
	username: string
	password: string
}

function StepCreateAccount({
	token,
	onSuccess,
}: {
	token: string
	onSuccess: (fields: AccountFields) => void
}) {
	const [displayName, setDisplayName] = useState('')
	const [username, setUsername] = useState('')
	const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false)
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [localError, setLocalError] = useState('')

	// Auto-generate username from display name unless manually edited
	useEffect(() => {
		if (!usernameManuallyEdited) {
			const generated = displayName
				.toLowerCase()
				.trim()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '')
				.replace(/^-+|-+$/g, '')
			setUsername(generated)
		}
	}, [displayName, usernameManuallyEdited])

	const acceptMut = trpcReact.user.acceptInvite.useMutation({
		onSuccess: () => {
			onSuccess({displayName, username, password})
		},
	})

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		setLocalError('')

		if (!displayName.trim()) {
			setLocalError('Display name is required')
			return
		}
		if (!username.trim()) {
			setLocalError('Username is required')
			return
		}
		if (password.length < 6) {
			setLocalError('Password must be at least 6 characters')
			return
		}
		if (password !== confirmPassword) {
			setLocalError('Passwords do not match')
			return
		}

		acceptMut.mutate({token, username, display_name: displayName, password})
	}

	const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword
	const isLoading = acceptMut.isPending
	const formError = localError || (acceptMut.error?.message ?? '')

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<TbUser size={20} className='text-brand' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						Create your account
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg' style={{maxWidth: 400}}>
					Choose your name, username, and a secure password
				</p>
			</div>

			{/* Avatar placeholder */}
			<motion.div
				initial={{opacity: 0, scale: 0.8}}
				animate={{opacity: 1, scale: 1}}
				transition={{type: 'spring', stiffness: 300, damping: 25}}
				className='flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 border-2 border-brand/30 text-display-xs font-bold text-brand select-none'
			>
				{displayName
					? displayName
						.trim()
						.split(/\s+/)
						.slice(0, 2)
						.map((w) => w[0]?.toUpperCase() ?? '')
						.join('')
					: '?'}
			</motion.div>

			<form onSubmit={handleSubmit} className='w-full max-w-sm'>
				<fieldset disabled={isLoading} className='flex flex-col gap-3.5'>
					<Labeled label='Display Name'>
						<Input
							autoFocus
							placeholder='Jane Smith'
							value={displayName}
							onValueChange={setDisplayName}
						/>
					</Labeled>

					<Labeled label='Username'>
						<Input
							placeholder='jane-smith'
							value={username}
							onValueChange={(v) => {
								setUsernameManuallyEdited(true)
								setUsername(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))
							}}
						/>
						<p className='mt-1 px-[5px] text-[11px] text-text-tertiary'>
							Lowercase letters, numbers, and hyphens only
						</p>
					</Labeled>

					<PasswordInput
						label='Password'
						value={password}
						onValueChange={setPassword}
					/>

					<PasswordInput
						label='Confirm Password'
						value={confirmPassword}
						onValueChange={setConfirmPassword}
						error={passwordMismatch ? 'Passwords do not match' : undefined}
					/>

					<div className='-my-1'>
						<AnimatedInputError>{formError}</AnimatedInputError>
					</div>

					<button type='submit' className={cn(primaryButtonClass, 'w-full mt-1')}>
						{isLoading ? (
							<>
								<TbLoader2 size={16} className='animate-spin' />
								Creating account...
							</>
						) : (
							<>
								Create Account
								<TbArrowRight size={16} />
							</>
						)}
					</button>
				</fieldset>
			</form>
		</div>
	)
}

// ─── Step 2: Personalize (Wallpaper) ────────────────────────────

function StepPersonalize({onNext}: {onNext: () => void}) {
	const {wallpaper, setWallpaperId} = useWallpaper()

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<TbPaint size={20} className='text-pink-400' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						Make it yours
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg'>
					Choose a wallpaper for your dashboard
				</p>
			</div>

			<div className='grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto w-full pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-default'>
				{animatedWallpaperIds.map((id) => (
					<motion.button
						key={id}
						onClick={() => setWallpaperId(id)}
						className={cn(
							'relative aspect-video rounded-xl transition-all duration-200 ring-2 overflow-hidden',
							wallpaper.id === id
								? 'ring-brand scale-[1.02] shadow-[0_0_16px_rgba(6,182,212,0.4)]'
								: 'ring-transparent hover:ring-border-default',
						)}
						style={{backgroundColor: `hsl(${animatedWallpapers[id].brandColorHsl})`}}
						whileHover={{scale: wallpaper.id === id ? 1.02 : 1.04}}
						whileTap={{scale: 0.98}}
					>
						<span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent px-1.5 pb-1 pt-3 text-[9px] font-medium text-white/80'>
							{animatedWallpapers[id].name}
						</span>
					</motion.button>
				))}
			</div>

			<button onClick={onNext} className={primaryButtonClass}>
				Continue
				<TbArrowRight size={16} />
			</button>
		</div>
	)
}

// ─── Step 3: Personalize AI ──────────────────────────────────────

const AI_ROLES = [
	{id: 'developer', label: 'Developer', icon: '💻'},
	{id: 'student', label: 'Student', icon: '📚'},
	{id: 'designer', label: 'Designer', icon: '🎨'},
	{id: 'business', label: 'Business', icon: '📊'},
	{id: 'creative', label: 'Creative', icon: '✨'},
	{id: 'general', label: 'General', icon: '🌐'},
] as const

const AI_STYLES = [
	{id: 'concise', label: 'Concise', desc: 'Short and to the point'},
	{id: 'balanced', label: 'Balanced', desc: 'Clear with enough detail'},
	{id: 'detailed', label: 'Detailed', desc: 'Thorough explanations'},
] as const

const AI_USE_CASES = [
	'Coding', 'Research', 'Writing', 'Automation',
	'Data Analysis', 'Email', 'Learning', 'Planning',
	'Creative Projects', 'System Admin',
] as const

export const ONBOARDING_PERSONALIZATION_KEY = 'livinity-onboarding-personalization'

function StepPersonalizeAI({
	onNext,
	onSkip,
	personalization,
	setPersonalization,
}: {
	onNext: () => void
	onSkip: () => void
	personalization: {role: string; style: string; useCases: string[]}
	setPersonalization: (p: {role: string; style: string; useCases: string[]}) => void
}) {
	const {role, style, useCases} = personalization

	const toggleUseCase = (uc: string) => {
		const next = useCases.includes(uc) ? useCases.filter((u) => u !== uc) : [...useCases, uc]
		setPersonalization({...personalization, useCases: next})
	}

	const handleContinue = () => {
		// Save to localStorage for post-login sync
		try {
			localStorage.setItem(ONBOARDING_PERSONALIZATION_KEY, JSON.stringify(personalization))
		} catch {}
		onNext()
	}

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<TbSparkles size={20} className='text-amber-400' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						Personalize your AI
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg'>
					Help your AI assistant understand you better
				</p>
			</div>

			{/* Role selection */}
			<div className='w-full space-y-2'>
				<label className='text-caption font-medium text-text-tertiary'>What best describes you?</label>
				<div className='grid grid-cols-3 gap-2'>
					{AI_ROLES.map((r) => (
						<motion.button
							key={r.id}
							onClick={() => setPersonalization({...personalization, role: r.id})}
							className={cn(
								'flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all',
								role === r.id
									? 'border-brand bg-brand/5 ring-1 ring-brand/30'
									: 'border-border-default hover:border-border-hover hover:bg-surface-1',
							)}
							whileTap={{scale: 0.97}}
						>
							<span className='text-xl'>{r.icon}</span>
							<span className='text-caption font-medium text-text-primary'>{r.label}</span>
						</motion.button>
					))}
				</div>
			</div>

			{/* Communication style */}
			<div className='w-full space-y-2'>
				<label className='text-caption font-medium text-text-tertiary'>How should AI respond?</label>
				<div className='flex gap-2'>
					{AI_STYLES.map((s) => (
						<motion.button
							key={s.id}
							onClick={() => setPersonalization({...personalization, style: s.id})}
							className={cn(
								'flex-1 rounded-xl border p-3 text-left transition-all',
								style === s.id
									? 'border-brand bg-brand/5 ring-1 ring-brand/30'
									: 'border-border-default hover:border-border-hover hover:bg-surface-1',
							)}
							whileTap={{scale: 0.97}}
						>
							<p className='text-caption font-semibold text-text-primary'>{s.label}</p>
							<p className='text-[11px] text-text-tertiary'>{s.desc}</p>
						</motion.button>
					))}
				</div>
			</div>

			{/* Use cases */}
			<div className='w-full space-y-2'>
				<label className='text-caption font-medium text-text-tertiary'>What will you use AI for?</label>
				<div className='flex flex-wrap gap-2'>
					{AI_USE_CASES.map((uc) => (
						<motion.button
							key={uc}
							onClick={() => toggleUseCase(uc)}
							className={cn(
								'rounded-full border px-3 py-1.5 text-caption font-medium transition-all',
								useCases.includes(uc)
									? 'border-brand bg-brand/10 text-brand'
									: 'border-border-default text-text-secondary hover:border-border-hover hover:bg-surface-1',
							)}
							whileTap={{scale: 0.95}}
						>
							{uc}
						</motion.button>
					))}
				</div>
			</div>

			<div className='flex flex-col items-center gap-3'>
				<button onClick={handleContinue} className={primaryButtonClass}>
					Continue
					<TbArrowRight size={16} />
				</button>
				<button onClick={onSkip} className={skipButtonClass}>
					Skip for now
				</button>
			</div>
		</div>
	)
}

// ─── Step 5: All Done ────────────────────────────────────────────

function StepAllDone({displayName}: {displayName: string}) {
	const firstName = displayName.split(' ')[0] || displayName || 'there'

	return (
		<div className='flex flex-col items-center gap-6'>
			{/* Animated checkmark */}
			<motion.div
				initial={{scale: 0, rotate: -180}}
				animate={{scale: 1, rotate: 0}}
				transition={{type: 'spring', stiffness: 200, damping: 15, delay: 0.2}}
				className='relative'
			>
				<GlowEffect
					colors={['#22C55E', '#16A34A', '#4ADE80', '#86EFAC']}
					mode='breathe'
					blur='strong'
					scale={1.5}
					duration={3}
				/>
				<div className='relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 border border-green-500/30'>
					<TbCheck size={40} className='text-green-400' />
				</div>
			</motion.div>

			{/* Confetti-like particles */}
			<div className='absolute inset-0 pointer-events-none overflow-hidden'>
				{Array.from({length: 12}).map((_, i) => (
					<motion.div
						key={i}
						className='absolute w-1.5 h-1.5 rounded-full'
						style={{
							background: ['#06B6D4', '#22C55E', '#3B82F6', '#F59E0B', '#EC4899', '#0EA5E9'][i % 6],
							left: `${15 + Math.random() * 70}%`,
							top: '50%',
						}}
						initial={{y: 0, opacity: 0, scale: 0}}
						animate={{
							y: [0, -120 - Math.random() * 80],
							x: [0, (Math.random() - 0.5) * 120],
							opacity: [0, 1, 1, 0],
							scale: [0, 1, 1, 0.5],
						}}
						transition={{
							duration: 1.8,
							delay: 0.3 + i * 0.08,
							ease: 'easeOut',
						}}
					/>
				))}
			</div>

			<div className='flex flex-col items-center gap-2'>
				<TextEffect
					preset='fade-in-blur'
					per='word'
					className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'
					delay={0.4}
				>
					{`Welcome aboard, ${firstName}!`}
				</TextEffect>
				<motion.p
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: 0.9, duration: 0.5}}
					className='text-center text-body font-medium text-text-secondary md:text-body-lg'
				>
					Your account is ready. Log in to get started.
				</motion.p>
			</div>

			<motion.div
				initial={{opacity: 0, y: 10}}
				animate={{opacity: 1, y: 0}}
				transition={{delay: 1.2, duration: 0.4}}
			>
				<button
					onClick={() => {
						window.location.href = '/login'
					}}
					className={primaryButtonClass}
				>
					Go to Login
					<TbArrowRight size={16} />
				</button>
			</motion.div>
		</div>
	)
}

// ─── Main Invite Wizard ──────────────────────────────────────────

export default function InviteAcceptPage() {
	const {token} = useParams<{token: string}>()
	const navigate = useNavigate()

	const [activeStep, setActiveStep] = useState(0)
	const [direction, setDirection] = useState(1)
	const [accountFields, setAccountFields] = useState<AccountFields>({
		displayName: '',
		username: '',
		password: '',
	})
	const [personalization, setPersonalization] = useState({
		role: '',
		style: 'balanced',
		useCases: [] as string[],
	})

	const goNext = useCallback(() => {
		setDirection(1)
		setActiveStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
	}, [])

	const goBack = useCallback(() => {
		setDirection(-1)
		setActiveStep((s) => Math.max(s - 1, 0))
	}, [])

	if (!token) {
		return (
			<div className='flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8'>
				<div className='flex-1' />
				<div
					className='flex w-full max-w-[520px] flex-col items-center gap-4 rounded-3xl border border-border-subtle px-8 py-10'
					style={glassCardStyle}
				>
					<LivinityLogo className='w-[80px]' />
					<p className='text-body text-red-500'>Invalid or expired invite link.</p>
					<button onClick={() => navigate('/login')} className={secondaryButtonClass}>
						Go to Login
					</button>
				</div>
				<div className='flex-1' />
			</div>
		)
	}

	return (
		<div className='flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8'>
			<div className='flex-1' />

			{/* Glassmorphic card */}
			<div
				className={cn(
					'flex w-full flex-col items-center gap-6 rounded-3xl border border-border-default px-6 py-8 md:px-10 md:py-12',
					'max-w-[520px]',
				)}
				style={glassCardStyle}
			>
				{/* Step indicator — show for steps 1–4 */}
				{activeStep > 0 && activeStep < TOTAL_STEPS - 1 && (
					<motion.div
						initial={{opacity: 0, y: -10}}
						animate={{opacity: 1, y: 0}}
						transition={{duration: 0.3}}
					>
						<StepIndicator steps={TOTAL_STEPS} currentStep={activeStep} />
					</motion.div>
				)}

				{/* Step content */}
				<TransitionPanel
					activeIndex={activeStep}
					variants={panelVariants}
					transition={panelTransition}
					custom={direction}
					className='w-full'
				>
					{/* Step 0: Welcome */}
					<div className='w-full'>
						<StepWelcome onNext={goNext} />
					</div>

					{/* Step 1: Create Account */}
					<div className='w-full'>
						<StepCreateAccount
							token={token}
							onSuccess={(fields) => {
								setAccountFields(fields)
								goNext()
							}}
						/>
					</div>

					{/* Step 2: Personalize (wallpaper) */}
					<div className='w-full'>
						<StepPersonalize onNext={goNext} />
					</div>

					{/* Step 3: Personalize AI */}
					<div className='w-full'>
						<StepPersonalizeAI
							onNext={goNext}
							onSkip={goNext}
							personalization={personalization}
							setPersonalization={setPersonalization}
						/>
					</div>

					{/* Step 4: All Done */}
					<div className='w-full'>
						<StepAllDone displayName={accountFields.displayName} />
					</div>
				</TransitionPanel>

				{/* Back button for steps 2–3 */}
				{activeStep >= 2 && activeStep <= 3 && (
					<motion.div
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						transition={{delay: 0.2}}
					>
						<button onClick={goBack} className={secondaryButtonClass}>
							<TbArrowLeft size={14} />
							Back
						</button>
					</motion.div>
				)}

				{/* Already have an account link (step 0 only) */}
				{activeStep === 0 && (
					<motion.div
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						transition={{delay: 1.4}}
					>
						<button
							type='button'
							onClick={() => navigate('/login')}
							className='text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'
						>
							Already have an account? Log in
						</button>
					</motion.div>
				)}
			</div>

			<div className='flex-1' />
		</div>
	)
}
