// Phase 22 MH-03 — Settings > Environments management UI.
//
// Renders:
//   (a) Environment list table — Name | Type | Connection | Status | Created
//       | Actions (Edit / Remove). The auto-seeded 'local' row has Edit and
//       Remove disabled (with tooltip 'Built-in environment').
//   (b) Add Environment dialog — type selector switches between socket /
//       tcp-tls / agent forms with the appropriate fields. tcp-tls captures
//       host + port + 3 PEM blobs.
//   (c) Generate Agent Token dialog — opened automatically after creating
//       an agent-type env. Shows the 64-char token once with a Copy button
//       and a 'will not be shown again' warning. The mutation is stubbed in
//       Plan 22-02 — Plan 22-03 ships the real backend.
//   (d) Edit dialog — same fields as Add (without type) pre-populated; PEM
//       textareas show 'leave blank to keep existing' placeholders.
//   (e) Remove dialog — confirmation requires the env name typed back, same
//       pattern as removeContainer / removeVolume.
//
// Mirrors the lazy-loaded scheduler-section pattern. Mutations route via
// HTTP per common.ts httpOnlyPaths (set up in Plan 22-01).

import {useEffect, useMemo, useState} from 'react'
import {
	TbAlertTriangle,
	TbCheck,
	TbCopy,
	TbEdit,
	TbLoader2,
	TbPlus,
	TbServerCog,
	TbTrash,
} from 'react-icons/tb'
import {toast} from 'sonner'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/shadcn-components/ui/radio-group'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'
import {
	useCreateEnvironment,
	useDeleteEnvironment,
	useEnvironments,
	useGenerateAgentToken,
	useUpdateEnvironment,
} from '@/hooks/use-environments'
import {LOCAL_ENV_ID} from '@/stores/environment-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnvironmentType = 'socket' | 'tcp-tls' | 'agent'

interface EnvironmentRow {
	id: string
	name: string
	type: EnvironmentType
	socketPath: string | null
	tcpHost: string | null
	tcpPort: number | null
	tlsCaPem: string | null
	tlsCertPem: string | null
	tlsKeyPem: string | null
	agentId: string | null
	agentStatus: 'online' | 'offline'
	lastSeen: Date | string | null
	createdBy: string | null
	createdAt: Date | string
}

const TYPE_LABELS: Record<EnvironmentType, string> = {
	socket: 'Unix socket',
	'tcp-tls': 'TCP / TLS',
	agent: 'Outbound agent',
}

// ---------------------------------------------------------------------------
// Status / connection display helpers
// ---------------------------------------------------------------------------

function StatusBadge({env}: {env: EnvironmentRow}) {
	if (env.type !== 'agent') {
		return (
			<span className='rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500'>
				Ready
			</span>
		)
	}
	const isOnline = env.agentStatus === 'online'
	return (
		<span
			className={cn(
				'rounded-full px-2 py-0.5 text-xs font-medium',
				isOnline ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500',
			)}
		>
			{isOnline ? 'Online' : 'Offline'}
		</span>
	)
}

function connectionString(env: EnvironmentRow): string {
	if (env.type === 'socket') return env.socketPath ?? '/var/run/docker.sock'
	if (env.type === 'tcp-tls') return `${env.tcpHost ?? '?'}:${env.tcpPort ?? '?'}`
	if (env.type === 'agent') return env.agentId ? `agent ${env.agentId.slice(0, 8)}…` : 'agent (pending)'
	return '—'
}

