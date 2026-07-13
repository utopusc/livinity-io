import {Loader2} from 'lucide-react'
import {useState} from 'react'
import {IconType} from 'react-icons'
import {
	TbBell,
	TbBrandDiscord,
	TbBrandSlack,
	TbBrandTelegram,
	TbBrandWhatsapp,
	TbCheck,
	TbMail,
	TbMessages,
	TbWebhook,
} from 'react-icons/tb'

import {FieldCard, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
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
import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogPortal, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input, PasswordInput} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {Switch} from '@/shadcn-components/ui/switch'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 310-04 (ALERT-01) — Settings → Alert Channels.
//
// Admin-only external alert-channel CRUD, bound to the Plan-02 tRPC surface
// (notifications.channels.list/upsert/delete/test). The list NEVER shows a raw
// secret — it only reads `hasSecret` and renders a "Secret set" indicator. The
// add form submits the secret to upsert; it is never fetched back. Mirrors the
// storage-section.tsx add-dialog + AlertDialog remove-confirm idiom and the
// domains-section.tsx FieldCard/FieldRow read pattern.
// ─────────────────────────────────────────────────────────────────────────────

type ChannelKind =
	| 'liv:telegram'
	| 'liv:discord'
	| 'liv:slack'
	| 'liv:matrix'
	| 'liv:gmail'
	| 'liv:whatsapp'
	| 'webhook'
	| 'ntfy'

type Severity = 'critical' | 'warning' | 'info'

const SEVERITIES: Severity[] = ['critical', 'warning', 'info']

interface KindMeta {
	value: ChannelKind
	/** Brand/proper-noun label — intentionally not translated. */
	label: string
	icon: IconType
	/** 'none' = no secret input; 'required' = mandatory (webhook URL); 'optional' = ntfy access token. */
	secret: 'none' | 'required' | 'optional'
	/** Which target-field hint to show. */
	target: 'messenger' | 'ntfy' | 'webhook'
}

const KINDS: KindMeta[] = [
	{value: 'liv:telegram', label: 'Telegram', icon: TbBrandTelegram, secret: 'none', target: 'messenger'},
	{value: 'liv:discord', label: 'Discord', icon: TbBrandDiscord, secret: 'none', target: 'messenger'},
	{value: 'liv:slack', label: 'Slack', icon: TbBrandSlack, secret: 'none', target: 'messenger'},
	{value: 'liv:matrix', label: 'Matrix', icon: TbMessages, secret: 'none', target: 'messenger'},
	{value: 'liv:gmail', label: 'Gmail', icon: TbMail, secret: 'none', target: 'messenger'},
	{value: 'liv:whatsapp', label: 'WhatsApp', icon: TbBrandWhatsapp, secret: 'none', target: 'messenger'},
	{value: 'webhook', label: 'Webhook', icon: TbWebhook, secret: 'required', target: 'webhook'},
	{value: 'ntfy', label: 'ntfy', icon: TbBell, secret: 'optional', target: 'ntfy'},
]

const KIND_BY_VALUE = Object.fromEntries(KINDS.map((k) => [k.value, k])) as Record<ChannelKind, KindMeta>

type TestStatus = {status: 'idle'} | {status: 'sending'} | {status: 'sent'} | {status: 'failed'; error: string}

function severityLabel(s: Severity): string {
	return t(`settings.alert-channels.severity-${s}`)
}

function severitySummary(sev: readonly string[] | undefined): string {
	if (!sev || sev.length === 0) return t('settings.alert-channels.severity-none')
	if (sev.length >= SEVERITIES.length) return t('settings.alert-channels.severity-all')
	return sev.map((s) => severityLabel(s as Severity)).join(', ')
}

function targetHint(meta: KindMeta): string {
	if (meta.target === 'webhook') return t('settings.alert-channels.target-hint-webhook')
	if (meta.target === 'ntfy') return t('settings.alert-channels.target-hint-ntfy')
	return t('settings.alert-channels.target-hint-messenger')
}

function secretHint(meta: KindMeta): string {
	return meta.secret === 'required'
		? t('settings.alert-channels.secret-hint-webhook')
		: t('settings.alert-channels.secret-hint-ntfy')
}

