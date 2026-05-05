// Phase 85 (UI slice) — Agent Builder Beta placeholder.
//
// Right-pane "Agent Builder Beta" tab content. v32 spec includes a
// conversational agent builder modeled after Suna's chat-driven workflow,
// but it is out of scope for this UI slice (it depends on P81/P82 chat
// surface). For v32 P85-UI we ship this clearly-labeled placeholder so the
// tab structure is in place.
//
// Decorative wireframe uses pure CSS shapes (no images, no extra deps).

import {IconSparkles} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

export function AgentBuilderBeta() {
	return (
		<div
			className={cn(
				'flex h-full flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-liv-border bg-liv-card p-8 text-center',
			)}
			data-testid='agent-builder-beta'
		>
			<div className='flex h-12 w-12 items-center justify-center rounded-full bg-liv-secondary/10 text-liv-secondary'>
				<IconSparkles size={24} />
			</div>

			<div className='space-y-1'>
				<h3 className='text-lg font-semibold text-liv-card-foreground'>
					Agent Builder Beta
				</h3>
				<p className='max-w-sm text-sm text-liv-muted-foreground'>
					Coming soon — describe what you want and we&apos;ll wire up the prompt,
					tools, and MCPs for you. For now, use the Manual tab to edit your agent.
				</p>
			</div>

			{/* Decorative chat-bubble wireframe — pure divs, no interactions */}
			<div
				className='flex w-full max-w-sm flex-col gap-3 opacity-40'
				aria-hidden='true'
			>
				<div className='self-start rounded-2xl rounded-bl-sm bg-liv-muted px-4 py-2'>
					<div className='h-2 w-32 rounded-full bg-liv-muted-foreground/30' />
				</div>
				<div className='self-end rounded-2xl rounded-br-sm bg-liv-secondary/20 px-4 py-2'>
					<div className='h-2 w-40 rounded-full bg-liv-muted-foreground/30' />
					<div className='mt-1 h-2 w-24 rounded-full bg-liv-muted-foreground/30' />
				</div>
				<div className='self-start rounded-2xl rounded-bl-sm bg-liv-muted px-4 py-2'>
					<div className='h-2 w-28 rounded-full bg-liv-muted-foreground/30' />
				</div>
			</div>
		</div>
	)
}
