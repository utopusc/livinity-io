import {useEffect, useRef, useState} from 'react'
import {TbLoader2, TbAlertCircle, TbCircleCheck, TbLogout, TbLogin, TbCopy, TbCheck, TbBrain} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

export default function AiConfigPage() {
	const [loginSession, setLoginSession] = useState<{
		sessionId: string
		verificationUrl: string
		userCode: string
	} | null>(null)
	const [copied, setCopied] = useState(false)
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	const kimiStatusQ = trpcReact.ai.getKimiStatus.useQuery(undefined, {
		// Don't poll status during active login — the poll endpoint handles that
		enabled: !loginSession,
	})
	const utils = trpcReact.useUtils()

	const isConnected = kimiStatusQ.data?.authenticated ?? false

	const loginMutation = trpcReact.ai.kimiLogin.useMutation({
		onSuccess: (data) => {
			setLoginSession(data)
		},
	})

	const logoutMutation = trpcReact.ai.kimiLogout.useMutation({
		onSuccess: () => {
			setLoginSession(null)
			utils.ai.getKimiStatus.invalidate()
		},
	})

	// Poll login session for auth completion
	const pollQ = trpcReact.ai.kimiLoginPoll.useQuery(
		{sessionId: loginSession?.sessionId ?? ''},
		{
			enabled: !!loginSession,
			refetchInterval: 2000,
		},
	)

	// When poll returns success, clear login session and refresh status
	useEffect(() => {
		if (pollQ.data?.status === 'success') {
			setLoginSession(null)
			utils.ai.getKimiStatus.invalidate()
		}
	}, [pollQ.data?.status, utils.ai.getKimiStatus])

	// When status changes to connected, clear login session
	useEffect(() => {
		if (isConnected && loginSession) {
			setLoginSession(null)
		}
	}, [isConnected, loginSession])

	// Cleanup poll interval on unmount
	useEffect(() => {
		return () => {
			if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
		}
	}, [])

	const handleLogin = () => {
		loginMutation.mutate()
	}

	const handleCopyCode = () => {
		if (loginSession?.userCode) {
			navigator.clipboard.writeText(loginSession.userCode)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	return (
		<SettingsPageLayout title='AI Configuration' description='Configure how LivOS connects to Kimi AI'>
			<div className='max-w-lg space-y-8'>
				{/* -- Kimi Provider ---------------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Kimi Account</h2>

					<div
						className={`rounded-radius-md border p-4 space-y-3 ${
							isConnected ? 'border-brand/50 bg-brand/5' : 'border-border-default bg-surface-base'
						}`}
					>
						{kimiStatusQ.isLoading ? (
							<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
								<TbLoader2 className='h-4 w-4 animate-spin' />
								Checking status...
							</div>
						) : isConnected ? (
							<div className='space-y-3'>
								<div className='flex items-center gap-2 text-body-sm text-green-400'>
									<TbCircleCheck className='h-4 w-4' />
									Connected to Kimi
								</div>
								<p className='text-caption text-text-secondary'>
									Authenticated via Kimi CLI. AI features are active.
								</p>
								<Button
									variant='secondary'
									size='sm'
									onClick={() => logoutMutation.mutate()}
									disabled={logoutMutation.isPending}
								>
									{logoutMutation.isPending ? (
										<>
											<TbLoader2 className='h-4 w-4 animate-spin' /> Signing out...
										</>
									) : (
										<>
											<TbLogout className='h-4 w-4' /> Sign Out
										</>
									)}
								</Button>
								{logoutMutation.isError && (
									<p className='text-caption text-red-400'>{logoutMutation.error.message}</p>
								)}
							</div>
						) : loginSession ? (
							/* Login in progress — show verification URL + code */
							<div className='space-y-3'>
								<div className='flex items-center gap-2 text-body-sm text-blue-400'>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									Waiting for authorization...
								</div>
								<p className='text-caption text-text-secondary'>
									Open the link below and enter the code to sign in:
								</p>
								<div className='rounded-radius-sm border border-border-default bg-surface-raised p-3 space-y-2'>
									<div className='flex items-center justify-between'>
										<span className='text-body-sm font-medium text-text-primary'>Code</span>
										<button
											onClick={handleCopyCode}
											className='flex items-center gap-1 text-caption text-blue-400 hover:text-blue-300 transition-colors'
										>
											{copied ? <TbCheck className='h-3.5 w-3.5' /> : <TbCopy className='h-3.5 w-3.5' />}
											{copied ? 'Copied' : 'Copy'}
										</button>
									</div>
									<p className='text-heading-md font-mono font-bold text-text-primary tracking-widest text-center'>
										{loginSession.userCode}
									</p>
								</div>
								<a
									href={loginSession.verificationUrl}
									target='_blank'
									rel='noopener noreferrer'
									className='block w-full'
								>
									<Button variant='primary' size='sm' className='w-full'>
										Open Kimi Authorization Page
									</Button>
								</a>
								<Button
									variant='secondary'
									size='sm'
									onClick={() => setLoginSession(null)}
									className='w-full'
								>
									Cancel
								</Button>
							</div>
						) : (
							<div className='space-y-3'>
								<div className='flex items-center gap-2 text-body-sm text-amber-400'>
									<TbAlertCircle className='h-4 w-4' />
									Not connected
								</div>
								<p className='text-caption text-text-secondary'>
									Sign in with your Kimi account to enable AI features.
								</p>
								<Button
									variant='primary'
									size='sm'
									onClick={handleLogin}
									disabled={loginMutation.isPending}
								>
									{loginMutation.isPending ? (
										<>
											<TbLoader2 className='h-4 w-4 animate-spin' /> Starting...
										</>
									) : (
										<>
											<TbLogin className='h-4 w-4' /> Sign in with Kimi
										</>
									)}
								</Button>
								{loginMutation.isError && (
									<p className='text-caption text-red-400'>{loginMutation.error.message}</p>
								)}
							</div>
						)}
					</div>
				</div>

				{/* -- Active Model ---------------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Active Model</h2>
					<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-2'>
						<div className='flex items-center gap-2'>
							<TbBrain className='h-4 w-4 text-brand' />
							<span className='text-body-sm font-medium text-text-primary'>Kimi for Coding</span>
						</div>
						<p className='text-caption text-text-secondary'>
							Thinking model with 128K context. Used for all AI tasks including chat, tool calling, and background agents.
						</p>
					</div>
				</div>
			</div>
		</SettingsPageLayout>
	)
}
