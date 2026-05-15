// Phase 96-05 — WebAppSkillsSidebar.
//
// Right-edge collapsible panel inside WebAppStreamWindow listing the
// current user's saved Teach-mode skills for this WebApp. Default-open,
// 280px wide. Tapping a row hands the skillId to the parent
// (WebAppStreamWindow → SkillReplayScrubber overlay).
//
// Shape per PLAN 96-05:
//   - Fetches via webapp.skills.list({webappId}) (HTTP-only path).
//   - Stale-while-revalidate via tRPC's default 30s staleTime.
//   - Live update: parent invalidates the query after 96-04's create
//     mutation, so a freshly-saved skill appears within ~1s.
//   - Each row: bold name, "N actions • created <relative-time>", trash
//     icon → confirm popover → webapp.skills.delete.
//   - Empty state copy: "No saved skills yet. Switch to Teach mode to
//     record one." (no spinner)
//
// Visual: piggybacks on the existing v32 panel chrome — surface-1
// background, border-default left edge, tight typography. Mirrors the
// agent-panel sidebar conventions (see ai-chat/agents-panel.tsx).

import {useState} from 'react'
import {formatDistanceToNow} from 'date-fns'
import {ChevronRight, Trash2} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'

export interface WebAppSkillsSidebarProps {
	webappId: string
	onSelectSkill: (skillId: string) => void
	collapsed?: boolean
	onToggleCollapsed?: (next: boolean) => void
	className?: string
}

const PANEL_WIDTH_PX = 280

export function WebAppSkillsSidebar({
	webappId,
	onSelectSkill,
	collapsed = false,
	onToggleCollapsed,
	className,
}: WebAppSkillsSidebarProps) {
	const utils = trpcReact.useUtils()
	const listQuery = trpcReact.webapp.skills.list.useQuery(
		{webappId},
		{
			enabled: !!webappId && /^[0-9a-f-]{36}$/i.test(webappId),
			staleTime: 30_000,
		},
	)
	const deleteMutation = trpcReact.webapp.skills.delete.useMutation({
		onSuccess: () => {
			void utils.webapp.skills.list.invalidate({webappId})
		},
	})

	const [pendingDelete, setPendingDelete] = useState<{id: string; name: string} | null>(null)

	const skills = listQuery.data ?? []

	if (collapsed) {
		return (
			<div
				className={cn(
					'flex h-full w-9 flex-col items-center gap-2 border-l border-border-default bg-surface-1 py-2',
					className,
				)}
			>
				<button
					type='button'
					onClick={() => onToggleCollapsed?.(false)}
					title='Show skills'
					className='inline-flex h-7 w-7 items-center justify-center rounded-radius-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary'
				>
					<ChevronRight className='h-4 w-4 rotate-180' />
				</button>
			</div>
		)
	}

	return (
		<div
			className={cn(
				'flex h-full flex-col border-l border-border-default bg-surface-1',
				className,
			)}
			style={{width: PANEL_WIDTH_PX}}
			data-testid='webapp-skills-sidebar'
		>
			<div className='flex h-9 items-center justify-between gap-2 border-b border-border-default px-3'>
				<div className='text-caption-sm font-medium text-text-primary'>Skills</div>
				<button
					type='button'
					onClick={() => onToggleCollapsed?.(true)}
					title='Hide skills'
					className='inline-flex h-6 w-6 items-center justify-center rounded-radius-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary'
				>
					<ChevronRight className='h-4 w-4' />
				</button>
			</div>
			<div className='flex-1 overflow-y-auto px-2 py-2'>
				{listQuery.isError ? (
					<div className='px-2 py-3 text-caption-sm text-accent-red'>
						Failed to load skills.
					</div>
				) : skills.length === 0 ? (
					<div className='px-2 py-6 text-caption-sm text-text-tertiary'>
						No saved skills yet. Switch to Teach mode to record one.
					</div>
				) : (
					<ul className='flex flex-col gap-1'>
						{skills.map((s) => (
							<li key={s.id}>
								<div className='group flex items-start gap-2 rounded-radius-sm px-2 py-1.5 hover:bg-surface-2'>
									<button
										type='button'
										onClick={() => onSelectSkill(s.id)}
										className='flex-1 text-left'
									>
										<div className='truncate text-caption-sm font-medium text-text-primary'>
											{s.skillName}
										</div>
										<div className='truncate text-caption-xs text-text-tertiary'>
											{s.actionCount} action{s.actionCount === 1 ? '' : 's'}
											{' · created '}
											{formatDistanceToNow(s.createdAt, {addSuffix: true})}
										</div>
									</button>
									<button
										type='button'
										onClick={() => setPendingDelete({id: s.id, name: s.skillName})}
										title='Delete skill'
										className='inline-flex h-6 w-6 items-center justify-center rounded-radius-xs text-text-tertiary opacity-0 transition-opacity hover:bg-accent-red/10 hover:text-accent-red group-hover:opacity-100'
									>
										<Trash2 className='h-3.5 w-3.5' />
									</button>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(o) => {
					if (!o) setPendingDelete(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete skill?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete
								? `Delete "${pendingDelete.name}" and all its captured screenshots? This cannot be undone.`
								: ''}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setPendingDelete(null)}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDelete) {
									deleteMutation.mutate({skillId: pendingDelete.id})
								}
								setPendingDelete(null)
							}}
							className='bg-accent-red text-white hover:bg-accent-red/90'
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
