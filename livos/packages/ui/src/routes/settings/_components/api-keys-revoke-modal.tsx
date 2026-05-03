/**
 * Phase 62 Plan 62-04 — ApiKeysRevokeModal (FR-BROKER-E2-01).
 *
 * Confirmation Dialog. Two-step revoke prevents accidental clicks
 * (T-62-16 mitigation): the row's Revoke button only OPENS this modal;
 * the actual revocation requires a second explicit click on the
 * destructive-variant Revoke button below.
 *
 * On success:
 *   - apiKeys.revoke({id}) returns {id, revoked_at}
 *   - utils.apiKeys.list.invalidate() so the parent section re-renders
 *     with the row faded + "(revoked)" badge (T-62-16 visual feedback)
 *   - Toast success
 *   - onClose() to dismiss
 *
 * On error:
 *   - Toast error message
 *   - Modal stays open (user can retry or Cancel)
 */

import {useState} from 'react'
import {TbLoader2} from 'react-icons/tb'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {trpcReact} from '@/trpc/trpc'
import {toast} from 'sonner'

export interface ApiKeysRevokeModalProps {
	open: boolean
	onClose: () => void
	keyId: string
	keyName: string
}

export function ApiKeysRevokeModal({open, onClose, keyId, keyName}: ApiKeysRevokeModalProps) {
	const utils = trpcReact.useUtils()
	const [isPending, setIsPending] = useState(false)

	const revokeMutation = trpcReact.apiKeys.revoke.useMutation({
		onSuccess: () => {
			void utils.apiKeys.list.invalidate()
			toast.success(`API key "${keyName}" revoked`)
			setIsPending(false)
			onClose()
		},
		onError: (err) => {
			setIsPending(false)
			toast.error(err.message ?? 'Failed to revoke API key')
		},
	})

	const onConfirm = () => {
		setIsPending(true)
		revokeMutation.mutate({id: keyId})
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (!o && !isPending ? onClose() : null)}>
			<DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Revoke API key?</DialogTitle>
				</DialogHeader>

				<div className='space-y-2 py-2 text-body-sm text-text-secondary'>
					<p>
						Revoking <span className='font-medium text-text-primary'>"{keyName}"</span> will
						invalidate it immediately.
					</p>
					<p>
						All clients using this key will get HTTP 401 errors on their next request. This
						cannot be undone.
					</p>
				</div>

				<DialogFooter className='gap-2'>
					<Button variant='secondary' onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button variant='destructive' onClick={onConfirm} disabled={isPending}>
						{isPending && <TbLoader2 className='mr-2 h-4 w-4 animate-spin' />}
						Revoke
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
