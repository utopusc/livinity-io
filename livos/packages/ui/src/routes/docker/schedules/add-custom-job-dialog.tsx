// Phase 329-08 APPS-04 (D-12/D-13/D-15/D-26) — Add Custom Job dialog.
// Cloned from add-backup-dialog.tsx (shadcn Dialog/Input/Label form + a
// `trpcReact.scheduler.upsertJob` mutation). Collects command + args[] +
// timeoutSec + workingDir + cron for a `type:'custom-command'` job.
//
// Locked behaviours:
//   - LIVE cronstrue human-readable preview as the cron field changes, and the
//     Save button is BLOCKED while the cron is empty / un-parseable (D-15). The
//     server re-validates with cron-parser strict (329-01) — this client preview
//     is convenience only, never the authority (T-329-23).
//   - Secrets-convention help copy: command/args must reference env-var NAMES,
//     never literal secret values (D-13).
//   - timeoutSec default 300 / hard-capped 3600 (D-12), matching the server zod.
//   - Every string comes from t('custom-job.*') with EN+TR parity (D-26).

import {useEffect, useMemo, useState} from 'react'
import cronstrue from 'cronstrue'
import {TbLoader2, TbPlus, TbTrash} from 'react-icons/tb'
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
import {trpcReact} from '@/trpc/trpc'
import {t} from '@/utils/i18n'

const DEFAULT_TIMEOUT = 300
const MAX_TIMEOUT = 3600

// Derive a live human-readable cron preview. Returns {ok:true, text} for a
// parseable expression or {ok:false} otherwise, so the caller can both render
// the preview line AND gate the Save button off the same single evaluation.
function previewCron(expr: string): {ok: true; text: string} | {ok: false} {
	const trimmed = expr.trim()
	if (!trimmed) return {ok: false}
	try {
		return {ok: true, text: cronstrue.toString(trimmed, {throwExceptionOnParseError: true})}
	} catch {
		return {ok: false}
	}
}

