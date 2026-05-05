// Phase 85 (UI slice) — /agents/:id editor route.
//
// Two-pane layout:
//   - Left (40%): live preview AgentCard (large size) + system prompt excerpt
//   - Right (60%): Tabs ["Manual", "Agent Builder Beta"]
//                  Manual = full edit form with 500ms debounced autosave
//                  Beta   = placeholder card
//
// Top bar: Back to /agents · agent name · save-status pill ·
//          Publish/Unpublish toggle · Delete (with confirm)
//
// Autosave: each field's onChange updates local state. The
// useDebouncedAutosave hook fires agents.update once the form has been
// stable for 500 ms. The save-status pill cycles: idle → saving → saved
// (2 s, then back to idle) → error.
//
// Read-only mode: when the agent is a system seed (userId === null) or a
// public agent owned by another user, the form fields are disabled and a
// banner explains "This is a system agent. Clone it to your library to
// customize." (clone CTA wired via agents.clone).

import {useCallback, useEffect, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {
	IconArrowLeft,
	IconCheck,
	IconCircle,
	IconCircleCheck,
	IconCopy,
	IconLoader2,
	IconTrash,
	IconUpload,
	IconUsers,
} from '@tabler/icons-react'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/shadcn-components/ui/alert-dialog'
import {useCurrentUser} from '@/hooks/use-current-user'
import {cn} from '@/shadcn-lib/utils'

import {AgentCard} from './agent-card'
import {AgentBuilderBeta} from './agent-builder-beta'
import {
	useAgent,
	useCloneAgent,
	useDeleteAgent,
	usePublishAgent,
	useUnpublishAgent,
	useUpdateAgent,
	type Agent,
	type SaveStatus,
} from './agents-api'
import {useDebouncedAutosave} from './use-debounced-autosave'
// Phase 84 V32-MCP — MCPConfigurationNew section. Mounted in the Manual
// tab below the existing form. Reads `configuredMcps` from the loaded
// agent; install/remove mutations invalidate the agent.get cache so the
// preview re-renders. Read-only mode (system seed / non-owned public)
// is wired via the `disabled` prop.
import {MCPConfigurationNew} from '@/components/mcp/MCPConfigurationNew'
import type {ConfiguredMcp} from '@/components/mcp/types'

const MODEL_TIERS = ['haiku', 'sonnet', 'opus'] as const
type ModelTier = (typeof MODEL_TIERS)[number]

// Editable subset of the Agent shape — everything the Manual tab can patch.
type EditableForm = {
	name: string
	description: string
	systemPrompt: string
	modelTier: ModelTier
	avatar: string
	avatarColor: string
}

const DEFAULT_COLOR = '#6366f1'

function agentToForm(agent: Agent): EditableForm {
	return {
		name: agent.name,
		description: agent.description ?? '',
		systemPrompt: agent.systemPrompt ?? '',
		modelTier: agent.modelTier,
		avatar: agent.avatar ?? '🤖',
		avatarColor: agent.avatarColor ?? DEFAULT_COLOR,
	}
}

export default function AgentEditorRoute() {
	const {id} = useParams<{id: string}>()
	const navigate = useNavigate()
	const currentUser = useCurrentUser()

	const agentQuery = useAgent(id)
	const updateMutation = useUpdateAgent()
	const deleteMutation = useDeleteAgent()
	const publishMutation = usePublishAgent()
	const unpublishMutation = useUnpublishAgent()
	const cloneMutation = useCloneAgent()

	const [form, setForm] = useState<EditableForm | null>(null)
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

	// Hydrate the form once the agent loads. We DO NOT re-hydrate on every
	// agent re-fetch — that would clobber in-flight edits. The form is
	// re-seeded only when the agentId changes (via the dep on agentQuery.data?.id).
	useEffect(() => {
		if (agentQuery.data && form === null) {
			setForm(agentToForm(agentQuery.data))
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [agentQuery.data?.id])

	const agent = agentQuery.data
	const isOwner = Boolean(agent && currentUser.userId && agent.userId === currentUser.userId)
	const isSystemSeed = Boolean(agent && agent.userId === null)
	const isReadOnly = !isOwner

	// Stable autosave callback — useCallback so identity is consistent
	// across re-renders (the debounce hook does not depend on it for
	// timing, but stable identity makes the React DevTools cleaner).
	const handleAutosave = useCallback(
		(snapshot: EditableForm) => {
			if (!agent || !isOwner) return
			setSaveStatus('saving')
			updateMutation.mutate(
				{
					agentId: agent.id,
					partial: {
						name: snapshot.name.trim() || 'Untitled',
						description: snapshot.description,
						systemPrompt: snapshot.systemPrompt,
						modelTier: snapshot.modelTier,
						avatar: snapshot.avatar || null,
						avatarColor: snapshot.avatarColor || null,
					},
				},
				{
					onSuccess: () => {
						setSaveStatus('saved')
						// Auto-clear the "saved" pill after 2s — Suna timing.
						window.setTimeout(() => {
							setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev))
						}, 2000)
					},
					onError: (err) => {
						setSaveStatus('error')
						toast.error(`Save failed: ${err.message}`)
					},
				},
			)
		},
		[agent, isOwner, updateMutation],
	)

	useDebouncedAutosave(form, (snapshot) => snapshot && handleAutosave(snapshot), {
		enabled: form !== null && isOwner,
	})

	// ─── Loading / error states ───────────────────────────────────────

	if (agentQuery.isLoading || form === null) {
		return (
			<div className='flex min-h-screen items-center justify-center bg-liv-background'>
				<IconLoader2 className='animate-spin text-liv-muted-foreground' size={32} />
			</div>
		)
	}

	if (agentQuery.error || !agent) {
		return (
			<div className='flex min-h-screen flex-col items-center justify-center gap-3 bg-liv-background text-center'>
				<p className='text-lg font-semibold text-liv-foreground'>Agent not found</p>
				<p className='max-w-md text-sm text-liv-muted-foreground'>
					{agentQuery.error?.message ?? 'This agent does not exist or you do not have access.'}
				</p>
				<Button variant='default' onClick={() => navigate('/agents')}>
					<IconArrowLeft size={16} className='mr-1' />
					Back to agents
				</Button>
			</div>
		)
	}

	// ─── Handlers ─────────────────────────────────────────────────────

	const handleDelete = () => {
		deleteMutation.mutate(
			{agentId: agent.id},
			{
				onSuccess: ({deleted}) => {
					if (deleted) {
						toast.success('Agent deleted')
						navigate('/agents')
					} else {
						toast.error('Agent not found or already deleted')
					}
				},
				onError: (err) => toast.error(`Delete failed: ${err.message}`),
			},
		)
	}

	const handlePublishToggle = () => {
		const mutation = agent.isPublic ? unpublishMutation : publishMutation
		mutation.mutate(
			{agentId: agent.id},
			{
				onSuccess: () => {
					toast.success(agent.isPublic ? 'Agent unpublished' : 'Agent published to marketplace')
				},
				onError: (err) => toast.error(`Publish toggle failed: ${err.message}`),
			},
		)
	}

	const handleClone = () => {
		cloneMutation.mutate(
			{sourceAgentId: agent.id},
			{
				onSuccess: (cloned) => {
					toast.success('Cloned to your library')
					navigate(`/agents/${cloned.id}`)
				},
				onError: (err) => toast.error(`Clone failed: ${err.message}`),
			},
		)
	}

	// Build a "preview" Agent that reflects in-flight form edits without
	// waiting for the server round trip. Falls back to server values for
	// fields we don't expose (isPublic, isDefault, etc).
	const previewAgent: Agent = {
		...agent,
		name: form.name || 'Untitled',
		description: form.description,
		systemPrompt: form.systemPrompt,
		modelTier: form.modelTier,
		avatar: form.avatar || null,
		avatarColor: form.avatarColor || null,
	}

	return (
		<div className='min-h-screen bg-liv-background text-liv-foreground'>
			<div className='container mx-auto max-w-7xl px-4 py-6'>
				{/* Top bar */}
				<div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => navigate('/agents')}
							data-testid='agent-editor-back'
						>
							<IconArrowLeft size={16} className='mr-1' />
							Back
						</Button>
						<h1 className='truncate text-xl font-semibold'>{previewAgent.name}</h1>
						<SaveStatusPill status={saveStatus} />
					</div>
					<div className='flex flex-wrap items-center gap-2'>
						{isSystemSeed && (
							<span className='inline-flex items-center gap-1 rounded-full bg-liv-secondary/10 px-3 py-1 text-xs font-medium text-liv-secondary'>
								<IconUsers size={12} /> System agent
							</span>
						)}
						{isReadOnly ? (
							<Button
								onClick={handleClone}
								disabled={cloneMutation.isPending}
								data-testid='agent-editor-clone'
							>
								{cloneMutation.isPending ? (
									<IconLoader2 size={16} className='mr-1 animate-spin' />
								) : (
									<IconCopy size={16} className='mr-1' />
								)}
								Clone to my library
							</Button>
						) : (
							<>
								<Button
									variant={agent.isPublic ? 'ghost' : 'default'}
									onClick={handlePublishToggle}
									disabled={publishMutation.isPending || unpublishMutation.isPending}
									data-testid='agent-editor-publish'
								>
									<IconUpload size={16} className='mr-1' />
									{agent.isPublic ? 'Unpublish' : 'Publish'}
								</Button>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											variant='default'
											className='text-liv-destructive hover:text-liv-destructive'
											data-testid='agent-editor-delete'
										>
											<IconTrash size={16} className='mr-1' />
											Delete
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete &quot;{agent.name}&quot;?</AlertDialogTitle>
											<AlertDialogDescription>
												This will permanently delete the agent. Any chat sessions
												using it will fall back to the default agent. This action
												cannot be undone.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												onClick={handleDelete}
												className='bg-liv-destructive text-liv-destructive-foreground hover:bg-liv-destructive/90'
											>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</>
						)}
					</div>
				</div>

				{/* Read-only banner for non-owned agents */}
				{isReadOnly && (
					<div
						className='mb-6 rounded-2xl border border-liv-border bg-liv-muted px-4 py-3 text-sm text-liv-muted-foreground'
						data-testid='agent-editor-readonly-banner'
					>
						{isSystemSeed
							? 'This is a system agent. Clone it to your library to customize.'
							: 'This agent belongs to another user. Clone it to your library to customize.'}
					</div>
				)}

				{/* Two-pane layout: preview | editor */}
				<div className='grid grid-cols-1 gap-6 lg:grid-cols-[40%_60%]'>
					{/* Preview pane */}
					<div className='flex flex-col gap-4'>
						<AgentCard agent={previewAgent} size='large' />
						{previewAgent.systemPrompt && (
							<div className='rounded-2xl border border-liv-border bg-liv-card p-4'>
								<p className='mb-2 text-xs font-semibold uppercase tracking-wide text-liv-muted-foreground'>
									System prompt preview
								</p>
								<p className='line-clamp-6 whitespace-pre-wrap text-sm text-liv-card-foreground'>
									{previewAgent.systemPrompt}
								</p>
							</div>
						)}
					</div>

					{/* Editor pane */}
					<Tabs defaultValue='manual' className='flex h-full flex-col'>
						<TabsList className='grid w-full grid-cols-2'>
							<TabsTrigger value='manual'>Manual</TabsTrigger>
							<TabsTrigger value='beta'>Agent Builder Beta</TabsTrigger>
						</TabsList>

						<TabsContent value='manual' className='mt-4 space-y-4'>
							<ManualForm
								form={form}
								onChange={(patch) => setForm((prev) => (prev ? {...prev, ...patch} : prev))}
								disabled={isReadOnly}
							/>

							{/* Phase 84 — MCP Single Source of Truth section. Reads
							    `configuredMcps` from the live agent (NOT the in-flight
							    form snapshot — MCPs are managed via dedicated install/
							    remove mutations, not the autosave path). Read-only mode
							    propagates via `disabled` so system seeds + non-owned
							    public agents render the list (visible) but lock the
							    install/remove affordances. */}
							<MCPConfigurationNew
								agentId={agent.id}
								configuredMcps={(agent.configuredMcps ?? []) as ConfiguredMcp[]}
								disabled={isReadOnly}
							/>
						</TabsContent>

						<TabsContent value='beta' className='mt-4'>
							<AgentBuilderBeta />
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	)
}

