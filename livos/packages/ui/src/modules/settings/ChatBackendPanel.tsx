// Phase 165-02 — Settings UI: chat backend + model picker.
//
// Mirrors the master-chrome-login.tsx tRPC pattern. Renders:
//   - Radio toggle: chat backend (vault | legacy)
//   - Dropdown:    default chat model (Opus 4.7 / Sonnet 4.6 / Haiku 4.5)
//   - Apply button: writes via chatConfig.setBackend + setModel mutations.
//
// Mutations bump AiModule in-place; the NEXT /ws/agent connection picks
// up the new values via Task 4's lazy resolveVaultModeConfig getter
// (no livinityd restart). Hint: "applies to new chat sessions" — existing
// open WS sessions keep the OLD backend until they reconnect.

import {useEffect, useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {trpcReact} from '@/trpc/trpc'

const MODELS = [
	{value: 'claude-opus-4-7', label: 'Opus 4.7 — best quality (default)'},
	{value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced'},
	{value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fastest, cheapest'},
] as const

export function ChatBackendPanel() {
	const utils = trpcReact.useUtils()
	const backendQ = trpcReact.chatConfig.getBackend.useQuery()
	const modelQ = trpcReact.chatConfig.getModel.useQuery()
	const setBackend = trpcReact.chatConfig.setBackend.useMutation({
		onSuccess: () => utils.chatConfig.getBackend.invalidate(),
	})
	const setModel = trpcReact.chatConfig.setModel.useMutation({
		onSuccess: () => utils.chatConfig.getModel.invalidate(),
	})

	const [draftBackend, setDraftBackend] = useState<'vault' | 'legacy'>('vault')
	const [draftModel, setDraftModel] = useState<string>('claude-opus-4-7')

	useEffect(() => {
		if (backendQ.data) setDraftBackend(backendQ.data.backend)
	}, [backendQ.data])
	useEffect(() => {
		if (modelQ.data) setDraftModel(modelQ.data.model)
	}, [modelQ.data])

	const dirty =
		(backendQ.data && draftBackend !== backendQ.data.backend) ||
		(modelQ.data && draftModel !== modelQ.data.model)
	const busy = setBackend.isPending || setModel.isPending

	const onApply = async () => {
		if (backendQ.data && draftBackend !== backendQ.data.backend) {
			await setBackend.mutateAsync({backend: draftBackend})
		}
		if (modelQ.data && draftModel !== modelQ.data.model) {
			await setModel.mutateAsync({model: draftModel as any})
		}
	}

	return (
		<div className='space-y-6'>
			<section>
				<h3 className='font-medium mb-2 text-text-primary'>Chat backend</h3>
				<label className='flex items-center gap-2 text-text-primary'>
					<input
						type='radio'
						name='backend'
						value='vault'
						checked={draftBackend === 'vault'}
						onChange={() => setDraftBackend('vault')}
					/>
					<span>Vault (Claude Code + livinity-vault, default)</span>
				</label>
				<label className='flex items-center gap-2 text-text-primary'>
					<input
						type='radio'
						name='backend'
						value='legacy'
						checked={draftBackend === 'legacy'}
						onChange={() => setDraftBackend('legacy')}
					/>
					<span>Legacy (pre-v34 path, fallback)</span>
				</label>
			</section>
			<section>
				<h3 className='font-medium mb-2 text-text-primary'>Default chat model</h3>
				<select
					value={draftModel}
					onChange={(e) => setDraftModel(e.target.value)}
					className='px-2 py-1 border rounded text-sm bg-transparent text-text-primary'
				>
					{MODELS.map((m) => (
						<option key={m.value} value={m.value}>
							{m.label}
						</option>
					))}
				</select>
			</section>
			<div>
				<Button onClick={onApply} disabled={!dirty || busy}>
					{busy ? 'Applying…' : 'Apply'}
				</Button>
				<p className='text-xs text-text-secondary mt-2'>
					Applies to new chat sessions. Existing open chats keep the previous
					backend until they reconnect.
				</p>
			</div>
		</div>
	)
}
