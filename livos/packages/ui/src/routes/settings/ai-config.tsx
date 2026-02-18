import {useEffect, useState} from 'react'
import {TbCheck, TbExternalLink, TbLoader2, TbAlertCircle, TbCircleCheck} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

export default function AiConfigPage() {
	const [anthropicKey, setAnthropicKey] = useState('')
	const [geminiKey, setGeminiKey] = useState('')
	const [loginCode, setLoginCode] = useState('')
	const [loginUrl, setLoginUrl] = useState('')
	const [saved, setSaved] = useState(false)

	const configQ = trpcReact.ai.getConfig.useQuery()
	const cliStatusQ = trpcReact.ai.getClaudeCliStatus.useQuery()
	const utils = trpcReact.useUtils()

	// Derive auth method from server state
	const serverAuthMethod = cliStatusQ.data?.authMethod ?? 'api-key'
	const [authMethod, setAuthMethod] = useState<'api-key' | 'sdk-subscription'>('api-key')

	// Sync auth method from server on load
	useEffect(() => {
		if (serverAuthMethod) setAuthMethod(serverAuthMethod)
	}, [serverAuthMethod])

	// Poll CLI status every 5s when subscription mode selected but not authenticated
	const cliAuthenticated = cliStatusQ.data?.authenticated ?? false
	useEffect(() => {
		if (authMethod !== 'sdk-subscription' || cliAuthenticated) return
		const interval = setInterval(() => {
			cliStatusQ.refetch()
		}, 5000)
		return () => clearInterval(interval)
	}, [authMethod, cliAuthenticated])

	// Clear login UI when auth completes
	useEffect(() => {
		if (cliAuthenticated) {
			setLoginUrl('')
			setLoginCode('')
		}
	}, [cliAuthenticated])

	const setConfigMutation = trpcReact.ai.setConfig.useMutation({
		onSuccess: () => {
			setSaved(true)
			setAnthropicKey('')
			setGeminiKey('')
			utils.ai.getConfig.invalidate()
			setTimeout(() => setSaved(false), 2000)
		},
	})

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
		onSuccess: () => {
			setLoginCode('')
			// Poll for auth status update
			setTimeout(() => utils.ai.getClaudeCliStatus.invalidate(), 2000)
		},
	})

	const handleAuthMethodChange = (value: string) => {
		const method = value as 'api-key' | 'sdk-subscription'
		setAuthMethod(method)
		setAuthMethodMutation.mutate({method})
	}

	const handleSave = () => {
		const updates: Record<string, string> = {}
		if (anthropicKey.trim()) updates.anthropicApiKey = anthropicKey.trim()
		if (geminiKey.trim()) updates.geminiApiKey = geminiKey.trim()
		if (Object.keys(updates).length === 0) return
		setConfigMutation.mutate(updates)
	}

	const cliInstalled = cliStatusQ.data?.installed ?? false
	const cliUser = cliStatusQ.data?.user
	const showCodeInput = loginUrl && !cliAuthenticated

	return (
		<SettingsPageLayout title='AI Configuration' description='Configure how LivOS connects to Claude and Gemini'>
			<div className='max-w-lg space-y-8'>
				{/* ── Claude Provider ─────────────────── */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Claude Provider</h2>

					<RadioGroup value={authMethod} onValueChange={handleAuthMethodChange} className='gap-0'>
						{/* SDK Subscription Option */}
						<label
							className={`flex cursor-pointer gap-3 rounded-t-radius-md border p-4 transition-colors ${
								authMethod === 'sdk-subscription'
									? 'border-brand/50 bg-brand/5'
									: 'border-border-default bg-surface-base hover:bg-surface-1'
							}`}
						>
							<RadioGroupItem value='sdk-subscription' className='mt-0.5 shrink-0' />
							<div className='flex-1 space-y-2'>
								<div className='flex items-center gap-2'>
									<span className='text-body font-medium'>Claude Subscription</span>
									<span className='rounded-full bg-brand/20 px-2 py-0.5 text-caption-sm text-brand'>Recommended</span>
								</div>
								<p className='text-body-sm text-text-secondary'>
									Use your Claude Pro/Max subscription. No API key needed.
								</p>

								{authMethod === 'sdk-subscription' && (
									<div className='mt-3 space-y-2'>
										{cliStatusQ.isLoading ? (
											<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
												<TbLoader2 className='h-4 w-4 animate-spin' />
												Checking CLI status...
											</div>
										) : cliAuthenticated ? (
											<div className='flex items-center gap-2 text-body-sm text-green-400'>
												<TbCircleCheck className='h-4 w-4' />
												Authenticated{cliUser ? ` as ${cliUser}` : ''}
											</div>
										) : cliInstalled ? (
											<div className='space-y-3'>
												<div className='flex items-center gap-2 text-body-sm text-amber-400'>
													<TbAlertCircle className='h-4 w-4' />
													CLI installed but not authenticated
												</div>
												<Button
													variant='primary'
													size='sm'
													onClick={() => startLoginMutation.mutate()}
													disabled={startLoginMutation.isPending}
												>
													{startLoginMutation.isPending ? (
														<>
															<TbLoader2 className='h-4 w-4 animate-spin' />
															Starting login...
														</>
													) : (
														<>
															<TbExternalLink className='h-4 w-4' />
															Authenticate with Claude
														</>
													)}
												</Button>
												{startLoginMutation.isError && (
													<p className='text-caption text-red-400'>
														{startLoginMutation.error.message}
													</p>
												)}
												{showCodeInput && (
													<div className='space-y-3 rounded-radius-sm bg-surface-2 p-3'>
														<p className='text-caption text-text-secondary'>
															1. Complete login in the opened tab.
															<br />
															2. Copy the code you receive and paste it below:
														</p>
														<a
															href={loginUrl}
															target='_blank'
															rel='noopener noreferrer'
															className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
														>
															<TbExternalLink className='h-3.5 w-3.5' />
															Re-open auth page
														</a>
														<div className='flex gap-2'>
															<Input
																placeholder='Paste auth code here...'
																value={loginCode}
																onValueChange={setLoginCode}
																className='font-mono text-caption'
															/>
															<Button
																variant='primary'
																size='sm'
																onClick={() => submitCodeMutation.mutate({code: loginCode})}
																disabled={!loginCode.trim() || submitCodeMutation.isPending}
															>
																{submitCodeMutation.isPending ? (
																	<TbLoader2 className='h-4 w-4 animate-spin' />
																) : (
																	'Submit'
																)}
															</Button>
														</div>
														{submitCodeMutation.isError && (
															<p className='text-caption text-red-400'>
																{submitCodeMutation.error.message}
															</p>
														)}
														{submitCodeMutation.isSuccess && (
															<p className='text-caption text-green-400'>
																Code submitted! Waiting for authentication...
															</p>
														)}
													</div>
												)}
											</div>
										) : (
											<div className='space-y-3'>
												<div className='flex items-center gap-2 text-body-sm text-red-400'>
													<TbAlertCircle className='h-4 w-4' />
													Claude CLI not installed
												</div>
												<div className='rounded-radius-sm bg-surface-2 p-3'>
													<p className='text-caption text-text-secondary'>
														Run on the server first:
													</p>
													<code className='mt-1 block font-mono text-caption text-text-primary'>
														npm install -g @anthropic-ai/claude-code
													</code>
												</div>
												<Button
													variant='primary'
													size='sm'
													onClick={() => startLoginMutation.mutate()}
													disabled={startLoginMutation.isPending}
												>
													{startLoginMutation.isPending ? (
														<>
															<TbLoader2 className='h-4 w-4 animate-spin' />
															Checking...
														</>
													) : (
														<>
															<TbExternalLink className='h-4 w-4' />
															Authenticate with Claude
														</>
													)}
												</Button>
												{startLoginMutation.isError && (
													<p className='text-caption text-red-400'>
														{startLoginMutation.error.message}
													</p>
												)}
											</div>
										)}
									</div>
								)}
							</div>
						</label>

						{/* API Key Option */}
						<label
							className={`flex cursor-pointer gap-3 rounded-b-radius-md border border-t-0 p-4 transition-colors ${
								authMethod === 'api-key'
									? 'border-brand/50 bg-brand/5'
									: 'border-border-default bg-surface-base hover:bg-surface-1'
							}`}
						>
							<RadioGroupItem value='api-key' className='mt-0.5 shrink-0' />
							<div className='flex-1 space-y-2'>
								<div className='flex items-center gap-2'>
									<span className='text-body font-medium'>API Key</span>
								</div>
								<p className='text-body-sm text-text-secondary'>
									Enter your Anthropic API key directly.
								</p>

								{authMethod === 'api-key' && (
									<div className='mt-3 space-y-3'>
										{/* Current key status */}
										{configQ.data?.hasAnthropicKey && (
											<div className='flex items-center gap-2 text-body-sm text-green-400'>
												<TbCircleCheck className='h-4 w-4' />
												Current: {configQ.data.anthropicApiKey}
											</div>
										)}
										<Input
											placeholder='sk-ant-...'
											value={anthropicKey}
											onValueChange={setAnthropicKey}
											className='font-mono'
										/>
										<a
											href='https://console.anthropic.com/settings/keys'
											target='_blank'
											rel='noopener noreferrer'
											className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
										>
											<TbExternalLink className='h-3.5 w-3.5' />
											Get API key from Anthropic Console
										</a>
									</div>
								)}
							</div>
						</label>
					</RadioGroup>
				</div>

				{/* ── Gemini (Fallback) ─────────────────── */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Gemini (Fallback)</h2>
					<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
						{configQ.data?.hasGeminiKey && (
							<div className='flex items-center gap-2 text-body-sm text-green-400'>
								<TbCircleCheck className='h-4 w-4' />
								Current: {configQ.data.geminiApiKey}
							</div>
						)}
						<Input
							placeholder='AIzaSy...'
							value={geminiKey}
							onValueChange={setGeminiKey}
							className='font-mono'
						/>
						<a
							href='https://aistudio.google.com/app/apikey'
							target='_blank'
							rel='noopener noreferrer'
							className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
						>
							<TbExternalLink className='h-3.5 w-3.5' />
							Get API key from Google AI Studio
						</a>
					</div>
				</div>

				{/* ── Save Button ─────────────────── */}
				<div className='pt-2'>
					<Button
						variant='primary'
						onClick={handleSave}
						disabled={(!anthropicKey.trim() && !geminiKey.trim()) || setConfigMutation.isPending}
						className='w-full sm:w-auto'
					>
						{saved ? (
							<>
								<TbCheck className='h-4 w-4' />
								Saved
							</>
						) : setConfigMutation.isPending ? (
							'Saving...'
						) : (
							'Save API Keys'
						)}
					</Button>
				</div>
			</div>
		</SettingsPageLayout>
	)
}
