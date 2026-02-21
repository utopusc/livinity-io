/**
 * Voice Settings — Configure push-to-talk voice mode.
 *
 * Manages Deepgram (STT) and Cartesia (TTS) API keys,
 * voice selection, STT language/model, and enabled state.
 */

import {useState, useEffect} from 'react'
import {Loader2} from 'lucide-react'
import {
	TbMicrophone,
	TbCheck,
	TbEye,
	TbEyeOff,
	TbCircleCheck,
	TbExternalLink,
	TbAlertCircle,
} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {trpcReact} from '@/trpc/trpc'

// ─────────────────────────────────────────────────────────────────────────────
// Voice Settings Content (lazy-loaded from settings-content.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export function VoiceContent() {
	const [deepgramApiKey, setDeepgramApiKey] = useState('')
	const [cartesiaApiKey, setCartesiaApiKey] = useState('')
	const [cartesiaVoiceId, setCartesiaVoiceId] = useState('')
	const [sttLanguage, setSttLanguage] = useState('en')
	const [sttModel, setSttModel] = useState('nova-3')
	const [enabled, setEnabled] = useState(false)
	const [showDeepgramKey, setShowDeepgramKey] = useState(false)
	const [showCartesiaKey, setShowCartesiaKey] = useState(false)
	const [saved, setSaved] = useState(false)

	const configQ = trpcReact.ai.getVoiceConfig.useQuery()
	const utils = trpcReact.useUtils()

	const updateMutation = trpcReact.ai.updateVoiceConfig.useMutation({
		onSuccess: (data) => {
			setSaved(true)
			setDeepgramApiKey('')
			setCartesiaApiKey('')
			utils.ai.getVoiceConfig.invalidate()
			setTimeout(() => setSaved(false), 2000)
		},
	})

	// Load config on mount
	useEffect(() => {
		if (configQ.data) {
			setCartesiaVoiceId(configQ.data.cartesiaVoiceId || '')
			setSttLanguage(configQ.data.sttLanguage || 'en')
			setSttModel(configQ.data.sttModel || 'nova-3')
			setEnabled(configQ.data.enabled || false)
		}
	}, [configQ.data])

	const handleSave = () => {
		const payload: Record<string, unknown> = {}
		if (deepgramApiKey.trim()) payload.deepgramApiKey = deepgramApiKey.trim()
		if (cartesiaApiKey.trim()) payload.cartesiaApiKey = cartesiaApiKey.trim()
		if (cartesiaVoiceId.trim()) payload.cartesiaVoiceId = cartesiaVoiceId.trim()
		payload.sttLanguage = sttLanguage
		payload.sttModel = sttModel
		payload.enabled = enabled
		updateMutation.mutate(payload as any)
	}

	if (configQ.isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='size-6 animate-spin text-text-tertiary' />
			</div>
		)
	}

	const hasDeepgramKey = configQ.data?.hasDeepgramKey ?? false
	const hasCartesiaKey = configQ.data?.hasCartesiaKey ?? false
	const isReady = hasDeepgramKey && hasCartesiaKey

	return (
		<div className='max-w-lg space-y-6'>
			{/* Header */}
			<div className='space-y-2'>
				<h3 className='text-body font-medium text-text-primary'>Voice Mode</h3>
				<p className='text-body-sm text-text-secondary'>
					Push-to-talk voice interaction with the AI agent. Speak to the AI and hear responses
					in real-time via the chat interface.
				</p>
			</div>

			{/* Status Card */}
			<div
				className={`rounded-radius-md border p-4 ${
					isReady && enabled
						? 'border-green-500/30 bg-green-500/10'
						: isReady
							? 'border-amber-500/30 bg-amber-500/10'
							: 'border-border-default bg-surface-base'
				}`}
			>
				<div className='flex items-center gap-3'>
					<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
						<TbMicrophone className='h-6 w-6 text-violet-400' />
					</div>
					<div className='flex-1'>
						<div className='text-body-lg font-semibold'>Voice Pipeline</div>
						<div className='text-caption text-text-secondary'>
							{isReady && enabled
								? 'Ready -- voice button visible in chat'
								: isReady
									? 'API keys configured -- enable to activate'
									: 'Configure API keys to get started'}
						</div>
					</div>
					{isReady && enabled ? (
						<div className='flex items-center gap-2 text-caption text-green-400'>
							<TbCircleCheck className='h-4 w-4' /> Active
						</div>
					) : isReady ? (
						<div className='flex items-center gap-2 text-caption text-amber-400'>
							<TbAlertCircle className='h-4 w-4' /> Disabled
						</div>
					) : null}
				</div>
			</div>

			{/* Enable Toggle */}
			<div className='flex items-center justify-between rounded-radius-md border border-border-default bg-surface-base p-4'>
				<div>
					<div className='text-body font-medium'>Enable Voice Mode</div>
					<div className='text-caption text-text-secondary'>
						Show the push-to-talk button in AI chat
					</div>
				</div>
				<button
					onClick={() => setEnabled(!enabled)}
					className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
						enabled ? 'bg-brand' : 'bg-surface-3'
					}`}
				>
					<span
						className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
							enabled ? 'translate-x-6' : 'translate-x-1'
						}`}
					/>
				</button>
			</div>

			{/* Deepgram API Key */}
			<div className='space-y-2'>
				<label className='text-caption text-text-secondary'>Deepgram API Key (STT)</label>
				{hasDeepgramKey && (
					<div className='flex items-center gap-2 text-body-sm text-green-400'>
						<TbCircleCheck className='h-4 w-4' />
						API key configured
					</div>
				)}
				<div className='relative'>
					<Input
						type={showDeepgramKey ? 'text' : 'password'}
						value={deepgramApiKey}
						onValueChange={setDeepgramApiKey}
						placeholder={hasDeepgramKey ? 'Enter new key to replace...' : 'Enter Deepgram API key...'}
						className='pr-10 font-mono'
					/>
					<button
						onClick={() => setShowDeepgramKey(!showDeepgramKey)}
						className='absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary'
					>
						{showDeepgramKey ? <TbEyeOff className='h-4 w-4' /> : <TbEye className='h-4 w-4' />}
					</button>
				</div>
				<a
					href='https://console.deepgram.com/signup'
					target='_blank'
					rel='noopener noreferrer'
					className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
				>
					<TbExternalLink className='h-3.5 w-3.5' />
					Get API key from deepgram.com
				</a>
			</div>

			{/* Cartesia API Key */}
			<div className='space-y-2'>
				<label className='text-caption text-text-secondary'>Cartesia API Key (TTS)</label>
				{hasCartesiaKey && (
					<div className='flex items-center gap-2 text-body-sm text-green-400'>
						<TbCircleCheck className='h-4 w-4' />
						API key configured
					</div>
				)}
				<div className='relative'>
					<Input
						type={showCartesiaKey ? 'text' : 'password'}
						value={cartesiaApiKey}
						onValueChange={setCartesiaApiKey}
						placeholder={hasCartesiaKey ? 'Enter new key to replace...' : 'Enter Cartesia API key...'}
						className='pr-10 font-mono'
					/>
					<button
						onClick={() => setShowCartesiaKey(!showCartesiaKey)}
						className='absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary'
					>
						{showCartesiaKey ? <TbEyeOff className='h-4 w-4' /> : <TbEye className='h-4 w-4' />}
					</button>
				</div>
				<a
					href='https://play.cartesia.ai/keys'
					target='_blank'
					rel='noopener noreferrer'
					className='flex items-center gap-1.5 text-caption text-blue-400 hover:text-blue-300'
				>
					<TbExternalLink className='h-3.5 w-3.5' />
					Get API key from cartesia.ai
				</a>
			</div>

			{/* Voice ID */}
			<div className='space-y-2'>
				<label className='text-caption text-text-secondary'>Cartesia Voice ID</label>
				<Input
					value={cartesiaVoiceId}
					onValueChange={setCartesiaVoiceId}
					placeholder='a0e99841-438c-4a64-b679-ae501e7d6091'
					className='font-mono'
				/>
				<p className='text-caption-sm text-text-tertiary'>
					UUID of the Cartesia voice to use for TTS. Browse voices at play.cartesia.ai.
				</p>
			</div>

			{/* STT Settings */}
			<div className='grid grid-cols-2 gap-4'>
				<div className='space-y-2'>
					<label className='text-caption text-text-secondary'>STT Language</label>
					<Select value={sttLanguage} onValueChange={setSttLanguage}>
						<SelectTrigger><SelectValue placeholder='Language' /></SelectTrigger>
						<SelectContent>
							<SelectItem value='en'>English</SelectItem>
							<SelectItem value='tr'>Turkish</SelectItem>
							<SelectItem value='de'>German</SelectItem>
							<SelectItem value='fr'>French</SelectItem>
							<SelectItem value='es'>Spanish</SelectItem>
							<SelectItem value='pt'>Portuguese</SelectItem>
							<SelectItem value='ja'>Japanese</SelectItem>
							<SelectItem value='ko'>Korean</SelectItem>
							<SelectItem value='zh'>Chinese</SelectItem>
							<SelectItem value='multi'>Multi-language</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className='space-y-2'>
					<label className='text-caption text-text-secondary'>STT Model</label>
					<Select value={sttModel} onValueChange={setSttModel}>
						<SelectTrigger><SelectValue placeholder='Model' /></SelectTrigger>
						<SelectContent>
							<SelectItem value='nova-3'>Nova 3 (Best)</SelectItem>
							<SelectItem value='nova-2'>Nova 2</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Info Card */}
			<div className='rounded-radius-md border border-blue-500/20 bg-blue-500/5 p-4 space-y-2'>
				<div className='text-body-sm font-medium text-blue-400'>Requirements</div>
				<p className='text-caption text-text-secondary'>
					Voice mode requires both a Deepgram API key (for speech-to-text) and a Cartesia API
					key (for text-to-speech). The voice button will only appear in the AI chat when both
					keys are configured and voice mode is enabled.
				</p>
			</div>

			{/* Save Button */}
			<div className='flex justify-end border-t border-border-default pt-4'>
				<Button
					variant='primary'
					size='sm'
					onClick={handleSave}
					disabled={updateMutation.isPending}
				>
					{saved ? (
						<><TbCheck className='h-4 w-4' /> Saved</>
					) : updateMutation.isPending ? (
						'Saving...'
					) : (
						'Save Voice Settings'
					)}
				</Button>
			</div>

			{updateMutation.isError && (
				<p className='text-caption text-red-400 flex items-center gap-1.5'>
					<TbAlertCircle className='h-3.5 w-3.5' />
					{updateMutation.error.message}
				</p>
			)}
		</div>
	)
}

export default VoiceContent