// ─── ManualForm ────────────────────────────────────────────────────────

function ManualForm({
	form,
	onChange,
	disabled,
}: {
	form: EditableForm
	onChange: (patch: Partial<EditableForm>) => void
	disabled: boolean
}) {
	return (
		<div className='space-y-5 rounded-2xl border border-liv-border bg-liv-card p-6'>
			<Field id='name' label='Name'>
				<Input
					id='name'
					value={form.name}
					onChange={(e) => onChange({name: e.target.value})}
					disabled={disabled}
					maxLength={100}
					data-testid='agent-editor-name'
				/>
			</Field>

			<Field id='description' label='Description'>
				<textarea
					id='description'
					value={form.description}
					onChange={(e) => onChange({description: e.target.value})}
					disabled={disabled}
					rows={2}
					maxLength={1000}
					className='w-full resize-none rounded-md border border-liv-input bg-liv-background px-3 py-2 text-sm text-liv-foreground outline-none focus:border-liv-ring disabled:opacity-50'
					data-testid='agent-editor-description'
				/>
			</Field>

			<Field id='systemPrompt' label='System prompt'>
				<textarea
					id='systemPrompt'
					value={form.systemPrompt}
					onChange={(e) => onChange({systemPrompt: e.target.value})}
					disabled={disabled}
					rows={10}
					maxLength={32_000}
					className='w-full resize-y rounded-md border border-liv-input bg-liv-background px-3 py-2 font-mono text-sm text-liv-foreground outline-none focus:border-liv-ring disabled:opacity-50'
					data-testid='agent-editor-system-prompt'
				/>
			</Field>

			<Field id='modelTier' label='Model tier'>
				<RadioGroup
					value={form.modelTier}
					onValueChange={(v) => onChange({modelTier: v as ModelTier})}
					disabled={disabled}
					className='flex flex-wrap gap-3'
					data-testid='agent-editor-model-tier'
				>
					{MODEL_TIERS.map((tier) => (
						<label
							key={tier}
							className={cn(
								'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm capitalize transition-colors',
								form.modelTier === tier
									? 'border-liv-ring bg-liv-secondary/10 text-liv-foreground'
									: 'border-liv-border bg-liv-background text-liv-muted-foreground hover:border-liv-ring/50',
								disabled && 'cursor-not-allowed opacity-50',
							)}
						>
							<RadioGroupItem value={tier} id={`tier-${tier}`} />
							<span>{tier}</span>
						</label>
					))}
				</RadioGroup>
			</Field>

			<div className='grid grid-cols-2 gap-4'>
				<Field id='avatar' label='Avatar emoji'>
					<Input
						id='avatar'
						value={form.avatar}
						onChange={(e) => onChange({avatar: e.target.value})}
						disabled={disabled}
						maxLength={8}
						placeholder='🤖'
						data-testid='agent-editor-avatar'
					/>
				</Field>

				<Field id='avatarColor' label='Avatar color'>
					<div className='flex items-center gap-2'>
						<input
							id='avatarColor'
							type='color'
							value={form.avatarColor || DEFAULT_COLOR}
							onChange={(e) => onChange({avatarColor: e.target.value})}
							disabled={disabled}
							className='h-9 w-12 cursor-pointer rounded-md border border-liv-border bg-transparent disabled:cursor-not-allowed disabled:opacity-50'
							data-testid='agent-editor-avatar-color'
						/>
						<Input
							value={form.avatarColor}
							onChange={(e) => onChange({avatarColor: e.target.value})}
							disabled={disabled}
							maxLength={32}
							className='flex-1 font-mono text-xs'
						/>
					</div>
				</Field>
			</div>
		</div>
	)
}

function Field({id, label, children}: {id: string; label: string; children: React.ReactNode}) {
	return (
		<div className='space-y-1.5'>
			<Label htmlFor={id} className='text-xs font-semibold uppercase tracking-wide text-liv-muted-foreground'>
				{label}
			</Label>
			{children}
		</div>
	)
}

// ─── SaveStatusPill ────────────────────────────────────────────────────

function SaveStatusPill({status}: {status: SaveStatus}) {
	if (status === 'idle') {
		return (
			<span className='inline-flex items-center gap-1 text-xs text-liv-muted-foreground'>
				<IconCircle size={10} />
				Saved
			</span>
		)
	}
	if (status === 'saving') {
		return (
			<span className='inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400'>
				<IconLoader2 size={10} className='animate-spin' />
				Saving…
			</span>
		)
	}
	if (status === 'saved') {
		return (
			<span className='inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400'>
				<IconCircleCheck size={10} />
				Saved
			</span>
		)
	}
	return (
		<span className='inline-flex items-center gap-1 rounded-full bg-liv-destructive/10 px-2 py-1 text-xs font-medium text-liv-destructive'>
			<IconCheck size={10} />
			Save failed
		</span>
	)
}