function formatDate(d: Date | string | null | undefined): string {
	if (!d) return '—'
	const date = typeof d === 'string' ? new Date(d) : d
	if (!date || isNaN(date.getTime())) return '—'
	return date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'})
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function EnvironmentsSection() {
	const envQ = useEnvironments()
	const environments = (envQ.data ?? []) as EnvironmentRow[]

	const [showAdd, setShowAdd] = useState(false)
	const [editTarget, setEditTarget] = useState<EnvironmentRow | null>(null)
	const [removeTarget, setRemoveTarget] = useState<EnvironmentRow | null>(null)
	// After creating an agent env, open the token-gen dialog for the new id.
	const [tokenForEnvId, setTokenForEnvId] = useState<string | null>(null)

	return (
		<TooltipProvider>
			<div className='space-y-4'>
				<div className='flex flex-wrap items-center justify-between gap-2'>
					<p className='text-body-sm text-text-secondary'>
						Manage Docker hosts that Livinity can control. Add a remote host via TLS or
						a Livinity agent. The built-in <strong>local</strong> environment cannot be
						modified — it always points at this server's Docker socket.
					</p>
					<Button
						variant='primary'
						size='sm'
						className='h-11'
						onClick={() => setShowAdd(true)}
					>
						<TbPlus className='h-4 w-4' />
						Add Environment
					</Button>
				</div>

				{envQ.isLoading ? (
					<div className='flex items-center justify-center py-12'>
						<TbLoader2 className='h-5 w-5 animate-spin text-text-tertiary' />
					</div>
				) : environments.length === 0 ? (
					<div className='rounded-radius-md border border-border-default bg-surface-base p-6 text-center'>
						<TbServerCog className='mx-auto h-8 w-8 text-text-tertiary' />
						<p className='mt-2 text-body-sm text-text-secondary'>No environments configured</p>
					</div>
				) : (
					<div className='space-y-2'>
						{environments.map((env) => (
							<EnvironmentCard
								key={env.id}
								env={env}
								onEdit={() => setEditTarget(env)}
								onRemove={() => setRemoveTarget(env)}
							/>
						))}
					</div>
				)}

				{/* Add */}
				<AddEnvironmentDialog
					open={showAdd}
					onOpenChange={setShowAdd}
					onCreated={(newId) => {
						setShowAdd(false)
						setTokenForEnvId(newId)
					}}
				/>

				{/* Edit */}
				<EditEnvironmentDialog
					env={editTarget}
					onClose={() => setEditTarget(null)}
				/>

				{/* Remove */}
				<RemoveEnvironmentDialog
					env={removeTarget}
					onClose={() => setRemoveTarget(null)}
				/>

				{/* Generate Agent Token (post-creation) */}
				<GenerateAgentTokenDialog
					environmentId={tokenForEnvId}
					environmentName={environments.find((e) => e.id === tokenForEnvId)?.name ?? null}
					onClose={() => setTokenForEnvId(null)}
				/>
			</div>
		</TooltipProvider>
	)
}

// ---------------------------------------------------------------------------
// Environment row card
// ---------------------------------------------------------------------------

function EnvironmentCard({
	env,
	onEdit,
	onRemove,
}: {
	env: EnvironmentRow
	onEdit: () => void
	onRemove: () => void
}) {
	const isLocal = env.id === LOCAL_ENV_ID

	const editButton = (
		<Button
			variant='secondary'
			size='sm'
			className='h-9'
			onClick={onEdit}
			disabled={isLocal}
		>
			<TbEdit className='h-4 w-4' />
		</Button>
	)
	const removeButton = (
		<Button
			variant='destructive'
			size='sm'
			className='h-9'
			onClick={onRemove}
			disabled={isLocal}
		>
			<TbTrash className='h-4 w-4' />
		</Button>
	)

	return (
		<div className='rounded-radius-md border border-border-default bg-surface-base p-4'>
			<div className='flex flex-wrap items-start gap-4'>
				<div className='min-w-0 flex-1'>
					<div className='flex flex-wrap items-center gap-2'>
						<span className='text-body-sm font-medium text-text-primary'>{env.name}</span>
						<span className='rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-tertiary'>
							{TYPE_LABELS[env.type]}
						</span>
						<StatusBadge env={env} />
						{isLocal && (
							<span className='rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400'>
								Built-in
							</span>
						)}
					</div>
					<div className='mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-tertiary'>
						<span>
							<span className='text-text-secondary'>Connection</span>:{' '}
							<code className='rounded bg-surface-2 px-1 font-mono text-[11px]'>
								{connectionString(env)}
							</code>
						</span>
						<span>
							<span className='text-text-secondary'>Created</span>: {formatDate(env.createdAt)}
						</span>
					</div>
				</div>
				<div className='flex shrink-0 items-center gap-2'>
					{isLocal ? (
						<>
							<Tooltip>
								<TooltipTrigger asChild>
									<span>{editButton}</span>
								</TooltipTrigger>
								<TooltipContent>Built-in environment cannot be modified</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<span>{removeButton}</span>
								</TooltipTrigger>
								<TooltipContent>Built-in environment cannot be removed</TooltipContent>
							</Tooltip>
						</>
					) : (
						<>
							{editButton}
							{removeButton}
						</>
					)}
				</div>
			</div>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Add Environment dialog
// ---------------------------------------------------------------------------

interface AddFormState {
	name: string
	type: EnvironmentType
	socketPath: string
	tcpHost: string
	tcpPort: string
	tlsCaPem: string
	tlsCertPem: string
	tlsKeyPem: string
}

function emptyAddForm(): AddFormState {
	return {
		name: '',
		type: 'tcp-tls',
		socketPath: '/var/run/docker.sock',
		tcpHost: '',
		tcpPort: '2376',
		tlsCaPem: '',
		tlsCertPem: '',
		tlsKeyPem: '',
	}
}

function AddEnvironmentDialog({
	open,
	onOpenChange,
	onCreated,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onCreated: (newId: string) => void
}) {
	const [form, setForm] = useState<AddFormState>(emptyAddForm)
	const create = useCreateEnvironment()
	const isSaving = create.isPending

	useEffect(() => {
		if (!open) setForm(emptyAddForm())
	}, [open])

	const onSave = async () => {
		if (!form.name.trim()) return toast.error('Name is required')
		if (form.type === 'socket') {
			if (!form.socketPath.trim()) return toast.error('Socket path is required')
		} else if (form.type === 'tcp-tls') {
			if (!form.tcpHost.trim()) return toast.error('Host is required')
			const port = parseInt(form.tcpPort, 10)
			if (!port || port < 1 || port > 65535) return toast.error('Port must be 1-65535')
			if (!form.tlsCaPem.trim()) return toast.error('CA PEM is required')
			if (!form.tlsCertPem.trim()) return toast.error('Cert PEM is required')
			if (!form.tlsKeyPem.trim()) return toast.error('Key PEM is required')
		}
		// agent: just need name; backend will accept on Plan 22-03 (in 22-02 it
		// throws because agentId is required server-side). The catch below
		// surfaces a friendly toast so the user knows to wait for 22-03.

		try {
			let payload: any
			if (form.type === 'socket') {
				payload = {
					name: form.name.trim(),
					type: 'socket',
					socketPath: form.socketPath.trim(),
				}
			} else if (form.type === 'tcp-tls') {
				payload = {
					name: form.name.trim(),
					type: 'tcp-tls',
					tcpHost: form.tcpHost.trim(),
					tcpPort: parseInt(form.tcpPort, 10),
					tlsCaPem: form.tlsCaPem,
					tlsCertPem: form.tlsCertPem,
					tlsKeyPem: form.tlsKeyPem,
				}
			} else {
				// agent
				payload = {
					name: form.name.trim(),
					type: 'agent',
				}
			}

			const result = (await create.mutateAsync(payload)) as {id: string}
			toast.success(`Environment '${form.name.trim()}' created`)
			if (form.type === 'agent') {
				onCreated(result.id)
			} else {
				onOpenChange(false)
			}
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to create environment')
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>Add Environment</DialogTitle>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					{/* Name */}
					<div className='space-y-1.5'>
						<Label htmlFor='env-name'>Name</Label>
						<Input
							id='env-name'
							placeholder='production-host'
							value={form.name}
							onValueChange={(v) => setForm((f) => ({...f, name: v}))}
						/>
					</div>

					{/* Type */}
					<div className='space-y-1.5'>
						<Label>Type</Label>
						<Select
							value={form.type}
							onValueChange={(v) => setForm((f) => ({...f, type: v as EnvironmentType}))}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='tcp-tls'>TCP / TLS — remote dockerd</SelectItem>
								<SelectItem value='agent'>Outbound agent — agent connects to Livinity</SelectItem>
								<SelectItem value='socket'>Unix socket — uncommon for non-local</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Conditional fields */}
					{form.type === 'socket' && (
						<div className='space-y-1.5'>
							<Label htmlFor='env-socket'>Socket path</Label>
							<Input
								id='env-socket'
								placeholder='/var/run/docker.sock'
								value={form.socketPath}
								onValueChange={(v) => setForm((f) => ({...f, socketPath: v}))}
							/>
						</div>
					)}

					{form.type === 'tcp-tls' && (
						<div className='space-y-3 rounded-radius-sm border border-border-default p-3'>
							<div className='grid grid-cols-[1fr_120px] gap-3'>
								<div className='space-y-1.5'>
									<Label htmlFor='env-host'>Host</Label>
									<Input
										id='env-host'
										placeholder='10.0.0.99'
										value={form.tcpHost}
										onValueChange={(v) => setForm((f) => ({...f, tcpHost: v}))}
									/>
								</div>
								<div className='space-y-1.5'>
									<Label htmlFor='env-port'>Port</Label>
									<Input
										id='env-port'
										type='number'
										placeholder='2376'
										value={form.tcpPort}
										onValueChange={(v) => setForm((f) => ({...f, tcpPort: v}))}
									/>
								</div>
							</div>
							<PemTextarea
								id='env-ca'
								label='CA PEM'
								value={form.tlsCaPem}
								onChange={(v) => setForm((f) => ({...f, tlsCaPem: v}))}
							/>
							<PemTextarea
								id='env-cert'
								label='Client Cert PEM'
								value={form.tlsCertPem}
								onChange={(v) => setForm((f) => ({...f, tlsCertPem: v}))}
							/>
							<PemTextarea
								id='env-key'
								label='Client Key PEM'
								value={form.tlsKeyPem}
								onChange={(v) => setForm((f) => ({...f, tlsKeyPem: v}))}
							/>
							<div className='text-caption-sm text-text-tertiary'>
								PEM blobs are stored in PostgreSQL on this server. Generate them with{' '}
								<code className='rounded bg-surface-2 px-1 font-mono'>dockerd --tls</code> +{' '}
								<code className='rounded bg-surface-2 px-1 font-mono'>openssl</code>; see Docker
								docs for full instructions.
							</div>
						</div>
					)}

					{form.type === 'agent' && (
						<div className='rounded-radius-sm border border-border-default bg-surface-base p-3 text-caption-sm text-text-secondary'>
							An <strong>agent token</strong> will be generated after the environment is
							created. Run the agent installer on the remote host with that token to bring
							the environment online.
						</div>
					)}
				</div>

				<DialogFooter className='gap-2'>
					<Button variant='primary' onClick={onSave} disabled={isSaving}>
						{isSaving && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						Save
					</Button>
					<Button variant='secondary' onClick={() => onOpenChange(false)} disabled={isSaving}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function PemTextarea({
	id,
	label,
	value,
	onChange,
	placeholder,
}: {
	id: string
	label: string
	value: string
	onChange: (v: string) => void
	placeholder?: string
}) {
	return (
		<div className='space-y-1.5'>
			<Label htmlFor={id}>{label}</Label>
			<textarea
				id={id}
				rows={4}
				placeholder={placeholder ?? '-----BEGIN CERTIFICATE-----…'}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className='w-full rounded-radius-sm border border-border-default bg-surface-base p-2 font-mono text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/30'
			/>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Edit Environment dialog
// ---------------------------------------------------------------------------

interface EditFormState {
	name: string
	socketPath: string
	tcpHost: string
	tcpPort: string
	tlsCaPem: string
	tlsCertPem: string
	tlsKeyPem: string
}

function EditEnvironmentDialog({
	env,
	onClose,
}: {
	env: EnvironmentRow | null
	onClose: () => void
}) {
	const [form, setForm] = useState<EditFormState>({
		name: '',
		socketPath: '',
		tcpHost: '',
		tcpPort: '',
		tlsCaPem: '',
		tlsCertPem: '',
		tlsKeyPem: '',
	})
	const update = useUpdateEnvironment()
	const isSaving = update.isPending

	// Pre-populate form from env when dialog opens
	useEffect(() => {
		if (!env) return
		setForm({
			name: env.name,
			socketPath: env.socketPath ?? '',
			tcpHost: env.tcpHost ?? '',
			tcpPort: env.tcpPort ? String(env.tcpPort) : '',
			tlsCaPem: '', // intentionally blank — leave blank to keep existing
			tlsCertPem: '',
			tlsKeyPem: '',
		})
	}, [env])

	if (!env) return null
	const open = !!env

	const onSave = async () => {
		if (!form.name.trim()) return toast.error('Name is required')
		// Build partial — only include fields that user actually changed.
		const partial: any = {id: env.id, name: form.name.trim()}
		if (env.type === 'socket' && form.socketPath !== (env.socketPath ?? '')) {
			partial.socketPath = form.socketPath.trim()
		}
		if (env.type === 'tcp-tls') {
			if (form.tcpHost !== (env.tcpHost ?? '')) partial.tcpHost = form.tcpHost.trim()
			const port = parseInt(form.tcpPort, 10)
			if (port && port !== env.tcpPort) {
				if (port < 1 || port > 65535) return toast.error('Port must be 1-65535')
				partial.tcpPort = port
			}
			if (form.tlsCaPem.trim()) partial.tlsCaPem = form.tlsCaPem
			if (form.tlsCertPem.trim()) partial.tlsCertPem = form.tlsCertPem
			if (form.tlsKeyPem.trim()) partial.tlsKeyPem = form.tlsKeyPem
		}

		try {
			await update.mutateAsync(partial)
			toast.success(`Environment '${partial.name}' updated`)
			onClose()
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to update environment')
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>Edit Environment</DialogTitle>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					<div className='space-y-1.5'>
						<Label htmlFor='env-edit-name'>Name</Label>
						<Input
							id='env-edit-name'
							value={form.name}
							onValueChange={(v) => setForm((f) => ({...f, name: v}))}
						/>
					</div>

					<div className='text-caption-sm text-text-tertiary'>
						Type: <strong>{TYPE_LABELS[env.type]}</strong> (cannot be changed — remove and
						re-add to switch transports).
					</div>

					{env.type === 'socket' && (
						<div className='space-y-1.5'>
							<Label htmlFor='env-edit-socket'>Socket path</Label>
							<Input
								id='env-edit-socket'
								value={form.socketPath}
								onValueChange={(v) => setForm((f) => ({...f, socketPath: v}))}
							/>
						</div>
					)}

					{env.type === 'tcp-tls' && (
						<div className='space-y-3 rounded-radius-sm border border-border-default p-3'>
							<div className='grid grid-cols-[1fr_120px] gap-3'>
								<div className='space-y-1.5'>
									<Label htmlFor='env-edit-host'>Host</Label>
									<Input
										id='env-edit-host'
										value={form.tcpHost}
										onValueChange={(v) => setForm((f) => ({...f, tcpHost: v}))}
									/>
								</div>
								<div className='space-y-1.5'>
									<Label htmlFor='env-edit-port'>Port</Label>
									<Input
										id='env-edit-port'
										type='number'
										value={form.tcpPort}
										onValueChange={(v) => setForm((f) => ({...f, tcpPort: v}))}
									/>
								</div>
							</div>
							<PemTextarea
								id='env-edit-ca'
								label='CA PEM'
								value={form.tlsCaPem}
								onChange={(v) => setForm((f) => ({...f, tlsCaPem: v}))}
								placeholder='Leave blank to keep existing'
							/>
							<PemTextarea
								id='env-edit-cert'
								label='Client Cert PEM'
								value={form.tlsCertPem}
								onChange={(v) => setForm((f) => ({...f, tlsCertPem: v}))}
								placeholder='Leave blank to keep existing'
							/>
							<PemTextarea
								id='env-edit-key'
								label='Client Key PEM'
								value={form.tlsKeyPem}
								onChange={(v) => setForm((f) => ({...f, tlsKeyPem: v}))}
								placeholder='Leave blank to keep existing'
							/>
						</div>
					)}

					{env.type === 'agent' && (
						<div className='text-caption-sm text-text-tertiary'>
							Agent connection parameters are managed by the agent itself. To rotate the
							agent's token, remove this environment and re-add it.
						</div>
					)}
				</div>

				<DialogFooter className='gap-2'>
					<Button variant='primary' onClick={onSave} disabled={isSaving}>
						{isSaving && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						Save
					</Button>
					<Button variant='secondary' onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ---------------------------------------------------------------------------
// Remove Environment dialog
// ---------------------------------------------------------------------------

function RemoveEnvironmentDialog({
	env,
	onClose,
}: {
	env: EnvironmentRow | null
	onClose: () => void
}) {
	const [confirm, setConfirm] = useState('')
	const remove = useDeleteEnvironment()
	const isRemoving = remove.isPending

	useEffect(() => {
		if (!env) setConfirm('')
	}, [env])

	if (!env) return null
	const open = !!env
	const matches = confirm === env.name

	const onDelete = async () => {
		if (!matches) return
		try {
			await remove.mutateAsync({id: env.id})
			toast.success(`Environment '${env.name}' removed`)
			onClose()
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to remove environment')
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Remove Environment</DialogTitle>
				</DialogHeader>
				<div className='space-y-3 py-2'>
					<p className='text-body-sm text-text-secondary'>
						This removes the environment record from Livinity. Containers, images and
						volumes on the remote host are <strong>not</strong> affected — only the
						connection configuration is forgotten.
					</p>
					<div className='space-y-1.5'>
						<Label htmlFor='env-remove-confirm'>
							Type <code className='rounded bg-surface-2 px-1 font-mono'>{env.name}</code>{' '}
							to confirm
						</Label>
						<Input
							id='env-remove-confirm'
							autoFocus
							value={confirm}
							onValueChange={setConfirm}
						/>
					</div>
				</div>
				<DialogFooter className='gap-2'>
					<Button
						variant='destructive'
						onClick={onDelete}
						disabled={!matches || isRemoving}
					>
						{isRemoving && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						Remove
					</Button>
					<Button variant='secondary' onClick={onClose} disabled={isRemoving}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ---------------------------------------------------------------------------
// Generate Agent Token dialog (write-once display)
// ---------------------------------------------------------------------------

function GenerateAgentTokenDialog({
	environmentId,
	environmentName,
	onClose,
}: {
	environmentId: string | null
	environmentName: string | null
	onClose: () => void
}) {
	const generate = useGenerateAgentToken()
	const [token, setToken] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const open = !!environmentId

	// Auto-trigger token generation once on dialog open. Mirrors Plan 21-02
	// webhook-secret pattern: the secret is shown only once at this moment;
	// closing the dialog drops it forever.
	useEffect(() => {
		if (!environmentId) {
			setToken(null)
			setCopied(false)
			setError(null)
			return
		}
		let cancelled = false
		;(async () => {
			try {
				const res = (await generate.mutateAsync({environmentId})) as {token: string}
				if (!cancelled) setToken(res.token)
			} catch (err: any) {
				if (!cancelled) setError(err?.message ?? 'Failed to generate token')
			}
		})()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [environmentId])

	const onCopy = async () => {
		if (!token) return
		try {
			await navigator.clipboard.writeText(token)
			setCopied(true)
			toast.success('Token copied to clipboard')
			setTimeout(() => setCopied(false), 2000)
		} catch {
			toast.error('Could not access clipboard — copy manually')
		}
	}

	const installSnippet = useMemo(() => {
		if (!token) return ''
		const origin =
			typeof window !== 'undefined' ? window.location.origin.replace(/^http/, 'ws') : 'wss://livinity.cloud'
		return `curl -fsSL ${origin.replace(/^wss?/, 'https')}/install-agent.sh | bash -s -- --token ${token} --server ${origin}/agent/connect`
	}, [token])

	return (
		<Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>Agent Token{environmentName ? ` for ${environmentName}` : ''}</DialogTitle>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					{generate.isPending && !token && !error && (
						<div className='flex items-center gap-2 text-body-sm text-text-secondary'>
							<TbLoader2 className='h-4 w-4 animate-spin' />
							Generating token…
						</div>
					)}

					{error && (
						<div className='rounded-radius-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300'>
							<div className='flex items-start gap-2'>
								<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
								<div>
									<div className='font-medium'>Could not generate token</div>
									<div className='mt-1'>{error}</div>
									<div className='mt-1 text-caption-sm opacity-80'>
										The agent transport ships in Plan 22-03. The environment record was
										created — you can generate the token after upgrading.
									</div>
								</div>
							</div>
						</div>
					)}

					{token && (
						<>
							<div className='rounded-radius-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300'>
								<div className='flex items-start gap-2'>
									<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
									<div>
										<div className='font-medium'>Save this token now</div>
										<div className='mt-1'>
											You will not be able to view it again. If you lose it, remove and
											re-add the environment to issue a new one.
										</div>
									</div>
								</div>
							</div>

							<div className='space-y-1.5'>
								<Label>Token</Label>
								<div className='flex gap-2'>
									<textarea
										readOnly
										rows={2}
										value={token}
										className='flex-1 rounded-radius-sm border border-border-default bg-surface-base p-2 font-mono text-caption text-text-primary'
									/>
									<Button
										variant='secondary'
										size='sm'
										className='h-auto self-stretch'
										onClick={onCopy}
									>
										{copied ? <TbCheck className='h-4 w-4' /> : <TbCopy className='h-4 w-4' />}
										{copied ? 'Copied' : 'Copy'}
									</Button>
								</div>
							</div>

							<div className='space-y-1.5'>
								<Label>Install on the remote host</Label>
								<textarea
									readOnly
									rows={3}
									value={installSnippet}
									className='w-full rounded-radius-sm border border-border-default bg-surface-base p-2 font-mono text-caption text-text-primary'
								/>
								<div className='text-caption-sm text-text-tertiary'>
									The agent will connect outbound via WebSocket. No inbound port required.
								</div>
							</div>
						</>
					)}
				</div>

				<DialogFooter className='gap-2'>
					<Button variant='primary' onClick={onClose}>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
