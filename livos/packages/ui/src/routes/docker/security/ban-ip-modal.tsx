// Phase 46 Plan 46-04 — BanIpModal (FR-F2B-03 + FR-F2B-05 + pitfalls B-02 / B-03 / B-19).
//
// Two-stage type-confirm gate:
//   Stage 1 (NORMAL ban): IP input + jail Select + 'I'm on cellular' toggle +
//                          dual-IP surface (HTTP X-Forwarded-For + active SSH IPs).
//                          Submit calls onSubmit; backend either succeeds OR
//                          throws TRPCError CONFLICT 'self_ban' on self-ban.
//   Stage 2 (SELF-BAN):    Re-render with destructive copy + type-LOCK-ME-OUT
//                          Input. Confirm button disabled until strict equality
//                          `confirmText === 'LOCK ME OUT'`. Re-calls onSubmit
//                          with confirmation field set so backend re-validates.
//
// Pitfall B-03 (CIDR /0 mass-unban → mass-ban) — defense-in-depth client-side
// Zod regex rejects ALL CIDR notation; only IPv4 dotted-quad accepted. Backend
// also rejects (Plan 03 ipSchema) — this is layer 1, backend is layer 2/3.
//
// Pitfall B-19 (cellular CGNAT false-positive self-ban) — 'I'm on cellular'
// toggle surfaces in Stage 1 and flows to backend as cellularBypass=true,
// which suppresses the self-ban check entirely.

import {useEffect, useState} from 'react'
import {z} from 'zod'

import {Button} from '@/shadcn-components/ui/button'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'

// IPv4 dotted-quad ONLY — explicitly rejects CIDR (/0-/32) per pitfall B-03.
// Mirror of Plan 03 backend `ipSchema` regex (defense in depth — backend is canonical).
const IPV4_REGEX = /^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/

const ipSchema = z
	.string()
	.trim()
	.refine((s) => IPV4_REGEX.test(s), 'IPv4 dotted-quad only — no CIDR allowed (pitfall B-03)')

const LOCK_ME_OUT = 'LOCK ME OUT' as const

export interface BanIpInput {
	jail: string
	ip: string
	// Backend Plan 03 Zod schema: z.literal('LOCK ME OUT').optional() — keep
	// the client-side interface narrow so tRPC's input type matches.
	confirmation?: 'LOCK ME OUT'
	cellularBypass: boolean
}

interface BanIpModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	jails: string[]
	onSubmit: (input: BanIpInput) => Promise<void>
	currentHttpIp?: string | null
	activeSshIps?: string[]
	isCellular: boolean
	setIsCellular: (b: boolean) => void
	isBanning: boolean
	// Phase 48 Plan 48-02 — additive prop: pre-populate the IP input on open
	// (used by SshSessionsTab click-to-ban). Existing callers omit this and
	// fall through to '' exactly as before. No behavior change unless provided.
	initialIp?: string
}

type Stage = 'normal' | 'self-ban'

