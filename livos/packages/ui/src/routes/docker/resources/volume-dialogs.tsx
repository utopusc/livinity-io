// Phase 26 Plan 26-02 — Volume dialogs (Remove + Create).
//
// RemoveVolumeDialog (legacy lines 1362-1421) and CreateVolumeDialog
// (legacy lines 1561-1685) ported verbatim from
// routes/server-control/index.tsx. The legacy file is left intact —
// both copies coexist until Plan 27 deletes the legacy file whole.

import {useEffect, useState} from 'react'
import {IconPlus, IconX} from '@tabler/icons-react'

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

// Remove Volume confirmation dialog (typed name required)
export function RemoveVolumeDialog({
	volumeName,
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	volumeName: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (confirmName: string) => void
	isRemoving: boolean
}) {
	const [typedName, setTypedName] = useState('')

	useEffect(() => {
		if (!open) setTypedName('')
	}, [open])

	const canConfirm = typedName === volumeName && !isRemoving

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Volume</DialogTitle>
					<DialogDescription>
						This will permanently delete the volume and its data. Type the volume name to confirm.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<p className='mb-3 text-sm text-text-secondary'>
						Volume: <span className='font-bold font-mono text-text-primary'>{volumeName}</span>
					</p>
					<Input
						sizeVariant='short-square'
						placeholder='Type volume name...'
						value={typedName}
						onValueChange={setTypedName}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={!canConfirm}
						onClick={() => onConfirm(typedName)}
					>
						Remove
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Create Volume Dialog
export function CreateVolumeDialog({
	open,
	onOpenChange,
	onConfirm,
	isCreating,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (input: {name: string; driver?: string; driverOpts?: Record<string, string>}) => void
	isCreating: boolean
}) {
	const [name, setName] = useState('')
	const [driver, setDriver] = useState('local')
	const [driverOpts, setDriverOpts] = useState<Array<{key: string; value: string}>>([])

	useEffect(() => {
		if (!open) {
			setName('')
			setDriver('local')
			setDriverOpts([])
		}
	}, [open])

	const canSubmit = name.trim().length > 0 && !isCreating

	const handleSubmit = () => {
		if (!canSubmit) return
		const opts: Record<string, string> = {}
		for (const opt of driverOpts) {
			if (opt.key.trim()) {
				opts[opt.key.trim()] = opt.value
			}
		}
		onConfirm({
			name: name.trim(),
			...(driver !== 'local' ? {driver} : {}),
			...(Object.keys(opts).length > 0 ? {driverOpts: opts} : {}),
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create Volume</DialogTitle>
					<DialogDescription>Create a new Docker volume for persistent data storage.</DialogDescription>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					<div className='space-y-2'>
						<Label>Name</Label>
						<Input
							sizeVariant='short-square'
							placeholder='my-volume'
							value={name}
							onValueChange={setName}
							autoFocus
						/>
					</div>
					<div className='space-y-2'>
						<Label>Driver</Label>
						<Input
							sizeVariant='short-square'
							placeholder='local'
							value={driver}
							onValueChange={setDriver}
						/>
					</div>
					<div className='space-y-2'>
						<Label>Driver Options <span className='text-text-tertiary font-normal'>(optional)</span></Label>
						{driverOpts.map((opt, i) => (
							<div key={i} className='flex items-center gap-2'>
								<Input
									sizeVariant='short-square'
									placeholder='key'
									value={opt.key}
									onValueChange={(v) => {
										const next = [...driverOpts]
										next[i] = {...next[i], key: v}
										setDriverOpts(next)
									}}
									className='flex-1'
								/>
								<Input
									sizeVariant='short-square'
									placeholder='value'
									value={opt.value}
									onValueChange={(v) => {
										const next = [...driverOpts]
										next[i] = {...next[i], value: v}
										setDriverOpts(next)
									}}
									className='flex-1'
								/>
								<button
									onClick={() => setDriverOpts(driverOpts.filter((_, idx) => idx !== i))}
									className='shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-red-500'
								>
									<IconX size={14} />
								</button>
							</div>
						))}
						<Button
							variant='default'
							size='sm'
							onClick={() => setDriverOpts([...driverOpts, {key: '', value: ''}])}
						>
							<IconPlus size={14} className='mr-1' />
							Add Option
						</Button>
					</div>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant='default' size='dialog' disabled={!canSubmit} onClick={handleSubmit}>
						{isCreating ? 'Creating...' : 'Create Volume'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
