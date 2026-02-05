import {useState} from 'react'
import {TbCheck} from 'react-icons/tb'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'

export function AiConfigDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
	const [apiKey, setApiKey] = useState('')
	const [saved, setSaved] = useState(false)

	const configQ = trpcReact.ai.getConfig.useQuery(undefined, {enabled: open})
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>AI Configuration</DialogTitle>
					<DialogDescription>
						Set your Gemini API key to enable AI features. The key is stored securely in Redis and persists across
						restarts.
					</DialogDescription>
				</DialogHeader>

				<div className='flex flex-col gap-4 py-2'>
					<div className='flex flex-col gap-1.5'>
						<div className='px-[5px] text-12 -tracking-2 text-white/50'>Current key</div>
						<div className='rounded-12 border border-white/10 bg-white/5 px-5 py-3 font-mono text-13 text-white/40'>
							{configQ.isLoading ? '...' : configQ.data?.hasGeminiKey ? configQ.data.geminiApiKey : 'Not set'}
						</div>
					</div>

					<div className='flex flex-col gap-1.5'>
						<div className='px-[5px] text-12 -tracking-2 text-white/50'>New API key</div>
						<Input
							placeholder='AIzaSy...'
							value={apiKey}
							onValueChange={setApiKey}
							onKeyDown={(e) => e.key === 'Enter' && handleSave()}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='primary'
						size='dialog'
						onClick={handleSave}
						disabled={!apiKey.trim() || setConfigMutation.isPending}
					>
						{saved ? (
							<>
								<TbCheck className='h-4 w-4' />
								Saved
							</>
						) : setConfigMutation.isPending ? (
							'Saving...'
						) : (
							'Save key'
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
