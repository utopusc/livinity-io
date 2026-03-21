import {useState} from 'react'
import {TbFolder, TbTrash, TbPencil, TbPalette} from 'react-icons/tb'

import {useWindowManagerOptional} from '@/providers/window-manager'
import {systemAppsKeyed} from '@/providers/apps'
import {trpcReact} from '@/trpc/trpc'
import {ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger} from '@/shadcn-components/ui/context-menu'
import {Dialog, DialogPortal, DialogContent, DialogHeader, DialogTitle, DialogFooter} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'

const FOLDER_COLORS: {name: string; body: string; tab: string; shadow: string}[] = [
	{name: 'Blue', body: '#4A9EF5', tab: '#3A8DE4', shadow: '#2A6DBB'},
	{name: 'Sky', body: '#38BDF8', tab: '#28ADE8', shadow: '#1890C8'},
	{name: 'Teal', body: '#2DD4BF', tab: '#1DC4AF', shadow: '#14A090'},
	{name: 'Green', body: '#4ADE80', tab: '#3ACE70', shadow: '#22A858'},
	{name: 'Lime', body: '#A3E635', tab: '#93D625', shadow: '#70B018'},
	{name: 'Yellow', body: '#FACC15', tab: '#EABC05', shadow: '#C89800'},
	{name: 'Orange', body: '#FB923C', tab: '#EB822C', shadow: '#D06818'},
	{name: 'Red', body: '#F87171', tab: '#E86161', shadow: '#CC4444'},
	{name: 'Pink', body: '#F472B6', tab: '#E462A6', shadow: '#C84888'},
	{name: 'Purple', body: '#A78BFA', tab: '#977BEA', shadow: '#7B5FCC'},
	{name: 'Violet', body: '#8B5CF6', tab: '#7B4CE6', shadow: '#6238CC'},
	{name: 'Slate', body: '#94A3B8', tab: '#8493A8', shadow: '#647890'},
]

const FOLDER_ICONS = ['📁', '📂', '🎮', '🎵', '📸', '🎬', '💼', '📚', '🔧', '🎨', '💡', '🏠', '📝', '🌐', '🔒', '⭐', '💾', '🗂️', '📦', '🧪', '🎯', '📊', '🖼️', '🎧']

interface DesktopFolderProps {
	name: string
	onRemove: () => void
	onRename: (newName: string) => void
	onChangeColor: (color: string) => void
	onChangeIcon: (icon: string) => void
	color?: string
	icon?: string
}

/** macOS-style folder icon shape */
function FolderShape({color, icon, size = 'desktop'}: {color?: string; icon?: string; size?: 'desktop' | 'picker'}) {
	// Parse color - support both old bg-xxx format and new hex format
	const colorSet = FOLDER_COLORS.find((c) => c.body === color || c.name === color) || FOLDER_COLORS[0]
	const isOldFormat = color?.startsWith('bg-')
	const body = isOldFormat ? FOLDER_COLORS[0].body : (colorSet?.body || FOLDER_COLORS[0].body)
	const tab = isOldFormat ? FOLDER_COLORS[0].tab : (colorSet?.tab || FOLDER_COLORS[0].tab)
	const shadow = isOldFormat ? FOLDER_COLORS[0].shadow : (colorSet?.shadow || FOLDER_COLORS[0].shadow)

	const w = size === 'picker' ? 44 : undefined
	const h = size === 'picker' ? 36 : undefined

	return (
		<svg width={w} height={h} viewBox='0 0 64 52' fill='none' xmlns='http://www.w3.org/2000/svg' className={size === 'picker' ? 'drop-shadow-md' : 'w-full drop-shadow-md'}>
			{/* Shadow */}
			<rect x='4' y='14' width='56' height='36' rx='5' fill={shadow} opacity='0.3' />

			{/* Tab */}
			<path d={`M6 8 C6 5.79 7.79 4 10 4 L24 4 C25.6 4 27.1 4.8 28 6.1 L30.5 10 L6 10 Z`} fill={tab} />

			{/* Body */}
			<rect x='4' y='10' width='56' height='36' rx='5' fill={body} />

			{/* Highlight line at top */}
			<rect x='4' y='10' width='56' height='2' rx='1' fill='white' opacity='0.35' />

			{/* Subtle gradient overlay */}
			<defs>
				<linearGradient id={`folderGrad-${body}`} x1='32' y1='10' x2='32' y2='46' gradientUnits='userSpaceOnUse'>
					<stop offset='0%' stopColor='white' stopOpacity='0.15' />
					<stop offset='100%' stopColor='black' stopOpacity='0.08' />
				</linearGradient>
			</defs>
			<rect x='4' y='10' width='56' height='36' rx='5' fill={`url(#folderGrad-${body})`} />

			{/* Icon in center */}
			{icon ? (
				<foreignObject x='16' y='16' width='32' height='26'>
					<div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%'}}>
						<span style={{fontSize: size === 'picker' ? '14px' : '20px', lineHeight: 1}}>{icon}</span>
					</div>
				</foreignObject>
			) : null}
		</svg>
	)
}

