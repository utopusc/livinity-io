// Phase 26 Plan 26-02 — Network dialogs (Create + Remove).
//
// CreateNetworkDialog (legacy lines 1423-1525) and RemoveNetworkDialog
// (legacy lines 1527-1559) ported verbatim from
// routes/server-control/index.tsx. The legacy file is left intact —
// both copies coexist until Plan 27 deletes the legacy file whole.

import {useEffect, useState} from 'react'

import {Button} from '@/shadcn-components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Label} from '@/shadcn-components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'

// Create Network Dialog
export function CreateNetworkDialog({
	open,
	onOpenChange,
	onConfirm,
	isCreating,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (input: {name: string; driver: string; subnet?: string; gateway?: string}) => void
	isCreating: boolean
}) {
	const [name, setName] = useState('')
	const [driver, setDriver] = useState('bridge')
	const [subnet, setSubnet] = useState('')
	const [gateway, setGateway] = useState('')

	useEffect(() => {
		if (!open) {
			setName('')
			setDriver('bridge')
			setSubnet('')
			setGateway('')
		}
	}, [open])

	const canSubmit = name.trim().length > 0 && !isCreating

	const handleSubmit = () => {
		if (!canSubmit) return
		onConfirm({
			name: name.trim(),
			driver,
			...(subnet.trim() ? {subnet: subnet.trim()} : {}),
			...(gateway.trim() ? {gateway: gateway.trim()} : {}),
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Network</DialogTitle>
					<DialogDescription>Create a new Docker network for container isolation.</DialogDescription>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					<div className='space-y-2'>
						<Label>Name</Label>
						<Input
							sizeVariant='short-square'
							placeholder='my-network'
							value={name}
							onValueChange={setName}
							autoFocus
						/>
					</div>
					<div className='space-y-2'>
						<Label>Driver</Label>
						<Select value={driver} onValueChange={setDriver}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='bridge'>bridge</SelectItem>
								<SelectItem value='overlay'>overlay</SelectItem>
								<SelectItem value='macvlan'>macvlan</SelectItem>
								<SelectItem value='host'>host</SelectItem>
								<SelectItem value='none'>none</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className='space-y-2'>
						<Label>Subnet <span className='text-text-tertiary font-normal'>(optional)</span></Label>
						<Input
							sizeVariant='short-square'
							placeholder='172.20.0.0/16'
							value={subnet}
							onValueChange={setSubnet}
						/>
					</div>
					<div className='space-y-2'>
						<Label>Gateway <span className='text-text-tertiary font-normal'>(optional)</span></Label>
						<Input
							sizeVariant='short-square'
							placeholder='172.20.0.1'
							value={gateway}
							onValueChange={setGateway}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant='default' size='dialog' disabled={!canSubmit} onClick={handleSubmit}>
						{isCreating ? 'Creating...' : 'Create Network'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Remove Network Confirmation Dialog
export function RemoveNetworkDialog({
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isRemoving: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Network</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove this network? This cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant='destructive' size='dialog' disabled={isRemoving} onClick={onConfirm}>
						{isRemoving ? 'Removing...' : 'Remove'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