export function BanIpModal({
	open,
	onOpenChange,
	jails,
	onSubmit,
	currentHttpIp,
	activeSshIps,
	isCellular,
	setIsCellular,
	isBanning,
	initialIp,
}: BanIpModalProps) {
	const [ip, setIp] = useState('')
	const [jail, setJail] = useState<string>(jails[0] ?? '')
	const [stage, setStage] = useState<Stage>('normal')
	const [confirmText, setConfirmText] = useState('')
	const [adminIps, setAdminIps] = useState<string[]>([])
	const [validationError, setValidationError] = useState<string | null>(null)
	const [submitError, setSubmitError] = useState<string | null>(null)

	// Reset state every time the dialog re-opens. Phase 48 Plan 48-02 —
	// honor `initialIp` (set by SshSessionsTab click-to-ban via lifted state)
	// so the IP input pre-populates. Falls back to '' for legacy callers.
	useEffect(() => {
		if (open) {
			setIp(initialIp ?? '')
			setJail(jails[0] ?? '')
			setStage('normal')
			setConfirmText('')
			setAdminIps([])
			setValidationError(null)
			setSubmitError(null)
		}
	}, [open, jails, initialIp])

	// Keep jail selection valid as the available jails change.
	useEffect(() => {
		if (!jail && jails[0]) setJail(jails[0])
	}, [jail, jails])

	async function handleSubmitStage(confirmation?: 'LOCK ME OUT') {
		setSubmitError(null)

		// Pitfall B-03 — Zod client-side IPv4 / CIDR-rejection BEFORE mutation fires.
		const parsed = ipSchema.safeParse(ip)
		if (!parsed.success) {
			setValidationError(parsed.error.issues[0]?.message ?? 'Invalid IP')
			return
		}
		setValidationError(null)
		if (!jail) {
			setValidationError('Select a jail.')
			return
		}

		try {
			await onSubmit({
				jail,
				ip: parsed.data,
				confirmation,
				cellularBypass: isCellular,
			})
			// Success — caller closes the modal via onOpenChange(false).
		} catch (err: any) {
			// Pitfall B-02 — backend signals self-ban via CONFLICT 'self_ban'.
			// Detect and re-render Stage 2 with type-LOCK-ME-OUT gate.
			const code = err?.data?.code
			const msg = typeof err?.message === 'string' ? err.message : ''
			if (code === 'CONFLICT' && msg === 'self_ban') {
				// Plan 03 SUMMARY notes `cause.adminIps` is admin-readable; surface it.
				const causeIps = (err?.data?.cause?.adminIps ?? err?.cause?.adminIps) as string[] | undefined
				setAdminIps(Array.isArray(causeIps) ? causeIps : [])
				setStage('self-ban')
				setConfirmText('')
				return
			}
			setSubmitError(msg || 'Ban failed.')
		}
	}

	const stage1Disabled = isBanning || ip.trim().length === 0 || !jail
	const stage2Disabled = isBanning || confirmText !== LOCK_ME_OUT

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				{stage === 'normal' ? (
					<>
						<DialogHeader>
							<DialogTitle>Ban an IP</DialogTitle>
							<DialogDescription>
								Add an IP to the selected jail's banned list. The IP will be blocked from
								connecting to the matching service until manually unbanned.
							</DialogDescription>
						</DialogHeader>

						<div className='space-y-3 py-2'>
							{/* IP input + Zod-validation feedback */}
							<div>
								<label className='mb-1 block text-caption font-medium text-text-secondary'>
									IP address (IPv4 dotted-quad — no CIDR)
								</label>
								<Input
									value={ip}
									onChange={(e) => setIp(e.target.value)}
									placeholder='1.2.3.4'
									autoComplete='off'
									spellCheck={false}
								/>
								{validationError ? (
									<div className='mt-1 text-caption text-destructive2'>{validationError}</div>
								) : null}
							</div>

							{/* Jail selector */}
							<div>
								<label className='mb-1 block text-caption font-medium text-text-secondary'>Jail</label>
								<Select value={jail} onValueChange={setJail}>
									<SelectTrigger>
										<SelectValue placeholder='Select a jail' />
									</SelectTrigger>
									<SelectContent>
										{jails.map((j) => (
											<SelectItem key={j} value={j}>
												{j}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* FR-F2B-05 — dual-IP surface */}
							<div className='rounded-radius-sm border border-border-default bg-surface-2 px-3 py-2 text-caption text-text-secondary'>
								<div>
									Your HTTP request came from:{' '}
									<span className='font-mono text-text-primary'>{currentHttpIp ?? 'unknown'}</span>
								</div>
								<div>
									Active SSH sessions from:{' '}
									<span className='font-mono text-text-primary'>
										{activeSshIps && activeSshIps.length > 0 ? activeSshIps.join(', ') : '(none)'}
									</span>
								</div>
								{/* v29.4 — IPs surfaced post-detection only (in Stage 2 modal). v30+ may add a
								   `fail2ban.detectAdminIps` query for upfront display. */}
							</div>

							{/* FR-F2B-05 — cellular toggle */}
							<label className='flex cursor-pointer items-start gap-2'>
								<Checkbox
									checked={isCellular}
									onCheckedChange={(checked) => setIsCellular(checked === true)}
								/>
								<span className='text-body-sm text-text-secondary'>
									I'm on cellular (CGNAT — disable self-ban check; pitfall B-19)
								</span>
							</label>

							{submitError ? (
								<div className='rounded-radius-sm border border-destructive2/40 bg-destructive2/10 px-3 py-2 text-caption text-destructive2'>
									{submitError}
								</div>
							) : null}
						</div>

						<DialogFooter>
							<Button variant='default' onClick={() => onOpenChange(false)} disabled={isBanning}>
								Cancel
							</Button>
							<Button
								variant='destructive'
								onClick={() => handleSubmitStage(undefined)}
								disabled={stage1Disabled}
							>
								{isBanning ? 'Banning…' : 'Ban'}
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						{/* Stage 2 — type-LOCK-ME-OUT gate */}
						<DialogHeader>
							<DialogTitle>Confirm self-ban</DialogTitle>
							<DialogDescription>
								WARNING: <span className='font-mono'>{ip}</span> is YOUR CURRENT CONNECTION IP.
								Banning will lock you out.
							</DialogDescription>
						</DialogHeader>

						<div className='space-y-3 py-2'>
							{adminIps.length > 0 ? (
								<div className='rounded-radius-sm border border-amber-200 bg-amber-50 px-3 py-2 text-caption text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
									These IPs were detected as your active sessions:{' '}
									<span className='font-mono'>{adminIps.join(', ')}</span>
								</div>
							) : null}

							<div>
								<label className='mb-1 block text-caption font-medium text-text-secondary'>
									Type <span className='font-mono'>{LOCK_ME_OUT}</span> to confirm
								</label>
								<Input
									value={confirmText}
									onChange={(e) => setConfirmText(e.target.value)}
									autoComplete='off'
									spellCheck={false}
								/>
							</div>

							{submitError ? (
								<div className='rounded-radius-sm border border-destructive2/40 bg-destructive2/10 px-3 py-2 text-caption text-destructive2'>
									{submitError}
								</div>
							) : null}
						</div>

						<DialogFooter>
							<Button
								variant='default'
								onClick={() => {
									setStage('normal')
									setConfirmText('')
								}}
								disabled={isBanning}
							>
								Back
							</Button>
							<Button
								variant='destructive'
								onClick={() => handleSubmitStage(LOCK_ME_OUT)}
								disabled={stage2Disabled}
							>
								{isBanning ? 'Banning…' : 'Confirm Ban'}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
