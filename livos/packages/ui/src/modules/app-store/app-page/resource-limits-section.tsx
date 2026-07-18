import {useState} from 'react'
import {TbGauge, TbLoader2} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Input} from '@/shadcn-components/ui/input'
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

interface ResourceLimitsSectionProps {
	appId: string
	appName: string
	/** Persisted per-app CPU-core limit (`app.cpuLimit`) — decimal cores, or undefined for no limit. */
	initialCpuLimit?: number
	/** Persisted per-app memory limit in BYTES (`app.memoryLimit`) — or undefined for no limit. */
	initialMemoryLimit?: number
	/** Persisted per-app cpuset pin (`app.cpuSet`) — e.g. "0-2,4", or undefined for no pinning. */
	initialCpuSet?: string
}

/**
 * Phase 326-04 (APPS-03 UI half) — per-app CPU + memory limits section.
 *
 * Clone of gpu-access-section.tsx with the container-create-form field UX: a CPU
 * (decimal cores) Input + a Memory (MB) Input + a Save button. Persists through
 * `apps.setResourceLimits` (adminProcedure, T-326-15) — non-admins see the fields
 * but Save is disabled. Empty fields clear the limit (send undefined). The server
 * applies limits via patchComposeFile + restart (never a live-container update,
 * T-326-16), so the app restarts to apply — surfaced in the caption.
 *
 * Unit conversion mirrors container-create-form.tsx: MB input -> bytes
 * (`Math.round(x * 1024 * 1024)`); CPU input -> decimal cores (`parseFloat`).
 *
 * All copy flows through `t('app-resource-limits.*')` against public/locales/{en,tr}.json.
 */
