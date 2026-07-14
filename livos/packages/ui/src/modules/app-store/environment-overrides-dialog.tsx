import {useState} from 'react'
import {TbAlertTriangle, TbInfoCircle} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/shadcn-components/ui/dialog'
import {Input, PasswordInput} from '@/shadcn-components/ui/input'
import {Switch} from '@/shadcn-components/ui/switch'
import {t} from '@/utils/i18n'

type EnvironmentOverride = {
	name: string
	label: string
	type: 'string' | 'password'
	default?: string
	required?: boolean
}

// Phase 330 (GPU-05) — the detectGpu vendor union the host bridge reads and
// threads into this dialog (mirrors GpuVendor in system/gpu.ts).
type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'unknown' | 'none' | null

export function EnvironmentOverridesDialog({
	open,
	onOpenChange,
	appName,
	overrides,
	onNext,
	// Phase 330 (GPU-05) — host-supplied GPU context. When the installed app is
	// gpu-capable AND a GPU is present, the popup renders a default-OFF "Use GPU"
	// Switch (opt-in). All of this is host-tier (Pitfall 5): the store iframe
	// never sees or supplies any of it.
	gpuCapable,
	gpuVendor,
	gpuWsl2,
	otherGpuApps,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	appName: string
	overrides: EnvironmentOverride[]
	// FLAG 1 — a single optional boolean sibling folds the GPU choice back to
	// handleInstall (do NOT redesign the resolve contract).
	onNext: (values: Record<string, string>, gpuAccess?: boolean) => void
	gpuCapable?: boolean
	gpuVendor?: GpuVendor
	gpuWsl2?: boolean
	otherGpuApps?: string[]
}) {
	const [values, setValues] = useState<Record<string, string>>(() => {
		const initial: Record<string, string> = {}
		for (const override of overrides) {
			initial[override.name] = override.default ?? ''
		}
		return initial
	})

	// Default OFF — GPU access is opt-in (GPU-05 D-2).
	const [gpuOn, setGpuOn] = useState(false)

	// WR-02: only show the toggle for vendors patchComposeFile actually acts on —
	// NVIDIA and (bare-metal) AMD. Previously `!== 'none'` let vendor:'unknown'
	// (the WSL2-paravirtualized-but-undeterminable case) render a dead-end toggle:
	// there is no 'unknown' compose branch and WSL2 lacks /dev/dri for compute, so
	// turning it on silently did nothing. AMD-on-WSL2 still passes this gate and is
	// disabled with a note below (amdWsl2Blocked).
	const showGpuToggle = gpuCapable === true && (gpuVendor === 'nvidia' || gpuVendor === 'amd')
	// AMD-on-WSL2: ROCm passthrough is unavailable in WSL2 (no /dev/kfd) — render
	// the toggle DISABLED with an explanatory note (FLAG 2, never wire it up).
	const amdWsl2Blocked = gpuVendor === 'amd' && gpuWsl2 === true
	const vendorLabel =
		gpuVendor === 'nvidia' ? 'NVIDIA' : gpuVendor === 'amd' ? 'AMD' : gpuVendor === 'intel' ? 'Intel' : ''
	// Collapse the double space when vendor is unknown (label falls back to "Use GPU").
	const gpuToggleLabel = t('gpu-access.use-gpu-toggle', {vendor: vendorLabel}).replace(/\s{2,}/g, ' ').trim()

	const allRequiredFilled = overrides.every(
		(o) => !o.required || (values[o.name] && values[o.name].trim().length > 0),
	)

	const handleSubmit = () => {
		// Only include non-empty values
		const result: Record<string, string> = {}
		for (const [key, value] of Object.entries(values)) {
			if (value.trim()) result[key] = value.trim()
		}
		// Fold the GPU choice into the return value alongside the env values — a
		// single optional boolean sibling (FLAG 1). Undefined when no toggle shown.
		onNext(result, showGpuToggle ? gpuOn : undefined)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Configure {appName}</DialogTitle>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					{overrides.map((override) => (
						<div key={override.name}>
							<label className='mb-1.5 block px-[5px] text-caption -tracking-2 text-text-secondary'>
								{override.label}
								{override.required && <span className='text-destructive2-lightest'> *</span>}
							</label>
							{override.type === 'password' ? (
								<PasswordInput
									value={values[override.name]}
									onValueChange={(v) => setValues((prev) => ({...prev, [override.name]: v}))}
									label={override.label}
									sizeVariant='default'
								/>
							) : (
								<Input
									type='text'
									value={values[override.name]}
									onValueChange={(v) => setValues((prev) => ({...prev, [override.name]: v}))}
									placeholder={override.default || override.label}
								/>
							)}
						</div>
					))}
				</div>

				{/* Phase 330 (GPU-05) — vendor-labelled default-OFF Use-GPU toggle. Hidden
				    when no GPU (showGpuToggle gate); disabled with a note on AMD-WSL2; a
				    NON-blocking exclusivity banner when another app already holds the GPU. */}
				{showGpuToggle && (
					<div className='space-y-3 border-t border-white/6 pt-4'>
						<div className='flex items-center justify-between gap-3'>
							<div className='flex flex-col gap-1 px-[5px]'>
								<span className='text-caption -tracking-2 text-text-secondary'>{gpuToggleLabel}</span>
								<span className='text-caption -tracking-2 text-text-tertiary'>{t('gpu-access.use-gpu-desc')}</span>
							</div>
							<Switch checked={gpuOn} onCheckedChange={setGpuOn} disabled={amdWsl2Blocked} />
						</div>

						{amdWsl2Blocked && (
							<div className='flex items-start gap-2 px-[5px]'>
								<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-yellow-400' />
								<p className='text-caption text-text-secondary'>{t('gpu-access.amd-wsl2-note')}</p>
							</div>
						)}

						{otherGpuApps && otherGpuApps.length > 0 && (
							<div className='flex items-start gap-2 px-[5px]'>
								<TbInfoCircle className='mt-0.5 h-4 w-4 shrink-0 text-yellow-400' />
								<p className='text-caption text-text-secondary'>
									{t('gpu-access.exclusivity-warning', {app: otherGpuApps.join(', ')})}
								</p>
							</div>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						variant='primary'
						size='dialog'
						disabled={!allRequiredFilled}
						onClick={handleSubmit}
					>
						Install {appName}
					</Button>
					<Button size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
