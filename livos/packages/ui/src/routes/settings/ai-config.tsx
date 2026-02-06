import {useState} from 'react'
import {TbCheck, TbKey, TbExternalLink} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

export default function AiConfigPage() {
	const [apiKey, setApiKey] = useState('')
	const [saved, setSaved] = useState(false)

	const configQ = trpcReact.ai.getConfig.useQuery()
	const utils = trpcReact.useUtils()

	const setConfigMutation = trpcReact.ai.setConfig.useMutation({
		onSuccess: () => {
			setSaved(true)
			setApiKey('')
			utils.ai.getConfig.invalidate()
			setTimeout(() => setSaved(false), 2000)
		},
	})

	const handleSave = () => {
		if (!apiKey.trim()) return
		setConfigMutation.mutate({geminiApiKey: apiKey.trim()})
	}

	return (
		<SettingsPageLayout title='AI Configuration' description='Set your Gemini API key to enable AI features'>
			<div className='max-w-lg space-y-6'>
				{/* Current Key Status */}
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
					<div className='flex items-center gap-3'>
						<div className='flex h-10 w-10 items-center justify-center rounded-radius-sm bg-surface-2'>
							<TbKey className='h-5 w-5 text-text-secondary' />
						</div>
						<div className='flex-1'>
							<div className='text-body font-medium'>Current API Key</div>
							<div className='font-mono text-body-sm text-text-secondary'>
								{configQ.isLoading ? 'Loading...' : configQ.data?.hasGeminiKey ? configQ.data.geminiApiKey : 'Not configured'}
							</div>
						</div>
						{configQ.data?.hasGeminiKey && (
							<div className='rounded-full bg-green-500/20 px-3 py-1 text-caption text-green-400'>Active</div>
						)}
					</div>
				</div>

				{/* New API Key Input */}
				<div className='space-y-3'>
					<label className='text-caption text-text-secondary'>Enter new API key</label>
					<Input
						placeholder='AIzaSy...'
						value={apiKey}
						onValueChange={setApiKey}
						onKeyDown={(e) => e.key === 'Enter' && handleSave()}
						className='font-mono'
					/>
					<p className='text-caption-sm text-text-tertiary'>
						Your API key is stored securely and persists across restarts.
					</p>
				</div>

				{/* Get API Key Link */}
				<a
					href='https://aistudio.google.com/app/apikey'
					target='_blank'
					rel='noopener noreferrer'
					className='flex items-center gap-2 text-body-sm text-blue-400 hover:text-blue-300'
				>
					<TbExternalLink className='h-4 w-4' />
					Get your Gemini API key from Google AI Studio
				</a>

				{/* Save Button */}
				<div className='pt-4'>
					<Button
						variant='primary'
						onClick={handleSave}
						disabled={!apiKey.trim() || setConfigMutation.isPending}
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
							'Save API Key'
						)}
					</Button>
				</div>
			</div>
		</SettingsPageLayout>
	)
}
