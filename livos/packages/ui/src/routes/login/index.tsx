import {AnimatePresence, motion} from 'motion/react'
import {useState} from 'react'
import {flushSync} from 'react-dom'
import {TbArrowLeft, TbArrowRight, TbLoader2} from 'react-icons/tb'

import {PinInput} from '@/components/ui/pin-input'
import {useAuth} from '@/modules/auth/use-auth'
import {PasswordInput} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {transitionViewIfSupported} from '@/utils/misc'

import {Orb} from '@/components/ui/orb'
import {LivinityMark} from '@/components/livinity-brand'

type LoginUser = {
	id: string
	username: string
	display_name: string
	avatar_color: string
	role: string
}

type Step = 'select-user' | 'password' | '2fa'

function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.map((w) => w[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase()
}

/** Generate deterministic orb colors from user's avatar_color */
function orbColorsFromAvatar(avatarColor: string): [string, string] {
	// Parse hex to slightly shift for second color
	try {
		const r = parseInt(avatarColor.slice(1, 3), 16)
		const g = parseInt(avatarColor.slice(3, 5), 16)
		const b = parseInt(avatarColor.slice(5, 7), 16)
		const c2r = Math.min(255, r + 40)
		const c2g = Math.min(255, g + 30)
		const c2b = Math.min(255, b + 20)
		return [avatarColor, `#${c2r.toString(16).padStart(2, '0')}${c2g.toString(16).padStart(2, '0')}${c2b.toString(16).padStart(2, '0')}`]
	} catch {
		return ['#06B6D4', '#22D3EE']
	}
}

/** Hash string to number for orb seed */
function hashStr(s: string): number {
	let h = 0
	for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
	return Math.abs(h)
}

export default function MultiUserLogin() {
	const [selectedUser, setSelectedUser] = useState<LoginUser | null>(null)
	const [password, setPassword] = useState('')
	const [step, setStep] = useState<Step>('select-user')
	const [orbState, setOrbState] = useState<'idle' | 'pulse' | 'breathe'>('breathe')

	const {loginWithJwt} = useAuth()
	const usersQ = trpcReact.user.listUsers.useQuery()
	const users = usersQ.data ?? []
	const isMultiUser = users.length > 1

	const loginMut = trpcReact.user.login.useMutation({
		onSuccess: loginWithJwt,
		onError: (error) => {
			if (error.message === 'Missing 2FA code') {
				setStep('2fa')
				return
			}
			// Wrong 2FA code: keep the password and stay on the 2FA step so the user
			// can retry the code without re-entering their password (PinInput clears +
			// refocuses its own 6-digit input). Clearing the password here used to
			// break every retry — the next attempt sent an empty password → "Incorrect
			// password" → the user had to refresh the whole page and start over.
			if (error.message !== 'Incorrect 2FA code') {
				setPassword('')
			}
			setOrbState('pulse')
			setTimeout(() => setOrbState('breathe'), 1500)
		},
	})

	const handleSelectUser = (user: LoginUser) => {
		setSelectedUser(user)
		setPassword('')
		loginMut.reset()
		transitionViewIfSupported(() => flushSync(() => setStep('password')))
	}

	const handleBack = () => {
		setSelectedUser(null)
		setPassword('')
		loginMut.reset()
		transitionViewIfSupported(() => flushSync(() => setStep('select-user')))
	}

	const handleSubmitPassword = (e: React.FormEvent) => {
		e.preventDefault()
		setOrbState('pulse')
		if (selectedUser) {
			loginMut.mutate({password, username: selectedUser.username})
		} else {
			loginMut.mutate({password})
		}
	}

	const handleSubmit2fa = async (totpToken: string) => {
		try {
			await loginMut.mutateAsync({password, totpToken, username: selectedUser?.username})
			return true
		} catch {
			// Wrong code (or a transient error) — return false so PinInput resets its
			// input for another attempt. The password is preserved (see onError), so
			// the user can immediately retry the 6-digit code.
			return false
		}
	}

	if (usersQ.isLoading) {
		return (
			<LoginShell>
				<TbLoader2 className='h-6 w-6 animate-spin text-white/40' />
			</LoginShell>
		)
	}

	// Single user
	if (!isMultiUser) {
		const user = users[0]
		return (
			<LoginShell>
				<AnimatePresence mode='wait'>
					{step === '2fa' ? (
						<TwoFAStep key='2fa' onSubmit={handleSubmit2fa} onBack={() => setStep('select-user')} />
					) : (
						<PasswordStep
							key='pw'
							user={user}
							orbState={orbState}
							password={password}
							setPassword={setPassword}
							onSubmit={handleSubmitPassword}
							error={loginMut.error?.message}
							isPending={loginMut.isPending}
						/>
					)}
				</AnimatePresence>
			</LoginShell>
		)
	}

	// Multi user
	return (
		<LoginShell>
			<AnimatePresence mode='wait'>
				{step === 'select-user' && (
					<UserSelectStep key='select' users={users} onSelect={handleSelectUser} />
				)}
				{step === 'password' && selectedUser && (
					<PasswordStep
						key='pw'
						user={selectedUser}
						orbState={orbState}
						password={password}
						setPassword={setPassword}
						onSubmit={handleSubmitPassword}
						onBack={handleBack}
						error={loginMut.error?.message}
						isPending={loginMut.isPending}
					/>
				)}
				{step === '2fa' && (
					<TwoFAStep key='2fa' onSubmit={handleSubmit2fa} onBack={() => setStep('password')} />
				)}
			</AnimatePresence>
		</LoginShell>
	)
}

// ── Shell ────────────────────────────────────────────────────
// v36 LivOS Design Port — login redesign matching livinity.io/login
// (.planning/design-system/livinity-design-system.html § auth.html). No
// glassy card, no cyan glow — just the clean monochrome editorial layout.
// Black donut brand mark, mono eyebrow with bullet dot, "Welcome back."
// headline with italic-serif accent, hairline form fields, fg/bg invert
// primary CTA with arrow.

function LoginShell({children}: {children: React.ReactNode}) {
	return (
		<div className='fixed inset-0 flex w-full flex-col items-center justify-center bg-[color:var(--bg)] px-6'>
			<motion.div
				initial={{opacity: 0, y: 16}}
				animate={{opacity: 1, y: 0}}
				transition={{duration: 0.5, ease: [0.2, 0.7, 0.2, 1]}}
				className='flex w-full max-w-[420px] flex-col items-center gap-7'
			>
				{children}
			</motion.div>
		</div>
	)
}

/**
 * The Livinity brand mark — the canonical donut from logo.html. Wraps the
 * shared `<LivinityMark size="xl" />` so login automatically follows whichever
 * theme is active (dark donut on light shell, light donut on dark shell).
 */
function BrandMark() {
	return <LivinityMark size='xl' />
}

function FormEyebrow({children}: {children: React.ReactNode}) {
	return (
		<div className='font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--fg-mute)] flex items-center gap-2'>
			<span className='inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--fg)]' aria-hidden='true' />
			{children}
		</div>
	)
}

// ── User Select ──────────────────────────────────────────────

function UserSelectStep({users, onSelect}: {users: LoginUser[]; onSelect: (u: LoginUser) => void}) {
	const orbSize = users.length <= 2 ? 80 : 64

	return (
		<motion.div
			initial={{opacity: 0}}
			animate={{opacity: 1}}
			exit={{opacity: 0, scale: 0.97}}
			transition={{duration: 0.3}}
			className='flex w-full flex-col items-center gap-6'
		>
			<BrandMark />
			<FormEyebrow>Sign in to LivOS</FormEyebrow>
			<h1 className='text-center text-[clamp(34px,4vw,46px)] font-medium leading-[1.05] tracking-[-0.035em] text-[color:var(--fg)] text-balance'>
				Welcome <em className='font-normal not-italic text-[color:var(--fg-mute)]'>back.</em>
			</h1>
			<p className='text-center text-[15px] leading-[1.5] text-[color:var(--fg-mute)] max-w-[38ch]'>
				Pick a user to sign in to your LivOS computer.
			</p>

			<div className='flex w-full flex-wrap items-center justify-center gap-4 pt-2'>
				{users.map((user, i) => (
					<motion.button
						key={user.id}
						onClick={() => onSelect(user)}
						className='group flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors hover:bg-[color:var(--bg-2)]'
						initial={{opacity: 0, y: 10}}
						animate={{opacity: 1, y: 0}}
						transition={{delay: i * 0.06, duration: 0.4, ease: [0.2, 0.7, 0.2, 1]}}
					>
						<div style={{width: orbSize, height: orbSize}} className='transition-transform duration-200 group-hover:-translate-y-px'>
							<Orb state='breathe' className='h-full w-full' initials={getInitials(user.display_name)} userId={user.id} />
						</div>
						<div className='flex flex-col items-center'>
							<span className='text-[13px] font-medium text-[color:var(--fg)]'>{user.display_name}</span>
							<span className='text-[11px] text-[color:var(--fg-faint)] capitalize'>{user.role}</span>
						</div>
					</motion.button>
				))}
			</div>
		</motion.div>
	)
}

// ── Password ─────────────────────────────────────────────────

function PasswordStep({
	user,
	orbState,
	password,
	setPassword,
	onSubmit,
	onBack,
	error,
	isPending,
}: {
	user?: LoginUser
	orbState: 'idle' | 'pulse' | 'breathe'
	password: string
	setPassword: (v: string) => void
	onSubmit: (e: React.FormEvent) => void
	onBack?: () => void
	error?: string
	isPending: boolean
}) {
	const firstName = user?.display_name?.split(/\s+/)[0]
	return (
		<motion.div
			initial={{opacity: 0, y: 16}}
			animate={{opacity: 1, y: 0}}
			exit={{opacity: 0, y: -10}}
			transition={{duration: 0.35, ease: [0.2, 0.7, 0.2, 1]}}
			className='flex w-full flex-col items-center gap-6'
		>
			{onBack && (
				<button
					type='button'
					onClick={onBack}
					className='flex items-center gap-1.5 self-start text-[12px] font-medium text-[color:var(--fg-mute)] transition-colors hover:text-[color:var(--fg)]'
				>
					<TbArrowLeft className='h-3.5 w-3.5' />
					Back
				</button>
			)}

			<BrandMark />
			<FormEyebrow>Sign in to LivOS</FormEyebrow>
			<h1 className='text-center text-[clamp(34px,4vw,46px)] font-medium leading-[1.05] tracking-[-0.035em] text-[color:var(--fg)] text-balance'>
				Welcome{firstName ? <span>, <em className='font-serif italic font-normal text-[color:var(--fg-mute)]'>{firstName}.</em></span> : <em className='font-normal not-italic text-[color:var(--fg-mute)]'> back.</em>}
			</h1>
			<p className='text-center text-[15px] leading-[1.5] text-[color:var(--fg-mute)] max-w-[38ch] -mt-3'>
				Sign in to pick up where you left off.
			</p>

			{/* Orb avatar — kept as user-identity signal; sized down to match v36 restraint */}
			{user && (
				<div className='h-16 w-16 mt-1'>
					<Orb state={orbState} className='h-full w-full' initials={getInitials(user.display_name)} userId={user.id} />
				</div>
			)}

			<form className='flex w-full flex-col gap-4 mt-2' onSubmit={onSubmit}>
				<div className='flex flex-col gap-1.5'>
					<label className='font-mono text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--fg-mute)] pl-1'>
						Password
					</label>
					<PasswordInput
						autoFocus
						value={password}
						onValueChange={setPassword}
						error={error}
					/>
				</div>
				<button
					type='submit'
					disabled={isPending || !password}
					className='mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[color:var(--fg)] px-6 text-[15px] font-medium tracking-[-0.005em] text-[color:var(--bg)] transition-all duration-200 hover:opacity-90 hover:-translate-y-px active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fg)]/20 disabled:pointer-events-none disabled:opacity-40'
				>
					{isPending ? (
						<TbLoader2 className='h-4 w-4 animate-spin' />
					) : (
						<>
							Sign in
							<TbArrowRight className='h-4 w-4' strokeWidth={2.25} />
						</>
					)}
				</button>
			</form>
		</motion.div>
	)
}

// ── 2FA ──────────────────────────────────────────────────────

function TwoFAStep({onSubmit, onBack}: {onSubmit: (code: string) => Promise<boolean>; onBack: () => void}) {
	return (
		<motion.div
			initial={{opacity: 0, y: 20}}
			animate={{opacity: 1, y: 0}}
			exit={{opacity: 0, y: -20}}
			transition={{duration: 0.3}}
			className='flex flex-col items-center gap-6'
		>
			<div className='text-center'>
				<h2 className='text-heading font-semibold text-text-primary -tracking-2'>{t('login-2fa.title')}</h2>
				<p className='mt-1 text-body-sm text-text-secondary'>{t('login-2fa.subtitle')}</p>
			</div>
			<PinInput autoFocus length={6} onCodeCheck={onSubmit} />
			<button type='button' onClick={onBack} className='text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'>
				{t('back')}
			</button>
		</motion.div>
	)
}

// ── Fallback Avatar (no WebGL) ───────────────────────────────

function FallbackAvatar({user, size}: {user: LoginUser; size: number}) {
	return (
		<div
			className='flex items-center justify-center rounded-full font-semibold text-white shadow-lg'
			style={{
				width: size,
				height: size,
				backgroundColor: user.avatar_color,
				fontSize: size * 0.35,
			}}
		>
			{getInitials(user.display_name)}
		</div>
	)
}
