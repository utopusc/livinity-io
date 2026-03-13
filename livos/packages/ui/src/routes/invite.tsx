import {useState, useEffect, useRef, useCallback} from 'react'
import {motion} from 'framer-motion'
import {useNavigate, useParams} from 'react-router-dom'
import {
	TbArrowRight,
	TbArrowLeft,
	TbUser,
	TbPaint,
	TbBrandTelegram,
	TbMail,
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

const TOTAL_STEPS = 6

const glassCardStyle = {
	background: 'rgba(255, 255, 255, 0.85)',
	backdropFilter: 'blur(24px)',
	WebkitBackdropFilter: 'blur(24px)',
	boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
} as const

const primaryButtonClass =
	'flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-body font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.15)] transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

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
					colors={['#8B5CF6', '#6D28D9', '#A78BFA', '#7C3AED']}
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
								? 'ring-brand scale-[1.02] shadow-[0_0_16px_rgba(139,92,246,0.4)]'
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

// ─── Step 3: Connect Telegram (Placeholder) ──────────────────────

function StepTelegram({onNext, onSkip}: {onNext: () => void; onSkip: () => void}) {
	const [chatId, setChatId] = useState('')

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<TbBrandTelegram size={22} className='text-[#2AABEE]' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						Connect Telegram
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg' style={{maxWidth: 400}}>
					Chat with your AI assistant from anywhere using Telegram
				</p>
			</div>

			{/* Instructions card */}
			<div className='w-full rounded-xl border border-border-default bg-surface-base p-5 space-y-4'>
				<ol className='space-y-3'>
					{[
						{
							num: 1,
							text: (
								<>
									Open Telegram and search for{' '}
									<span className='font-mono font-medium text-text-primary'>@LivinityBot</span>
								</>
							),
						},
						{
							num: 2,
							text: (
								<>
									Send the command{' '}
									<span className='font-mono font-medium text-text-primary'>/start</span>{' '}
									to begin pairing
								</>
							),
						},
						{
							num: 3,
							text: 'Copy the Chat ID shown and paste it below',
						},
					].map(({num, text}) => (
						<li key={num} className='flex items-start gap-3'>
							<span className='flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#2AABEE]/20 text-[11px] font-bold text-[#2AABEE]'>
								{num}
							</span>
							<span className='text-body text-text-secondary'>{text}</span>
						</li>
					))}
				</ol>

				<div>
					<label className='mb-1.5 block text-caption font-medium text-text-tertiary'>
						Telegram Chat ID
					</label>
					<Input
						placeholder='e.g. 123456789'
						value={chatId}
						onValueChange={setChatId}
					/>
				</div>

				<div className='rounded-lg bg-[#2AABEE]/10 border border-[#2AABEE]/20 px-3 py-2.5 text-caption text-[#2AABEE]/80'>
					Telegram integration will be available after setup. Your Chat ID will be saved to connect automatically.
				</div>
			</div>

			<div className='flex flex-col items-center gap-3'>
				<button onClick={onNext} className={primaryButtonClass}>
					{chatId.trim() ? (
						<>
							Save &amp; Continue
							<TbArrowRight size={16} />
						</>
					) : (
						<>
							Continue
							<TbArrowRight size={16} />
						</>
					)}
				</button>
				<button onClick={onSkip} className={skipButtonClass}>
					Skip for now
				</button>
			</div>
		</div>
	)
}

// ─── Step 4: Connect Gmail (Placeholder) ─────────────────────────

function StepGmail({onNext, onSkip}: {onNext: () => void; onSkip: () => void}) {
	const [connected, setConnected] = useState(false)

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<TbMail size={22} className='text-red-400' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						Connect Gmail
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg' style={{maxWidth: 400}}>
					Let your AI assistant help you manage and reply to emails
				</p>
			</div>

			{/* Feature highlights */}
			<div className='w-full rounded-xl border border-border-default bg-surface-base p-5 space-y-3'>
				{[
					{
						icon: '📬',
						title: 'Smart email summaries',
						desc: 'Get daily briefings of your important emails',
					},
					{
						icon: '✍️',
						title: 'AI-powered replies',
						desc: 'Draft replies in your writing style',
					},
					{
						icon: '🔒',
						title: 'Read-only by default',
						desc: 'Your AI can only send emails when you approve',
					},
				].map(({icon, title, desc}) => (
					<div key={title} className='flex items-start gap-3'>
						<span className='text-lg leading-none mt-0.5'>{icon}</span>
						<div>
							<p className='text-body font-medium text-text-primary'>{title}</p>
							<p className='text-caption text-text-tertiary'>{desc}</p>
						</div>
					</div>
				))}
			</div>

			{/* OAuth connect button (placeholder) */}
			{connected ? (
				<motion.div
					initial={{opacity: 0, scale: 0.95}}
					animate={{opacity: 1, scale: 1}}
					className='flex items-center gap-3 rounded-full bg-green-500/10 border border-green-500/20 px-5 py-3'
				>
					<motion.div
						initial={{scale: 0}}
						animate={{scale: 1}}
						transition={{type: 'spring', stiffness: 400, damping: 15}}
						className='flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20'
					>
						<TbCheck size={14} className='text-green-400' />
					</motion.div>
					<span className='text-body font-medium text-green-400'>Gmail connected</span>
				</motion.div>
			) : (
				<button
					onClick={() => setConnected(true)}
					className={cn(secondaryButtonClass, 'gap-3')}
				>
					{/* Google "G" icon using SVG inline */}
					<svg width='18' height='18' viewBox='0 0 18 18' fill='none' xmlns='http://www.w3.org/2000/svg'>
						<path
							d='M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z'
							fill='#4285F4'
						/>
						<path
							d='M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z'
							fill='#34A853'
						/>
						<path
							d='M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z'
							fill='#FBBC05'
						/>
						<path
							d='M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z'
							fill='#EA4335'
						/>
					</svg>
					Connect with Google
				</button>
			)}

			<div className='rounded-lg bg-surface-1 border border-border-subtle px-3 py-2 text-caption text-text-tertiary text-center' style={{maxWidth: 360}}>
				Gmail OAuth integration is coming soon. Your preference will be saved and configured once available.
			</div>

			<div className='flex flex-col items-center gap-3'>
				<button onClick={onNext} className={primaryButtonClass}>
					{connected ? (
						<>
							Continue
							<TbArrowRight size={16} />
						</>
					) : (
						<>
							Continue
							<TbArrowRight size={16} />
						</>
					)}
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
							background: ['#8B5CF6', '#22C55E', '#3B82F6', '#F59E0B', '#EC4899', '#06B6D4'][i % 6],
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

					{/* Step 3: Connect Telegram */}
					<div className='w-full'>
						<StepTelegram onNext={goNext} onSkip={goNext} />
					</div>

					{/* Step 4: Connect Gmail */}
					<div className='w-full'>
						<StepGmail onNext={goNext} onSkip={goNext} />
					</div>

					{/* Step 5: All Done */}
					<div className='w-full'>
						<StepAllDone displayName={accountFields.displayName} />
					</div>
				</TransitionPanel>

				{/* Back button for steps 2–4 */}
				{activeStep >= 2 && activeStep <= 4 && (
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
