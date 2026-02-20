/**
 * Webhooks Settings — Manage webhook endpoints.
 *
 * Lists all registered webhooks with name, URL, delivery count, last used.
 * Provides create (with name + optional secret) and delete with confirmation.
 * Secret is displayed only once at creation time.
 */

import {useState} from 'react'
import {Loader2} from 'lucide-react'
import {
	TbWebhook,
	TbPlus,
	TbTrash,
	TbCopy,
	TbCheck,
	TbAlertCircle,
	TbEye,
	TbEyeOff,
} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
	if (!iso) return 'Never'
	try {
		return new Date(iso).toLocaleString()
	} catch {
		return iso
	}
}

function CopyButton({text}: {text: string}) {
	const [copied, setCopied] = useState(false)

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// Fallback
		}
	}

	return (
		<button
			onClick={handleCopy}
			className='p-1 rounded text-text-tertiary hover:text-text-primary transition-colors'
			title='Copy to clipboard'
		>
			{copied ? <TbCheck className='h-3.5 w-3.5 text-green-400' /> : <TbCopy className='h-3.5 w-3.5' />}
		</button>
	)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function WebhooksContent() {
	const [showCreate, setShowCreate] = useState(false)
	const [name, setName] = useState('')
	const [secret, setSecret] = useState('')
	const [createdResult, setCreatedResult] = useState<{id: string; url: string; secret: string} | null>(null)
	const [showSecret, setShowSecret] = useState(false)
	const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

	const webhooksQ = trpcReact.ai.getWebhooks.useQuery()
	const utils = trpcReact.useUtils()

	const createMutation = trpcReact.ai.createWebhook.useMutation({
		onSuccess: (data) => {
			setCreatedResult(data)
			setShowSecret(true)
			setName('')
			setSecret('')
			utils.ai.getWebhooks.invalidate()
		},
	})

	const deleteMutation = trpcReact.ai.deleteWebhook.useMutation({
		onSuccess: () => {
			setDeleteConfirm(null)
			utils.ai.getWebhooks.invalidate()
		},
	})

	const webhooks = webhooksQ.data?.webhooks ?? []
	const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

	const handleCreate = () => {
		if (!name.trim()) return
		createMutation.mutate({name: name.trim(), secret: secret.trim() || undefined})
	}

	return (
		<div className='space-y-6'>
			{/* ── Created Webhook Secret Banner ─────────── */}
			{createdResult && (
				<div className='rounded-radius-md border border-green-500/30 bg-green-500/10 p-4 space-y-3'>
					<div className='flex items-start gap-3'>
						<TbCheck className='h-5 w-5 text-green-400 mt-0.5 shrink-0' />
						<div className='flex-1 space-y-2'>
							<div className='text-body font-medium text-green-400'>Webhook Created</div>
							<p className='text-caption text-text-secondary'>
								Save the secret below. It will not be shown again.
							</p>

							<div className='space-y-2'>
								<div className='flex items-center gap-2'>
									<span className='text-caption text-text-tertiary w-12 shrink-0'>URL</span>
									<code className='flex-1 text-caption font-mono text-text-primary bg-surface-2 rounded px-2 py-1 truncate'>
										{baseUrl}{createdResult.url}
									</code>
									<CopyButton text={`${baseUrl}${createdResult.url}`} />
								</div>
								<div className='flex items-center gap-2'>
									<span className='text-caption text-text-tertiary w-12 shrink-0'>Secret</span>
									<code className='flex-1 text-caption font-mono text-text-primary bg-surface-2 rounded px-2 py-1 truncate'>
										{showSecret ? createdResult.secret : createdResult.secret.replace(/./g, '*')}
									</code>
									<button
										onClick={() => setShowSecret(!showSecret)}
										className='p-1 rounded text-text-tertiary hover:text-text-primary transition-colors'
									>
										{showSecret ? <TbEyeOff className='h-3.5 w-3.5' /> : <TbEye className='h-3.5 w-3.5' />}
									</button>
									<CopyButton text={createdResult.secret} />
								</div>
							</div>
						</div>
					</div>
					<div className='flex justify-end'>
						<Button variant='secondary' size='sm' onClick={() => setCreatedResult(null)}>
							Dismiss
						</Button>
					</div>
				</div>
			)}

			{/* ── Create Form ─────────────────────────── */}
			{showCreate ? (
				<div className='rounded-radius-md border border-border-default bg-surface-base p-4 space-y-3'>
					<div className='text-body font-medium'>New Webhook</div>
					<div className='space-y-2'>
						<label className='text-caption text-text-secondary'>Name</label>
						<Input
							placeholder='e.g. GitHub Push, Stripe Events...'
							value={name}
							onValueChange={setName}
							onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
						/>
					</div>
					<div className='space-y-2'>
						<label className='text-caption text-text-secondary'>Secret (optional)</label>
						<Input
							placeholder='Auto-generated if empty'
							value={secret}
							onValueChange={setSecret}
							className='font-mono'
						/>
						<p className='text-caption-sm text-text-tertiary'>
							Used for HMAC-SHA256 signature verification. Leave empty to auto-generate.
						</p>
					</div>
					<div className='flex gap-2'>
						<Button
							variant='primary'
							size='sm'
							onClick={handleCreate}
							disabled={!name.trim() || createMutation.isPending}
						>
							{createMutation.isPending ? (
								<><Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' /> Creating...</>
							) : (
								'Create Webhook'
							)}
						</Button>
						<Button variant='secondary' size='sm' onClick={() => { setShowCreate(false); setName(''); setSecret('') }}>
							Cancel
						</Button>
					</div>
					{createMutation.isError && (
						<p className='text-caption text-red-400 flex items-center gap-1.5'>
							<TbAlertCircle className='h-3.5 w-3.5' />
							{createMutation.error.message}
						</p>
					)}
				</div>
			) : (
				<Button variant='primary' size='sm' onClick={() => setShowCreate(true)}>
					<TbPlus className='mr-1.5 h-4 w-4' /> Create Webhook
				</Button>
			)}

			{/* ── Webhook List ─────────────────────────── */}
			{webhooksQ.isLoading ? (
				<div className='flex items-center justify-center py-8'>
					<Loader2 className='h-5 w-5 animate-spin text-text-tertiary' />
				</div>
			) : webhooks.length === 0 ? (
				<div className='rounded-radius-md border border-border-default bg-surface-base p-8 text-center'>
					<TbWebhook className='mx-auto h-8 w-8 text-text-tertiary' />
					<p className='mt-2 text-body-sm text-text-secondary'>No webhooks configured</p>
					<p className='text-caption text-text-tertiary'>Create a webhook to receive events from external services.</p>
				</div>
			) : (
				<div className='space-y-2'>
					{webhooks.map((wh) => (
						<div
							key={wh.id}
							className='rounded-radius-md border border-border-default bg-surface-base p-4'
						>
							<div className='flex items-start justify-between gap-4'>
								<div className='flex-1 min-w-0 space-y-1'>
									<div className='flex items-center gap-2'>
										<TbWebhook className='h-4 w-4 text-text-secondary shrink-0' />
										<span className='text-body font-medium truncate'>{wh.name}</span>
									</div>
									<div className='flex items-center gap-2'>
										<code className='text-caption font-mono text-text-secondary truncate'>
											/api/webhook/{wh.id}
										</code>
										<CopyButton text={`${baseUrl}/api/webhook/${wh.id}`} />
									</div>
									<div className='flex gap-4 text-caption text-text-tertiary'>
										<span>Deliveries: {wh.deliveryCount}</span>
										<span>Last used: {formatDate(wh.lastUsed)}</span>
									</div>
								</div>

								{/* Delete */}
								<div className='shrink-0'>
									{deleteConfirm === wh.id ? (
										<div className='flex items-center gap-2'>
											<span className='text-caption text-red-400'>Delete?</span>
											<Button
												variant='destructive'
												size='sm'
												onClick={() => deleteMutation.mutate({id: wh.id})}
												disabled={deleteMutation.isPending}
											>
												{deleteMutation.isPending ? (
													<Loader2 className='h-3.5 w-3.5 animate-spin' />
												) : (
													'Yes'
												)}
											</Button>
											<Button variant='secondary' size='sm' onClick={() => setDeleteConfirm(null)}>
												No
											</Button>
										</div>
									) : (
										<button
											onClick={() => setDeleteConfirm(wh.id)}
											className='p-2 rounded-radius-sm text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors'
											title='Delete webhook'
										>
											<TbTrash className='h-4 w-4' />
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default WebhooksContent