export function AlertChannelsSection() {
	const listQ = trpcReact.notifications.channels.list.useQuery()
	const deleteM = trpcReact.notifications.channels.delete.useMutation()
	const testM = trpcReact.notifications.channels.test.useMutation()

	const [showAdd, setShowAdd] = useState(false)
	const [removeTarget, setRemoveTarget] = useState<{id: string; label: string} | null>(null)
	const [testStates, setTestStates] = useState<Record<string, TestStatus>>({})

	const channels = listQ.data ?? []

	async function handleTest(id: string) {
		setTestStates((s) => ({...s, [id]: {status: 'sending'}}))
		try {
			const res = await testM.mutateAsync({id})
			if (res?.ok) {
				setTestStates((s) => ({...s, [id]: {status: 'sent'}}))
				setTimeout(() => setTestStates((s) => ({...s, [id]: {status: 'idle'}})), 3000)
			} else {
				setTestStates((s) => ({...s, [id]: {status: 'failed', error: res?.error || t('settings.alert-channels.test-failed')}}))
			}
		} catch (err) {
			setTestStates((s) => ({...s, [id]: {status: 'failed', error: (err as Error).message || t('settings.alert-channels.test-failed')}}))
		}
	}

	async function handleRemove() {
		if (!removeTarget) return
		try {
			await deleteM.mutateAsync({id: removeTarget.id})
			await listQ.refetch()
		} finally {
			setRemoveTarget(null)
		}
	}

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow={t('settings.alert-channels.eyebrow')}
				title={t('settings.alert-channels.title')}
				titleAccent={t('settings.alert-channels.title-accent')}
				sub={t('settings.alert-channels.sub')}
			/>

			<section className='flex flex-col gap-3'>
				<div className='flex items-baseline justify-between gap-2'>
					<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
						{t('settings.alert-channels.menu-label')}
					</span>
					<Button variant='v36-ghost' size='v36-pill-sm' onClick={() => setShowAdd(true)}>
						{t('settings.alert-channels.add')}
					</Button>
				</div>

				{listQ.isLoading ? (
					<FieldCard>
						<div className='flex items-center justify-center gap-2 py-8 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					</FieldCard>
				) : channels.length === 0 ? (
					<FieldCard>
						<FieldRow
							label={t('settings.alert-channels.none')}
							value={<span className='text-[color:var(--fg-faint)]'>{t('settings.alert-channels.empty')}</span>}
						/>
					</FieldCard>
				) : (
					<FieldCard>
						{channels.map((ch) => {
							const meta = KIND_BY_VALUE[ch.kind as ChannelKind]
							const Icon = meta?.icon ?? TbBell
							const test: TestStatus = testStates[ch.id] ?? {status: 'idle'}
							return (
								<FieldRow
									key={ch.id}
									label={
										<span className='inline-flex items-center gap-2'>
											<Icon className='h-4 w-4 shrink-0 text-[color:var(--fg-mute)]' />
											<span className='truncate'>{meta?.label ?? ch.kind}</span>
										</span>
									}
									value={
										<div className='flex min-w-0 flex-col gap-0.5'>
											<span className='truncate font-mono text-[13px] text-[color:var(--fg-mute)]' title={ch.target}>
												{ch.target}
											</span>
											<span className='text-[12px] text-[color:var(--fg-faint)]'>
												{ch.enabled ? severitySummary(ch.severityFilter) : t('settings.alert-channels.disabled')}
												{ch.hasSecret ? ` · ${t('settings.alert-channels.secret-set')}` : ''}
											</span>
											{test.status === 'failed' && (
												<span className='text-[12px] text-[color:var(--red,#dc2626)]'>{test.error}</span>
											)}
										</div>
									}
									trailing={
										<div className='flex items-center gap-2'>
											<Button
												variant='v36-ghost'
												size='v36-pill-sm'
												disabled={test.status === 'sending'}
												onClick={() => handleTest(ch.id)}
											>
												{test.status === 'sending' ? (
													<>
														<Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('settings.alert-channels.sending')}
													</>
												) : test.status === 'sent' ? (
													<>
														<TbCheck className='h-3.5 w-3.5 text-green-400' /> {t('settings.alert-channels.test-sent')}
													</>
												) : (
													t('settings.alert-channels.send-test')
												)}
											</Button>
											<Button
												variant='v36-ghost'
												size='v36-pill-sm'
												disabled={deleteM.isPending}
												onClick={() => setRemoveTarget({id: ch.id, label: meta?.label ?? ch.kind})}
											>
												{t('settings.alert-channels.remove')}
											</Button>
										</div>
									}
								/>
							)
						})}
					</FieldCard>
				)}
			</section>

			<AddChannelDialog
				open={showAdd}
				onOpenChange={setShowAdd}
				onSaved={() => {
					setShowAdd(false)
					listQ.refetch()
				}}
			/>

			{/* Remove confirm — light. */}
			<AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('settings.alert-channels.remove-title')}</AlertDialogTitle>
						<AlertDialogDescription>{t('settings.alert-channels.remove-body')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction variant='destructive' disabled={deleteM.isPending} onClick={handleRemove}>
							{deleteM.isPending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('settings.alert-channels.remove')}
						</AlertDialogAction>
						<AlertDialogCancel>{t('settings.alert-channels.cancel')}</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

function AddChannelDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSaved: () => void
}) {
	const upsertM = trpcReact.notifications.channels.upsert.useMutation()
	const [kind, setKind] = useState<ChannelKind>('liv:telegram')
	const [target, setTarget] = useState('')
	const [secret, setSecret] = useState('')
	const [enabled, setEnabled] = useState(true)
	const [severity, setSeverity] = useState<Severity[]>([...SEVERITIES])
	const [error, setError] = useState<string | null>(null)

	const meta = KIND_BY_VALUE[kind]

	function reset() {
		setKind('liv:telegram')
		setTarget('')
		setSecret('')
		setEnabled(true)
		setSeverity([...SEVERITIES])
		setError(null)
		upsertM.reset()
	}

	function toggleSeverity(s: Severity) {
		setSeverity((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
	}

	async function handleSave() {
		setError(null)
		const trimmedTarget = target.trim()
		const trimmedSecret = secret.trim()
		if (!trimmedTarget) {
			setError(t('settings.alert-channels.error-target-required'))
			return
		}
		if (meta.secret === 'required' && !trimmedSecret) {
			setError(t('settings.alert-channels.error-secret-required'))
			return
		}
		if (severity.length === 0) {
			setError(t('settings.alert-channels.error-severity-required'))
			return
		}
		try {
			await upsertM.mutateAsync({
				kind,
				target: trimmedTarget,
				secret: meta.secret !== 'none' && trimmedSecret ? trimmedSecret : undefined,
				enabled,
				severityFilter: severity,
			})
			reset()
			onSaved()
		} catch (err) {
			// The server message (e.g. an SSRF BAD_REQUEST) is surfaced inline.
			setError((err as Error).message || t('settings.alert-channels.error-save'))
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) reset()
				onOpenChange(o)
			}}
		>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('settings.alert-channels.add')}</DialogTitle>
					</DialogHeader>

					<div className='flex flex-col gap-4 text-left'>
						{/* Channel kind */}
						<label className='flex flex-col gap-1.5'>
							<span className='text-[13px] font-medium text-text-secondary'>{t('settings.alert-channels.kind-label')}</span>
							<Select
								value={kind}
								onValueChange={(v) => {
									setKind(v as ChannelKind)
									setError(null)
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{KINDS.map((k) => (
										<SelectItem key={k.value} value={k.value}>
											{k.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</label>

						{/* Target (chat id / topic URL / display label) */}
						<label className='flex flex-col gap-1.5'>
							<span className='text-[13px] font-medium text-text-secondary'>{t('settings.alert-channels.target-label')}</span>
							<Input value={target} onValueChange={setTarget} />
							<span className='text-[12px] text-text-tertiary'>{targetHint(meta)}</span>
						</label>

						{/* Secret — only for webhook (URL, required) and ntfy (token, optional). Masked. */}
						{meta.secret !== 'none' && (
							<label className='flex flex-col gap-1.5'>
								<span className='text-[13px] font-medium text-text-secondary'>
									{t('settings.alert-channels.secret-label')}
									{meta.secret === 'optional' && (
										<span className='text-[color:var(--fg-faint)]'> · {t('settings.alert-channels.optional')}</span>
									)}
								</span>
								<PasswordInput value={secret} onValueChange={setSecret} />
								<span className='text-[12px] text-text-tertiary'>{secretHint(meta)}</span>
							</label>
						)}

						{/* Enabled */}
						<div className='flex items-center justify-between'>
							<span className='text-[13px] font-medium text-text-secondary'>{t('settings.alert-channels.enabled-label')}</span>
							<Switch checked={enabled} onCheckedChange={setEnabled} />
						</div>

						{/* Severity filter */}
						<div className='flex flex-col gap-2'>
							<span className='text-[13px] font-medium text-text-secondary'>{t('settings.alert-channels.severity-label')}</span>
							<div className='flex flex-wrap gap-4'>
								{SEVERITIES.map((s) => (
									<label key={s} className='flex cursor-pointer items-center gap-2'>
										<Checkbox checked={severity.includes(s)} onCheckedChange={() => toggleSeverity(s)} />
										<span className='text-[13px] text-[color:var(--fg-mute)]'>{severityLabel(s)}</span>
									</label>
								))}
							</div>
						</div>

						{error && <p className='text-[13px] text-[color:var(--red,#dc2626)]'>{error}</p>}
					</div>

					<DialogFooter>
						<Button type='button' size='dialog' variant='primary' disabled={upsertM.isPending} onClick={handleSave}>
							{upsertM.isPending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('settings.alert-channels.save')}
						</Button>
						<Button type='button' size='dialog' onClick={() => onOpenChange(false)}>
							{t('settings.alert-channels.cancel')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
