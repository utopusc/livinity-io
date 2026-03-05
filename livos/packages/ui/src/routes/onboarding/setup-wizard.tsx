import {useState, useEffect, useRef, useCallback} from 'react'
import {motion} from 'framer-motion'

import {TextEffect} from '@/components/motion-primitives/text-effect'
import {TransitionPanel} from '@/components/motion-primitives/transition-panel'
import {GlowEffect} from '@/components/motion-primitives/glow-effect'
import LivinityLogo from '@/assets/livinity-logo'
import {StepIndicator} from '@/components/ui/step-indicator'
import {useLanguage} from '@/hooks/use-language'
import {useWallpaper, wallpapers} from '@/providers/wallpaper'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {cn} from '@/shadcn-lib/utils'
import {Input, PasswordInput, AnimatedInputError} from '@/shadcn-components/ui/input'
import {LanguageDropdown} from '@/routes/settings/_components/language-dropdown'
import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'
import {supportedLanguageCodes} from '@/utils/language'
import {
	IconArrowRight,
	IconArrowLeft,
	IconGlobe,
	IconLock,
	IconCheck,
	IconCopy,
	IconAlertCircle,
	IconLoader2,
	IconExternalLink,
	IconRefresh,
	IconSparkles,
} from '@tabler/icons-react'

// ─── Constants ──────────────────────────────────────────────────

const TOTAL_STEPS = 6

const glassCardStyle = {
	background: 'rgba(255, 255, 255, 0.03)',
	backdropFilter: 'blur(24px)',
	WebkitBackdropFilter: 'blur(24px)',
	boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
} as const

const primaryButtonClass =
	'flex items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-body font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const secondaryButtonClass =
	'flex items-center justify-center gap-2 rounded-full bg-white/[0.06] border border-white/[0.08] px-6 py-3 backdrop-blur-md text-white/70 hover:bg-white/[0.1] hover:text-white transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'

const skipButtonClass = 'text-white/40 hover:text-white/60 text-body-sm underline underline-offset-4 transition-colors'

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

// ─── Auto-detect browser language ───────────────────────────────

function useAutoDetectLanguage() {
	const [, setLang] = useLanguage()

	useEffect(() => {
		if (sessionStorage.getItem('temporary-language')) {
			return
		}

		const {languages: browserLanguageCodes} = navigator
		if (!Array.isArray(browserLanguageCodes)) return

		for (const languageCode of browserLanguageCodes) {
			const baseCode = languageCode.split('-')[0]

			if ((supportedLanguageCodes as readonly string[]).includes(baseCode)) {
				setLang(baseCode as any)
				sessionStorage.setItem('temporary-language', baseCode)
				break
			}
		}
	}, [])
}

// ─── Copy Helper ────────────────────────────────────────────────

function CopyButton({text}: {text: string}) {
	const [copied, setCopied] = useState(false)

	const handleCopy = () => {
		navigator.clipboard.writeText(text)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<button onClick={handleCopy} className='p-1.5 rounded text-white/40 hover:text-white/60 transition-colors' title='Copy'>
			{copied ? <IconCheck size={14} className='text-green-400' /> : <IconCopy size={14} />}
		</button>
	)
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
					className='text-center text-display-sm font-bold leading-tight -tracking-2 text-white md:text-56'
					delay={0.3}
				>
					Welcome to Livinity
				</TextEffect>
				<motion.p
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: 0.8, duration: 0.5}}
					className='text-center text-body font-medium text-white/60 md:text-body-lg'
				>
					{t('onboarding.start.subtitle', {defaultValue: 'Your personal AI-powered home server'})}
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
					{t('onboarding.start.continue', {defaultValue: 'Get Started'})}
					<IconArrowRight size={16} />
				</button>
			</motion.div>
		</div>
	)
}

// ─── Step 1: Create Account ─────────────────────────────────────

