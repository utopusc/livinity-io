// Phase 27-01 — verbatim port of legacy routes/server-control/index.tsx:2680-2796
// (Phase 23 AID-03 — Kimi natural-language compose generator). Legacy file
// deleted Phase 27-02.
//
// Consumed by DeployStackForm's third Tab. Component renders a textarea
// for the user's natural-language prompt, generates compose YAML via the
// Kimi-backed `useAiDiagnostics` hook, and surfaces a "Use this YAML"
// button that pipes the generated YAML back to the parent (which switches
// the form to the YAML tab and pre-fills the editor).

import {IconCheck, IconLoader2, IconSparkles} from '@tabler/icons-react'

import {useAiDiagnostics} from '@/hooks/use-ai-diagnostics'
import {Button} from '@/shadcn-components/ui/button'
import {Label} from '@/shadcn-components/ui/label'

export function AiComposeTab({
	prompt,
	setPrompt,
	onUseYaml,
}: {
	prompt: string
	setPrompt: (v: string) => void
	onUseYaml: (yaml: string) => void
}) {
	const {generateCompose, composeResult, composeError, isGeneratingCompose, resetCompose} =
		useAiDiagnostics()
	const promptValid = prompt.trim().length >= 10 && prompt.trim().length <= 2000

	return (
		<div className='space-y-3'>
			<div className='space-y-1.5'>
				<Label htmlFor='ai-compose-prompt'>Describe your stack</Label>
				<textarea
					id='ai-compose-prompt'
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder={`e.g. "Nextcloud with Redis and MariaDB, expose on 8080. Use latest stable images."`}
					className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
					style={{
						fontSize: '13px',
						minHeight: '100px',
						lineHeight: '1.5',
						resize: 'vertical',
					}}
					maxLength={2000}
					spellCheck={false}
				/>
				<div className='flex items-center justify-between text-xs text-text-tertiary'>
					<span>{prompt.trim().length}/2000 characters (min 10)</span>
					<Button
						type='button'
						size='sm'
						disabled={!promptValid || isGeneratingCompose}
						onClick={() => {
							resetCompose()
							generateCompose({prompt: prompt.trim()})
						}}
					>
						{isGeneratingCompose ? (
							<>
								<IconLoader2 size={14} className='mr-1 animate-spin' />
								Generating...
							</>
						) : (
							<>
								<IconSparkles size={14} className='mr-1' />
								Generate
							</>
						)}
					</Button>
				</div>
			</div>

			{isGeneratingCompose && (
				<div className='flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-700'>
					<IconLoader2 size={14} className='animate-spin' />
					<span>Asking Kimi to generate compose YAML — this can take up to 30s...</span>
				</div>
			)}

			{composeError && (
				<div className='rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600'>
					{composeError.message}
				</div>
			)}

			{composeResult && composeResult.yaml && (
				<div className='space-y-2'>
					<div className='flex items-center justify-between'>
						<Label>Generated YAML preview</Label>
						<Button
							type='button'
							size='sm'
							variant='default'
							onClick={() => onUseYaml(composeResult.yaml)}
						>
							<IconCheck size={14} className='mr-1' />
							Use this YAML
						</Button>
					</div>
					<textarea
						readOnly
						value={composeResult.yaml}
						className='w-full rounded-lg border border-border-default bg-neutral-950 px-4 py-3 text-white focus:outline-none'
						style={{
							fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
							fontSize: '12px',
							minHeight: '300px',
							lineHeight: '1.5',
							resize: 'vertical',
							tabSize: 2,
						}}
					/>
					{composeResult.warnings && composeResult.warnings.length > 0 && (
						<div className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 space-y-0.5'>
							{composeResult.warnings.map((w, i) => (
								<div key={i}>· {w}</div>
							))}
						</div>
					)}
				</div>
			)}

			{composeResult && !composeResult.yaml && (
				<div className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600'>
					Kimi did not return a compose YAML. Try rephrasing the prompt with more specific
					service names and ports.
				</div>
			)}
		</div>
	)
}