export function DesktopFolder({name, onRemove, onRename, onChangeColor, onChangeIcon, color, icon}: DesktopFolderProps) {
	const windowManager = useWindowManagerOptional()
	const [showRename, setShowRename] = useState(false)
	const [showColorPicker, setShowColorPicker] = useState(false)
	const [showIconPicker, setShowIconPicker] = useState(false)
	const [newName, setNewName] = useState(name)

	const deleteMut = trpcReact.files.delete.useMutation()

	const handleOpen = () => {
		const route = `/files/Home/${encodeURIComponent(name)}`
		const filesIcon = systemAppsKeyed['LIVINITY_files']?.icon || ''
		if (windowManager) {
			windowManager.openWindow('LIVINITY_files', route, name, filesIcon)
		}
	}

	const handleDelete = async () => {
		try {
			await deleteMut.mutateAsync({path: `/Home/${name}`})
		} catch {
			// May fail but still remove from grid
		}
		onRemove()
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger>
					<button
						className='group flex h-[var(--app-h)] w-[var(--app-w)] flex-col items-center gap-2.5 py-3 focus:outline-none'
						onClick={handleOpen}
					>
						<div className='relative aspect-square w-12 shrink-0 md:w-16 flex items-end justify-center transition-transform duration-200 group-hover:scale-105 group-active:scale-95'>
							<FolderShape color={color} icon={icon} />
						</div>
						<div className='max-w-full text-[11px] font-medium leading-normal text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] md:text-[12px]'>
							<div className='truncate'>{name}</div>
						</div>
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={handleOpen}>Open</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={() => { setNewName(name); setShowRename(true) }}>
						<TbPencil className='mr-2 h-4 w-4' /> Rename
					</ContextMenuItem>
					<ContextMenuItem onSelect={() => setShowColorPicker(true)}>
						<TbPalette className='mr-2 h-4 w-4' /> Change color
					</ContextMenuItem>
					<ContextMenuItem onSelect={() => setShowIconPicker(true)}>
						<TbFolder className='mr-2 h-4 w-4' /> Change icon
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem className='text-red-500 focus:text-red-500' onSelect={handleDelete}>
						<TbTrash className='mr-2 h-4 w-4' /> Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			{/* Rename dialog */}
			<Dialog open={showRename} onOpenChange={setShowRename}>
				<DialogPortal>
					<DialogContent asChild>
						<form onSubmit={(e) => { e.preventDefault(); onRename(newName.trim()); setShowRename(false) }}>
							<DialogHeader><DialogTitle>Rename folder</DialogTitle></DialogHeader>
							<Input value={newName} onValueChange={setNewName} autoFocus />
							<DialogFooter>
								<Button type='submit' size='dialog' variant='primary' disabled={!newName.trim()}>Save</Button>
								<Button type='button' size='dialog' onClick={() => setShowRename(false)}>Cancel</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</DialogPortal>
			</Dialog>

			{/* Color picker dialog */}
			<Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
				<DialogPortal>
					<DialogContent>
						<DialogHeader><DialogTitle>Choose color</DialogTitle></DialogHeader>
						<div className='grid grid-cols-4 gap-3 py-2'>
							{FOLDER_COLORS.map((c) => (
								<button
									key={c.body}
									onClick={() => { onChangeColor(c.body); setShowColorPicker(false) }}
									className='group/swatch flex h-14 items-center justify-center rounded-xl transition-all hover:scale-105'
									style={{background: c.body}}
								>
									<div className={`h-5 w-5 rounded-full border-2 border-white transition-opacity ${color === c.body ? 'opacity-100' : 'opacity-0 group-hover/swatch:opacity-40'}`}>
										{color === c.body && (
											<svg viewBox='0 0 20 20' className='h-full w-full text-white'>
												<path d='M6 10l3 3 5-5' stroke='currentColor' strokeWidth='2.5' fill='none' strokeLinecap='round' strokeLinejoin='round' />
											</svg>
										)}
									</div>
								</button>
							))}
						</div>
					</DialogContent>
				</DialogPortal>
			</Dialog>

			{/* Icon picker dialog */}
			<Dialog open={showIconPicker} onOpenChange={setShowIconPicker}>
				<DialogPortal>
					<DialogContent>
						<DialogHeader><DialogTitle>Choose icon</DialogTitle></DialogHeader>
						<div className='grid grid-cols-6 gap-2 py-2'>
							<button
								onClick={() => { onChangeIcon(''); setShowIconPicker(false) }}
								className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all hover:bg-surface-1 hover:scale-105 ${!icon ? 'ring-2 ring-brand' : ''}`}
							>
								<TbFolder className='h-6 w-6 text-text-secondary' />
							</button>
							{FOLDER_ICONS.map((emoji) => (
								<button
									key={emoji}
									onClick={() => { onChangeIcon(emoji); setShowIconPicker(false) }}
									className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-all hover:bg-surface-1 hover:scale-105 ${icon === emoji ? 'ring-2 ring-brand' : ''}`}
								>
									{emoji}
								</button>
							))}
						</div>
					</DialogContent>
				</DialogPortal>
			</Dialog>
		</>
	)
}
