import {Loader2} from 'lucide-react'
import {useState} from 'react'
import {TbCheck, TbCopy, TbShieldLock} from 'react-icons/tb'
import {useCopyToClipboard} from 'react-use'

import {FieldCard} from '@/components/field-card'
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
import {Dialog, DialogContent, DialogHeader, DialogPortal, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'
import {sleep} from '@/utils/misc'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 346-05 (MCP-01, D-346-4/6/9) — Settings → MCP control server.
//
// Admin-only section (adminOnly:true in settings-content.tsx). Drives the
// mcpControl.* router (Plan 04): enable/disable the loopback control-plane
// transport (getStatus/setEnabled), mint/list/revoke bounded `liv_mcp_*`
// transport keys. The minted plaintext is shown EXACTLY ONCE (T-346-20) in a
// copy-once dialog and cleared on close — listKeys never returns it.
//
// DISTINCT from the consumer-side settings/mcp-servers.tsx (which installs
// EXTERNAL MCP servers into the chat agent, hidden via V42_HIDDEN_MENU_IDS).
// This section is a NEW visible admin surface for the box's OWN control server.
//
// Neutral (non-alarming) warning card: the server binds 127.0.0.1 ONLY,
// default-off, and reaching it from off-box is a DELIBERATE operator step via
// their own tunnel/reverse-proxy — never a default (D-346-5, T-346-22).
// ─────────────────────────────────────────────────────────────────────────────

type KeyRow = {
	id: string
	keyPrefix: string
	name: string
	createdBy: string | null
	createdAt: string | number
	lastUsedAt: string | number | null
	revokedAt: string | number | null
}

function fmtDate(value: string | number | null): string {
	if (value === null || value === undefined) return '—'
	const d = new Date(value)
	if (Number.isNaN(d.getTime())) return '—'
	return d.toLocaleString()
}

/** One-shot copy button that flips to a check for 1s (mirrors CopyButton idiom). */
function InlineCopy({value, label}: {value: string; label: string}) {
	const [, copyToClipboard] = useCopyToClipboard()
	const [copied, setCopied] = useState(false)
	return (
		<Button
			variant='primary'
			size='sm'
			onClick={async () => {
				copyToClipboard(value)
				setCopied(true)
				await sleep(1000)
				setCopied(false)
			}}
		>
			{copied ? (
				<span className='flex items-center gap-1.5'>
					<TbCheck className='h-4 w-4' />
					{t('settings.mcp-control.copied')}
				</span>
			) : (
				<span className='flex items-center gap-1.5'>
					<TbCopy className='h-4 w-4' />
					{label}
				</span>
			)}
		</Button>
	)
}

export function McpControlSection() {
	const utils = trpcReact.useUtils()
	const statusQ = trpcReact.mcpControl.getStatus.useQuery(undefined, {staleTime: 15_000})
	const listQ = trpcReact.mcpControl.listKeys.useQuery(undefined, {staleTime: 15_000})

	const setEnabledM = trpcReact.mcpControl.setEnabled.useMutation({
		onSuccess: () => utils.mcpControl.getStatus.invalidate(),
	})

	// The minted plaintext lives ONLY in this transient state; cleared on dialog
	// close so it never lingers in the UI (T-346-20). Never re-fetchable.
	const [mintedPlaintext, setMintedPlaintext] = useState<string | null>(null)
	const [mintedPrefix, setMintedPrefix] = useState<string>('')
	const [keyName, setKeyName] = useState('')
	const mintM = trpcReact.mcpControl.mintKey.useMutation({
		onSuccess: (res) => {
			setMintedPlaintext(res.plaintext)
			setMintedPrefix(res.keyPrefix)
			setKeyName('')
			utils.mcpControl.listKeys.invalidate()
		},
	})

	const [revokeTarget, setRevokeTarget] = useState<KeyRow | null>(null)
	const revokeM = trpcReact.mcpControl.revokeKey.useMutation({
		onSuccess: () => {
			setRevokeTarget(null)
			utils.mcpControl.listKeys.invalidate()
		},
	})

	const enabled = statusQ.data?.enabled ?? false
	const listening = statusQ.data?.listening ?? false
	const host = statusQ.data?.host ?? '127.0.0.1'
	const path = statusQ.data?.path ?? '/mcp-control'
	const keys = (listQ.data ?? []) as KeyRow[]

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow={t('settings.mcp-control.eyebrow')}
				title={t('settings.mcp-control.title')}
				titleAccent={t('settings.mcp-control.title-accent')}
				sub={t('settings.mcp-control.sub')}
			/>

			{/* ── Loopback / exposure warning (neutral, additive micro-change) ── */}
			<FieldCard>
				<div className='flex items-start gap-3 px-5 py-4'>
					<TbShieldLock className='mt-0.5 h-5 w-5 shrink-0 text-[color:var(--fg-mute)]' />
					<div className='flex min-w-0 flex-col gap-1.5'>
						<p className='text-[13px] font-medium text-[color:var(--fg)]'>
							{t('settings.mcp-control.warning-title')}
						</p>
						<p className='text-[13px] leading-[1.55] text-[color:var(--fg-mute)]'>
							{t('settings.mcp-control.warning-loopback')}
						</p>
						<p className='text-[13px] leading-[1.55] text-[color:var(--fg-mute)]'>
							{t('settings.mcp-control.warning-exposure')}
						</p>
					</div>
				</div>
			</FieldCard>

			{/* ── Enable toggle + listening state ── */}
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('settings.mcp-control.server-title')}
				</span>
				<FieldCard>
					<div className='flex items-center justify-between gap-4 px-5 py-4'>
						<div className='flex min-w-0 flex-col gap-1'>
							<span className='text-[14px] text-[color:var(--fg)]'>
								{t('settings.mcp-control.enable-label')}
							</span>
							<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
								{t('settings.mcp-control.enable-description')}
							</p>
						</div>
						<Switch
							checked={enabled}
							onCheckedChange={(next) => setEnabledM.mutate({enabled: next})}
							disabled={setEnabledM.isPending || statusQ.isLoading}
						/>
					</div>
					<div className='flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-4 text-[12px]'>
						<span className='flex items-center gap-2'>
							<span className='text-[color:var(--fg-faint)]'>{t('settings.mcp-control.status-label')}</span>
							<span
								className={cn(
									'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
									listening
										? 'border-green-500/40 bg-green-500/10 text-green-400'
										: 'border-[color:var(--line)] bg-[color:var(--bg-faint)] text-[color:var(--fg-faint)]',
								)}
							>
								{listening ? t('settings.mcp-control.status-listening') : t('settings.mcp-control.status-inert')}
							</span>
						</span>
						<span className='flex items-center gap-2 font-mono text-[color:var(--fg-mute)]'>
							<span className='font-sans text-[color:var(--fg-faint)]'>
								{t('settings.mcp-control.endpoint-label')}
							</span>
							{`http://${host}${path}`}
						</span>
					</div>
				</FieldCard>
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
					{t('settings.mcp-control.connect-hint')}
				</p>
			</section>

			{/* ── Key management ── */}
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('settings.mcp-control.keys-title')}
				</span>
				<p className='text-[13px] leading-[1.55] text-[color:var(--fg-mute)]'>
					{t('settings.mcp-control.keys-description')}
				</p>

				{/* Mint control */}
				<FieldCard>
					<div className='flex flex-wrap items-end gap-3 px-5 py-4'>
						<label className='flex min-w-[220px] flex-1 flex-col gap-1.5'>
							<span className='text-[12px] text-[color:var(--fg-faint)]'>
								{t('settings.mcp-control.mint-name-label')}
							</span>
							<Input
								value={keyName}
								onChange={(e) => setKeyName(e.target.value)}
								placeholder={t('settings.mcp-control.mint-name-placeholder')}
								maxLength={64}
							/>
						</label>
						<Button
							variant='primary'
							onClick={() => mintM.mutate({name: keyName.trim()})}
							disabled={mintM.isPending || keyName.trim().length === 0}
						>
							{mintM.isPending ? (
								<span className='flex items-center gap-2'>
									<Loader2 className='h-4 w-4 animate-spin' />
									{t('settings.mcp-control.minting')}
								</span>
							) : (
								t('settings.mcp-control.mint')
							)}
						</Button>
					</div>
				</FieldCard>

				{/* Key list */}
				{listQ.isLoading ? (
					<FieldCard>
						<div className='flex items-center justify-center py-8 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					</FieldCard>
				) : keys.length === 0 ? (
					<FieldCard>
						<div className='px-5 py-8 text-center text-[13px] text-[color:var(--fg-faint)]'>
							{t('settings.mcp-control.no-keys')}
						</div>
					</FieldCard>
				) : (
					<FieldCard>
						{keys.map((k) => {
							const revoked = k.revokedAt !== null && k.revokedAt !== undefined
							return (
								<div key={k.id} className='flex items-start justify-between gap-4 px-5 py-4'>
									<div className='flex min-w-0 flex-col gap-1.5'>
										<div className='flex flex-wrap items-center gap-2'>
											<span className='text-[14px] text-[color:var(--fg)]'>{k.name}</span>
											<span className='font-mono text-[11px] text-[color:var(--fg-faint)]'>{k.keyPrefix}…</span>
											{revoked && (
												<span className='inline-flex shrink-0 items-center rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400'>
													{t('settings.mcp-control.badge-revoked')}
												</span>
											)}
										</div>
										<div className='flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[color:var(--fg-faint)]'>
											<span>{t('settings.mcp-control.col-created', {time: fmtDate(k.createdAt)})}</span>
											<span>
												{k.lastUsedAt
													? t('settings.mcp-control.col-last-used', {time: fmtDate(k.lastUsedAt)})
													: t('settings.mcp-control.col-never-used')}
											</span>
										</div>
									</div>
									{!revoked && (
										<Button
											variant='destructive'
											size='sm'
											className='shrink-0 self-center'
											onClick={() => setRevokeTarget(k)}
											disabled={revokeM.isPending}
										>
											{t('settings.mcp-control.revoke')}
										</Button>
									)}
								</div>
							)
						})}
					</FieldCard>
				)}
			</section>

			{/* ── Copy-once minted-key dialog (T-346-20: shown exactly once) ── */}
			<Dialog
				open={mintedPlaintext !== null}
				onOpenChange={(o) => {
					if (!o) {
						setMintedPlaintext(null)
						setMintedPrefix('')
					}
				}}
			>
				<DialogPortal>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('settings.mcp-control.minted-title')}</DialogTitle>
						</DialogHeader>
						<div className='flex flex-col gap-4 text-left'>
							<p className='text-[13px] leading-[1.55] text-[color:var(--fg-mute)]'>
								{t('settings.mcp-control.minted-once-warning')}
							</p>
							<div className='flex items-center justify-between gap-3 rounded-8 border border-line bg-[color:var(--bg-faint)] px-4 py-3'>
								<code className='min-w-0 break-all font-mono text-[13px] text-[color:var(--fg)]'>
									{mintedPlaintext ?? ''}
								</code>
							</div>
							<div className='flex items-center justify-between gap-3'>
								<span className='font-mono text-[11px] text-[color:var(--fg-faint)]'>{mintedPrefix}…</span>
								{mintedPlaintext && (
									<InlineCopy value={mintedPlaintext} label={t('settings.mcp-control.copy-key')} />
								)}
							</div>
							<Button
								variant='default'
								onClick={() => {
									setMintedPlaintext(null)
									setMintedPrefix('')
								}}
							>
								{t('settings.mcp-control.minted-done')}
							</Button>
						</div>
					</DialogContent>
				</DialogPortal>
			</Dialog>

			{/* ── Revoke confirm ── */}
			<AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('settings.mcp-control.revoke-title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('settings.mcp-control.revoke-body', {name: revokeTarget?.name ?? ''})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction
							variant='destructive'
							disabled={revokeM.isPending}
							onClick={() => revokeTarget && revokeM.mutate({id: revokeTarget.id})}
						>
							{t('settings.mcp-control.revoke-confirm')}
						</AlertDialogAction>
						<AlertDialogCancel>{t('settings.mcp-control.cancel')}</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
