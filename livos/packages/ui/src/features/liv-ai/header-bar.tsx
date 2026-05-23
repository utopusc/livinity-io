// Phase 199-07 — LivAiHeaderBar.
//
// Pure-presentational header chrome that sits ABOVE the 2-column layout in
// <Assistant />. Three responsibilities:
//   1. Render the brand string 'Liv AI' on the left (D-199-02 / INV-199-02).
//   2. Mount the Phase 199-04 <LivAiModelPicker /> on the right with the
//      caller-controlled value/onChange (D-199-20 / D-199-21).
//   3. Render a '+ New conversation' button that fires the caller's
//      onNewThread callback (D-199-21).
//
// Stateless: all data flow is props-down. Plan 199-07 Task 3 wires
// `value`/`onModelChange` to tRPC and `onNewThread` to the existing
// useThreadListAdapter().onSwitchToNewThread handler.

import {PlusIcon} from 'lucide-react'

import {Button} from '@/shadcn-components/ui/button'

import {LivAiModelPicker} from './model-picker'
import type {LivAiModelId} from './models'

export interface LivAiHeaderBarProps {
	selectedModel: LivAiModelId
	onModelChange: (next: LivAiModelId) => void
	onNewThread: () => void
}

export function LivAiHeaderBar({
	selectedModel,
	onModelChange,
	onNewThread,
}: LivAiHeaderBarProps) {
	return (
		<header
			className='flex h-12 items-center justify-between border-b bg-background px-4'
			data-testid='liv-ai-header-bar'
		>
			<h1
				className='text-base font-medium'
				data-testid='liv-ai-header-title'
			>
				Liv AI
			</h1>
			<div className='flex items-center gap-2'>
				<LivAiModelPicker value={selectedModel} onChange={onModelChange} />
				<Button
					variant='ghost'
					size='sm'
					onClick={onNewThread}
					className='gap-1.5'
					data-testid='liv-ai-header-new-thread'
				>
					<PlusIcon className='size-4' />
					New conversation
				</Button>
			</div>
		</header>
	)
}

export default LivAiHeaderBar
