import {useState, useEffect} from 'react'
import {TbCheck, TbRefresh, TbBrain, TbTool, TbClock, TbMessage, TbHeartbeat, TbBrandTelegram, TbBrandDiscord, TbMessageCircle} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

interface NexusConfig {
	retry?: {
		enabled?: boolean
		attempts?: number
		minDelayMs?: number
		maxDelayMs?: number
		jitter?: number
	}
	agent?: {
		maxTurns?: number
		maxTokens?: number
		timeoutMs?: number
		tier?: string
		maxDepth?: number
		streamEnabled?: boolean
	}
	subagents?: {
		maxConcurrent?: number
		maxTurns?: number
		maxTokens?: number
		timeoutMs?: number
	}
	session?: {
		idleMinutes?: number
		maxHistoryMessages?: number
	}
	logging?: {
		level?: string
		redactSensitive?: boolean
	}
	heartbeat?: {
		enabled?: boolean
		intervalMinutes?: number
		target?: string
	}
	response?: {
		style?: string
		showSteps?: boolean
		showReasoning?: boolean
		language?: string
		maxLength?: number
	}
}

export default function NexusConfigPage() {
	const [config, setConfig] = useState<NexusConfig>({})
	const [saved, setSaved] = useState(false)
	const [activeTab, setActiveTab] = useState('response')

	const configQ = trpcReact.ai.getNexusConfig.useQuery()
	const utils = trpcReact.useUtils()

	const updateConfigMutation = trpcReact.ai.updateNexusConfig.useMutation({
		onSuccess: () => {
			setSaved(true)
			utils.ai.getNexusConfig.invalidate()
			setTimeout(() => setSaved(false), 2000)
		},
	})

	const resetConfigMutation = trpcReact.ai.resetNexusConfig.useMutation({
		onSuccess: () => {
			utils.ai.getNexusConfig.invalidate()
		},
	})

	useEffect(() => {
		if (configQ.data?.config) {
			setConfig(configQ.data.config)
		}
	}, [configQ.data])

	const handleSave = () => {
		updateConfigMutation.mutate(config)
	}

	const handleReset = () => {
		if (confirm('Reset all settings to defaults?')) {
			resetConfigMutation.mutate()
		}
	}

	const updateConfig = (path: string, value: any) => {
		setConfig((prev) => {
			const newConfig = {...prev}
			const parts = path.split('.')
			let current: any = newConfig
			for (let i = 0; i < parts.length - 1; i++) {
				if (!current[parts[i]]) current[parts[i]] = {}
				current = current[parts[i]]
			}
			current[parts[parts.length - 1]] = value
			return newConfig
		})
	}

	return (
		<SettingsPageLayout title='Nexus AI Settings' description='Configure agent behavior, response style, and system parameters'>
			<Tabs value={activeTab} onValueChange={setActiveTab} className='w-full'>
				<TabsList className='mb-6 grid w-full grid-cols-6'>
					<TabsTrigger value='response' className='flex items-center gap-2'>
						<TbMessageCircle className='h-4 w-4' />
						<span className='hidden sm:inline'>Response</span>
					</TabsTrigger>
					<TabsTrigger value='agent' className='flex items-center gap-2'>
						<TbBrain className='h-4 w-4' />
						<span className='hidden sm:inline'>Agent</span>
					</TabsTrigger>
					<TabsTrigger value='retry' className='flex items-center gap-2'>
						<TbRefresh className='h-4 w-4' />
						<span className='hidden sm:inline'>Retry</span>
					</TabsTrigger>
					<TabsTrigger value='heartbeat' className='flex items-center gap-2'>
						<TbHeartbeat className='h-4 w-4' />
						<span className='hidden sm:inline'>Heartbeat</span>
					</TabsTrigger>
					<TabsTrigger value='session' className='flex items-center gap-2'>
						<TbClock className='h-4 w-4' />
						<span className='hidden sm:inline'>Session</span>
					</TabsTrigger>
					<TabsTrigger value='advanced' className='flex items-center gap-2'>
						<TbTool className='h-4 w-4' />
						<span className='hidden sm:inline'>Advanced</span>
					</TabsTrigger>
				</TabsList>

				{/* Response Tab - Now First! */}
				<TabsContent value='response' className='space-y-4'>
					<div className='flex flex-col gap-2'>
						<label className='text-12 text-white/50'>Response Style</label>
						<Select
							value={config.response?.style || 'detailed'}
							onValueChange={(v) => updateConfig('response.style', v)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Select style' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='detailed'>
									<div className='flex flex-col'>
										<span>Detailed</span>
										<span className='text-11 text-white/40'>Step-by-step with explanations</span>
									</div>
								</SelectItem>
								<SelectItem value='concise'>
									<div className='flex flex-col'>
										<span>Concise</span>
										<span className='text-11 text-white/40'>Brief but informative</span>
									</div>
								</SelectItem>
								<SelectItem value='direct'>
									<div className='flex flex-col'>
										<span>Direct</span>
										<span className='text-11 text-white/40'>Just the result, no explanation</span>
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
						<span className='text-11 text-white/30'>How detailed AI responses should be</span>
					</div>

					<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
						<div>
							<div className='text-14 font-medium'>Show Steps</div>
							<div className='text-12 text-white/50'>Show step-by-step breakdown (Step 1, Step 2...)</div>
						</div>
						<Switch
							checked={config.response?.showSteps ?? true}
							onCheckedChange={(v) => updateConfig('response.showSteps', v)}
						/>
					</div>

					<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
						<div>
							<div className='text-14 font-medium'>Show Reasoning</div>
							<div className='text-12 text-white/50'>Include thought process and reasoning</div>
						</div>
						<Switch
							checked={config.response?.showReasoning ?? true}
							onCheckedChange={(v) => updateConfig('response.showReasoning', v)}
						/>
					</div>

					<div className='flex flex-col gap-2'>
						<label className='text-12 text-white/50'>Response Language</label>
						<Select
							value={config.response?.language || 'auto'}
							onValueChange={(v) => updateConfig('response.language', v)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Select language' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='auto'>Auto-detect</SelectItem>
								<SelectItem value='en'>English</SelectItem>
								<SelectItem value='tr'>Turkish</SelectItem>
								<SelectItem value='de'>German</SelectItem>
								<SelectItem value='fr'>French</SelectItem>
								<SelectItem value='es'>Spanish</SelectItem>
							</SelectContent>
						</Select>
						<span className='text-11 text-white/30'>Language for AI responses</span>
					</div>
				</TabsContent>

				{/* Agent Tab */}
				<TabsContent value='agent' className='space-y-4'>
					<div className='grid grid-cols-2 gap-4'>
						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max Turns (1-100)</label>
							<Input
								type='number'
								min={1}
								max={100}
								value={config.agent?.maxTurns || 30}
								onValueChange={(v) => updateConfig('agent.maxTurns', parseInt(v) || 30)}
							/>
							<span className='text-11 text-white/30'>Maximum tool calls per conversation</span>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max Tokens (K)</label>
							<Input
								type='number'
								min={10}
								max={1000}
								value={Math.round((config.agent?.maxTokens || 200000) / 1000)}
								onValueChange={(v) => updateConfig('agent.maxTokens', (parseInt(v) || 200) * 1000)}
							/>
							<span className='text-11 text-white/30'>Token budget per conversation</span>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Timeout (minutes)</label>
							<Input
								type='number'
								min={1}
								max={60}
								value={Math.round((config.agent?.timeoutMs || 600000) / 60000)}
								onValueChange={(v) => updateConfig('agent.timeoutMs', (parseInt(v) || 10) * 60000)}
							/>
							<span className='text-11 text-white/30'>Max time per task</span>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max Subagent Depth</label>
							<Input
								type='number'
								min={1}
								max={10}
								value={config.agent?.maxDepth || 3}
								onValueChange={(v) => updateConfig('agent.maxDepth', parseInt(v) || 3)}
							/>
							<span className='text-11 text-white/30'>Nested agent limit</span>
						</div>
					</div>

					<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
						<div>
							<div className='text-14 font-medium'>Stream Responses</div>
							<div className='text-12 text-white/50'>Show responses as they generate</div>
						</div>
						<Switch
							checked={config.agent?.streamEnabled ?? true}
							onCheckedChange={(v) => updateConfig('agent.streamEnabled', v)}
						/>
					</div>
				</TabsContent>

				{/* Retry Tab */}
				<TabsContent value='retry' className='space-y-4'>
					<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
						<div>
							<div className='text-14 font-medium'>Enable Retry</div>
							<div className='text-12 text-white/50'>Automatically retry failed API calls</div>
						</div>
						<Switch
							checked={config.retry?.enabled ?? true}
							onCheckedChange={(v) => updateConfig('retry.enabled', v)}
						/>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max Attempts</label>
							<Input
								type='number'
								min={1}
								max={10}
								value={config.retry?.attempts || 3}
								onValueChange={(v) => updateConfig('retry.attempts', parseInt(v) || 3)}
								disabled={!config.retry?.enabled}
							/>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Min Delay (ms)</label>
							<Input
								type='number'
								min={100}
								max={10000}
								value={config.retry?.minDelayMs || 500}
								onValueChange={(v) => updateConfig('retry.minDelayMs', parseInt(v) || 500)}
								disabled={!config.retry?.enabled}
							/>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max Delay (ms)</label>
							<Input
								type='number'
								min={1000}
								max={60000}
								value={config.retry?.maxDelayMs || 30000}
								onValueChange={(v) => updateConfig('retry.maxDelayMs', parseInt(v) || 30000)}
								disabled={!config.retry?.enabled}
							/>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Jitter (0-1)</label>
							<Input
								type='number'
								min={0}
								max={1}
								step={0.1}
								value={config.retry?.jitter || 0.2}
								onValueChange={(v) => updateConfig('retry.jitter', parseFloat(v) || 0.2)}
								disabled={!config.retry?.enabled}
							/>
							<span className='text-11 text-white/30'>Randomness in delay timing</span>
						</div>
					</div>
				</TabsContent>

				{/* Heartbeat Tab */}
				<TabsContent value='heartbeat' className='space-y-4'>
					<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
						<div>
							<div className='text-14 font-medium'>Enable Heartbeat</div>
							<div className='text-12 text-white/50'>Periodically check HEARTBEAT.md for tasks</div>
						</div>
						<Switch
							checked={config.heartbeat?.enabled ?? false}
							onCheckedChange={(v) => updateConfig('heartbeat.enabled', v)}
						/>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Interval (minutes)</label>
							<Input
								type='number'
								min={5}
								max={1440}
								value={config.heartbeat?.intervalMinutes || 30}
								onValueChange={(v) => updateConfig('heartbeat.intervalMinutes', parseInt(v) || 30)}
								disabled={!config.heartbeat?.enabled}
							/>
							<span className='text-11 text-white/30'>How often to check for tasks</span>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Delivery Target</label>
							<Select
								value={config.heartbeat?.target || 'telegram'}
								onValueChange={(v) => updateConfig('heartbeat.target', v)}
								disabled={!config.heartbeat?.enabled}
							>
								<SelectTrigger>
									<SelectValue placeholder='Select target' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='telegram'>
										<div className='flex items-center gap-2'>
											<TbBrandTelegram className='h-4 w-4 text-blue-400' />
											Telegram
										</div>
									</SelectItem>
									<SelectItem value='discord'>
										<div className='flex items-center gap-2'>
											<TbBrandDiscord className='h-4 w-4 text-indigo-400' />
											Discord
										</div>
									</SelectItem>
									<SelectItem value='all'>
										<div className='flex items-center gap-2'>
											<TbMessage className='h-4 w-4 text-green-400' />
											All Connected Channels
										</div>
									</SelectItem>
									<SelectItem value='none'>
										<div className='flex items-center gap-2'>
											<TbTool className='h-4 w-4 text-white/50' />
											Don't deliver (log only)
										</div>
									</SelectItem>
								</SelectContent>
							</Select>
							<span className='text-11 text-white/30'>Where to send alerts</span>
						</div>
					</div>
				</TabsContent>

				{/* Session Tab */}
				<TabsContent value='session' className='space-y-4'>
					<div className='grid grid-cols-2 gap-4'>
						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Idle Timeout (minutes)</label>
							<Input
								type='number'
								min={5}
								max={1440}
								value={config.session?.idleMinutes || 60}
								onValueChange={(v) => updateConfig('session.idleMinutes', parseInt(v) || 60)}
							/>
							<span className='text-11 text-white/30'>Session reset after inactivity</span>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max History Messages</label>
							<Input
								type='number'
								min={10}
								max={500}
								value={config.session?.maxHistoryMessages || 100}
								onValueChange={(v) => updateConfig('session.maxHistoryMessages', parseInt(v) || 100)}
							/>
							<span className='text-11 text-white/30'>Messages kept in context</span>
						</div>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Subagent Max Turns</label>
							<Input
								type='number'
								min={1}
								max={20}
								value={config.subagents?.maxTurns || 5}
								onValueChange={(v) => updateConfig('subagents.maxTurns', parseInt(v) || 5)}
							/>
						</div>

						<div className='flex flex-col gap-2'>
							<label className='text-12 text-white/50'>Max Concurrent Subagents</label>
							<Input
								type='number'
								min={1}
								max={20}
								value={config.subagents?.maxConcurrent || 8}
								onValueChange={(v) => updateConfig('subagents.maxConcurrent', parseInt(v) || 8)}
							/>
						</div>
					</div>
				</TabsContent>

				{/* Advanced Tab */}
				<TabsContent value='advanced' className='space-y-4'>
					<div className='flex flex-col gap-2'>
						<label className='text-12 text-white/50'>Log Level</label>
						<Select
							value={config.logging?.level || 'info'}
							onValueChange={(v) => updateConfig('logging.level', v)}
						>
							<SelectTrigger>
								<SelectValue placeholder='Select log level' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='silent'>Silent</SelectItem>
								<SelectItem value='error'>Error</SelectItem>
								<SelectItem value='warn'>Warn</SelectItem>
								<SelectItem value='info'>Info</SelectItem>
								<SelectItem value='debug'>Debug</SelectItem>
								<SelectItem value='trace'>Trace</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className='flex items-center justify-between rounded-12 border border-white/10 bg-white/5 p-4'>
						<div>
							<div className='text-14 font-medium'>Redact Sensitive Data</div>
							<div className='text-12 text-white/50'>Hide API keys and tokens in logs</div>
						</div>
						<Switch
							checked={config.logging?.redactSensitive ?? true}
							onCheckedChange={(v) => updateConfig('logging.redactSensitive', v)}
						/>
					</div>

					<div className='rounded-12 border border-orange-500/30 bg-orange-500/10 p-4'>
						<div className='text-14 font-medium text-orange-400'>Danger Zone</div>
						<div className='mt-2 text-12 text-white/50'>
							Reset all settings to factory defaults. This cannot be undone.
						</div>
						<Button variant='destructive' size='sm' className='mt-3' onClick={handleReset}>
							Reset to Defaults
						</Button>
					</div>
				</TabsContent>
			</Tabs>

			{/* Save Button - Fixed at bottom */}
			<div className='mt-8 flex justify-end border-t border-white/10 pt-4'>
				<Button
					variant='primary'
					size='dialog'
					onClick={handleSave}
					disabled={updateConfigMutation.isPending}
				>
					{saved ? (
						<>
							<TbCheck className='h-4 w-4' />
							Saved
						</>
					) : updateConfigMutation.isPending ? (
						'Saving...'
					) : (
						'Save Changes'
					)}
				</Button>
			</div>
		</SettingsPageLayout>
	)
}
