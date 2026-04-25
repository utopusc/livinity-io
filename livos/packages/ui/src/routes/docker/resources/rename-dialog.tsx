// Phase 26 Plan 26-01 — Container rename dialog.
//
// Verbatim port of legacy routes/server-control/index.tsx:999-1059 (deleted
// Phase 27-02). Used by ContainerSection's Rename action button.

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

export function RenameDialog({
	containerName,
	open,
	onOpenChange,
	onConfirm,
	isPending,
	error,
}: {
	containerName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (newName: string) => void
	isPending: boolean
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	error: any
}) {
	const [newName, setNewName] = useState('')

	// Reset when dialog opens/closes
	useEffect(() => {
		if (!open) setNewName('')
	}, [open])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename Container</DialogTitle>
					<DialogDescription>
						Rename <span className='font-mono font-medium'>{containerName}</span> to a new name.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<Label className='mb-1.5 block text-text-secondary'>New Name</Label>
					<Input
						sizeVariant='short-square'
						placeholder='new-container-name'
						value={newName}
						onValueChange={setNewName}
						autoFocus
					/>
					{error && (
						<p className='mt-2 text-sm text-red-400'>{error.message}</p>
					)}
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='default'
						size='dialog'
						onClick={() => onConfirm(newName)}
						disabled={!newName.trim() || isPending}
					>
						{isPending ? 'Renaming...' : 'Rename'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