export function AddCustomJobDialog({
	open,
	onOpenChange,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSaved: () => void
}) {
	const [name, setName] = useState('')
	const [command, setCommand] = useState('')
	const [args, setArgs] = useState<string[]>([])
	const [timeoutSec, setTimeoutSec] = useState<number>(DEFAULT_TIMEOUT)
	const [workingDir, setWorkingDir] = useState('')
	const [schedule, setSchedule] = useState('0 3 * * *')

	// Reset form whenever the dialog closes so reopening starts clean.
	useEffect(() => {
		if (!open) {
			setName('')
			setCommand('')
			setArgs([])
			setTimeoutSec(DEFAULT_TIMEOUT)
			setWorkingDir('')
			setSchedule('0 3 * * *')
		}
	}, [open])

	// LIVE cron preview + validity, recomputed on every schedule change (D-15).
	const cron = useMemo(() => previewCron(schedule), [schedule])

	const upsertMut = trpcReact.scheduler.upsertJob.useMutation({
		onSuccess: () => {
			toast.success(t('custom-job.saved'))
			onSaved()
		},
		onError: (err) => toast.error(err.message),
	})

	const addArg = () => setArgs((prev) => [...prev, ''])
	const removeArg = (i: number) => setArgs((prev) => prev.filter((_, idx) => idx !== i))
	const setArg = (i: number, v: string) => setArgs((prev) => prev.map((a, idx) => (idx === i ? v : a)))

	const onSave = () => {
		if (!name.trim()) return toast.error(t('custom-job.name-required'))
		if (!command.trim()) return toast.error(t('custom-job.command-required'))
		if (!cron.ok) return toast.error(t('custom-job.cron-invalid'))
		const cappedTimeout = Math.min(Math.max(1, Math.floor(timeoutSec) || DEFAULT_TIMEOUT), MAX_TIMEOUT)
		upsertMut.mutate({
			name: name.trim(),
			schedule: schedule.trim(),
			type: 'custom-command',
			config: {
				command: command.trim(),
				// Drop trailing empty arg rows; keep intentional interior blanks out too.
				args: args.map((a) => a).filter((a) => a.length > 0),
				timeoutSec: cappedTimeout,
				...(workingDir.trim() ? {workingDir: workingDir.trim()} : {}),
			},
			enabled: true,
		})
	}

	const isSaving = upsertMut.isPending

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>{t('custom-job.title')}</DialogTitle>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					{/* Name */}
					<div className='space-y-1.5'>
						<Label htmlFor='cj-name'>{t('custom-job.name')}</Label>
						<Input
							id='cj-name'
							placeholder={t('custom-job.name-placeholder')}
							value={name}
							onValueChange={setName}
						/>
					</div>

					{/* Command */}
					<div className='space-y-1.5'>
						<Label htmlFor='cj-command'>{t('custom-job.command')}</Label>
						<Input
							id='cj-command'
							placeholder={t('custom-job.command-placeholder')}
							value={command}
							onValueChange={setCommand}
						/>
						<div className='text-caption-sm text-text-tertiary'>{t('custom-job.command-help')}</div>
					</div>

					{/* Args */}
					<div className='space-y-1.5'>
						<Label>{t('custom-job.args')}</Label>
						{args.length === 0 ? (
							<div className='text-caption-sm text-text-tertiary'>{t('custom-job.args-empty')}</div>
						) : (
							<div className='space-y-2'>
								{args.map((a, i) => (
									<div key={i} className='flex items-center gap-2'>
										<Input
											placeholder={t('custom-job.arg-placeholder')}
											value={a}
											onValueChange={(v) => setArg(i, v)}
										/>
										<Button
											variant='secondary'
											size='sm'
											className='h-9 shrink-0'
											onClick={() => removeArg(i)}
											aria-label={t('custom-job.remove-arg')}
										>
											<TbTrash className='h-4 w-4' />
										</Button>
									</div>
								))}
							</div>
						)}
						<Button variant='secondary' size='sm' className='h-9' onClick={addArg}>
							<TbPlus className='h-4 w-4' />
							{t('custom-job.add-arg')}
						</Button>
					</div>

					{/* Timeout */}
					<div className='space-y-1.5'>
						<Label htmlFor='cj-timeout'>{t('custom-job.timeout')}</Label>
						<Input
							id='cj-timeout'
							type='number'
							value={String(timeoutSec)}
							onValueChange={(v) => setTimeoutSec(parseInt(v, 10) || DEFAULT_TIMEOUT)}
						/>
						<div className='text-caption-sm text-text-tertiary'>{t('custom-job.timeout-help')}</div>
					</div>

					{/* Working directory (optional) */}
					<div className='space-y-1.5'>
						<Label htmlFor='cj-workdir'>{t('custom-job.working-dir')}</Label>
						<Input
							id='cj-workdir'
							placeholder={t('custom-job.working-dir-placeholder')}
							value={workingDir}
							onValueChange={setWorkingDir}
						/>
					</div>

					{/* Schedule + live cronstrue preview */}
					<div className='space-y-1.5'>
						<Label htmlFor='cj-cron'>{t('custom-job.schedule')}</Label>
						<Input
							id='cj-cron'
							placeholder={t('custom-job.schedule-placeholder')}
							value={schedule}
							onValueChange={setSchedule}
						/>
						{cron.ok ? (
							<div className='text-caption-sm text-emerald-500'>
								{t('custom-job.cron-preview', {text: cron.text})}
							</div>
						) : (
							<div className='text-caption-sm text-accent-red'>{t('custom-job.cron-invalid')}</div>
						)}
					</div>
				</div>

				<DialogFooter className='gap-2'>
					<Button variant='primary' onClick={onSave} disabled={isSaving || !cron.ok}>
						{isSaving && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						{t('custom-job.save')}
					</Button>
					<Button variant='secondary' onClick={() => onOpenChange(false)} disabled={isSaving}>
						{t('custom-job.cancel')}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
