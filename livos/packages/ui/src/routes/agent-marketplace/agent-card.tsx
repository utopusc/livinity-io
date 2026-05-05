// Phase 76 Plan 76-04 — AgentCard component (GREEN).
//
// One card in the agent-marketplace grid. Renders a single agent template
// with mascot emoji + name + clone count + 2-line-clamped description +
// tag chips + the "Add to Library" clone button. Stateless: receives
// `template`, `onClone`, and `isCloning` as props from the parent route
// which owns the trpc query/mutation lifecycle.
//
// Design system invariants (76-04 must_haves):
//   - <Card variant="liv-elevated"> — P66-03 shadcn variant (D-09).
//   - <Button variant="liv-primary"> — P66-03 cyan-accent button.
//   - <Badge> default variant — neutral chip per tag.
//   - <IconLoader2 className='animate-spin'> — P66 unified icon language.
//   - line-clamp-2 on the description paragraph (76-04 must_have).
//
// Type strategy (D-NO-NEW-DEPS): re-derive AgentTemplate locally from the
// repo shape rather than coupling the UI package to the livinityd
// internal repo types. Field names mirror `agent-templates-repo.ts`
// rowToTemplate() output verbatim. createdAt accepts string|Date because
// no superjson transformer is installed (Date round-trips as ISO string
// over wire) — verified via grep for "transformer" returning nothing in
// livinityd/source.

import {IconLoader2} from '@tabler/icons-react'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Card} from '@/components/ui/card'
import {cn} from '@/shadcn-lib/utils'

export type AgentTemplate = {
	slug: string
	name: string
	description: string
	systemPrompt: string
	toolsEnabled: string[]
	tags: string[]
	mascotEmoji: string
	cloneCount: number
	createdAt: string | Date
}

export type AgentCardProps = {
	template: AgentTemplate
	onClone: (slug: string) => void
	isCloning: boolean
}

export function AgentCard({template, onClone, isCloning}: AgentCardProps) {
	return (
		<Card variant='liv-elevated' className={cn('flex h-full flex-col p-6')}>
			<div className='flex items-start gap-3'>
				<span
					className='shrink-0 text-4xl leading-none'
					aria-label={`${template.name} mascot`}
					data-testid='agent-card-mascot'
				>
					{template.mascotEmoji}
				</span>
				<div className='min-w-0 flex-1'>
					<h3
						className='truncate text-h3 font-semibold text-text-primary'
						data-testid='agent-card-name'
					>
						{template.name}
					</h3>
					<p className='mt-0.5 text-caption text-text-secondary'>
						{template.cloneCount} {template.cloneCount === 1 ? 'clone' : 'clones'}
					</p>
				</div>
			</div>

			<p
				className='mt-3 flex-1 text-body text-text-secondary line-clamp-2'
				data-testid='agent-card-description'
			>
				{template.description}
			</p>

			<div className='mt-4 flex flex-wrap gap-1.5' data-testid='agent-card-tags'>
				{template.tags.map((tag) => (
					<Badge key={tag} className='text-caption' data-testid='agent-card-tag'>
						{tag}
					</Badge>
				))}
			</div>

			<Button
				variant='liv-primary'
				onClick={() => onClone(template.slug)}
				disabled={isCloning}
				className='mt-4 w-full'
				data-testid='agent-card-clone-button'
				aria-label={isCloning ? `Cloning ${template.name}` : `Add ${template.name} to library`}
			>
				{isCloning ? (
					<>
						<IconLoader2 size={16} className='animate-spin' />
						Cloning…
					</>
				) : (
					'Add to Library'
				)}
			</Button>
		</Card>
	)
}
