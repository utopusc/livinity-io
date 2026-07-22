// Phase 296 — Live Usage compact navbar dropdown.
//
// Replaces the full-screen `?dialog=live-usage` ImmersiveDialog (routes/
// live-usage.tsx) + the standalone `LIVINITY_live-usage` app. The navbar's
// existing Live Usage button (top-bar.tsx) now opens THIS compact panel as a
// Radix Popover that drops down from the bar (operator request).
//
// Three live gauges only (operator chose "compact"): CPU / Memory / Storage —
// label + value + progress + a secondary line. NO per-app breakdown.
//
// Theming: this is OS chrome (NOT inside `.livos-app-light`), so it follows the
// OS theme via the semantic tokens (dark surface + light text in dark theme).
// It deliberately does NOT reuse routes/live-usage.tsx's `UsageCard`, whose
// active state hardcodes a white background (`rgba(255,255,255,1)`) — that was
// the unreadable light-on-light selected card in dark theme.
//
// CPU/Memory poll while mounted; Radix unmounts PopoverContent when closed, so
// there are zero polls while the dropdown is shut. Disk is fetched once on open
// (not polled) — its calculation causes CPU spikes and it barely moves.

import {Cpu, HardDrive, MemoryStick, type LucideIcon} from 'lucide-react'

import {LOADING_DASH} from '@/constants'
import {useCpuForUi} from '@/hooks/use-cpu'
import {useSystemDiskForUi} from '@/hooks/use-disk'
import {useSystemMemoryForUi} from '@/hooks/use-memory'
import {Progress} from '@/shadcn-components/ui/progress'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'

export function Gauge({
	icon: Icon,
	label,
	value,
	valueSub,
	secondary,
	progress = 0,
	warn = false,
}: {
	icon: LucideIcon
	label: string
	value?: string
	valueSub?: string
	secondary?: string
	progress?: number
	warn?: boolean
}) {
	return (
		<div className='flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-1 p-3'>
			<div className='flex items-center justify-between gap-2'>
				<span className='flex items-center gap-1.5 text-13 font-medium -tracking-2 text-text-secondary'>
					<Icon className='h-3.5 w-3.5' />
					{label}
				</span>
				<span className={cn('text-13 font-semibold tabular-nums -tracking-2', warn ? 'text-[#F45A5A]' : 'text-text-primary')}>
					{value ?? LOADING_DASH}
					{valueSub ? <span className='ml-1 font-normal text-text-tertiary'>{valueSub}</span> : null}
				</span>
			</div>
			<Progress value={progress * 100} variant='primary' />
			{secondary ? <span className='text-11 -tracking-2 text-text-tertiary'>{secondary}</span> : null}
		</div>
	)
}

/**
 * The dropdown body. Rendered inside the navbar's Radix PopoverContent
 * (top-bar.tsx), which supplies the glassy themed surface.
 */
export function LiveUsagePanel() {
	const cpu = useCpuForUi({poll: true})
	const memory = useSystemMemoryForUi({poll: true})
	// Disk is intentionally NOT polled (fetched once on open): the disk-usage
	// calculation causes CPU spikes and disk barely moves in real time — same
	// rationale as the original full-screen Live Usage view.
	const disk = useSystemDiskForUi()

	return (
		<div className='flex w-[280px] flex-col gap-2'>
			<div className='px-0.5 pb-0.5 text-12 font-semibold uppercase -tracking-2 text-text-tertiary'>{t('live-usage')}</div>
			<Gauge icon={Cpu} label={t('cpu')} value={cpu.value} secondary={cpu.secondaryValue} progress={cpu.progress} />
			<Gauge
				icon={MemoryStick}
				label={t('memory')}
				value={memory.value}
				valueSub={memory.valueSub}
				secondary={memory.secondaryValue}
				progress={memory.progress}
				warn={memory.isMemoryLow}
			/>
			<Gauge
				icon={HardDrive}
				label={t('storage')}
				value={disk.value}
				valueSub={disk.valueSub}
				secondary={disk.secondaryValue}
				progress={disk.progress}
				warn={disk.isDiskLow || disk.isDiskFull}
			/>
		</div>
	)
}
