import {Loader2} from 'lucide-react'

import {FieldCard} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 328-05 (SEC-02) — Settings → Security Advisor.
//
// Admin-only section (mounted with adminOnly:true in settings-content.tsx). It
// surfaces the visible half of SEC-02:
//   1. Weak-configuration findings from securityAdvisor.getAdvisorReport — each
//      carries a stable `id`, a `severity`, a boolean `detected`, and a fixed
//      remediation i18n KEY (never free host text — T-328-16). Rendered as a
//      severity badge + a human title + the localized remediation + a "Fix"
//      link to the relevant settings; a green pass badge when NOT detected.
//   2. Per-image Trivy CVE counts (C/H/M/L), with a "Not yet scanned" state for
//      images the weekly scan has not cached yet.
//   3. A "Run scan now" button (runAdvisorScanNow mutation → refetch) plus two
//      standing honesty notes: Trivy = container CVEs only, and password
//      strength cannot be audited retroactively (bcrypt one-way).
//
// The whole surface + both procedures are adminProcedure server-side (Plan 02);
// the UI adminOnly gate is convenience only. Cloned from monitoring-section.tsx
// (SettingsPageHeader shell + useQuery/useMutation + Loader2 states).
// ─────────────────────────────────────────────────────────────────────────────

// The backend types `images` as `unknown[]` (routes.ts), so we narrow it to this
// local discriminated union at the render boundary.
type AdvisorImage =
	| {imageRef: string; counts: {CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number}; scannedAt: number; scanned: true}
	| {imageRef: string; scanned: false}
	| {imageRef: string; error: string}

function SeverityBadge({severity, detected}: {severity: 'critical' | 'warning' | 'info'; detected: boolean}) {
	const cls = !detected
		? 'border-green-500/40 bg-green-500/10 text-green-400'
		: severity === 'critical'
			? 'border-red-500/40 bg-red-500/10 text-red-400'
			: severity === 'warning'
				? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
				: 'border-blue-500/40 bg-blue-500/10 text-blue-400'
	const label = detected
		? t('settings.security-advisor.severity-' + severity)
		: t('settings.security-advisor.pass')
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
				cls,
			)}
		>
			{label}
		</span>
	)
}

export function SecurityAdvisorSection() {
	const reportQ = trpcReact.securityAdvisor.getAdvisorReport.useQuery(undefined, {staleTime: 30_000})
	const scanM = trpcReact.securityAdvisor.runAdvisorScanNow.useMutation({
		onSuccess: () => reportQ.refetch(),
	})

	const weakConfig = reportQ.data?.weakConfig ?? []
	const images = (reportQ.data?.images ?? []) as AdvisorImage[]

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow={t('settings.security-advisor.eyebrow')}
				title={t('settings.security-advisor.title')}
				titleAccent={t('settings.security-advisor.title-accent')}
				sub={t('settings.security-advisor.sub')}
			/>

			{/* Run scan now */}
			<div className='flex items-center gap-3'>
				<Button variant='primary' onClick={() => scanM.mutate()} disabled={scanM.isPending}>
					{scanM.isPending ? (
						<span className='flex items-center gap-2'>
							<Loader2 className='h-4 w-4 animate-spin' />
							{t('settings.security-advisor.scanning')}
						</span>
					) : (
						t('settings.security-advisor.scan-now')
					)}
				</Button>
			</div>

			{/* ── Configuration checks ── */}
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('settings.security-advisor.findings-title')}
				</span>

				{reportQ.isLoading ? (
					<FieldCard>
						<div className='flex items-center justify-center py-8 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					</FieldCard>
				) : weakConfig.length === 0 ? (
					<FieldCard>
						<div className='px-5 py-8 text-center text-[13px] text-[color:var(--fg-faint)]'>
							{t('settings.security-advisor.no-findings')}
						</div>
					</FieldCard>
				) : (
					<FieldCard>
						{weakConfig.map((finding) => (
							<div key={finding.id} className='flex items-start justify-between gap-4 px-5 py-4'>
								<div className='flex min-w-0 flex-col gap-1.5'>
									<div className='flex items-center gap-2'>
										<SeverityBadge severity={finding.severity} detected={finding.detected} />
										<span className='text-[14px] text-[color:var(--fg)]'>
											{t('settings.security-advisor.check.' + finding.id)}
										</span>
									</div>
									{finding.detected && (
										<p className='text-[13px] leading-[1.5] text-[color:var(--fg-mute)]'>
											{t(finding.remediation)}
										</p>
									)}
								</div>
								{finding.detected && finding.settingsLink && (
									<a
										href={finding.settingsLink}
										className='shrink-0 self-center rounded-full border border-line px-3 py-1 text-[12px] font-medium text-[color:var(--fg-mute)] transition-colors hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
									>
										{t('settings.security-advisor.fix')}
									</a>
								)}
							</div>
						))}
					</FieldCard>
				)}
			</section>

			{/* ── Image vulnerabilities ── */}
			<section className='flex flex-col gap-3'>
				<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
					{t('settings.security-advisor.images-title')}
				</span>

				{reportQ.isLoading ? (
					<FieldCard>
						<div className='flex items-center justify-center py-8 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					</FieldCard>
				) : images.length === 0 ? (
					<FieldCard>
						<div className='px-5 py-8 text-center text-[13px] text-[color:var(--fg-faint)]'>
							{t('settings.security-advisor.not-scanned')}
						</div>
					</FieldCard>
				) : (
					<FieldCard>
						{images.map((entry) => (
							<div
								key={entry.imageRef}
								className='flex items-center justify-between gap-4 px-5 py-3'
							>
								<span className='min-w-0 truncate font-mono text-[12px] text-[color:var(--fg-mute)]'>
									{entry.imageRef}
								</span>
								{'counts' in entry && entry.counts ? (
									<span className='shrink-0 font-mono text-[13px]'>
										<span className='text-red-400'>C:{entry.counts.CRITICAL}</span>{' '}
										<span className='text-amber-400'>H:{entry.counts.HIGH}</span>{' '}
										<span className='text-blue-400'>M:{entry.counts.MEDIUM}</span>{' '}
										<span className='text-[color:var(--fg-faint)]'>L:{entry.counts.LOW}</span>
									</span>
								) : 'error' in entry ? (
									<span className='shrink-0 text-[13px] text-destructive2'>{String(entry.error)}</span>
								) : (
									<span className='shrink-0 text-[13px] text-[color:var(--fg-faint)]'>
										{t('settings.security-advisor.not-scanned')}
									</span>
								)}
							</div>
						))}
					</FieldCard>
				)}
			</section>

			{/* ── Honesty notes ── */}
			<div className='flex flex-col gap-2 border-t border-line pt-6'>
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
					{t('settings.security-advisor.trivy-note')}
				</p>
				<p className='text-[12px] leading-[1.5] text-[color:var(--fg-faint)]'>
					{t(reportQ.data?.weakPasswordNote ?? 'settings.security-advisor.note.weak-password-not-retroactive')}
				</p>
			</div>
		</div>
	)
}
