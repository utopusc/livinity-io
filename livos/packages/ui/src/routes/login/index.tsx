import {AnimatePresence, motion} from 'motion/react'
import {useState} from 'react'
import {flushSync} from 'react-dom'
import {TbArrowLeft, TbLoader2} from 'react-icons/tb'

import {GlowEffect} from '@/components/motion-primitives/glow-effect'
import {PinInput} from '@/components/ui/pin-input'
import {useAuth} from '@/modules/auth/use-auth'
import {PasswordInput} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {transitionViewIfSupported} from '@/utils/misc'

import {Orb} from '@/components/ui/orb'

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
			} else {
				setPassword('')
				setOrbState('pulse')
				setTimeout(() => setOrbState('breathe'), 1500)
			}
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
		const res = await loginMut.mutateAsync({password, totpToken, username: selectedUser?.username})
		return !!res
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

function LoginShell({children}: {children: React.ReactNode}) {
	return (
		<div className='flex min-h-[calc(100dvh-40px)] w-full flex-col items-center justify-center px-4'>
			<div className='relative w-full max-w-md'>
				<GlowEffect
					colors={['#06B6D4', '#0891B2', '#22D3EE', '#67E8F9']}
					mode='breathe'
					blur='strong'
					scale={1.08}
					duration={5}
				/>
				<motion.div
					initial={{opacity: 0, scale: 0.96, y: 20}}
					animate={{opacity: 1, scale: 1, y: 0}}
					transition={{duration: 0.5, ease: 'easeOut'}}
					className='relative flex w-full flex-col items-center gap-6 rounded-3xl px-8 py-10 md:px-12 md:py-14'
					style={{
						background: 'rgba(255, 255, 255, 0.88)',
						backdropFilter: 'blur(24px)',
						WebkitBackdropFilter: 'blur(24px)',
						boxShadow: '0 8px 40px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
					}}
				>
					{children}
				</motion.div>
			</div>
		</div>
	)
}

// ── User Select ──────────────────────────────────────────────

function UserSelectStep({users, onSelect}: {users: LoginUser[]; onSelect: (u: LoginUser) => void}) {
	const orbSize = users.length === 1 ? 140 : users.length === 2 ? 110 : 88

	return (
		<motion.div
			initial={{opacity: 0}}
			animate={{opacity: 1}}
			exit={{opacity: 0, scale: 0.95}}
			transition={{duration: 0.3}}
			className='flex flex-col items-center gap-6'
		>
			<motion.h1
				className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'
				initial={{opacity: 0, y: 10}}
				animate={{opacity: 1, y: 0}}
				transition={{duration: 0.4}}
			>
				{t('login.title', {defaultValue: 'Welcome'})}
			</motion.h1>

			<div className='flex flex-wrap items-center justify-center gap-6 md:gap-8'>
				{users.map((user, i) => (
					<motion.button
						key={user.id}
						onClick={() => onSelect(user)}
						className='group flex flex-col items-center gap-3 rounded-2xl p-3 transition-all hover:bg-black/5'
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						transition={{delay: i * 0.1, duration: 0.4, ease: 'easeOut'}}
					>
						<div style={{width: orbSize, height: orbSize}} className='transition-transform duration-300 group-hover:scale-110'>
							<Orb
								state='breathe'
								className='h-full w-full'
								initials={getInitials(user.display_name)}
								userId={user.id}
							/>
						</div>
						<div className='flex flex-col items-center'>
							<span className='text-base font-bold text-text-primary md:text-lg'>{user.display_name}</span>
							<span className='text-xs text-text-tertiary capitalize'>{user.role}</span>
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
	return (
		<motion.div
			initial={{opacity: 0, y: 20}}
			animate={{opacity: 1, y: 0}}
			exit={{opacity: 0, y: -20}}
			transition={{duration: 0.35}}
			className='flex w-full max-w-sm flex-col items-center gap-6'
		>
			{onBack && (
				<button
					type='button'
					onClick={onBack}
					className='flex items-center gap-1.5 self-start text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'
				>
					<TbArrowLeft className='h-4 w-4' />
					{t('back')}
				</button>
			)}

			<h1 className='text-center text-display-sm font-bold leading-tight -tracking-2 text-text-primary md:text-56'>
				{t('login.title', {defaultValue: 'Welcome'})}
			</h1>

			{/* Orb avatar */}
			{user && (
				<div className='flex flex-col items-center gap-3'>
					<div className='h-32 w-32 md:h-40 md:w-40'>
						<Orb
								state={orbState}
								className='h-full w-full'
								initials={getInitials(user.display_name)}
								userId={user.id}
							/>
					</div>
					<span className='text-xl font-bold text-text-primary md:text-2xl'>{user.display_name}</span>
				</div>
			)}

			{/* Password form — no card, just floating over wallpaper */}
			<form className='flex w-full flex-col items-center gap-4' onSubmit={onSubmit}>
				<div className='w-full'>
					<PasswordInput
						label={t('login.password-label')}
						autoFocus
						value={password}
						onValueChange={setPassword}
						error={error}
					/>
				</div>
				<button
					type='submit'
					disabled={isPending || !password}
					className='flex h-11 w-full items-center justify-center rounded-xl bg-brand px-6 text-body-sm font-medium text-white shadow-[0_0_20px_rgba(6,182,212,0.2)] transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40'
				>
					{isPending ? <TbLoader2 className='h-4 w-4 animate-spin' /> : t('login.password.submit')}
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
