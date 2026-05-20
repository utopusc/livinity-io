// Phase 175-03 — ProjectDetail view.
//
// Sections (top-to-bottom):
//   1. README.md preview (streamdown) — empty state when readme prop is null
//   2. CLAUDE.md preview (streamdown inside collapsed <details>) — when claudeMd prop set
//   3. Tasks checklist (prop-driven; click emits onTaskToggle(id, nextDone))
//   4. Children list (per-type lucide icon mirrored from ItemTreeRow.tsx
//      so the test selector `.lucide-folder-kanban` etc. matches)
//   5. Recent sessions (placeholder — will plumb in Phase 177)
//
// NOTE on prop name `childItems` (not `children`) — React's `children` prop
// is reserved for JSX children passed between tags. Using `childItems` here
// keeps the API explicit and avoids React's special-cased prop semantics.

import {Bot, FolderKanban, MessageSquare} from 'lucide-react'
import {Streamdown} from 'streamdown'

export interface Task {
	id: string
	title: string
	done: boolean
}

interface ChildSummary {
	id: string
	type: 'project' | 'agent' | 'chat'
	name: string
}

export interface ProjectDetailProps {
	item: {name: string; id?: string}
	readme?: string | null
	claudeMd?: string | null
	tasks?: readonly Task[]
	childItems?: readonly ChildSummary[]
	onTaskToggle?: (taskId: string, nextDone: boolean) => void
}

function ChildRow({child}: {child: ChildSummary}) {
	if (child.type === 'project') {
		return (
			<div className='flex items-center gap-2 px-2 py-1 text-sm font-semibold'>
				<FolderKanban size={16} className='lucide-folder-kanban text-accent-amber' />
				<span className='truncate'>{child.name}</span>
			</div>
		)
	}
	if (child.type === 'agent') {
		return (
			<div className='flex items-center gap-2 px-2 py-1 text-sm font-medium'>
				<Bot size={16} className='lucide-bot text-accent-blue' />
				<span className='truncate'>{child.name}</span>
			</div>
		)
	}
	return (
		<div className='flex items-center gap-2 px-2 py-1 text-sm text-text-secondary'>
			<MessageSquare size={16} className='lucide-message-square text-text-secondary' />
			<span className='truncate'>{child.name}</span>
		</div>
	)
}

export function ProjectDetail({
	item,
	readme,
	claudeMd,
	tasks,
	childItems,
	onTaskToggle,
}: ProjectDetailProps) {
	return (
		<div className='flex h-full flex-col gap-4 overflow-y-auto p-4'>
			<h2 className='text-lg font-semibold'>{item.name}</h2>

			<section>
				<h3 className='mb-2 text-sm font-semibold text-text-secondary'>README</h3>
				{readme == null ? (
					<p data-testid='readme-empty' className='text-xs text-text-secondary'>
						No README.md yet — Liv can create one on request.
					</p>
				) : (
					<div data-testid='readme-content' className='prose prose-sm max-w-none'>
						<Streamdown>{readme}</Streamdown>
					</div>
				)}
			</section>

			{claudeMd != null && (
				<section>
					<details data-testid='claude-md-details'>
						<summary className='cursor-pointer text-sm font-semibold text-text-secondary'>
							CLAUDE.md
						</summary>
						<div className='prose prose-sm mt-2 max-w-none'>
							<Streamdown>{claudeMd}</Streamdown>
						</div>
					</details>
				</section>
			)}

			{tasks && tasks.length > 0 && (
				<section>
					<h3 className='mb-2 text-sm font-semibold text-text-secondary'>Tasks</h3>
					<ul className='flex flex-col gap-1'>
						{tasks.map((t) => (
							<li
								key={t.id}
								data-testid={`task-row-${t.id}`}
								className='flex items-center gap-2'
							>
								<input
									type='checkbox'
									checked={t.done}
									onChange={(e) => onTaskToggle?.(t.id, e.target.checked)}
								/>
								<span className={t.done ? 'text-text-secondary line-through' : ''}>
									{t.title}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{childItems && childItems.length > 0 && (
				<section data-testid='children-list'>
					<h3 className='mb-2 text-sm font-semibold text-text-secondary'>Children</h3>
					<div className='flex flex-col'>
						{childItems.map((c) => (
							<ChildRow key={c.id} child={c} />
						))}
					</div>
				</section>
			)}

			<section>
				<h3 className='mb-2 text-sm font-semibold text-text-secondary'>Recent sessions</h3>
				<p className='text-xs text-text-secondary'>
					No recent CC PTY sessions for this project yet.
				</p>
			</section>
		</div>
	)
}
