import {useState, useEffect, useRef, useCallback} from 'react'
import {motion} from 'framer-motion'
import {TbCloud, TbWorldWww} from 'react-icons/tb'

import {TextEffect} from '@/components/motion-primitives/text-effect'
import {TransitionPanel} from '@/components/motion-primitives/transition-panel'
import {GlowEffect} from '@/components/motion-primitives/glow-effect'
import LivinityLogo from '@/assets/livinity-logo'
import {StepIndicator} from '@/components/ui/step-indicator'
import {useLanguage} from '@/hooks/use-language'
import {animatedWallpapers, animatedWallpaperIds} from '@/components/animated-wallpapers'
import {useWallpaper} from '@/providers/wallpaper'
import {trpcReact, wsClient} from '@/trpc/trpc'
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

// ─── Domain Sub-Step Types ───────────────────────────────────────

type DomainSubStep = 'enter-domain' | 'choose-method' | 'tunnel' | 'dns-records' | 'verify' | 'activate'
type DomainMethod = 'tunnel' | 'direct'

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

const skipButtonClass = 'text-text-tertiary hover:text-text-secondary text-body-sm underline underline-offset-4 transition-colors'

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
		<button onClick={handleCopy} className='p-1.5 rounded text-text-tertiary hover:text-text-secondary transition-colors' title='Copy'>
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
					className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'
					delay={0.3}
				>
					Welcome to Livinity
				</TextEffect>
				<motion.p
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: 0.8, duration: 0.5}}
					className='text-center text-body font-medium text-text-secondary md:text-body-lg'
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
			// Force WebSocket to reconnect with the new JWT token
			// Without this, the WS was established at page load without auth,
			// and subsequent privateProcedure calls through WS would get 401
			wsClient.close()
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
				<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
					{t('onboarding.create-account', {defaultValue: 'Create your account'})}
				</h2>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg' style={{maxWidth: 400}}>
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
				<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
					{t('onboarding.personalize.title', {defaultValue: 'Make it yours'})}
				</h2>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg'>
					{t('onboarding.personalize.subtitle', {defaultValue: 'Choose a wallpaper for your dashboard'})}
				</p>
			</div>

			<div className='grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto w-full pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-default'>
				{animatedWallpaperIds.map((id) => (
					<motion.button
						key={id}
						onClick={() => setWallpaperId(id)}
						className={cn(
							'relative aspect-video rounded-xl transition-all duration-200 ring-2 overflow-hidden',
							wallpaper.id === id ? 'ring-brand scale-[1.02] shadow-[0_0_16px_rgba(139,92,246,0.4)]' : 'ring-transparent hover:ring-border-default',
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
				{t('continue', {defaultValue: 'Continue'})}
				<IconArrowRight size={16} />
			</button>
		</div>
	)
}

// ─── Step 3: Domain Setup (Skippable) ───────────────────────────

function StepDomainSetup({onNext, onSkip}: {onNext: () => void; onSkip: () => void}) {
	const [subStep, setSubStep] = useState<DomainSubStep>('enter-domain')
	const [domainMethod, setDomainMethod] = useState<DomainMethod | null>(null)
	const [domain, setDomain] = useState('')
	const [serverIp, setServerIp] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [activating, setActivating] = useState(false)
	const [activateError, setActivateError] = useState('')
	const [tunnelToken, setTunnelToken] = useState('')
	const [tunnelError, setTunnelError] = useState('')

	const ipQuery = trpcReact.domain.getPublicIp.useQuery()
	const setDomainMutation = trpcReact.domain.setDomain.useMutation()
	const activateMutation = trpcReact.domain.activate.useMutation()
	const configureTunnelM = trpcReact.domain.tunnel.configure.useMutation()

	const verifyQuery = trpcReact.domain.verifyDns.useQuery(undefined, {
		enabled: subStep === 'verify',
		refetchInterval: subStep === 'verify' ? 10_000 : false,
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
			setSubStep('choose-method')
		} catch {
			// error handled by tRPC
		} finally {
			setSaving(false)
		}
	}, [domain, setDomainMutation])

	const handleSelectMethod = useCallback((selected: DomainMethod) => {
		setDomainMethod(selected)
		if (selected === 'tunnel') {
			setSubStep('tunnel')
		} else {
			setSubStep('dns-records')
		}
	}, [])

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

	const handleConnectTunnel = async () => {
		setTunnelError('')
		try {
			await configureTunnelM.mutateAsync({token: tunnelToken, domain})
			onNext()
		} catch (err: any) {
			setTunnelError(err.message || 'Failed to configure tunnel')
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
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						{t('onboarding.domain.title', {defaultValue: 'Connect your domain'})}
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg'>
					{t('onboarding.domain.subtitle', {defaultValue: 'Set up a custom domain with HTTPS for your server'})}
				</p>
			</div>

			{/* Sub-step: Enter domain */}
			{subStep === 'enter-domain' && (
				<motion.div
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					className='w-full space-y-4'
				>
					<div>
						<label className='mb-1.5 block text-caption font-medium text-text-tertiary'>Domain name</label>
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
						<div className='flex items-center gap-2 rounded-xl bg-surface-1 border border-border-subtle px-4 py-3'>
							<IconGlobe size={14} className='text-blue-400' />
							<span className='text-caption text-text-tertiary'>Server IP:</span>
							<span className='font-mono text-caption text-text-primary'>{serverIp}</span>
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

			{/* Sub-step: Choose connection method */}
			{subStep === 'choose-method' && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-text-primary'>Choose connection method</h3>
						<p className='mt-1 text-caption text-text-tertiary'>
							How would you like to expose your server to the internet?
						</p>
					</div>

					<div className='space-y-3'>
						{/* Cloudflare Tunnel */}
						<button
							onClick={() => handleSelectMethod('tunnel')}
							className='w-full rounded-xl border border-border-default bg-surface-base px-4 py-4 text-left transition-all hover:border-violet-400/50 hover:bg-surface-1 group'
						>
							<div className='flex items-start gap-3'>
								<div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-500/15 group-hover:bg-orange-500/20 transition-colors'>
									<TbCloud size={18} className='text-orange-400' />
								</div>
								<div className='flex-1 min-w-0'>
									<div className='flex items-center gap-2'>
										<span className='text-body font-medium text-text-primary'>Cloudflare Tunnel</span>
										<span className='rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400'>
											Recommended
										</span>
									</div>
									<p className='mt-0.5 text-caption text-text-tertiary'>
										No port forwarding. Secure tunnel via Cloudflare Zero Trust.
									</p>
								</div>
								<IconArrowRight size={14} className='mt-1 flex-shrink-0 text-text-tertiary group-hover:text-text-secondary transition-colors' />
							</div>
						</button>

						{/* Direct DNS */}
						<button
							onClick={() => handleSelectMethod('direct')}
							className='w-full rounded-xl border border-border-default bg-surface-base px-4 py-4 text-left transition-all hover:border-violet-400/50 hover:bg-surface-1 group'
						>
							<div className='flex items-start gap-3'>
								<div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/15 group-hover:bg-blue-500/20 transition-colors'>
									<TbWorldWww size={18} className='text-blue-400' />
								</div>
								<div className='flex-1 min-w-0'>
									<span className='text-body font-medium text-text-primary'>Direct (DNS + Let's Encrypt)</span>
									<p className='mt-0.5 text-caption text-text-tertiary'>
										Point your domain's A record to this server. Requires open ports 80/443.
									</p>
								</div>
								<IconArrowRight size={14} className='mt-1 flex-shrink-0 text-text-tertiary group-hover:text-text-secondary transition-colors' />
							</div>
						</button>
					</div>

					<div className='flex justify-start'>
						<button onClick={() => setSubStep('enter-domain')} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							Back
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step: Configure Cloudflare Tunnel */}
			{subStep === 'tunnel' && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-text-primary'>Configure Cloudflare Tunnel</h3>
						<p className='mt-1 text-caption text-text-tertiary'>
							Paste your tunnel token to connect{' '}
							<span className='font-mono text-text-secondary'>{domain}</span> securely.
						</p>
					</div>

					<div className='space-y-2 rounded-xl border border-border-default bg-surface-base p-4 text-caption text-text-secondary'>
						<p className='font-medium text-text-primary'>How to get your tunnel token:</p>
						<ol className='space-y-1 pl-4'>
							<li className='list-decimal'>
								Go to{' '}
								<a
									href='https://one.dash.cloudflare.com/'
									target='_blank'
									rel='noopener noreferrer'
									className='inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors'
								>
									Cloudflare Zero Trust Dashboard
									<IconExternalLink size={11} className='ml-0.5' />
								</a>
							</li>
							<li className='list-decimal'>Navigate to <span className='text-text-primary'>Networks → Tunnels</span></li>
							<li className='list-decimal'>Create a tunnel → Choose <span className='text-text-primary'>Cloudflared</span></li>
							<li className='list-decimal'>Copy the token from the install command</li>
						</ol>
					</div>

					<div>
						<label className='mb-1.5 block text-caption font-medium text-text-tertiary'>Tunnel Token</label>
						<textarea
							value={tunnelToken}
							onChange={(e) => setTunnelToken(e.target.value)}
							placeholder='eyJhIjoiMTIz...'
							rows={3}
							className='w-full rounded-xl border border-border-default bg-surface-base px-4 py-2.5 font-mono text-caption text-text-primary placeholder-text-tertiary outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25 resize-none'
						/>
					</div>

					{tunnelError && (
						<div className='flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-caption text-red-400'>
							<IconAlertCircle size={14} className='mt-0.5 flex-shrink-0' />
							<span>{tunnelError}</span>
						</div>
					)}

					<div className='flex items-center justify-between'>
						<button
							onClick={() => setSubStep('choose-method')}
							disabled={configureTunnelM.isPending}
							className={secondaryButtonClass}
						>
							<IconArrowLeft size={14} />
							Back
						</button>
						<button
							onClick={handleConnectTunnel}
							disabled={!tunnelToken.trim() || configureTunnelM.isPending}
							className={cn(primaryButtonClass, 'bg-orange-600 shadow-[0_0_20px_rgba(234,88,12,0.25)] hover:bg-orange-500')}
						>
							{configureTunnelM.isPending ? (
								<IconLoader2 size={16} className='animate-spin' />
							) : (
								<TbCloud size={16} />
							)}
							Connect
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step: DNS records */}
			{subStep === 'dns-records' && serverIp && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-text-primary'>Add DNS record</h3>
						<p className='mt-1 text-caption text-text-tertiary'>
							Go to your domain registrar and add the following DNS record:
						</p>
					</div>

					<div className='overflow-hidden rounded-xl border border-border-default bg-surface-base'>
						<table className='w-full text-left text-caption'>
							<thead>
								<tr className='border-b border-border-subtle'>
									<th className='px-4 py-2.5 font-medium text-text-tertiary'>Type</th>
									<th className='px-4 py-2.5 font-medium text-text-tertiary'>Name</th>
									<th className='px-4 py-2.5 font-medium text-text-tertiary'>Value</th>
									<th className='px-4 py-2.5 font-medium text-text-tertiary'>TTL</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td className='px-4 py-3'>
										<span className='rounded bg-blue-500/20 px-2 py-0.5 font-mono font-medium text-blue-400'>A</span>
									</td>
									<td className='px-4 py-3'>
										<div className='flex items-center gap-1.5'>
											<span className='font-mono text-text-primary'>{hostName}</span>
											<CopyButton text={hostName} />
										</div>
									</td>
									<td className='px-4 py-3'>
										<div className='flex items-center gap-1.5'>
											<span className='font-mono text-text-primary'>{serverIp}</span>
											<CopyButton text={serverIp} />
										</div>
									</td>
									<td className='px-4 py-3'>
										<span className='font-mono text-text-tertiary'>300</span>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div className='rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-caption text-amber-400/80'>
						DNS changes can take a few minutes to propagate. Setting TTL to 300 (5 minutes) helps speed this up.
					</div>

					<div className='flex items-center justify-between'>
						<button onClick={() => setSubStep('choose-method')} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							Back
						</button>
						<button onClick={() => setSubStep('verify')} className={primaryButtonClass}>
							I've added the record
							<IconArrowRight size={14} />
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step: Verify DNS */}
			{subStep === 'verify' && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-text-primary'>Verify DNS</h3>
						<p className='mt-1 text-caption text-text-tertiary'>
							Checking if <span className='font-mono text-text-secondary'>{domain}</span> points to your server...
						</p>
					</div>

					<div className='rounded-xl border border-border-default bg-surface-base p-4'>
						{verifyQuery.isFetching ? (
							<div className='flex items-center gap-3'>
								<IconLoader2 size={18} className='animate-spin text-brand' />
								<span className='text-body text-text-secondary'>Checking DNS records...</span>
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
									<p className='mt-0.5 text-caption text-text-tertiary'>
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
										<p className='mt-0.5 text-caption text-text-tertiary'>DNS records may need more time to propagate.</p>
									</div>
								</div>

								{verifyQuery.data && (
									<div className='rounded-lg bg-surface-1 px-3 py-2 text-caption'>
										<div className='flex items-center justify-between'>
											<span className='text-text-tertiary'>Current:</span>
											<span className='font-mono text-text-secondary'>{verifyQuery.data.currentIp || 'No A record found'}</span>
										</div>
										<div className='mt-1 flex items-center justify-between'>
											<span className='text-text-tertiary'>Expected:</span>
											<span className='font-mono text-text-secondary'>{verifyQuery.data.expected}</span>
										</div>
									</div>
								)}

								<p className='text-caption-sm text-text-tertiary'>Auto-checking every 10 seconds...</p>
							</div>
						)}
					</div>

					{!isMatch && (
						<button
							onClick={() => verifyQuery.refetch()}
							className='flex items-center gap-2 text-caption text-text-tertiary transition-colors hover:text-text-secondary'
						>
							<IconRefresh size={14} />
							Check again
						</button>
					)}

					<div className='flex items-center justify-between'>
						<button onClick={() => setSubStep('dns-records')} className={secondaryButtonClass}>
							<IconArrowLeft size={14} />
							Back
						</button>
						<button
							onClick={() => setSubStep('activate')}
							disabled={!isMatch}
							className={primaryButtonClass}
						>
							Next
							<IconArrowRight size={14} />
						</button>
					</div>
				</motion.div>
			)}

			{/* Sub-step: Activate HTTPS */}
			{subStep === 'activate' && (
				<motion.div
					initial={{opacity: 0, x: 40}}
					animate={{opacity: 1, x: 0}}
					transition={{type: 'spring', stiffness: 300, damping: 30}}
					className='w-full space-y-4'
				>
					<div>
						<h3 className='text-body font-semibold text-text-primary'>Activate HTTPS</h3>
						<p className='mt-1 text-caption text-text-tertiary'>
							DNS is verified. Ready to enable HTTPS for <span className='font-mono text-text-secondary'>{domain}</span>.
						</p>
					</div>

					<div className='space-y-3 rounded-xl border border-border-default bg-surface-base p-4'>
						<div className='flex items-start gap-3'>
							<IconLock size={16} className='mt-0.5 flex-shrink-0 text-green-400' />
							<div>
								<p className='text-body text-text-primary'>Free SSL certificate from Let's Encrypt</p>
								<p className='mt-0.5 text-caption text-text-tertiary'>
									Caddy will automatically obtain and renew a certificate.
								</p>
							</div>
						</div>
						<div className='flex items-start gap-3'>
							<IconGlobe size={16} className='mt-0.5 flex-shrink-0 text-blue-400' />
							<div>
								<p className='text-body text-text-primary'>HTTP to HTTPS redirect</p>
								<p className='mt-0.5 text-caption text-text-tertiary'>
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
						<button onClick={() => setSubStep('verify')} className={secondaryButtonClass}>
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

// ─── Step 4: Kimi AI Auth (Skippable) ────────────────────────────

function StepKimiAuth({onNext, onSkip}: {onNext: () => void; onSkip: () => void}) {
	const [loginSession, setLoginSession] = useState<{
		sessionId: string
		verificationUrl: string
		userCode: string
	} | null>(null)

	const kimiStatusQ = trpcReact.ai.getKimiStatus.useQuery()
	const utils = trpcReact.useUtils()

	const authenticated = kimiStatusQ.data?.authenticated ?? false

	const kimiLoginMutation = trpcReact.ai.kimiLogin.useMutation({
		onSuccess: (data) => {
			setLoginSession(data)
		},
	})

	// Poll login session for auth completion
	const pollQ = trpcReact.ai.kimiLoginPoll.useQuery(
		{sessionId: loginSession?.sessionId ?? ''},
		{enabled: !!loginSession, refetchInterval: 2000},
	)

	// When poll returns success or status becomes connected, clear login session
	useEffect(() => {
		if (pollQ.data?.status === 'success' || (authenticated && loginSession)) {
			setLoginSession(null)
			utils.ai.getKimiStatus.invalidate()
		}
	}, [pollQ.data?.status, authenticated, loginSession, utils.ai.getKimiStatus])

	return (
		<div className='flex flex-col items-center gap-5 w-full'>
			<div className='flex flex-col items-center gap-2'>
				<div className='flex items-center gap-2'>
					<IconSparkles size={20} className='text-brand' />
					<h2 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
						{t('onboarding.kimi.title', {defaultValue: 'Connect Kimi AI'})}
					</h2>
				</div>
				<p className='text-center text-body font-medium text-text-secondary md:text-body-lg' style={{maxWidth: 420}}>
					{t('onboarding.kimi.subtitle', {defaultValue: 'Sign in with your Kimi account to enable AI features'})}
				</p>
			</div>

			<div className='w-full rounded-xl border border-border-default bg-surface-base p-5 space-y-4'>
				{kimiStatusQ.isLoading ? (
					<div className='flex items-center justify-center gap-2 py-4 text-text-secondary'>
						<IconLoader2 size={18} className='animate-spin' />
						<span className='text-body'>Checking status...</span>
					</div>
				) : authenticated ? (
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
							<p className='text-body font-medium text-green-400'>
								{t('onboarding.kimi.connected', {defaultValue: 'Connected'})}
							</p>
							<p className='mt-0.5 text-caption text-text-tertiary'>
								{t('onboarding.kimi.connected-desc', {defaultValue: 'Kimi AI is ready to use'})}
							</p>
						</div>
					</motion.div>
				) : loginSession ? (
					<div className='space-y-4'>
						<div className='flex items-center justify-center gap-2 text-blue-400'>
							<IconLoader2 size={18} className='animate-spin' />
							<span className='text-body'>Waiting for authorization...</span>
						</div>
						<div className='rounded-lg border border-border-default bg-surface-raised p-4 text-center space-y-2'>
							<p className='text-caption text-text-secondary'>Enter this code on the Kimi page:</p>
							<p className='text-display-sm font-mono font-bold text-text-primary tracking-widest'>
								{loginSession.userCode}
							</p>
						</div>
						<a
							href={loginSession.verificationUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='block'
						>
							<button className={cn(primaryButtonClass, 'w-full')}>
								Open Kimi Authorization Page
								<IconExternalLink size={16} />
							</button>
						</a>
						<button
							onClick={() => setLoginSession(null)}
							className={cn(skipButtonClass, 'w-full')}
						>
							Cancel
						</button>

						{kimiLoginMutation.isError && (
							<AnimatedInputError>{kimiLoginMutation.error.message}</AnimatedInputError>
						)}
					</div>
				) : (
					<div className='space-y-4'>
						<button
							onClick={() => kimiLoginMutation.mutate()}
							disabled={kimiLoginMutation.isPending}
							className={cn(primaryButtonClass, 'w-full')}
						>
							{kimiLoginMutation.isPending ? (
								<>
									<IconLoader2 size={16} className='animate-spin' />
									{t('onboarding.kimi.validating', {defaultValue: 'Starting login...'})}
								</>
							) : (
								<>
									<IconSparkles size={16} />
									{t('onboarding.kimi.validate', {defaultValue: 'Sign in with Kimi'})}
								</>
							)}
						</button>

						{kimiLoginMutation.isError && (
							<AnimatedInputError>{kimiLoginMutation.error.message}</AnimatedInputError>
						)}
					</div>
				)}
			</div>

			{/* Next / Skip */}
			{authenticated && (
				<motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}}>
					<button onClick={onNext} className={primaryButtonClass}>
						{t('continue', {defaultValue: 'Continue'})}
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
					className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'
					delay={0.4}
				>
					{`You're all set, ${firstName}!`}
				</TextEffect>
				<motion.p
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{delay: 0.9, duration: 0.5}}
					className='text-center text-body font-medium text-text-secondary md:text-body-lg'
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
					'flex w-full flex-col items-center gap-6 rounded-3xl border border-border-default px-6 py-8 md:px-10 md:py-12',
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

					{/* Step 4: Kimi AI Auth */}
					<div className='w-full'>
						<StepKimiAuth onNext={goNext} onSkip={goNext} />
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