function StepCreateAccount({onSuccess}: {onSuccess: () => void}) {
	const [language] = useLanguage()

	const [name, setName] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [localError, setLocalError] = useState('')
	const [isNavigating, setIsNavigating] = useState(false)

	const loginMut = trpcReact.user.login.useMutation({
		onSuccess: async (jwt) => {
			setIsNavigating(true)
			// Set JWT directly without triggering navigation -- stay in wizard
			localStorage.setItem(JWT_LOCAL_STORAGE_KEY, jwt)
			onSuccess()
		},
	})

	const registerMut = trpcReact.user.register.useMutation({
		onSuccess: async () => loginMut.mutate({password, totpToken: ''}),
	})

	const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()

		registerMut.reset()
		setLocalError('')

		if (!name.trim()) {
			setLocalError(t('onboarding.create-account.failed.name-required', {defaultValue: 'Name is required'}))
			return
		}

		if (password.length < 6) {
			setLocalError(t('change-password.failed.min-length', {characters: 6, defaultValue: 'Password must be at least 6 characters'}))
			return
		}

		if (password !== confirmPassword) {
			setLocalError(t('onboarding.create-account.failed.passwords-dont-match', {defaultValue: 'Passwords do not match'}))
			return
		}

		registerMut.mutate({name, password, language})
	}

	const remoteFormError = !registerMut.error?.data?.zodError && registerMut.error?.message
	const formError = localError || remoteFormError
	const isLoading = registerMut.isPending || loginMut.isPending || isNavigating

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-white md:text-56'>
					{t('onboarding.create-account', {defaultValue: 'Create your account'})}
				</h2>
				<p className='text-center text-body font-medium text-white/60 md:text-body-lg' style={{maxWidth: 400}}>
					{t('onboarding.create-account.subtitle', {defaultValue: 'Set up your name and password to get started'})}
				</p>
			</div>

			<form onSubmit={onSubmit} className='w-full max-w-sm'>
				<fieldset disabled={isLoading} className='flex flex-col items-center gap-4'>
					<div className='flex w-full flex-col gap-2.5'>
						<Input
							placeholder={t('onboarding.create-account.name.input-placeholder', {defaultValue: 'Your name'})}
							autoFocus
							value={name}
							onValueChange={setName}
						/>
						<PasswordInput
							label={t('onboarding.create-account.password.input-label', {defaultValue: 'Password'})}
							value={password}
							onValueChange={setPassword}
							error={registerMut.error?.data?.zodError?.fieldErrors['password']?.join('. ')}
						/>
						<PasswordInput
							label={t('onboarding.create-account.confirm-password.input-label', {defaultValue: 'Confirm password'})}
							value={confirmPassword}
							onValueChange={setConfirmPassword}
						/>
					</div>

					<div className='-my-1'>
						<AnimatedInputError>{formError}</AnimatedInputError>
					</div>

					<button type='submit' className={primaryButtonClass}>
						{isLoading ? (
							<>
								<IconLoader2 size={16} className='animate-spin' />
								{t('onboarding.create-account.submitting', {defaultValue: 'Creating...'})}
							</>
						) : (
							<>
								{t('onboarding.create-account.submit', {defaultValue: 'Create Account'})}
								<IconArrowRight size={16} />
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
				<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-white md:text-56'>
					{t('onboarding.personalize.title', {defaultValue: 'Make it yours'})}
				</h2>
				<p className='text-center text-body font-medium text-white/60 md:text-body-lg'>
					{t('onboarding.personalize.subtitle', {defaultValue: 'Choose a wallpaper for your dashboard'})}
				</p>
			</div>

			<div className='grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto w-full pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10'>
				{wallpapers.map((w) => (
					<motion.button
						key={w.id}
						onClick={() => setWallpaperId(w.id)}
						className={cn(
							'aspect-video rounded-xl bg-cover bg-center transition-all duration-200 ring-2',
							wallpaper.id === w.id ? 'ring-brand scale-[1.02] shadow-[0_0_16px_rgba(139,92,246,0.4)]' : 'ring-transparent hover:ring-white/20',
						)}
						style={{backgroundImage: `url(/wallpapers/generated-thumbs/${w.id}.jpg)`}}
						whileHover={{scale: wallpaper.id === w.id ? 1.02 : 1.04}}
						whileTap={{scale: 0.98}}
					/>
				))}
			</div>

			<button onClick={onNext} className={primaryButtonClass}>
				{t('continue', {defaultValue: 'Continue'})}
				<IconArrowRight size={16} />
			</button>
		</div>
	)
}

