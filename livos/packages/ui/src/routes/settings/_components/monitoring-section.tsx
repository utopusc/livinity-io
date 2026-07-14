import {Loader2} from 'lucide-react'
import {useEffect, useState} from 'react'

import {FieldCard, FieldCardInput, FieldRow} from '@/components/field-card'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {Button} from '@/shadcn-components/ui/button'
import {Tabs, TabsList, TabsTrigger} from '@/shadcn-components/ui/tabs'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

import {ResourceHistoryChart} from './resource-history-chart'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 320-05 (MON-01 / MON-02) — Settings → Monitoring.
//
// Admin-only section (mounted with adminOnly:true in settings-content.tsx, per
// D-320-3). Two blocks:
//  1. A timeframe-selector resource-history chart. The Tabs value (one of the
//     four D-320-2 presets 1h/24h/7d/30d — never a custom range) drives the
//     history query for that range; the server-persisted series is handed to
//     <ResourceHistoryChart> (props-in, no client polling).
//  2. An editable alert-threshold form bound to monitoring.thresholds.get, saved
//     through monitoring.thresholds.set. The number inputs carry client-side
//     min/max that MIRROR the server zod bounds (pct 1-100, restart 1-50) as a
//     UX affordance only — the server zod remains the authoritative validator
//     (see 320-04); a crafted out-of-range request is still rejected server-side.
// Cloned from alert-channels-section.tsx (SettingsPageHeader shell + FieldCard
// form + Loader2 loading/empty states).
// ─────────────────────────────────────────────────────────────────────────────

type Range = '1h' | '24h' | '7d' | '30d'

const RANGES: {value: Range; labelKey: string}[] = [
	{value: '1h', labelKey: 'settings.monitoring.range-1h'},
	{value: '24h', labelKey: 'settings.monitoring.range-24h'},
	{value: '7d', labelKey: 'settings.monitoring.range-7d'},
	{value: '30d', labelKey: 'settings.monitoring.range-30d'},
]

type ThresholdForm = {
	containerMemoryWarningPct: number
	containerMemoryCriticalPct: number
	containerRestartLoopCount: number
}

export function MonitoringSection() {
	// ── History block ──────────────────────────────────────────────────────
	const [range, setRange] = useState<Range>('24h')
	const historyQ = trpcReact.monitoring.history.list.useQuery({range})
	const points = historyQ.data ?? []

	// ── Threshold block ────────────────────────────────────────────────────
	const thresholdsQ = trpcReact.monitoring.thresholds.get.useQuery()
	const setM = trpcReact.monitoring.thresholds.set.useMutation({
		onSuccess: () => thresholdsQ.refetch(),
	})

	const [form, setForm] = useState<ThresholdForm | null>(null)

	// Seed the local form once the server thresholds arrive (and re-seed after a
	// successful save's refetch, keeping the inputs authoritative).
	useEffect(() => {
		if (thresholdsQ.data) {
			setForm({
				containerMemoryWarningPct: thresholdsQ.data.containerMemoryWarningPct,
				containerMemoryCriticalPct: thresholdsQ.data.containerMemoryCriticalPct,
				containerRestartLoopCount: thresholdsQ.data.containerRestartLoopCount,
			})
		}
	}, [thresholdsQ.data])

	function updateField(key: keyof ThresholdForm, raw: string) {
		const n = Number(raw)
		setForm((f) => (f ? {...f, [key]: Number.isFinite(n) ? n : 0} : f))
	}

	function handleSave() {
		if (!form) return
		setM.mutate(form)
	}

	return (
		<div className='flex flex-col gap-8'>
			<SettingsPageHeader
				eyebrow={t('settings.monitoring.eyebrow')}
				title={t('settings.monitoring.title')}
				titleAccent={t('settings.monitoring.title-accent')}
				sub={t('settings.monitoring.sub')}
			/>

			{/* ── Resource history ── */}
			<section className='flex flex-col gap-3'>
				<div className='flex flex-wrap items-baseline justify-between gap-2'>
					<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
						{t('settings.monitoring.history-title')}
					</span>
					<Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
						<TabsList className='w-max justify-start gap-1 bg-transparent p-0'>
							{RANGES.map((r) => (
								<TabsTrigger key={r.value} value={r.value}>
									{t(r.labelKey)}
								</TabsTrigger>
							))}
						</TabsList>
					</Tabs>
				</div>

				<FieldCard>
					{historyQ.isLoading ? (
						<div className='flex items-center justify-center py-16 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					) : points.length === 0 ? (
						<div className='px-5 py-16 text-center text-[13px] text-[color:var(--fg-faint)]'>
							{t('settings.monitoring.empty')}
						</div>
					) : (
						<div className='p-4'>
							<ResourceHistoryChart data={points} />
						</div>
					)}
				</FieldCard>
			</section>

			{/* ── Alert thresholds ── */}
			<section className='flex flex-col gap-3'>
				<div className='flex flex-col gap-1'>
					<span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--fg-faint)]'>
						{t('settings.monitoring.thresholds-title')}
					</span>
					<span className='text-[13px] text-[color:var(--fg-faint)]'>{t('settings.monitoring.thresholds-sub')}</span>
				</div>

				{thresholdsQ.isLoading || !form ? (
					<FieldCard>
						<div className='flex items-center justify-center py-8 text-[color:var(--fg-faint)]'>
							<Loader2 className='size-4 animate-spin' />
						</div>
					</FieldCard>
				) : (
					<>
						<FieldCard>
							<FieldRow
								label={t('settings.monitoring.threshold-mem-warning')}
								value={
									<FieldCardInput
										type='number'
										min={1}
										max={100}
										value={form.containerMemoryWarningPct}
										onChange={(e) => updateField('containerMemoryWarningPct', e.target.value)}
									/>
								}
							/>
							<FieldRow
								label={t('settings.monitoring.threshold-mem-critical')}
								value={
									<FieldCardInput
										type='number'
										min={1}
										max={100}
										value={form.containerMemoryCriticalPct}
										onChange={(e) => updateField('containerMemoryCriticalPct', e.target.value)}
									/>
								}
							/>
							<FieldRow
								label={t('settings.monitoring.threshold-restart-loop')}
								value={
									<FieldCardInput
										type='number'
										min={1}
										max={50}
										value={form.containerRestartLoopCount}
										onChange={(e) => updateField('containerRestartLoopCount', e.target.value)}
									/>
								}
							/>
						</FieldCard>

						<div className='flex items-center gap-3'>
							<Button variant='primary' disabled={setM.isPending} onClick={handleSave}>
								{setM.isPending ? <Loader2 className='h-4 w-4 animate-spin' /> : t('settings.monitoring.save')}
							</Button>
							{setM.isSuccess && (
								<span className='text-[13px] text-green-400'>{t('settings.monitoring.saved')}</span>
							)}
							{setM.isError && (
								<span className='text-[13px] text-[color:var(--red,#dc2626)]'>{t('settings.monitoring.error')}</span>
							)}
						</div>
					</>
				)}
			</section>
		</div>
	)
}
