// Phase 27-01 — ported verbatim from routes/server-control/index.tsx.
//
// RemoveStackDialog (legacy lines 3451-3502): confirm-removal dialog with
//   "also remove volumes" checkbox. Calls onConfirm(removeVolumes: boolean).
// RedeployStackDialog (legacy lines 3505-3539, QW-03): confirm-redeploy
//   dialog explaining "pull latest images + recreate containers, preserve
//   volumes". Calls onConfirm() — caller invokes controlStack('pull-and-up').
//
// Paired in one file to mirror the image-dialogs.tsx precedent from Plan
// 26-01 (multiple small modal dialogs grouped per resource type).

import {useState} from 'react'

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

export function RemoveStackDialog({
	stackName,
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	stackName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (removeVolumes: boolean) => void
	isRemoving: boolean
}) {
	const [removeVolumes, setRemoveVolumes] = useState(false)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Stack: {stackName}</DialogTitle>
					<DialogDescription>
						This will stop and remove all containers in this stack.
					</DialogDescription>
				</DialogHeader>
				<div className='py-3'>
					<label className='flex items-center gap-2 cursor-pointer'>
						<Checkbox
							checked={removeVolumes}
							onCheckedChange={(checked) => setRemoveVolumes(checked === true)}
						/>
						<span className='text-sm text-text-secondary'>Also remove associated volumes</span>
					</label>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						onClick={() => {
							onConfirm(removeVolumes)
							setRemoveVolumes(false)
						}}
						disabled={isRemoving}
					>
						{isRemoving ? 'Removing...' : 'Remove'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Redeploy (pull latest) Stack Dialog — QW-03
export function RedeployStackDialog({
	stackName,
	open,
	onOpenChange,
	onConfirm,
	isBusy,
}: {
	stackName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isBusy: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Redeploy Stack: {stackName}</DialogTitle>
					<DialogDescription>
						This will pull the latest version of every image in this stack and recreate
						containers on the new digest. Existing volumes are preserved.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)} disabled={isBusy}>
						Cancel
					</Button>
					<Button onClick={onConfirm} disabled={isBusy}>
						{isBusy ? 'Redeploying...' : 'Pull & Redeploy'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