// ─── Step 3: Domain Setup (Skippable) ───────────────────────────

function StepDomainSetup({onNext, onSkip}: {onNext: () => void; onSkip: () => void}) {
	const [domainSubStep, setDomainSubStep] = useState<0 | 1 | 2 | 3>(0)
	const [domain, setDomain] = useState('')
	const [serverIp, setServerIp] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [activating, setActivating] = useState(false)
	const [activateError, setActivateError] = useState('')

	const ipQuery = trpcReact.domain.getPublicIp.useQuery()
	const setDomainMutation = trpcReact.domain.setDomain.useMutation()
	const activateMutation = trpcReact.domain.activate.useMutation()

	const verifyQuery = trpcReact.domain.verifyDns.useQuery(undefined, {
		enabled: domainSubStep === 2,
		refetchInterval: domainSubStep === 2 ? 10_000 : false,
	})

	const isMatch = verifyQuery.data?.match === true

	useEffect(() => {
		if (ipQuery.data?.ip) {
			setServerIp(ipQuery.data.ip)
		}
	}, [ipQuery.data])

	const handleSaveDomain = useCallback(async () => {
		setSaving(true)
		try {
			await setDomainMutation.mutateAsync({domain})
			setDomainSubStep(1)
		} catch {
			// error handled by tRPC
		} finally {
			setSaving(false)
		}
	}, [domain, setDomainMutation])

	const handleActivate = async () => {
		setActivateError('')
		setActivating(true)
		try {
			await activateMutation.mutateAsync()
			onNext()
		} catch (err: any) {
			setActivateError(err.message || 'Failed to activate HTTPS')
		} finally {
			setActivating(false)
		}
	}

	const validDomain = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(domain) && domain.includes('.')

	// Extract subdomain vs root
	const parts = domain.split('.')
	const isRoot = parts.length === 2
	const hostName = isRoot ? '@' : parts.slice(0, -2).join('.')

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<IconGlobe size={20} className='text-blue-400' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-white md:text-56'>
						{t('onboarding.domain.title', {defaultValue: 'Connect your domain'})}
					</h2>
				</div>
				<p className='text-center text-body font-medium text-white/60 md:text-body-lg'>
					{t('onboarding.domain.subtitle', {defaultValue: 'Set up a custom domain with HTTPS for your server'})}
				</p>
			</div>

			{/* Sub-step 0: Domain input */}
			{domainSubStep === 0 && (
				<motion.div
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					className='w-full space-y-4'
				>
					<div>
						<label className='mb-1.5 block text-caption font-medium text-white/50'>Domain name</label>
						<Input
							type='text'
							value={domain}
							onValueChange={setDomain}
							onKeyDown={(e) => e.key === 'Enter' && validDomain && handleSaveDomain()}
							placeholder='myserver.example.com'
							autoFocus
						/>
					</div>

					{serverIp && (
						<div className='flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3'>
							<IconGlobe size={14} className='text-blue-400' />
							<span className='text-caption text-white/50'>Server IP:</span>
							<span className='font-mono text-caption text-white/80'>{serverIp}</span>
							<CopyButton text={serverIp} />
						</div>
					)}

					<div className='flex justify-center'>
						<button
							onClick={handleSaveDomain}
							disabled={!validDomain || saving}
							className={primaryButtonClass}
						>
							{saving ? <IconLoader2 size={16} className='animate-spin' /> : <IconArrowRight size={16} />}
							Next
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step 1: DNS records */}
			{domainSubStep === 1 && serverIp && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-white'>Add DNS record</h3>
						<p className='mt-1 text-caption text-white/40'>
							Go to your domain registrar and add the following DNS record:
						</p>
					</div>

					<div className='overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]'>
						<table className='w-full text-left text-caption'>
							<thead>
								<tr className='border-b border-white/[0.06]'>
									<th className='px-4 py-2.5 font-medium text-white/50'>Type</th>
									<th className='px-4 py-2.5 font-medium text-white/50'>Name</th>
									<th className='px-4 py-2.5 font-medium text-white/50'>Value</th>
									<th className='px-4 py-2.5 font-medium text-white/50'>TTL</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td className='px-4 py-3'>
										<span className='rounded bg-blue-500/20 px-2 py-0.5 font-mono font-medium text-blue-400'>A</span>
									</td>
									<td className='px-4 py-3'>
										<div className='flex items-center gap-1.5'>
											<span className='font-mono text-white/80'>{hostName}</span>
											<CopyButton text={hostName} />
										</div>
									</td>
									<td className='px-4 py-3'>
										<div className='flex items-center gap-1.5'>
											<span className='font-mono text-white/80'>{serverIp}</span>
											<CopyButton text={serverIp} />
										</div>
									</td>
									<td className='px-4 py-3'>
										<span className='font-mono text-white/50'>300</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div className='rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-caption text-amber-400/80'>
						DNS changes can take a few minutes to propagate. Setting TTL to 300 (5 minutes) helps speed this up.
					</div>

					<div className='flex items-center justify-between'>
						<button onClick={() => setDomainSubStep(0)} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							Back
						</button>
						<button onClick={() => setDomainSubStep(2)} className={primaryButtonClass}>
							I've added the record
							<IconArrowRight size={14} />
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step 2: Verify DNS */}
			{domainSubStep === 2 && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-white'>Verify DNS</h3>
						<p className='mt-1 text-caption text-white/40'>
							Checking if <span className='font-mono text-white/60'>{domain}</span> points to your server...
						</p>
					</div>

					<div className='rounded-xl border border-white/[0.08] bg-white/[0.02] p-4'>
						{verifyQuery.isFetching ? (
							<div className='flex items-center gap-3'>
								<IconLoader2 size={18} className='animate-spin text-brand' />
								<span className='text-body text-white/60'>Checking DNS records...</span>
							</div>
						) : isMatch ? (
							<div className='flex items-center gap-3'>
								<motion.div
									initial={{scale: 0}}
									animate={{scale: 1}}
									transition={{type: 'spring', stiffness: 400, damping: 15}}
									className='flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20'
								>
									<IconCheck size={18} className='text-green-400' />
								</motion.div>
								<div>
									<span className='text-body font-medium text-green-400'>DNS verified!</span>
									<p className='mt-0.5 text-caption text-white/40'>
										<span className='font-mono'>{domain}</span> resolves to{' '}
										<span className='font-mono'>{verifyQuery.data?.currentIp ?? ''}</span>
									</p>
								</div>
							</div>
						) : (
							<div className='space-y-3'>
								<div className='flex items-center gap-3'>
									<div className='flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20'>
										<IconAlertCircle size={18} className='text-amber-400' />
									</div>
									<div>
										<span className='text-body font-medium text-amber-400'>Not yet resolved</span>
										<p className='mt-0.5 text-caption text-white/40'>DNS records may need more time to propagate.</p>
									</div>
								</div>

								{verifyQuery.data && (
									<div className='rounded-lg bg-white/[0.03] px-3 py-2 text-caption'>
										<div className='flex items-center justify-between'>
											<span className='text-white/40'>Current:</span>
											<span className='font-mono text-white/60'>{verifyQuery.data.currentIp || 'No A record found'}</span>
										</div>
										<div className='mt-1 flex items-center justify-between'>
											<span className='text-white/40'>Expected:</span>
											<span className='font-mono text-white/60'>{verifyQuery.data.expected}</span>
										</div>
									</div>
								)}

								<p className='text-caption-sm text-white/30'>Auto-checking every 10 seconds...</p>
							</div>
						)}
					</div>

					{!isMatch && (
						<button
							onClick={() => verifyQuery.refetch()}
							className='flex items-center gap-2 text-caption text-white/40 transition-colors hover:text-white/60'
						>
							<IconRefresh size={14} />
							Check again
						</button>
					)}

					<div className='flex items-center justify-between'>
						<button onClick={() => setDomainSubStep(1)} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							Back
						</button>
						<button
							onClick={() => setDomainSubStep(3)}
							disabled={!isMatch}
							className={primaryButtonClass}
						>
							Next
							<IconArrowRight size={14} />
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step 3: Activate HTTPS */}
			{domainSubStep === 3 && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-white'>Activate HTTPS</h3>
						<p className='mt-1 text-caption text-white/40'>
							DNS is verified. Ready to enable HTTPS for <span className='font-mono text-white/60'>{domain}</span>.
						</p>
					</div>

					<div className='space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4'>
						<div className='flex items-start gap-3'>
							<IconLock size={16} className='mt-0.5 flex-shrink-0 text-green-400' />
							<div>
								<p className='text-body text-white/80'>Free SSL certificate from Let's Encrypt</p>
								<p className='mt-0.5 text-caption text-white/40'>
									Caddy will automatically obtain and renew a certificate.
								</p>
							</div>
						</div>
						<div className='flex items-start gap-3'>
							<IconGlobe size={16} className='mt-0.5 flex-shrink-0 text-blue-400' />
							<div>
								<p className='text-body text-white/80'>HTTP to HTTPS redirect</p>
								<p className='mt-0.5 text-caption text-white/40'>
									All HTTP traffic will be automatically redirected to HTTPS.
								</p>
							</div>
						</div>
					</div>

					{activateError && (
						<div className='flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-caption text-red-400'>
							<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
							<span>{activateError}</span>
						</div>
					)}

					<div className='flex items-center justify-between'>
						<button onClick={() => setDomainSubStep(2)} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							Back
						</button>
						<button
							onClick={handleActivate}
							disabled={activating}
							className={cn(primaryButtonClass, 'bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:bg-green-500')}
						>
							{activating ? <IconLoader2 size={16} className='animate-spin' /> : <IconLock size={16} />}
							Activate HTTPS
						</button>
					</div>
				</motion.div>
			)}

			{/* Skip always visible */}
			<button onClick={onSkip} className={skipButtonClass}>
				{t('onboarding.skip', {defaultValue: 'Skip for now'})}
			</button>
		</div>
	)
}

