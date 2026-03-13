import {AnimatePresence, motion} from 'motion/react'
import {useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {TbCheck, TbLoader2} from 'react-icons/tb'

import LivinityLogo from '@/assets/livinity-logo'
import {Input, Labeled, PasswordInput} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'

export default function InviteAcceptPage() {
	const {token} = useParams<{token: string}>()
	const navigate = useNavigate()

	const [username, setUsername] = useState('')
	const [displayName, setDisplayName] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [success, setSuccess] = useState(false)

	const acceptMut = trpcReact.user.acceptInvite.useMutation({
		onSuccess: () => {
			setSuccess(true)
			// Redirect to login after short delay
			setTimeout(() => {
				window.location.href = '/login'
			}, 2000)
		},
	})

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault()
		if (!token) return
		if (password !== confirmPassword) return
		acceptMut.mutate({
			token,
			username,
			display_name: displayName,
			password,
		})
	}

	const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword

	if (!token) {
		return (
			<InviteContainer>
				<p className='text-body-sm text-red-500'>Invalid invite link.</p>
			</InviteContainer>
		)
	}

	return (
		<InviteContainer>
			<AnimatePresence mode='wait'>
				{success ? (
					<motion.div
						key='success'
						initial={{opacity: 0, scale: 0.9}}
						animate={{opacity: 1, scale: 1}}
						transition={{duration: 0.3}}
						className='flex flex-col items-center gap-4'
					>
						<div className='flex h-14 w-14 items-center justify-center rounded-full bg-green-100'>
							<TbCheck className='h-7 w-7 text-green-600' />
						</div>
						<h2 className='text-heading font-semibold -tracking-2'>Account Created</h2>
						<p className='text-body-sm text-text-secondary'>Redirecting to login...</p>
					</motion.div>
				) : (
					<motion.div
						key='form'
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						transition={{duration: 0.3, ease: 'easeOut'}}
						className='flex w-full flex-col items-center gap-6'
					>
						<div className='text-center'>
							<h2 className='text-heading font-semibold -tracking-2'>Create Your Account</h2>
							<p className='mt-1 text-body-sm text-text-secondary'>
								You've been invited to join this Livinity server.
							</p>
						</div>

						<form className='flex w-full flex-col gap-4' onSubmit={handleSubmit}>
							<Labeled label='Display Name'>
								<Input
									autoFocus
									placeholder='John Doe'
									value={displayName}
									onValueChange={setDisplayName}
								/>
							</Labeled>

							<Labeled label='Username'>
								<Input
									placeholder='johndoe'
									value={username}
									onValueChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
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

							{acceptMut.error && (
								<div className='rounded-lg bg-red-50 px-3 py-2 text-body-sm text-red-600'>
									{acceptMut.error.message}
								</div>
							)}

							<button
								type='submit'
								disabled={
									acceptMut.isPending ||
									!username ||
									!displayName ||
									!password ||
									password.length < 6 ||
									passwordMismatch
								}
								className='mt-2 flex h-11 w-full items-center justify-center rounded-full bg-brand text-body-sm font-medium text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50'
							>
								{acceptMut.isPending ? (
									<TbLoader2 className='h-4 w-4 animate-spin' />
								) : (
									'Create Account'
								)}
							</button>
						</form>

						<button
							type='button'
							onClick={() => navigate('/login')}
							className='text-body-sm text-text-tertiary transition-colors hover:text-text-secondary'
						>
							Already have an account? Log in
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</InviteContainer>
	)
}

function InviteContainer({children}: {children: React.ReactNode}) {
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

				{children}
			</div>
			<div className='flex-1' />
		</>
	)
}
