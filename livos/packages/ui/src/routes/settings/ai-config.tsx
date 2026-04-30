import {useEffect, useRef, useState} from 'react'
import {TbLoader2, TbAlertCircle, TbCircleCheck, TbLogout, TbLogin, TbCopy, TbCheck, TbBrain, TbKey, TbShieldCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

export default function AiConfigPage() {
	// -- Kimi login state -----------------------------------------------
	const [loginSession, setLoginSession] = useState<{
		sessionId: string
		verificationUrl: string
		userCode: string
	} | null>(null)
	const [copied, setCopied] = useState(false)
	const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// -- Claude state ---------------------------------------------------
	const [claudeApiKey, setClaudeApiKey] = useState('')
	const [claudeApiKeySaved, setClaudeApiKeySaved] = useState(false)
	const [claudeOAuthCode, setClaudeOAuthCode] = useState('')
	const [claudeOAuthData, setClaudeOAuthData] = useState<{verificationUrl: string} | null>(null)

	// -- Per-user Claude state (multi-user mode only — Phase 40 FR-AUTH-02) -----
	const [perUserDeviceCode, setPerUserDeviceCode] = useState<{
		verificationUrl: string
		userCode: string
	} | null>(null)
	const [perUserLoginActive, setPerUserLoginActive] = useState(false)
	const [perUserLoginError, setPerUserLoginError] = useState<string | null>(null)

	// -- Queries --------------------------------------------------------
	const kimiStatusQ = trpcReact.ai.getKimiStatus.useQuery(undefined, {
		enabled: !loginSession,
	})
	const claudeStatusQ = trpcReact.ai.getClaudeStatus.useQuery()
	const providersQ = trpcReact.ai.getProviders.useQuery()
	const utils = trpcReact.useUtils()

	const isKimiConnected = kimiStatusQ.data?.authenticated ?? false
	const isClaudeConnected = claudeStatusQ.data?.authenticated ?? false
	const claudeAuthMethod = claudeStatusQ.data?.method
	const primaryProvider = providersQ.data?.primaryProvider ?? 'kimi'

	// -- Kimi mutations -------------------------------------------------
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

	// -- Claude mutations -----------------------------------------------
	const setClaudeApiKeyMutation = trpcReact.ai.setClaudeApiKey.useMutation({
		onSuccess: () => {
			setClaudeApiKeySaved(true)
			setClaudeApiKey('')
			utils.ai.getClaudeStatus.invalidate()
			utils.ai.getProviders.invalidate()
			setTimeout(() => setClaudeApiKeySaved(false), 2000)
		},
	})

	const claudeStartLoginMutation = trpcReact.ai.claudeStartLogin.useMutation({
		onSuccess: (data: any) => {
			if (data?.url || data?.verificationUrl) {
				setClaudeOAuthData({verificationUrl: data.url || data.verificationUrl})
			}
		},
	})

	const claudeSubmitCodeMutation = trpcReact.ai.claudeSubmitCode.useMutation({
		onSuccess: () => {
			setClaudeOAuthData(null)
			setClaudeOAuthCode('')
			utils.ai.getClaudeStatus.invalidate()
			utils.ai.getProviders.invalidate()
		},
	})

	const claudeLogoutMutation = trpcReact.ai.claudeLogout.useMutation({
		onSuccess: () => {
			utils.ai.getClaudeStatus.invalidate()
			utils.ai.getProviders.invalidate()
		},
	})

	// -- Per-user Claude (multi-user mode only — Phase 40 FR-AUTH-02) ---
	const claudePerUserStatusQ = trpcReact.ai.claudePerUserStatus.useQuery()
	const isMultiUserMode = claudePerUserStatusQ.data?.multiUserMode === true
	const isPerUserClaudeConnected =
		isMultiUserMode && (claudePerUserStatusQ.data?.authenticated ?? false)

	// Subscription is enabled only while a per-user login is in progress.
	trpcReact.ai.claudePerUserStartLogin.useSubscription(undefined, {
		enabled: perUserLoginActive,
		onData: (event: any) => {
			if (event?.type === 'device_code') {
				setPerUserDeviceCode({
					verificationUrl: event.verificationUrl,
					userCode: event.userCode,
				})
			} else if (event?.type === 'success') {
				setPerUserLoginActive(false)
				setPerUserDeviceCode(null)
				setPerUserLoginError(null)
				utils.ai.claudePerUserStatus.invalidate()
				utils.ai.getProviders.invalidate()
			} else if (event?.type === 'error') {
				setPerUserLoginActive(false)
				setPerUserDeviceCode(null)
				setPerUserLoginError(event.message ?? 'login failed')
			}
		},
		onError: (err: any) => {
			setPerUserLoginActive(false)
			setPerUserDeviceCode(null)
			setPerUserLoginError(err?.message ?? 'subscription error')
		},
	})

	const claudePerUserLogoutMutation = trpcReact.ai.claudePerUserLogout.useMutation({
		onSuccess: () => {
			utils.ai.claudePerUserStatus.invalidate()
			utils.ai.getProviders.invalidate()
		},
	})

	const handleStartPerUserLogin = () => {
		setPerUserLoginError(null)
		setPerUserDeviceCode(null)
		setPerUserLoginActive(true)
	}

	const handleStopPerUserLogin = () => {
		setPerUserLoginActive(false)
		setPerUserDeviceCode(null)
	}

	// -- Provider selection mutation ------------------------------------
	const setPrimaryProviderMutation = trpcReact.ai.setPrimaryProvider.useMutation({
		onSuccess: () => {
			utils.ai.getProviders.invalidate()
		},
	})

	// -- Kimi poll for login completion ---------------------------------
	const pollQ = trpcReact.ai.kimiLoginPoll.useQuery(
		{sessionId: loginSession?.sessionId ?? ''},
		{
			enabled: !!loginSession,
			refetchInterval: 2000,
		},
	)

	useEffect(() => {
		if (pollQ.data?.status === 'success') {
			setLoginSession(null)
			utils.ai.getKimiStatus.invalidate()
		}
	}, [pollQ.data?.status, utils.ai.getKimiStatus])

	useEffect(() => {
		if (isKimiConnected && loginSession) {
			setLoginSession(null)
		}
	}, [isKimiConnected, loginSession])

	useEffect(() => {
		return () => {
			if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
		}
	}, [])

	// -- Handlers -------------------------------------------------------
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

	const handleSaveClaudeApiKey = () => {
		if (claudeApiKey.trim()) {
			setClaudeApiKeyMutation.mutate({apiKey: claudeApiKey.trim()})
		}
	}

	const handleClaudeOAuthLogin = () => {
		claudeStartLoginMutation.mutate()
	}

	const handleSubmitClaudeCode = () => {
		if (claudeOAuthCode.trim()) {
			claudeSubmitCodeMutation.mutate({code: claudeOAuthCode.trim()})
		}
	}

	return (
		<SettingsPageLayout title='AI Configuration' description='Configure AI providers for LivOS'>
			<div className='max-w-lg space-y-8'>
				{/* -- Primary Provider Selector ----------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Primary Provider</h2>
					<div className='flex gap-3'>
						{(['kimi', 'claude'] as const).map((provider) => {
							const isActive = primaryProvider === provider
							const providerData = providersQ.data?.providers?.find((p) => p.id === provider)
							const isAvailable = providerData?.available ?? false
							return (
								<button
									key={provider}
									onClick={() => setPrimaryProviderMutation.mutate({provider})}
									disabled={setPrimaryProviderMutation.isPending}
									className={`flex-1 rounded-radius-md border p-3 cursor-pointer transition-colors ${
										isActive
											? 'border-brand bg-brand/10'
											: 'border-border-default bg-surface-base hover:bg-surface-1'
									}`}
								>
									<div className='flex items-center justify-between'>
										<span className='text-body-sm font-medium capitalize'>{provider}</span>
										<span
											className={`h-2 w-2 rounded-full ${
												isAvailable ? 'bg-green-400' : 'bg-text-tertiary'
											}`}
										/>
									</div>
									{isActive && (
										<span className='mt-1 block text-caption text-brand'>Active</span>
									)}
								</button>
							)
						})}
					</div>
				</div>

				{/* -- Kimi Provider ---------------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Kimi Account</h2>

					<div
						className={`rounded-radius-md border p-4 space-y-3 ${
							isKimiConnected ? 'border-brand/50 bg-brand/5' : 'border-border-default bg-surface-base'
						}`}
					>
						{kimiStatusQ.isLoading ? (
							<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
								<TbLoader2 className='h-4 w-4 animate-spin' />
								Checking status...
							</div>
						) : isKimiConnected ? (
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
							/* Login in progress -- show verification URL + code */
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

				{/* -- Claude Provider -------------------------------------- */}
				{/* Phase 40 (FR-AUTH-02): if multi-user mode is on, show per-user-aware card. */}
				{/* Single-user mode keeps the existing PKCE OAuth + API key UX byte-identical. */}
				{isMultiUserMode ? (
					<div className='space-y-4'>
						<h2 className='text-body font-semibold'>Claude Account (per-user subscription)</h2>

						<div
							className={`rounded-radius-md border p-4 space-y-3 ${
								isPerUserClaudeConnected ? 'border-brand/50 bg-brand/5' : 'border-border-default bg-surface-base'
							}`}
						>
							{claudePerUserStatusQ.isLoading ? (
								<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									Checking status...
								</div>
							) : isPerUserClaudeConnected ? (
								<div className='space-y-3'>
									<div className='flex items-center gap-2 text-body-sm text-green-400'>
										<TbCircleCheck className='h-4 w-4' />
										Connected — your Claude subscription
									</div>
									<p className='text-caption text-text-secondary'>
										Authenticated via sdk-subscription. AI features active for your account.
									</p>
									<Button
										variant='secondary'
										size='sm'
										onClick={() => claudePerUserLogoutMutation.mutate()}
										disabled={claudePerUserLogoutMutation.isPending}
									>
										{claudePerUserLogoutMutation.isPending ? (
											<>
												<TbLoader2 className='h-4 w-4 animate-spin' /> Signing out...
											</>
										) : (
											<>
												<TbLogout className='h-4 w-4' /> Sign Out
											</>
										)}
									</Button>
									{claudePerUserLogoutMutation.isError && (
										<p className='text-caption text-red-400'>
											{claudePerUserLogoutMutation.error.message}
										</p>
									)}
								</div>
							) : perUserLoginActive ? (
								<div className='space-y-3'>
									{perUserDeviceCode ? (
										<>
											<div className='flex items-center gap-2 text-body-sm text-blue-400'>
												<TbLoader2 className='h-4 w-4 animate-spin' />
												Waiting for authorization...
											</div>
											<p className='text-caption text-text-secondary'>
												1. Open the verification page:
											</p>
											<a
												href={perUserDeviceCode.verificationUrl}
												target='_blank'
												rel='noopener noreferrer'
												className='block w-full'
											>
												<Button variant='primary' size='sm' className='w-full'>
													Open Claude Authorization Page
												</Button>
											</a>
											<p className='text-caption text-text-secondary'>
												2. Enter this code:
											</p>
											<code className='block rounded bg-surface-raised px-3 py-2 font-mono text-body-sm'>
												{perUserDeviceCode.userCode}
											</code>
											<Button
												variant='secondary'
												size='sm'
												onClick={handleStopPerUserLogin}
												className='w-full'
											>
												Cancel
											</Button>
										</>
									) : (
										<>
											<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
												<TbLoader2 className='h-4 w-4 animate-spin' />
												Starting `claude login`...
											</div>
											<Button
												variant='secondary'
												size='sm'
												onClick={handleStopPerUserLogin}
												className='w-full'
											>
												Cancel
											</Button>
										</>
									)}
								</div>
							) : (
								<div className='space-y-4'>
									<div className='flex items-center gap-2 text-body-sm text-amber-400'>
										<TbAlertCircle className='h-4 w-4' />
										Not connected
									</div>
									<p className='text-caption text-text-secondary'>
										Sign in with your Claude subscription to enable AI features for your account.
									</p>
									<Button variant='primary' size='sm' onClick={handleStartPerUserLogin}>
										<TbLogin className='h-4 w-4' />
										<span className='ml-2'>Sign in with Claude sub</span>
									</Button>
									{perUserLoginError ? (
										<p className='text-caption text-red-400'>{perUserLoginError}</p>
									) : null}
								</div>
							)}
						</div>
					</div>
				) : (
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Claude Account</h2>

					<div
						className={`rounded-radius-md border p-4 space-y-3 ${
							isClaudeConnected ? 'border-brand/50 bg-brand/5' : 'border-border-default bg-surface-base'
						}`}
					>
						{claudeStatusQ.isLoading ? (
							<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
								<TbLoader2 className='h-4 w-4 animate-spin' />
								Checking status...
							</div>
						) : isClaudeConnected ? (
							<div className='space-y-3'>
								<div className='flex items-center gap-2 text-body-sm text-green-400'>
									<TbCircleCheck className='h-4 w-4' />
									Connected to Claude
								</div>
								<p className='text-caption text-text-secondary'>
									Authenticated via {claudeAuthMethod === 'api_key' ? 'API key' : claudeAuthMethod === 'oauth' ? 'OAuth' : claudeAuthMethod ?? 'API key'}.
								</p>
								<Button
									variant='secondary'
									size='sm'
									onClick={() => claudeLogoutMutation.mutate()}
									disabled={claudeLogoutMutation.isPending}
								>
									{claudeLogoutMutation.isPending ? (
										<>
											<TbLoader2 className='h-4 w-4 animate-spin' /> Signing out...
										</>
									) : (
										<>
											<TbLogout className='h-4 w-4' /> Sign Out
										</>
									)}
								</Button>
								{claudeLogoutMutation.isError && (
									<p className='text-caption text-red-400'>{claudeLogoutMutation.error.message}</p>
								)}
							</div>
						) : claudeOAuthData ? (
							/* OAuth in progress -- show code input */
							<div className='space-y-3'>
								<div className='flex items-center gap-2 text-body-sm text-blue-400'>
									<TbLoader2 className='h-4 w-4 animate-spin' />
									Waiting for authorization...
								</div>
								<p className='text-caption text-text-secondary'>
									Complete authorization in the browser, then paste the code below:
								</p>
								<a
									href={claudeOAuthData.verificationUrl}
									target='_blank'
									rel='noopener noreferrer'
									className='block w-full'
								>
									<Button variant='primary' size='sm' className='w-full'>
										Open Claude Authorization Page
									</Button>
								</a>
								<div className='flex gap-2'>
									<Input
										sizeVariant='short-square'
										placeholder='Paste authorization code'
										value={claudeOAuthCode}
										onValueChange={setClaudeOAuthCode}
									/>
									<Button
										variant='primary'
										size='sm'
										onClick={handleSubmitClaudeCode}
										disabled={!claudeOAuthCode.trim() || claudeSubmitCodeMutation.isPending}
									>
										{claudeSubmitCodeMutation.isPending ? (
											<TbLoader2 className='h-4 w-4 animate-spin' />
										) : (
											'Submit'
										)}
									</Button>
								</div>
								{claudeSubmitCodeMutation.isError && (
									<p className='text-caption text-red-400'>{claudeSubmitCodeMutation.error.message}</p>
								)}
								<Button
									variant='secondary'
									size='sm'
									onClick={() => {
										setClaudeOAuthData(null)
										setClaudeOAuthCode('')
									}}
									className='w-full'
								>
									Cancel
								</Button>
							</div>
						) : (
							<div className='space-y-4'>
								<div className='flex items-center gap-2 text-body-sm text-amber-400'>
									<TbAlertCircle className='h-4 w-4' />
									Not connected
								</div>

								{/* API Key auth */}
								<div className='space-y-2'>
									<p className='text-caption font-medium text-text-secondary'>
										<TbKey className='mr-1 inline h-3.5 w-3.5' />
										API Key
									</p>
									<div className='flex gap-2'>
										<Input
											sizeVariant='short-square'
											placeholder='sk-ant-...'
											value={claudeApiKey}
											onValueChange={setClaudeApiKey}
											type='password'
										/>
										<Button
											variant='primary'
											size='sm'
											onClick={handleSaveClaudeApiKey}
											disabled={!claudeApiKey.trim() || setClaudeApiKeyMutation.isPending}
										>
											{setClaudeApiKeyMutation.isPending ? (
												<TbLoader2 className='h-4 w-4 animate-spin' />
											) : claudeApiKeySaved ? (
												<>
													<TbCheck className='h-4 w-4' /> Saved
												</>
											) : (
												'Save'
											)}
										</Button>
									</div>
									{setClaudeApiKeyMutation.isError && (
										<p className='text-caption text-red-400'>{setClaudeApiKeyMutation.error.message}</p>
									)}
								</div>

								{/* OAuth auth */}
								<div className='space-y-2'>
									<p className='text-caption font-medium text-text-secondary'>Or</p>
									<Button
										variant='secondary'
										size='sm'
										onClick={handleClaudeOAuthLogin}
										disabled={claudeStartLoginMutation.isPending}
									>
										{claudeStartLoginMutation.isPending ? (
											<>
												<TbLoader2 className='h-4 w-4 animate-spin' /> Starting...
											</>
										) : (
											<>
												<TbLogin className='h-4 w-4' /> Sign in with Claude
											</>
										)}
									</Button>
									{claudeStartLoginMutation.isError && (
										<p className='text-caption text-red-400'>{claudeStartLoginMutation.error.message}</p>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
				)}

				{/* -- Active Model ---------------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Active Model</h2>
					<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-2'>
						<div className='flex items-center gap-2'>
							<TbBrain className='h-4 w-4 text-brand' />
							<span className='text-body-sm font-medium text-text-primary'>
								{primaryProvider === 'claude' ? 'Claude (Anthropic)' : 'Kimi for Coding'}
							</span>
						</div>
						<p className='text-caption text-text-secondary'>
							{primaryProvider === 'claude'
								? 'Claude AI model. Used for all AI tasks including chat, tool calling, and background agents.'
								: 'Thinking model with 128K context. Used for all AI tasks including chat, tool calling, and background agents.'}
						</p>
					</div>
				</div>

				{/* -- Computer Use Settings --------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Computer Use</h2>
					<ComputerUseConsentToggle />
				</div>
			</div>
		</SettingsPageLayout>
	)
}

function ComputerUseConsentToggle() {
	const consentQ = trpcReact.ai.getComputerUseAutoConsent.useQuery()
	const utils = trpcReact.useUtils()
	const setConsentMutation = trpcReact.ai.setComputerUseAutoConsent.useMutation({
		onSuccess: () => {
			utils.ai.getComputerUseAutoConsent.invalidate()
		},
	})

	const autoConsent = consentQ.data?.autoConsent ?? false

	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<TbShieldCheck className='h-4 w-4 text-text-secondary' />
					<span className='text-body-sm font-medium text-text-primary'>Auto-approve device control</span>
				</div>
				<button
					onClick={() => setConsentMutation.mutate({enabled: !autoConsent})}
					disabled={setConsentMutation.isPending}
					className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
						autoConsent ? 'bg-brand' : 'bg-surface-3'
					}`}
				>
					<span
						className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
							autoConsent ? 'translate-x-6' : 'translate-x-1'
						}`}
					/>
				</button>
			</div>
			<p className='text-caption text-text-secondary'>
				{autoConsent
					? 'AI can control mouse and keyboard on connected devices without asking permission each time.'
					: 'AI will ask for permission before taking control of mouse and keyboard on connected devices.'}
			</p>
		</div>
	)
}