// ─── Step 4: Claude AI Auth (Skippable) ─────────────────────────

function StepClaudeAuth({onNext, onSkip}: {onNext: () => void; onSkip: () => void}) {
	const [loginCode, setLoginCode] = useState('')
	const [loginUrl, setLoginUrl] = useState('')

	const cliStatusQ = trpcReact.ai.getClaudeCliStatus.useQuery()
	const utils = trpcReact.useUtils()

	const cliAuthenticated = cliStatusQ.data?.authenticated ?? false

	const setAuthMethodMutation = trpcReact.ai.setClaudeAuthMethod.useMutation({
		onSuccess: () => {
			utils.ai.getClaudeCliStatus.invalidate()
		},
	})

	const startLoginMutation = trpcReact.ai.startClaudeLogin.useMutation({
		onSuccess: (data) => {
			if (data.url) {
				setLoginUrl(data.url)
				window.open(data.url, '_blank', 'noopener,noreferrer')
			}
			if (data.alreadyAuthenticated) {
				utils.ai.getClaudeCliStatus.invalidate()
			}
		},
	})

	const submitCodeMutation = trpcReact.ai.submitClaudeLoginCode.useMutation({
		onSuccess: (data) => {
			if (data.success) {
				setLoginCode('')
				setLoginUrl('')
				utils.ai.getClaudeCliStatus.invalidate()
			}
		},
	})

	// Set auth method to sdk-subscription on mount
	useEffect(() => {
		setAuthMethodMutation.mutate({method: 'sdk-subscription'})
	}, [])

	// Poll CLI status every 5s when not authenticated
	useEffect(() => {
		if (cliAuthenticated) return
		const interval = setInterval(() => {
			cliStatusQ.refetch()
		}, 5000)
		return () => clearInterval(interval)
	}, [cliAuthenticated])

	// Clear login UI when auth completes
	useEffect(() => {
		if (cliAuthenticated) {
			setLoginUrl('')
			setLoginCode('')
		}
	}, [cliAuthenticated])

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<IconSparkles size={20} className='text-brand' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-white md:text-56'>
						{t('onboarding.claude.title', {defaultValue: 'Connect Claude AI'})}
					</h2>
				</div>
				<p className='text-center text-body font-medium text-white/60 md:text-body-lg' style={{maxWidth: 420}}>
					{t('onboarding.claude.subtitle', {defaultValue: 'Sign in with your Claude subscription to enable AI features'})}
				</p>
			</div>

			<div className='w-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4'>
				{cliStatusQ.isLoading ? (
					<div className='flex items-center justify-center gap-2 py-4 text-white/60'>
						<IconLoader2 size={18} className='animate-spin' />
						<span className='text-body'>Checking status...</span>
					</div>
				) : cliAuthenticated ? (
					<motion.div
						initial={{opacity: 0, scale: 0.95}}
						animate={{opacity: 1, scale: 1}}
						className='flex flex-col items-center gap-3 py-4'
					>
						<motion.div
							initial={{scale: 0}}
							animate={{scale: 1}}
							transition={{type: 'spring', stiffness: 400, damping: 15}}
							className='flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20'
						>
							<IconCheck size={24} className='text-green-400' />
						</motion.div>
						<div className='text-center'>
							<p className='text-body font-medium text-green-400'>Authenticated</p>
							{cliStatusQ.data?.user && (
								<p className='mt-0.5 text-caption text-white/40'>
									Signed in as <span className='text-white/60'>{cliStatusQ.data.user}</span>
								</p>
							)}
						</div>
					</motion.div>
				) : (
					<div className='space-y-4'>
						{/* Step 1: Sign in button */}
						<button
							onClick={() => startLoginMutation.mutate()}
							disabled={startLoginMutation.isPending}
							className={cn(primaryButtonClass, 'w-full')}
						>
							{startLoginMutation.isPending ? (
								<>
									<IconLoader2 size={16} className='animate-spin' />
									Opening...
								</>
							) : (
								<>
									<IconExternalLink size={16} />
									{loginUrl ? 'Re-open Auth Page' : 'Sign in with Claude'}
								</>
							)}
						</button>

						{startLoginMutation.isError && (
							<p className='text-caption text-red-400 text-center'>{startLoginMutation.error.message}</p>
						)}

						{/* Step 2: Code input */}
						<div className='space-y-3 rounded-lg bg-white/[0.03] border border-white/[0.05] p-4'>
							<p className='text-caption text-white/40'>
								1. Click the button above to open the auth page.
								<br />
								2. Log in with your Claude account.
								<br />
								3. Copy the code you receive and paste it below:
							</p>

							{loginUrl && (
								<a
									href={loginUrl}
									target='_blank'
									rel='noopener noreferrer'
									className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300 transition-colors'
								>
									<IconExternalLink size={14} />
									Re-open auth page
								</a>
							)}

							<div className='flex gap-2'>
								<Input
									placeholder='Paste auth code here...'
									value={loginCode}
									onValueChange={setLoginCode}
									className='font-mono text-caption'
								/>
								<button
									onClick={() => {
										if (!loginUrl) {
											startLoginMutation.mutate(undefined, {
												onSuccess: () => {
													submitCodeMutation.mutate({code: loginCode})
												},
											})
										} else {
											submitCodeMutation.mutate({code: loginCode})
										}
									}}
									disabled={!loginCode.trim() || submitCodeMutation.isPending}
									className={primaryButtonClass}
								>
									{submitCodeMutation.isPending ? (
										<IconLoader2 size={16} className='animate-spin' />
									) : (
										'Submit'
									)}
								</button>
							</div>

							{submitCodeMutation.isError && (
								<p className='text-caption text-red-400'>{submitCodeMutation.error.message}</p>
							)}
							{submitCodeMutation.isSuccess && !submitCodeMutation.data?.success && (
								<p className='text-caption text-red-400'>
									{submitCodeMutation.data?.error || 'Code exchange failed'}
								</p>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Next / Skip */}
			{cliAuthenticated && (
				<motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}>
					<button onClick={onNext} className={primaryButtonClass}>
						Continue
						<IconArrowRight size={16} />
					</button>
				</motion.div>
			)}
			<button onClick={onSkip} className={skipButtonClass}>
				{t('onboarding.skip', {defaultValue: 'Skip for now'})}
			</button>
		</div>
	)
}

// ─── Step 5: All Done ───────────────────────────────────────────

function StepAllDone({name}: {name: string}) {
	const firstName = name.split(' ')[0] || name

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
					<motion.div
						initial={{pathLength: 0}}
						animate={{pathLength: 1}}
						transition={{delay: 0.5, duration: 0.5, ease: 'easeOut'}}
					>
						<IconCheck size={40} className='text-green-400' />
					</motion.div>
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
					className='text-center text-display-sm font-bold leading-tight -tracking-2 text-white md:text-56'
					delay={0.4}
				>
					{`You're all set, ${firstName}!`}
				</TextEffect>
				<motion.p
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: 0.9, duration: 0.5}}
					className='text-center text-body font-medium text-white/60 md:text-body-lg'
				>
					{t('onboarding.done.subtitle', {defaultValue: 'Your Livinity server is ready'})}
				</motion.p>
			</div>

			<motion.div
				initial={{opacity: 0, y: 10}}
				animate={{opacity: 1, y: 0}}
				transition={{delay: 1.2, duration: 0.4}}
			>
				<button
					onClick={() => {
						// Hard navigate to force full re-render with authenticated state
						window.location.href = '/'
					}}
					className={primaryButtonClass}
				>
					{t('onboarding.done.enter-dashboard', {defaultValue: 'Enter Dashboard'})}
					<IconArrowRight size={16} />
				</button>
			</motion.div>
		</div>
	)
}

