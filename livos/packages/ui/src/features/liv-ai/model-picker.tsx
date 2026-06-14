// Phase 199-04 — LivAiModelPicker (frontend).
//
// Standalone shadcn DropdownMenu over the LIV_AI_MODELS registry. Pure UI:
// `value` + `onChange` are props; this component does NOT read/write Redis
// directly. Plan 199-07 will mount it into the header bar and wire onChange
// to `mastra.agent.setActiveModel.useMutation()` + hydrate value from
// `mastra.agent.getActiveModel.useQuery()`.
//
// Keyboard navigation is delegated to Radix DropdownMenu (WAI-ARIA combobox
// pattern — Tab focuses trigger, Enter/Space opens, Arrow keys navigate,
// Enter selects, Escape closes). No custom focus handling needed.

import {Check, ChevronDown} from 'lucide-react'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'

import {AgentLogo} from './agent-logos'
import {LIV_AI_MODELS, type LivAiModelId} from './models'

export interface LivAiModelPickerProps {
	value: LivAiModelId
	onChange: (next: LivAiModelId) => void
}

export function LivAiModelPicker({value, onChange}: LivAiModelPickerProps) {
	const current = LIV_AI_MODELS.find((m) => m.id === value) ?? LIV_AI_MODELS[0]

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className='flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
				aria-label='Select model'
				data-testid='liv-ai-model-picker-trigger'
			>
				{/*
				 * Phase 267-04 — render each row icon through <AgentLogo> keyed by
				 * the model/agent id. Branded CLI agents (claude/gemini/cursor/…)
				 * resolve to their real brand SVG from AGENT_LOGOS; the 3 Grok
				 * MODELS are NOT in the brand map, so `fallbackIcon` keeps their
				 * existing lucide glyph (those are xAI models, not CLI agents).
				 */}
				<AgentLogo
					name={current.id}
					size={14}
					className='size-3.5'
					fallbackIcon={current.Icon}
				/>
				<span>{current.name}</span>
				<ChevronDown className='size-3.5 opacity-50' />
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-64'>
				{LIV_AI_MODELS.map((m) => {
					const selected = m.id === value
					return (
						<DropdownMenuItem
							key={m.id}
							onSelect={() => onChange(m.id)}
							data-testid={`liv-ai-model-picker-item-${m.id}`}
							className='flex items-start gap-2'
						>
							{selected ? (
								<Check className='mt-0.5 size-4 shrink-0' />
							) : (
								<AgentLogo
									name={m.id}
									size={16}
									className='mt-0.5 size-4 shrink-0 opacity-50'
									fallbackIcon={m.Icon}
								/>
							)}
							<div className='flex flex-col'>
								<span className='text-sm font-medium'>{m.name}</span>
								<span className='text-xs text-muted-foreground'>
									{m.description}
								</span>
							</div>
						</DropdownMenuItem>
					)
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export default LivAiModelPicker
