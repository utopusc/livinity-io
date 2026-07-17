import {Loader2} from 'lucide-react'

import {FieldCard} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {Button} from '@/shadcn-components/ui/button'
import {Switch} from '@/shadcn-components/ui/switch'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 333-03 (DIAG-01/02) — Settings → Connectivity.
//
// Admin-only section (adminOnly:true in settings-content.tsx). Surfaces the
// scheduled connectivity self-diagnosis (connectivity.getReport): per-check
// category + status (pass/warn/fail) + last-run, a per-check "mute" toggle, an
// opt-in for the mail-deliverability category, and a "Run check now" button
// (connectivity.runCheckNow → refetch). Distinct from Settings → Troubleshoot →
// Diagnostics (AI capability/model/app-health). Cloned from security-advisor-section.
// ─────────────────────────────────────────────────────────────────────────────

type CheckRow = {id: string; category: string; status: 'pass' | 'warn' | 'fail'; detail: string; at: number}

function StatusBadge({status}: {status: 'pass' | 'warn' | 'fail'}) {
	const cls =
		status === 'pass'
			? 'border-green-500/40 bg-green-500/10 text-green-400'
			: status === 'warn'
				? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
				: 'border-red-500/40 bg-red-500/10 text-red-400'
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
				cls,
			)}
		>
			{t('settings.connectivity.status-' + status)}
		</span>
	)
}

export function ConnectivitySection() {
	const utils = trpcReact.useUtils()
	const reportQ = trpcReact.connectivity.getReport.useQuery(undefined, {staleTime: 30_000})
	const runM = trpcReact.connectivity.runCheckNow.useMutation({onSuccess: () => reportQ.refetch()})
	const ignoreM = trpcReact.connectivity.setIgnore.useMutation({
		onSuccess: () => utils.connectivity.getReport.invalidate(),
	})
	const mailM = trpcReact.connectivity.setMailEnabled.useMutation({
		onSuccess: () => utils.connectivity.getReport.invalidate(),
	})

	const checks = (reportQ.data?.checks ?? []) as CheckRow[]
	const ignore = new Set(reportQ.data?.ignore ?? [])
	const lastRun = reportQ.data?.lastRun ?? null
	const mailEnabled = reportQ.data?.mailEnabled ?? false

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow={t('settings.connectivity.eyebrow')}
				title={t('settings.connectivity.title')}
				titleAccent={t('settings.connectivity.title-accent')}
				sub={t('settings.connectivity.sub')}
			/>

			{/* Run check now + last-run */}
			<div className='flex flex-wrap items-center gap-4'>
				<Button variant='primary' onClick={() => runM.mutate()} disabled={runM.isPending}>
					{runM.isPending ? (
						<span className='flex items-center gap-2'>
							<Loader2 className='h-4 w-4 animate-spin' />
							{t('settings.connectivity.checking')}
						</span>
					) : (
						t('settings.connectivity.check-now')
					)}
				</Button>
				<span className='text-[12px] text-[color:var(--fg-faint)]'>
					{lastRun
						? t('settings.connectivity.last-run', {time: new Date(lastRun).toLocaleString()})
						: t('settings.connectivity.never-run')}
				</span>
			</div>

			{/* ── Checks ── */}
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('settings.connectivity.checks-title')}
				</span>

				{reportQ.isLoading ? (
					<FieldCard>
						<div className='flex items-center justify-center py-8 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					</FieldCard>
				) : checks.length === 0 ? (
					<FieldCard>
						<div className='px-5 py-8 text-center text-[13px] text-[color:var(--fg-faint)]'>
							{t('settings.connectivity.no-checks')}
						</div>
					</FieldCard>
				) : (
					<FieldCard>
						{checks.map((check) => (
							<div key={check.id} className='flex items-start justify-between gap-4 px-5 py-4'>
								<div className='flex min-w-0 flex-col gap-1.5'>
									<div className='flex items-center gap-2'>
										<StatusBadge status={check.status} />
										<span className='text-[14px] text-[color:var(--fg)]'>
											{t('settings.connectivity.category-' + check.category)}
										</span>
										<span className='font-mono text-[11px] text-[color:var(--fg-faint)]'>{check.id}</span>
									</div>
									<p className='text-[13px] leading-[1.5] text-[color:var(--fg-mute)]'>{check.detail}</p>
									{check.status !== 'pass' && (
										<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
											{t('settings.connectivity.remedy-' + check.category)}
										</p>
									)}
								</div>
								{/* Mute toggle — an ignored check still runs + scores but never alerts. */}
								<label className='flex shrink-0 items-center gap-2 self-center'>
									<span className='text-[12px] text-[color:var(--fg-faint)]'>
										{t('settings.connectivity.mute')}
									</span>
									<Switch
										checked={ignore.has(check.id)}
										onCheckedChange={(next) => ignoreM.mutate({id: check.id, ignored: next})}
										disabled={ignoreM.isPending}
									/>
								</label>
							</div>
						))}
					</FieldCard>
				)}
			</section>

			{/* ── Mail deliverability opt-in ── */}
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('settings.connectivity.mail-title')}
				</span>
				<FieldCard>
					<div className='flex items-center justify-between gap-4 px-5 py-4'>
						<p className='text-[13px] leading-[1.5] text-[color:var(--fg-mute)]'>
							{t('settings.connectivity.mail-description')}
						</p>
						<Switch
							checked={mailEnabled}
							onCheckedChange={(next) => mailM.mutate({enabled: next})}
							disabled={mailM.isPending}
						/>
					</div>
				</FieldCard>
			</section>

			{/* ── Honesty note ── */}
			<div className='flex flex-col gap-2 border-t border-line pt-6'>
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
					{t('settings.connectivity.note')}
				</p>
			</div>
		</div>
	)
}