export function ResourceLimitsSection({appId, appName, initialCpuLimit, initialMemoryLimit, initialCpuSet}: ResourceLimitsSectionProps) {
	const utils = trpcReact.useUtils()
	const {isAdmin} = useCurrentUser()

	const [cpuLimit, setCpuLimit] = useState(initialCpuLimit != null ? String(initialCpuLimit) : '')
	const [memoryLimitMB, setMemoryLimitMB] = useState(
		initialMemoryLimit != null ? String(Math.round(initialMemoryLimit / 1024 / 1024)) : '',
	)
	// 342-02 APPD-02 (D-342-5): per-app CPU-core pinning (`cpuset`). Empty = no pinning.
	const [cpuSet, setCpuSet] = useState(initialCpuSet ?? '')

	// 326-review (WR-02): Docker refuses a memory limit below 6 MB and the app is
	// then stuck stopped (the bad limit re-applies on every patchComposeFile). Reject
	// a positive-but-below-6-MB value inline before firing the mutation. Empty / <=0
	// still means "no limit" (cleared), so only a positive < 6 is invalid.
	const memoryMBNum = parseFloat(memoryLimitMB)
	const memoryBelowMin = memoryLimitMB.trim() !== '' && Number.isFinite(memoryMBNum) && memoryMBNum > 0 && memoryMBNum < 6

	// 342-02 APPD-02 (T-342-05): FORMAT mirror of the server route regex — the SEMANTIC
	// core-count guard stays server-side (validateCpuSet, os.cpus().length). Empty = cleared.
	const cpuSetInvalid = cpuSet.trim() !== '' && !/^\d{1,3}(-\d{1,3})?(,\d{1,3}(-\d{1,3})?)*$/.test(cpuSet.trim())

	const setResourceLimitsMut = trpcReact.apps.setResourceLimits.useMutation({
		onSuccess: () => {
			utils.apps.state.invalidate({appId})
			utils.apps.list.invalidate()
		},
	})

	const handleSave = () => {
		// 326-review (WR-02): never send a below-6-MB limit — Docker would brick the app.
		if (memoryBelowMin) return
		// 342-02 APPD-02: never send a malformed cpuset — the format mirror blocks it.
		if (cpuSetInvalid) return
		// Empty / non-positive fields CLEAR the limit (send undefined). Convert MB->bytes
		// and CPU->decimal cores exactly like container-create-form.tsx.
		const cpu = cpuLimit.trim() && parseFloat(cpuLimit) > 0 ? parseFloat(cpuLimit) : undefined
		const mem =
			memoryLimitMB.trim() && parseFloat(memoryLimitMB) > 0
				? Math.round(parseFloat(memoryLimitMB) * 1024 * 1024)
				: undefined
		setResourceLimitsMut.mutate({appId, cpuLimit: cpu, memoryLimit: mem, cpuSet: cpuSet.trim() || undefined})
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center gap-2'>
				<TbGauge className='h-5 w-5 text-text-primary' />
				<span className='text-body-sm font-medium text-text-primary'>{t('app-resource-limits.title')}</span>
			</div>

			<p className='text-caption text-text-tertiary'>{t('app-resource-limits.description', {app: appName})}</p>

			<div className='space-y-3'>
				<div>
					<label className='mb-1.5 block px-[5px] text-caption -tracking-2 text-text-secondary'>
						{t('app-resource-limits.cpu-label')}
					</label>
					<Input
						type='text'
						inputMode='decimal'
						value={cpuLimit}
						onValueChange={setCpuLimit}
						placeholder={t('app-resource-limits.cpu-placeholder')}
						disabled={!isAdmin || setResourceLimitsMut.isPending}
					/>
				</div>
				<div>
					<label className='mb-1.5 block px-[5px] text-caption -tracking-2 text-text-secondary'>
						{t('app-resource-limits.memory-label')}
					</label>
					<Input
						type='text'
						inputMode='numeric'
						min={6}
						value={memoryLimitMB}
						onValueChange={setMemoryLimitMB}
						placeholder={t('app-resource-limits.memory-placeholder')}
						disabled={!isAdmin || setResourceLimitsMut.isPending}
						aria-invalid={memoryBelowMin || undefined}
					/>
					{/* 326-review (WR-02): inline validation — Docker's 6 MB floor. */}
					{memoryBelowMin ? (
						<p role='alert' className='mt-1.5 px-[5px] text-caption text-red-400'>
							{t('app-resource-limits.memory-min-error')}
						</p>
					) : null}
				</div>
				{/* 342-02 APPD-02 (D-342-5): CPU-core pinning (`cpuset`). Format-validated inline;
				    server enforces the semantic core-count guard. Empty clears the pin. */}
				<div>
					<label className='mb-1.5 block px-[5px] text-caption -tracking-2 text-text-secondary'>
						{t('app-resource-limits.cpuset-label')}
					</label>
					<Input
						type='text'
						inputMode='text'
						value={cpuSet}
						onValueChange={setCpuSet}
						placeholder={t('app-resource-limits.cpuset-placeholder')}
						disabled={!isAdmin || setResourceLimitsMut.isPending}
						aria-invalid={cpuSetInvalid || undefined}
					/>
					<p className='mt-1.5 px-[5px] text-caption text-text-tertiary'>{t('app-resource-limits.cpuset-help')}</p>
					{cpuSetInvalid ? (
						<p role='alert' className='mt-1.5 px-[5px] text-caption text-red-400'>
							{t('app-resource-limits.cpuset-format-error')}
						</p>
					) : null}
				</div>
			</div>

			{/* T-326-16 — limits apply via compose recreation, so the app restarts to apply. */}
			<p className='text-caption text-text-tertiary'>{t('app-resource-limits.restart-note')}</p>

			{/* WR-02 mirror — setResourceLimits is admin-only (host resource contention). */}
			{!isAdmin ? <p className='text-caption text-text-tertiary'>{t('app-resource-limits.admin-only')}</p> : null}

			<div className='flex items-center gap-3'>
				<Button
					size='sm'
					variant='default'
					onClick={handleSave}
					disabled={!isAdmin || setResourceLimitsMut.isPending || memoryBelowMin || cpuSetInvalid}
				>
					{setResourceLimitsMut.isPending ? <TbLoader2 className='mr-1 h-4 w-4 animate-spin' /> : null}
					{t('app-resource-limits.save')}
				</Button>
			</div>

			{setResourceLimitsMut.isError ? (
				<p role='alert' className='text-caption text-red-400'>
					{setResourceLimitsMut.error?.message ?? 'Failed to save resource limits — try again.'}
				</p>
			) : null}
		</div>
	)
}
