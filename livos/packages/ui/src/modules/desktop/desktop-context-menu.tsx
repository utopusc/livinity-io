import {useRef, useState} from 'react'
import {RiCloseCircleFill} from 'react-icons/ri'

import {WallpaperPicker} from '@/routes/settings/_components/wallpaper-picker'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {Popover, PopoverAnchor, PopoverClose, PopoverContent} from '@/shadcn-components/ui/popover'
import {Dialog, DialogPortal, DialogContent, DialogHeader, DialogTitle, DialogFooter} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'
import {t} from '@/utils/i18n'
import {addDesktopFolder} from '@/modules/desktop/desktop-content'
import {trpcReact} from '@/trpc/trpc'
import {WidgetPickerDialog} from './widgets/widget-picker-dialog'

export function DesktopContextMenu({children}: {children: React.ReactNode}) {
	const [showWallpaper, setShowWallpaper] = useState(false)
	const [showNewFolder, setShowNewFolder] = useState(false)
	const [showWidgetPicker, setShowWidgetPicker] = useState(false)
	const contentRef = useRef<HTMLDivElement>(null)
	const anchorRef = useRef<HTMLDivElement>(null)

	return (
		<>
			<ContextMenu modal={false}>
				<ContextMenuTrigger>{children}</ContextMenuTrigger>
				<ContextMenuContent ref={contentRef}>
					<ContextMenuItem
						onSelect={() => {
							setShowWidgetPicker(true)
						}}
					>
						Add Widget
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => {
							setShowNewFolder(true)
						}}
					>
						New Folder
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={() => {
							const {top, left} = contentRef.current!.getBoundingClientRect()
							anchorRef.current!.style.top = `${top}px`
							anchorRef.current!.style.left = `${left}px`
							setTimeout(() => setShowWallpaper(true), 200)
						}}
					>
						{t('desktop.context-menu.change-wallpaper')}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			{/* Wallpaper picker popover */}
			<Popover open={showWallpaper} onOpenChange={setShowWallpaper}>
				<PopoverAnchor className='fixed' ref={anchorRef} />
				<PopoverContent align='start' className='relative py-2.5 pl-1.5 pr-5'>
					<CloseButton className='absolute right-2 top-2' />
					<WallpaperPicker maxW={300} />
				</PopoverContent>
			</Popover>

			{/* New folder dialog */}
			<NewFolderDialog open={showNewFolder} onOpenChange={setShowNewFolder} />

			{/* Widget picker dialog */}
			<WidgetPickerDialog open={showWidgetPicker} onOpenChange={setShowWidgetPicker} />
		</>
	)
}

function NewFolderDialog({open, onOpenChange}: {open: boolean; onOpenChange: (v: boolean) => void}) {
	const [name, setName] = useState('Untitled Folder')
	const [error, setError] = useState('')

	const createFolderMut = trpcReact.files.createDirectory.useMutation()

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault()
		const trimmed = name.trim()
		if (!trimmed) {
			setError('Folder name cannot be empty')
			return
		}
		setError('')
		try {
			await createFolderMut.mutateAsync({path: `/Home/${trimmed}`})
		} catch {
			// Ignore API errors — folder may still be created
		}
		// Add to desktop grid regardless
		addDesktopFolder(trimmed)
		onOpenChange(false)
		setName('Untitled Folder')
	}

	return (
		<Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setName('Untitled Folder'); setError('') } }}>
			<DialogPortal>
				<DialogContent asChild>
					<form onSubmit={handleCreate}>
						<fieldset disabled={createFolderMut.isPending} className='flex flex-col gap-4'>
							<DialogHeader>
								<DialogTitle>New Folder</DialogTitle>
							</DialogHeader>
							<Input
								placeholder='Folder name'
								value={name}
								onValueChange={setName}
								autoFocus
							/>
							{error && <p className='text-sm text-red-500'>{error}</p>}
							<DialogFooter>
								<Button type='submit' size='dialog' variant='primary'>
									Create
								</Button>
								<Button type='button' size='dialog' onClick={() => onOpenChange(false)}>
									Cancel
								</Button>
							</DialogFooter>
						</fieldset>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

const CloseButton = ({className}: {className: string}) => (
	<PopoverClose
		className={cn(
			'rounded-full opacity-30 outline-none ring-border-emphasis transition-opacity hover:opacity-40 focus-visible:opacity-40 focus-visible:ring-2',
			className,
		)}
	>
		<RiCloseCircleFill className='h-4 w-4' />
		<span className='sr-only'>{t('close')}</span>
	</PopoverClose>
)
