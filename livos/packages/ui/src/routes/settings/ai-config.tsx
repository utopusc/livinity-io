import {useState} from 'react'
import {TbCheck, TbExternalLink, TbLoader2, TbAlertCircle, TbCircleCheck, TbLogout} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

/** Map UI tier labels to Nexus config tier values */
const TIER_TO_NEXUS: Record<string, string> = {
	fast: 'flash',
	balanced: 'sonnet',
	powerful: 'opus',
}

/** Map Nexus config tier values back to UI tier labels */
function nexusTierToUi(tier: string | undefined): string {
	if (tier === 'flash' || tier === 'haiku') return 'fast'
	if (tier === 'opus') return 'powerful'
	return 'balanced' // default
}

export default function AiConfigPage() {
	const [apiKey, setApiKey] = useState('')
	const [saved, setSaved] = useState(false)

	const kimiStatusQ = trpcReact.ai.getKimiStatus.useQuery()
	const configQ = trpcReact.ai.getConfig.useQuery()
	const nexusConfigQ = trpcReact.ai.getNexusConfig.useQuery()
	const utils = trpcReact.useUtils()

	const isConnected = kimiStatusQ.data?.authenticated ?? false

	const loginMutation = trpcReact.ai.kimiLogin.useMutation({
		onSuccess: () => {
			setSaved(true)
			setApiKey('')
			utils.ai.getKimiStatus.invalidate()
			utils.ai.getConfig.invalidate()
			setTimeout(() => setSaved(false), 2000)
		},
	})

	const logoutMutation = trpcReact.ai.kimiLogout.useMutation({
		onSuccess: () => {
			utils.ai.getKimiStatus.invalidate()
			utils.ai.getConfig.invalidate()
		},
	})

	const updateNexusConfigMutation = trpcReact.ai.updateNexusConfig.useMutation({
		onSuccess: () => {
			utils.ai.getNexusConfig.invalidate()
		},
	})

	const handleSave = () => {
		if (!apiKey.trim()) return
		loginMutation.mutate({apiKey: apiKey.trim()})
	}

	const handleDisconnect = () => {
		logoutMutation.mutate()
	}

	// Current tier from Nexus config
	const currentTier = nexusTierToUi(
		(nexusConfigQ.data?.config as Record<string, Record<string, string>> | undefined)?.agent?.tier,
	)

	const handleTierChange = (value: string) => {
		const nexusTier = TIER_TO_NEXUS[value]
		if (nexusTier) {
			updateNexusConfigMutation.mutate({
				agent: {tier: nexusTier as 'flash' | 'sonnet' | 'opus'},
			})
		}
	}

	return (
		<SettingsPageLayout title='AI Configuration' description='Configure how LivOS connects to Kimi AI'>
			<div className='max-w-lg space-y-8'>
				{/* -- Kimi Provider ---------------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Kimi Provider</h2>

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
									Connected
								</div>
								{configQ.data?.kimiApiKey && (
									<p className='text-caption text-text-secondary font-mono'>
										Current: {configQ.data.kimiApiKey}
									</p>
								)}
								<div className='space-y-3'>
									<Input
										placeholder='Enter a new Kimi API key...'
										value={apiKey}
										onValueChange={setApiKey}
										className='font-mono'
									/>
									<div className='flex gap-2'>
										<Button
											variant='primary'
											size='sm'
											onClick={handleSave}
											disabled={!apiKey.trim() || loginMutation.isPending}
										>
											{saved ? (
												<>
													<TbCheck className='h-4 w-4' />
													Saved
												</>
											) : loginMutation.isPending ? (
												'Saving...'
											) : (
												'Save API Key'
											)}
										</Button>
										<Button
											variant='secondary'
											size='sm'
											onClick={handleDisconnect}
											disabled={logoutMutation.isPending}
										>
											{logoutMutation.isPending ? (
												<>
													<TbLoader2 className='h-4 w-4 animate-spin' /> Disconnecting...
												</>
											) : (
												<>
													<TbLogout className='h-4 w-4' /> Disconnect
												</>
											)}
										</Button>
									</div>
								</div>
								{loginMutation.isError && (
									<p className='text-caption text-red-400'>{loginMutation.error.message}</p>
								)}
								{logoutMutation.isError && (
									<p className='text-caption text-red-400'>{logoutMutation.error.message}</p>
								)}
							</div>
						) : (
							<div className='space-y-3'>
								<div className='flex items-center gap-2 text-body-sm text-amber-400'>
									<TbAlertCircle className='h-4 w-4' />
									Not connected
								</div>
								<Input
									placeholder='Enter your Kimi API key...'
									value={apiKey}
									onValueChange={setApiKey}
									className='font-mono'
								/>
								<a
									href='https://platform.kimi.com'
									target='_blank'
									rel='noopener noreferrer'
									className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
								>
									<TbExternalLink className='h-3.5 w-3.5' />
									Get API key from Kimi Platform
								</a>
								<Button
									variant='primary'
									size='sm'
									onClick={handleSave}
									disabled={!apiKey.trim() || loginMutation.isPending}
								>
									{saved ? (
										<>
											<TbCheck className='h-4 w-4' />
											Saved
										</>
									) : loginMutation.isPending ? (
										'Saving...'
									) : (
										'Save API Key'
									)}
								</Button>
								{loginMutation.isError && (
									<p className='text-caption text-red-400'>{loginMutation.error.message}</p>
								)}
							</div>
						)}
					</div>
				</div>

				{/* -- Model Selection ---------------------------------------- */}
				<div className='space-y-4'>
					<h2 className='text-body font-semibold'>Model Selection</h2>
					<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
						<p className='text-body-sm text-text-secondary'>
							Select the default model tier for AI tasks.
						</p>
						<Select value={currentTier} onValueChange={handleTierChange}>
							<SelectTrigger className='w-full'>
								<SelectValue placeholder='Select model tier' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='fast'>Fast (K2.5 Flash)</SelectItem>
								<SelectItem value='balanced'>Balanced (K2.5)</SelectItem>
								<SelectItem value='powerful'>Powerful (K2.5 Pro)</SelectItem>
							</SelectContent>
						</Select>
						{updateNexusConfigMutation.isPending && (
							<p className='text-caption text-text-secondary'>Saving...</p>
						)}
						{updateNexusConfigMutation.isError && (
							<p className='text-caption text-red-400'>{updateNexusConfigMutation.error.message}</p>
						)}
					</div>
				</div>
			</div>
		</SettingsPageLayout>
	)
}
