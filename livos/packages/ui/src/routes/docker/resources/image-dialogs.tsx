// Phase 26 Plan 26-01 — Image-related dialogs.
//
// Ported verbatim from routes/server-control/index.tsx:1073-1291. The four
// dialogs (Remove / Prune / Pull / Tag) were file-local in the legacy file
// (not exported), so importing them across modules was impossible. The port
// here makes them reusable AND becomes their canonical location after Plan 27
// deletes the legacy file. Until then both copies exist (the legacy ImagesTab
// still uses its local copies).

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

// Remove Image confirmation dialog (simple)
export function RemoveImageDialog({
	imageTag,
	open,
	onOpenChange,
	onConfirm,
	isRemoving,
}: {
	imageTag: string
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isRemoving: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Remove Image</DialogTitle>
					<DialogDescription>
						Are you sure you want to remove this image? This action cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<p className='text-sm text-text-secondary'>
						Image: <span className='font-bold font-mono text-text-primary'>{imageTag}</span>
					</p>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={isRemoving}
						onClick={onConfirm}
					>
						Remove
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Prune Images confirmation dialog
export function PruneImagesDialog({
	open,
	onOpenChange,
	onConfirm,
	isPruning,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isPruning: boolean
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Prune Unused Images</DialogTitle>
					<DialogDescription>
						This will remove all dangling images. Are you sure?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						size='dialog'
						disabled={isPruning}
						onClick={onConfirm}
					>
						Prune
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Pull Image dialog
export function PullImageDialog({
	open,
	onOpenChange,
	onConfirm,
	isPulling,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (image: string) => void
	isPulling: boolean
}) {
	const [imageName, setImageName] = useState('')

	useEffect(() => {
		if (!open) setImageName('')
	}, [open])

	return (
		<Dialog open={open} onOpenChange={isPulling ? undefined : onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Pull Image</DialogTitle>
					<DialogDescription>
						Pull a Docker image from a registry.
					</DialogDescription>
				</DialogHeader>
				<div className='py-2'>
					<Label htmlFor='pull-image-name' className='mb-2 block text-sm'>Image Name</Label>
					<Input
						id='pull-image-name'
						sizeVariant='short-square'
						placeholder='e.g. nginx:latest, ubuntu:22.04'
						value={imageName}
						onValueChange={setImageName}
						autoFocus
						disabled={isPulling}
					/>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)} disabled={isPulling}>
						Cancel
					</Button>
					<Button
						variant='default'
						size='dialog'
						disabled={!imageName.trim() || isPulling}
						onClick={() => onConfirm(imageName.trim())}
					>
						{isPulling ? 'Pulling...' : 'Pull'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Tag Image dialog
export function TagImageDialog({
	open,
	onOpenChange,
	imageId,
	currentTag,
	onConfirm,
	isTagging,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	imageId: string
	currentTag: string
	onConfirm: (id: string, repo: string, tag: string) => void
	isTagging: boolean
}) {
	const [repo, setRepo] = useState('')
	const [tag, setTag] = useState('latest')

	useEffect(() => {
		if (!open) {
			setRepo('')
			setTag('latest')
		}
	}, [open])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Tag Image</DialogTitle>
					<DialogDescription>
						Add a new tag to this image.
					</DialogDescription>
				</DialogHeader>
				<div className='space-y-3 py-2'>
					<p className='text-sm text-text-secondary'>
						Current: <span className='font-bold font-mono text-text-primary'>{currentTag}</span>
					</p>
					<div>
						<Label htmlFor='tag-repo' className='mb-2 block text-sm'>Repository</Label>
						<Input
							id='tag-repo'
							sizeVariant='short-square'
							placeholder='e.g. myapp'
							value={repo}
							onValueChange={setRepo}
							autoFocus
						/>
					</div>
					<div>
						<Label htmlFor='tag-tag' className='mb-2 block text-sm'>Tag</Label>
						<Input
							id='tag-tag'
							sizeVariant='short-square'
							placeholder='e.g. v1.0'
							value={tag}
							onValueChange={setTag}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant='default' size='dialog' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='default'
						size='dialog'
						disabled={!repo.trim() || !tag.trim() || isTagging}
						onClick={() => onConfirm(imageId, repo.trim(), tag.trim())}
					>
						Tag
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