// ─── Main Wizard ────────────────────────────────────────────────

export default function SetupWizard() {
	const [activeStep, setActiveStep] = useState(0)
	const [direction, setDirection] = useState(1)
	const [userName, setUserName] = useState('')

	// Auto-detect browser language
	useAutoDetectLanguage()

	// Fetch user name after account creation
	const userQuery = trpcReact.user.get.useQuery(undefined, {
		enabled: activeStep >= 2,
		retry: false,
	})

	useEffect(() => {
		if (userQuery.data?.name) {
			setUserName(userQuery.data.name)
		}
	}, [userQuery.data?.name])

	const goNext = useCallback(() => {
		setDirection(1)
		setActiveStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
	}, [])

	const goBack = useCallback(() => {
		setDirection(-1)
		setActiveStep((s) => Math.max(s - 1, 0))
	}, [])

	return (
		<div className='flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8'>
			<div className='flex-1' />

			{/* Glassmorphic card */}
			<div
				className={cn(
					'flex w-full flex-col items-center gap-6 rounded-3xl border border-white/[0.08] px-6 py-8 md:px-10 md:py-12',
					activeStep === 3 ? 'max-w-[600px]' : 'max-w-[520px]',
				)}
				style={glassCardStyle}
			>
				{/* Step indicator -- show for steps 1-4 */}
				{activeStep > 0 && activeStep < 5 && (
					<motion.div
						initial={{opacity: 0, y: -10}}
						animate={{opacity: 1, y: 0}}
						transition={{duration: 0.3}}
					>
						<StepIndicator steps={TOTAL_STEPS} currentStep={activeStep} />
					</motion.div>
				)}

				{/* Step content with transitions */}
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
							onSuccess={() => {
								goNext()
							}}
						/>
					</div>

					{/* Step 2: Personalize */}
					<div className='w-full'>
						<StepPersonalize onNext={goNext} />
					</div>

					{/* Step 3: Domain Setup */}
					<div className='w-full'>
						<StepDomainSetup onNext={goNext} onSkip={goNext} />
					</div>

					{/* Step 4: Claude AI Auth */}
					<div className='w-full'>
						<StepClaudeAuth onNext={goNext} onSkip={goNext} />
					</div>

					{/* Step 5: All Done */}
					<div className='w-full'>
						<StepAllDone name={userName || 'friend'} />
					</div>
				</TransitionPanel>

				{/* Back button for steps 2-4 */}
				{activeStep >= 2 && activeStep <= 4 && (
					<motion.div
						initial={{opacity: 0}}
						animate={{opacity: 1}}
						transition={{delay: 0.2}}
					>
						<button onClick={goBack} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							{t('onboarding.back', {defaultValue: 'Back'})}
						</button>
					</motion.div>
				)}
			</div>

			<div className='flex-1' />
		</div>
	)
}
