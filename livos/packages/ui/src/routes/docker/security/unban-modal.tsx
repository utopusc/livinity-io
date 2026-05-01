// Phase 46 Plan 46-04 — UnbanModal (FR-F2B-02 + pitfall B-01 / W-01).
//
// Mirrors stack-dialogs.tsx RemoveStackDialog pattern (Dialog + Checkbox +
// onConfirm signature). Adds a 5s click-debounce to prevent the double-fire
// pitfall (W-01).
//
// FR-F2B-02 differentiator: "Add to ignoreip whitelist" checkbox surfaces
// the action-targeted-unban + optional whitelist flow that distinguishes
// LivOS from raw fail2ban-client. The checkbox defaults UNCHECKED — admin
// must opt-in to whitelist (so accidental flagging-as-trusted is hard).
//
// Pitfall B-01 user education: inline note explains that fail2ban may
// re-ban this IP if connection attempts continue. This nudges admins to
// fix the SSH key issue BEFORE re-banning becomes a surprise.

import {useEffect, useState} from 'react'
import {formatDistanceToNow, parseISO} from 'date-fns'

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

interface UnbanModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	ip: string
	jail: string
	lastAttemptedUser?: string | null
	lastAttemptedAt?: string | null
	onConfirm: (addToWhitelist: boolean) => void
	isUnbanning: boolean
}

const DEBOUNCE_MS = 5_000

function safeFormatRelative(iso: string | undefined | null): string | null {
	if (!iso) return null
	try {
		return formatDistanceToNow(parseISO(iso), {addSuffix: true})
	} catch {
		return iso
	}
}

export function UnbanModal({
	open,
	onOpenChange,
	ip,
	jail,
	lastAttemptedUser,
	lastAttemptedAt,
	onConfirm,
	isUnbanning,
}: UnbanModalProps) {
	const [addToWhitelist, setAddToWhitelist] = useState(false)
	const [debouncing, setDebouncing] = useState(false)

	// Reset checkbox + debounce state every time the dialog re-opens so that
	// the previous user's choice doesn't bleed into the next unban (sub-issue
	// W-01: avoid sticky state across separate IP confirmations).
	useEffect(() => {
		if (open) {
			setAddToWhitelist(false)
			setDebouncing(false)
		}
	}, [open])

	const lastAttemptRel = safeFormatRelative(lastAttemptedAt)
	const userLabel = lastAttemptedUser?.trim() ? lastAttemptedUser : null
	const buttonDisabled = isUnbanning || debouncing

	function handleConfirm() {
		if (buttonDisabled) return
		onConfirm(addToWhitelist)
		// Pitfall W-01 — disable button for 5s after click to prevent double-fire
		// (the parent caller's mutation may not flip isUnbanning fast enough on
		// fast LANs).
		setDebouncing(true)
		setTimeout(() => setDebouncing(false), DEBOUNCE_MS)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Unban {ip} from {jail}
					</DialogTitle>
					<DialogDescription>
						{lastAttemptRel || userLabel ? (
							<>
								Last failed attempt
								{userLabel ? <> by user <span className='font-mono'>{userLabel}</span></> : null}
								{lastAttemptRel ? <> {lastAttemptRel}</> : null}
								{'. '}
							</>
						) : null}
						This will remove the IP from the {jail} jail's banned list immediately.
					</DialogDescription>
				</DialogHeader>

				{/* Pitfall B-01 — inline user education */}
				<div className='rounded-radius-sm border border-amber-200 bg-amber-50 px-3 py-2 text-caption text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
					After unban, fail2ban may re-ban this IP if connection attempts continue with bad
					credentials. Verify your SSH key is correct first.
				</div>

				{/* FR-F2B-02 differentiator: optional whitelist */}
				<div className='py-2'>
					<label className='flex cursor-pointer items-start gap-2'>
						<Checkbox
							checked={addToWhitelist}
							onCheckedChange={(checked) => setAddToWhitelist(checked === true)}
							disabled={isUnbanning}
						/>
						<span className='text-body-sm text-text-secondary'>
							Add to ignoreip whitelist (prevents re-ban from this IP)
						</span>
					</label>
				</div>

				<DialogFooter>
					<Button variant='default' onClick={() => onOpenChange(false)} disabled={isUnbanning}>
						Cancel
					</Button>
					<Button variant='destructive' onClick={handleConfirm} disabled={buttonDisabled}>
						{isUnbanning ? 'Unbanning…' : 'Unban'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
