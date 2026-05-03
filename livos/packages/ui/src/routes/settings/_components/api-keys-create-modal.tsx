/**
 * Phase 62 Plan 62-04 — ApiKeysCreateModal (FR-BROKER-E2-01).
 *
 * Two-state Stripe-style Dialog:
 *   1. 'input' state — name field (1-64 chars) + Submit
 *   2. 'show-once' state — plaintext displayed in monospace block + Copy
 *      button + ⚠ warning admonition + "I've saved it, close" dismiss
 *
 * Security contract (D-NO-PERSIST-PLAINTEXT):
 *   - Plaintext lives ONLY in component state (`plaintext` useState)
 *   - On Close: setPlaintext(null) + setName('') + setStep('input')
 *     ensures React DevTools sees no leak after dismiss (T-62-14)
 *   - Cleanup useEffect on unmount also clears state defensively
 *   - The plaintext value is NEVER passed to console logging APIs —
 *     enforced by source-text invariant test in
 *     api-keys-create-modal.unit.test.tsx (T-62-13)
 *   - Copy reuses the environments-section.tsx:865-875 pattern verbatim
 *     (navigator.clipboard.writeText + sonner toast — Pattern 5)
 */

import {useEffect, useState} from 'react'
import {TbAlertTriangle, TbCheck, TbCopy, TbLoader2} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {trpcReact} from '@/trpc/trpc'
import {toast} from 'sonner'

export interface ApiKeysCreateModalProps {
	open: boolean
	onClose: () => void
}

type Step = 'input' | 'show-once'

export function ApiKeysCreateModal({open, onClose}: ApiKeysCreateModalProps) {
	const utils = trpcReact.useUtils()
	const [step, setStep] = useState<Step>('input')
	const [name, setName] = useState('')
	const [plaintext, setPlaintext] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)

	const createMutation = trpcReact.apiKeys.create.useMutation({
		onSuccess: (res) => {
			// res shape from Phase 59 routes.ts:
			//   {id, plaintext, prefix, name, created_at, oneTimePlaintextWarning}
			// We only retain res.plaintext in component-local state — never
			// persist anywhere else (T-62-14 contract).
			setPlaintext(res.plaintext)
			setStep('show-once')
			void utils.apiKeys.list.invalidate()
		},
		onError: (err) => {
			toast.error(err.message ?? 'Failed to create API key')
		},
	})

	// Defensive cleanup on unmount — even if onClose isn't called (e.g.
	// route-level navigation away), drop plaintext from React state so it
	// never lingers in DevTools after the user moves on (T-62-14).
	useEffect(() => {
		return () => {
			setPlaintext(null)
			setName('')
			setStep('input')
			setCopied(false)
		}
	}, [])

	const handleClose = () => {
		// Explicit clear — prevents the next "open" of this same modal
		// instance from briefly rendering the previous plaintext (T-62-14).
		setPlaintext(null)
		setName('')
		setStep('input')
		setCopied(false)
		onClose()
	}

	const handleSubmit = () => {
		const trimmed = name.trim()
		if (trimmed.length < 1 || trimmed.length > 64) return
		createMutation.mutate({name: trimmed})
	}

	const onCopy = async () => {
		if (!plaintext) return
		try {
			await navigator.clipboard.writeText(plaintext)
			setCopied(true)
			toast.success('API key copied to clipboard')
			setTimeout(() => setCopied(false), 2000)
		} catch {
			toast.error('Could not access clipboard — copy manually')
		}
	}

	const submitDisabled =
		createMutation.isPending || name.trim().length < 1 || name.trim().length > 64

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) handleClose()
			}}
		>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>
						{step === 'input' ? 'Create API key' : 'Save your API key'}
					</DialogTitle>
				</DialogHeader>

				{step === 'input' && (
					<div className='space-y-4 py-2'>
						<div className='space-y-2'>
							<label htmlFor='api-key-name' className='text-body-sm font-medium text-text-primary'>
								Key name
							</label>
							<Input
								id='api-key-name'
								type='text'
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g., 'My Bolt.diy Key'"
								maxLength={64}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && !submitDisabled) handleSubmit()
								}}
								autoFocus
							/>
							<p className='text-caption text-text-secondary'>
								1-64 characters. Pick a name that helps you identify this key later.
							</p>
						</div>

						<DialogFooter className='gap-2'>
							<Button variant='secondary' onClick={handleClose} disabled={createMutation.isPending}>
								Cancel
							</Button>
							<Button onClick={handleSubmit} disabled={submitDisabled}>
								{createMutation.isPending && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
								Create key
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === 'show-once' && plaintext && (
					<div className='space-y-4 py-2'>
						<div className='rounded-radius-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300'>
							<div className='flex items-start gap-2'>
								<TbAlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
								<div>
									<div className='font-medium'>Save this key now</div>
									<div className='mt-1'>
										You will NOT be able to see it again. Store it in a password manager or your
										client&apos;s config.
									</div>
								</div>
							</div>
						</div>

						<div className='space-y-2'>
							<label className='text-body-sm font-medium text-text-primary'>API key</label>
							<div className='flex items-center gap-2'>
								<pre className='flex-1 overflow-x-auto rounded-radius-sm border border-border-default bg-surface-raised p-2 font-mono text-caption text-text-primary'>
									{plaintext}
								</pre>
								<Button variant='secondary' onClick={onCopy} aria-label='Copy API key'>
									{copied ? (
										<>
											<TbCheck className='mr-2 h-4 w-4' /> Copied
										</>
									) : (
										<>
											<TbCopy className='mr-2 h-4 w-4' /> Copy
										</>
									)}
								</Button>
							</div>
						</div>

						<DialogFooter>
							<Button onClick={handleClose}>I&apos;ve saved it, close</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
