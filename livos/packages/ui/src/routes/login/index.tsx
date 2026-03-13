import {AnimatePresence, motion} from 'motion/react'
import {useState} from 'react'
import {flushSync} from 'react-dom'
import {TbArrowLeft, TbLoader2} from 'react-icons/tb'

import LivinityLogo from '@/assets/livinity-logo'
import {PinInput} from '@/components/ui/pin-input'
import {useAuth} from '@/modules/auth/use-auth'
import {PasswordInput} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {transitionViewIfSupported} from '@/utils/misc'

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
		.map((word) => word[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase()
}

export default function MultiUserLogin() {
	const [selectedUser, setSelectedUser] = useState<LoginUser | null>(null)
	const [password, setPassword] = useState('')
	const [step, setStep] = useState<Step>('select-user')

	const {loginWithJwt} = useAuth()

	const usersQ = trpcReact.user.listUsers.useQuery()
	const users = usersQ.data ?? []

	// Determine if we're in multi-user mode (more than one user in the DB)
	const isMultiUser = users.length > 1

	const loginMut = trpcReact.user.login.useMutation({
		onSuccess: loginWithJwt,
		onError: (error) => {
			if (error.message === 'Missing 2FA code') {
				setStep('2fa')
			} else {
				setPassword('')
			}
		},
	})

	const handleSelectUser = (user: LoginUser) => {
		setSelectedUser(user)
		setPassword('')
		loginMut.reset()
		transitionViewIfSupported(() => {
			flushSync(() => {
				setStep('password')
			})
		})
	}

	const handleBack = () => {
		setSelectedUser(null)
		setPassword('')
		loginMut.reset()
		transitionViewIfSupported(() => {
			flushSync(() => {
				setStep('select-user')
			})
		})
	}

	const handleSubmitPassword = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (selectedUser) {
			loginMut.mutate({password, username: selectedUser.username})
		} else {
			// Fallback: legacy single-user
			loginMut.mutate({password})
		}
	}

	const handleSubmit2fa = async (totpToken: string) => {
		const res = await loginMut.mutateAsync({
			password,
			totpToken,
			username: selectedUser?.username,
		})
		return !!res
	}

	// If the user list is loading
	if (usersQ.isLoading) {
		return (
			<LoginContainer>
				<div className='flex items-center justify-center py-12'>
					<TbLoader2 className='h-6 w-6 animate-spin text-text-tertiary' />
				</div>
			</LoginContainer>
		)
	}

	// If there are no users in DB or only one user, show classic login
	if (!isMultiUser) {
		const singleUser = users[0]

		return (
			<LoginContainer>
				<AnimatePresence mode='wait'>
					{step === '2fa' ? (
						<motion.div
							key='2fa'
							initial={{opacity: 0, y: 20}}
							animate={{opacity: 1, y: 0}}
							exit={{opacity: 0, y: -20}}
							transition={{duration: 0.3, ease: 'easeOut'}}
							className='flex w-full flex-col items-center gap-6'
						>
							<div className='text-center'>
								<h2 className='text-heading font-semibold -tracking-2'>{t('login-2fa.title')}</h2>
								<p className='mt-1 text-body-sm text-text-secondary'>{t('login-2fa.subtitle')}</p>
							</div>
							<PinInput autoFocus length={6} onCodeCheck={handleSubmit2fa} />
							<button
								type='button'
								onClick={() => setStep('select-user')}
								className='text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'
							>
								{t('back')}
							</button>
						</motion.div>
					) : (
						<motion.div
							key='password'
							initial={{opacity: 0, y: 20}}
							animate={{opacity: 1, y: 0}}
							exit={{opacity: 0, y: -20}}
							transition={{duration: 0.3, ease: 'easeOut'}}
							className='flex w-full flex-col items-center gap-6'
						>
							{singleUser && (
								<div className='flex flex-col items-center gap-2'>
									<UserAvatar user={singleUser} size='lg' />
									<span className='text-body font-medium text-text-primary'>{singleUser.display_name}</span>
								</div>
							)}
							<form className='flex w-full flex-col items-center gap-4' onSubmit={handleSubmitPassword}>
								<div className='w-full max-w-xs'>
									<PasswordInput
										label={t('login.password-label')}
										autoFocus
										value={password}
										onValueChange={setPassword}
										error={loginMut.error?.message}
									/>
								</div>
								<button
									type='submit'
									disabled={loginMut.isPending || !password}
									className='flex h-11 min-w-[140px] items-center justify-center rounded-full bg-brand px-6 text-body-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'
								>
									{loginMut.isPending ? (
										<TbLoader2 className='h-4 w-4 animate-spin' />
									) : (
										t('login.password.submit')
									)}
								</button>
							</form>
						</motion.div>
					)}
				</AnimatePresence>
			</LoginContainer>
		)
	}

	// Multi-user mode
	return (
		<LoginContainer>
			<AnimatePresence mode='wait'>
				{step === 'select-user' && (
					<motion.div
						key='select'
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -20}}
						transition={{duration: 0.3, ease: 'easeOut'}}
						className='flex w-full flex-col items-center gap-6'
					>
						<p className='text-body-sm text-text-secondary'>Select your account</p>
						<div className='flex flex-wrap items-center justify-center gap-5'>
							{users.map((user, i) => (
								<motion.button
									key={user.id}
									onClick={() => handleSelectUser(user)}
									className='group flex flex-col items-center gap-2.5 rounded-2xl p-3 transition-colors hover:bg-white/60'
									initial={{opacity: 0, scale: 0.8}}
									animate={{opacity: 1, scale: 1}}
									transition={{delay: i * 0.06, duration: 0.35, ease: 'easeOut'}}
								>
									<UserAvatar user={user} size='lg' />
									<div className='flex flex-col items-center'>
										<span className='text-body-sm font-medium text-text-primary'>{user.display_name}</span>
										<span className='text-caption text-text-tertiary capitalize'>{user.role}</span>
									</div>
								</motion.button>
							))}
						</div>
					</motion.div>
				)}

				{step === 'password' && selectedUser && (
					<motion.div
						key='password'
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -20}}
						transition={{duration: 0.3, ease: 'easeOut'}}
						className='flex w-full flex-col items-center gap-6'
					>
						<button
							type='button'
							onClick={handleBack}
							className='flex items-center gap-1.5 self-start text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'
						>
							<TbArrowLeft className='h-4 w-4' />
							{t('back')}
						</button>

						<div className='flex flex-col items-center gap-2'>
							<UserAvatar user={selectedUser} size='lg' />
							<span className='text-body font-medium text-text-primary'>{selectedUser.display_name}</span>
						</div>

						<form className='flex w-full flex-col items-center gap-4' onSubmit={handleSubmitPassword}>
							<div className='w-full max-w-xs'>
								<PasswordInput
									label={t('login.password-label')}
									autoFocus
									value={password}
									onValueChange={setPassword}
									error={loginMut.error?.message}
								/>
							</div>
							<button
								type='submit'
								disabled={loginMut.isPending || !password}
								className='flex h-11 min-w-[140px] items-center justify-center rounded-full bg-brand px-6 text-body-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'
							>
								{loginMut.isPending ? (
									<TbLoader2 className='h-4 w-4 animate-spin' />
								) : (
									t('login.password.submit')
								)}
							</button>
						</form>
					</motion.div>
				)}

				{step === '2fa' && (
					<motion.div
						key='2fa'
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						exit={{opacity: 0, y: -20}}
						transition={{duration: 0.3, ease: 'easeOut'}}
						className='flex w-full flex-col items-center gap-6'
					>
						<div className='text-center'>
							<h2 className='text-heading font-semibold -tracking-2'>{t('login-2fa.title')}</h2>
							<p className='mt-1 text-body-sm text-text-secondary'>{t('login-2fa.subtitle')}</p>
						</div>
						<PinInput autoFocus length={6} onCodeCheck={handleSubmit2fa} />
						<button
							type='button'
							onClick={() => setStep('password')}
							className='text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'
						>
							{t('back')}
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</LoginContainer>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function LoginContainer({children}: {children: React.ReactNode}) {
	return (
		<>
			<div className='flex-1' />
			<div
				className='flex w-full max-w-[520px] flex-col items-center gap-6 rounded-3xl border border-border-subtle px-8 py-10 md:px-12 md:py-14'
				style={{
					background: 'rgba(255, 255, 255, 0.85)',
					backdropFilter: 'blur(24px)',
					WebkitBackdropFilter: 'blur(24px)',
					boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)',
				}}
			>
				<motion.div
					className='animate-[logo-glow-pulse_4s_ease-in-out_infinite]'
					initial={{opacity: 0, scale: 0.9}}
					animate={{opacity: 1, scale: 1}}
					transition={{duration: 0.4}}
				>
					<LivinityLogo className='md:w-[120px]' />
				</motion.div>

				<motion.h1
					className='text-center text-display-sm font-bold leading-tight -tracking-2 md:text-56'
					initial={{opacity: 0, y: 10}}
					animate={{opacity: 1, y: 0}}
					transition={{duration: 0.4, delay: 0.1}}
					style={{viewTransitionName: 'title'}}
				>
					{t('login.title')}
				</motion.h1>

				{children}
			</div>
			<div className='flex-1' />
		</>
	)
}

function UserAvatar({user, size = 'md'}: {user: LoginUser; size?: 'sm' | 'md' | 'lg'}) {
	const sizeClasses = {
		sm: 'h-10 w-10 text-body-sm',
		md: 'h-14 w-14 text-body',
		lg: 'h-[72px] w-[72px] text-body-lg',
	}

	return (
		<div
			className={`${sizeClasses[size]} flex items-center justify-center rounded-full font-semibold text-white shadow-md transition-transform group-hover:scale-105`}
			style={{backgroundColor: user.avatar_color}}
		>
			{getInitials(user.display_name)}
		</div>
	)
}
