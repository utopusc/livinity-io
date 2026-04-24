import {useCallback, useEffect, useState} from 'react'
import {useDropzone} from 'react-dropzone'
import {
	IconAlertTriangle,
	IconChevronRight,
	IconDownload,
	IconFile,
	IconFileText,
	IconFolder,
	IconLink,
	IconLoader2,
	IconPencil,
	IconTrash,
	IconUpload,
} from '@tabler/icons-react'
import prettyBytes from 'pretty-bytes'
import {formatDistanceToNow} from 'date-fns'
import {toast} from 'sonner'

import {trpcReact, type RouterOutput} from '@/trpc/trpc'
import {Checkbox} from '@/shadcn-components/ui/checkbox'
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from '@/shadcn-components/ui/dialog'
import {cn} from '@/shadcn-lib/utils'

// ---------------------------------------------------------------------------
// Types — derived from tRPC router output (single source of truth lives in
// livos/packages/livinityd/source/modules/docker/container-files.ts → ContainerFileEntry)
// ---------------------------------------------------------------------------

type ListDirOutput = RouterOutput['docker']['containerListDir']
type ContainerFileEntry = ListDirOutput['entries'][number]

// ---------------------------------------------------------------------------
// Path helpers — POSIX-only (container paths are always POSIX even on Windows)
// ---------------------------------------------------------------------------

function posixJoin(dir: string, name: string): string {
	if (dir === '/') return `/${name}`
	return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`
}

function posixDirname(p: string): string {
	if (p === '/' || !p.includes('/')) return '/'
	const trimmed = p.replace(/\/$/, '')
	const i = trimmed.lastIndexOf('/')
	return i <= 0 ? '/' : trimmed.slice(0, i)
}

function segmentsOf(p: string): Array<{name: string; path: string}> {
	const parts = p.split('/').filter(Boolean)
	const segs: Array<{name: string; path: string}> = [{name: '/', path: '/'}]
	let acc = ''
	for (const part of parts) {
		acc += '/' + part
		segs.push({name: part, path: acc})
	}
	return segs
}

// ---------------------------------------------------------------------------
// File-type detection
// ---------------------------------------------------------------------------

const TEXT_EXTENSIONS = new Set([
	'txt', 'md', 'json', 'yml', 'yaml', 'log', 'conf', 'env', 'ini', 'toml',
	'xml', 'csv', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'sh', 'py', 'rb',
	'go', 'rs', 'lua', 'sql',
])

const TEXT_FILE_ICON_EXTS = new Set([
	'txt', 'md', 'json', 'yml', 'yaml', 'log', 'conf', 'env', 'ini', 'toml',
])

const MAX_EDIT_BYTES = 1_000_000 // 1MB hard guard for the inline edit modal

function extOf(name: string): string {
	const i = name.lastIndexOf('.')
	if (i <= 0) return ''
	return name.slice(i + 1).toLowerCase()
}

function canEdit(entry: ContainerFileEntry): boolean {
	if (entry.type !== 'file') return false
	if (entry.size >= MAX_EDIT_BYTES) return false
	return TEXT_EXTENSIONS.has(extOf(entry.name))
}

function entryIcon(entry: ContainerFileEntry): {Icon: typeof IconFile; color: string} {
	if (entry.type === 'dir') return {Icon: IconFolder, color: 'text-blue-400'}
	if (entry.type === 'symlink') return {Icon: IconLink, color: 'text-cyan-400'}
	if (entry.type === 'file' && TEXT_FILE_ICON_EXTS.has(extOf(entry.name))) {
		return {Icon: IconFileText, color: 'text-text-secondary'}
	}
	return {Icon: IconFile, color: 'text-text-secondary'}
}

// ---------------------------------------------------------------------------
// FilesTab — main component
// ---------------------------------------------------------------------------

export function FilesTab({containerName}: {containerName: string}): JSX.Element {
	const [currentPath, setCurrentPath] = useState<string>('/')
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editContent, setEditContent] = useState<string>('')
	const [editLoading, setEditLoading] = useState(false)
	const [editError, setEditError] = useState<string | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<ContainerFileEntry | null>(null)
	const [deleteRecursiveConfirmed, setDeleteRecursiveConfirmed] = useState(false)
	const [isUploading, setIsUploading] = useState(false)
	// Inline error shown when user clicks Edit on a file that fails canEdit()
	const [tooLargeError, setTooLargeError] = useState<string | null>(null)

	const utils = trpcReact.useUtils()

	const listQuery = trpcReact.docker.containerListDir.useQuery(
		{name: containerName, path: currentPath},
		{enabled: !!containerName, retry: false, staleTime: 2_000},
	)

	const writeMutation = trpcReact.docker.containerWriteFile.useMutation({
		onSuccess: () => {
			toast.success('File saved')
			utils.docker.containerListDir.invalidate({name: containerName, path: currentPath})
			setEditingPath(null)
			setEditContent('')
		},
		onError: (err) => toast.error(`Save failed: ${err.message}`),
	})

	const deleteMutation = trpcReact.docker.containerDeleteFile.useMutation({
		onSuccess: () => {
			toast.success('Deleted')
			utils.docker.containerListDir.invalidate({name: containerName, path: currentPath})
			setDeleteTarget(null)
			setDeleteRecursiveConfirmed(false)
		},
		onError: (err) => toast.error(`Delete failed: ${err.message}`),
	})

	// -----------------------------------------------------------------------
	// Drop zone (CFB-03)
	// -----------------------------------------------------------------------

	const onDrop = useCallback(
		async (files: File[]) => {
			if (files.length === 0) return
			setIsUploading(true)
			try {
				for (const file of files) {
					const form = new FormData()
					form.append('file', file)
					const qp = new URLSearchParams({path: currentPath})
					const res = await fetch(
						`/api/docker/container/${encodeURIComponent(containerName)}/file?${qp.toString()}`,
						{method: 'POST', body: form, credentials: 'include'},
					)
					if (!res.ok) {
						const msg = await res.json().catch(() => ({error: `HTTP ${res.status}`}))
						throw new Error((msg as {error?: string}).error || `HTTP ${res.status}`)
					}
				}
				toast.success(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`)
				utils.docker.containerListDir.invalidate({name: containerName, path: currentPath})
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				toast.error(`Upload failed: ${message}`)
			} finally {
				setIsUploading(false)
			}
		},
		[containerName, currentPath, utils],
	)

	const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop, noClick: false})

	// -----------------------------------------------------------------------
	// Edit modal (CFB-04)
	// -----------------------------------------------------------------------

	const handleEditClick = useCallback(
		async (entry: ContainerFileEntry) => {
			setTooLargeError(null)
			if (!canEdit(entry)) {
				setTooLargeError(
					entry.size >= MAX_EDIT_BYTES
						? `File too large to edit inline (max ${prettyBytes(MAX_EDIT_BYTES)})`
						: 'File type not editable inline',
				)
				return
			}
			const fullPath = posixJoin(currentPath, entry.name)
			setEditingPath(fullPath)
			setEditContent('')
			setEditLoading(true)
			setEditError(null)
			try {
				const result = await utils.docker.containerReadFile.fetch({
					name: containerName,
					path: fullPath,
					maxBytes: MAX_EDIT_BYTES,
				})
				setEditContent(result.content)
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				setEditError(message)
			} finally {
				setEditLoading(false)
			}
		},
		[containerName, currentPath, utils],
	)

	const handleEditSave = useCallback(() => {
		if (!editingPath) return
		writeMutation.mutate({
			name: containerName,
			path: editingPath,
			content: editContent,
		})
	}, [containerName, editingPath, editContent, writeMutation])

	// Auto-clear the inline "too large" notice when the user navigates away
	useEffect(() => {
		setTooLargeError(null)
	}, [currentPath])

	// -----------------------------------------------------------------------
	// Delete confirmation (CFB-05)
	// -----------------------------------------------------------------------

	const handleDeleteClick = useCallback((entry: ContainerFileEntry) => {
		setDeleteTarget(entry)
		setDeleteRecursiveConfirmed(false)
	}, [])

	const handleDeleteConfirm = useCallback(() => {
		if (!deleteTarget) return
		const isDir = deleteTarget.type === 'dir'
		// Directory delete REQUIRES the recursive checkbox before we proceed
		if (isDir && !deleteRecursiveConfirmed) return
		deleteMutation.mutate({
			name: containerName,
			path: posixJoin(currentPath, deleteTarget.name),
			recursive: isDir,
		})
	}, [containerName, currentPath, deleteTarget, deleteRecursiveConfirmed, deleteMutation])

	// -----------------------------------------------------------------------
	// Navigation helpers
	// -----------------------------------------------------------------------

	const navigateTo = useCallback((next: string) => {
		setCurrentPath(next)
		setTooLargeError(null)
	}, [])

	const onRowClick = useCallback(
		(entry: ContainerFileEntry) => {
			if (entry.type === 'dir') {
				navigateTo(posixJoin(currentPath, entry.name))
			}
		},
		[currentPath, navigateTo],
	)

	// -----------------------------------------------------------------------
	// Render
	// -----------------------------------------------------------------------

	const segments = segmentsOf(currentPath)
	const entries = listQuery.data?.entries ?? []
	const showParentRow = currentPath !== '/'

	return (
		<div className='flex h-full flex-col gap-3'>
			{/* Breadcrumb (CFB-01) */}
			<div className='flex shrink-0 flex-wrap items-center gap-1 text-xs'>
				{segments.map((seg, i) => (
					<div key={`${seg.path}-${i}`} className='flex items-center gap-1'>
						{i > 0 && <IconChevronRight size={12} className='text-text-tertiary' />}
						<button
							onClick={() => navigateTo(seg.path)}
							className={cn(
								'rounded px-1.5 py-0.5 font-mono transition-colors hover:bg-surface-2',
								i === segments.length - 1 ? 'text-text-primary' : 'text-text-secondary',
							)}
						>
							{seg.name}
						</button>
					</div>
				))}
			</div>

			{/* Drop zone (CFB-03) */}
			<div
				{...getRootProps()}
				className={cn(
					'flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 px-4 py-3 text-xs transition-colors',
					isDragActive
						? 'border-solid border-brand bg-brand/10 text-text-primary'
						: 'border-dashed border-border-default text-text-secondary hover:bg-surface-1/50',
				)}
			>
				<input {...getInputProps()} />
				<div className='flex items-center gap-2'>
					{isUploading ? (
						<IconLoader2 size={14} className='animate-spin' />
					) : (
						<IconUpload size={14} />
					)}
					<span>
						{isUploading
							? 'Uploading...'
							: isDragActive
								? 'Drop files to upload'
								: `Drop files here or click to browse (uploads to ${currentPath})`}
					</span>
				</div>
			</div>

			{/* Inline error from too-large/non-text edit attempt */}
			{tooLargeError && (
				<div className='shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300'>
					{tooLargeError}
				</div>
			)}

			{/* File table */}
			<div className='min-h-0 flex-1 overflow-auto rounded-lg border border-border-default'>
				{listQuery.isLoading ? (
					<div className='flex items-center justify-center py-16'>
						<IconLoader2 size={20} className='animate-spin text-text-tertiary' />
					</div>
				) : listQuery.error ? (
					<div className='flex flex-col items-center justify-center gap-2 py-16'>
						<IconAlertTriangle size={20} className='text-red-400' />
						<p className='text-xs text-red-400'>{listQuery.error.message}</p>
					</div>
				) : entries.length === 0 && !showParentRow ? (
					<div className='flex items-center justify-center py-16'>
						<p className='text-xs text-text-tertiary'>No files in this directory</p>
					</div>
				) : (
					<table className='w-full text-xs'>
						<thead className='sticky top-0 bg-surface-1/80 backdrop-blur'>
							<tr className='border-b border-border-default'>
								<th className='w-6 px-2 py-1.5'></th>
								<th className='px-2 py-1.5 text-left font-medium text-text-secondary'>Name</th>
								<th className='px-2 py-1.5 text-right font-medium text-text-secondary'>Size</th>
								<th className='px-2 py-1.5 text-left font-medium text-text-secondary'>Modified</th>
								<th className='w-24 px-2 py-1.5 text-right font-medium text-text-secondary'>Actions</th>
							</tr>
						</thead>
						<tbody>
							{showParentRow && (
								<tr
									className='cursor-pointer border-b border-border-default transition-colors hover:bg-surface-1/60'
									onClick={() => navigateTo(posixDirname(currentPath))}
								>
									<td className='px-2 py-1.5'>
										<IconFolder size={14} className='text-blue-400' />
									</td>
									<td className='px-2 py-1.5 font-mono text-text-primary' colSpan={4}>
										..
									</td>
								</tr>
							)}
							{entries.map((entry) => {
								const {Icon, color} = entryIcon(entry)
								const isDir = entry.type === 'dir'
								const isSymlink = entry.type === 'symlink'
								const fullPath = posixJoin(currentPath, entry.name)
								const editable = canEdit(entry)

								return (
									<tr
										key={entry.name}
										className={cn(
											'border-b border-border-default last:border-0 transition-colors hover:bg-surface-1/60',
											isDir && 'cursor-pointer',
										)}
										onClick={() => onRowClick(entry)}
									>
										<td className='px-2 py-1.5'>
											<Icon size={14} className={color} />
										</td>
										<td className='px-2 py-1.5 font-mono text-text-primary'>
											<span className={cn(isDir && 'text-blue-400')}>{entry.name}</span>
											{isSymlink && entry.target && (
												<span className='ml-2 text-text-tertiary'>→ {entry.target}</span>
											)}
										</td>
										<td className='px-2 py-1.5 text-right font-mono tabular-nums text-text-secondary'>
											{entry.type === 'file' ? prettyBytes(entry.size) : ''}
										</td>
										<td className='px-2 py-1.5 text-text-tertiary' title={new Date(entry.mtime * 1000).toISOString()}>
											{formatDistanceToNow(new Date(entry.mtime * 1000), {addSuffix: true})}
										</td>
										<td className='px-2 py-1.5'>
											<div className='flex items-center justify-end gap-1'>
												{/* Download (CFB-02) — only for files */}
												{entry.type === 'file' && (
													<a
														href={`/api/docker/container/${encodeURIComponent(containerName)}/file?path=${encodeURIComponent(fullPath)}`}
														download={`${entry.name}.tar`}
														title='Download as .tar archive'
														onClick={(e) => e.stopPropagation()}
														className='inline-flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-surface-2 hover:text-text-primary'
													>
														<IconDownload size={14} />
													</a>
												)}
												{/* Edit (CFB-04) — files only; disabled for non-text or large files */}
												{entry.type === 'file' && (
													<button
														onClick={(e) => {
															e.stopPropagation()
															handleEditClick(entry)
														}}
														disabled={!editable}
														title={
															editable
																? 'Edit file'
																: entry.size >= MAX_EDIT_BYTES
																	? 'File too large to edit inline (max 1MB)'
																	: 'File type not editable inline'
														}
														className={cn(
															'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
															editable
																? 'text-text-tertiary hover:bg-surface-2 hover:text-text-primary'
																: 'cursor-not-allowed text-text-tertiary/40',
														)}
													>
														<IconPencil size={14} />
													</button>
												)}
												{/* Delete (CFB-05) */}
												<button
													onClick={(e) => {
														e.stopPropagation()
														handleDeleteClick(entry)
													}}
													title={isDir ? 'Delete directory' : 'Delete file'}
													className='inline-flex h-6 w-6 items-center justify-center rounded text-text-tertiary hover:bg-red-500/20 hover:text-red-400'
												>
													<IconTrash size={14} />
												</button>
											</div>
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				)}
			</div>

			{/* Help text below table */}
			<p className='shrink-0 text-[10px] text-text-tertiary'>
				Downloads return a .tar archive. Edit is limited to text files under 1MB.
			</p>

			{/* Edit modal (CFB-04) */}
			<Dialog
				open={editingPath !== null}
				onOpenChange={(open) => {
					if (!open) {
						setEditingPath(null)
						setEditContent('')
						setEditError(null)
					}
				}}
			>
				<DialogContent className='!max-w-3xl'>
					<DialogHeader>
						<DialogTitle>Edit {editingPath ?? ''}</DialogTitle>
					</DialogHeader>
					{editLoading ? (
						<div className='flex items-center justify-center py-12'>
							<IconLoader2 size={20} className='animate-spin text-text-tertiary' />
							<span className='ml-2 text-xs text-text-tertiary'>Loading file...</span>
						</div>
					) : editError ? (
						<div className='flex flex-col items-center justify-center gap-2 py-8'>
							<IconAlertTriangle size={20} className='text-red-400' />
							<p className='text-xs text-red-400'>{editError}</p>
						</div>
					) : (
						<textarea
							value={editContent}
							onChange={(e) => setEditContent(e.target.value)}
							className='w-full rounded-lg border border-border-default bg-neutral-900 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/50'
							style={{
								fontFamily: "'JetBrains Mono','Fira Code',monospace",
								fontSize: '13px',
								minHeight: '400px',
								lineHeight: '1.6',
								resize: 'vertical',
								tabSize: 2,
							}}
							spellCheck={false}
						/>
					)}
					<DialogFooter>
						<button
							onClick={() => {
								setEditingPath(null)
								setEditContent('')
								setEditError(null)
							}}
							className='rounded-lg bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2'
						>
							Cancel
						</button>
						<button
							onClick={handleEditSave}
							disabled={editLoading || !!editError || writeMutation.isPending}
							className='rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50'
						>
							{writeMutation.isPending ? 'Saving...' : 'Save'}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation (CFB-05) */}
			<Dialog
				open={deleteTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteTarget(null)
						setDeleteRecursiveConfirmed(false)
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{deleteTarget?.type === 'dir' ? 'Delete directory?' : 'Delete file?'}
						</DialogTitle>
					</DialogHeader>
					{deleteTarget && (
						<div className='space-y-3 text-sm text-text-secondary'>
							{deleteTarget.type === 'dir' ? (
								<>
									<p>
										Delete <span className='font-mono text-text-primary'>{deleteTarget.name}</span> and{' '}
										<span className='text-red-400'>everything inside it</span>? This cannot be undone.
									</p>
									<label className='flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2'>
										<Checkbox
											checked={deleteRecursiveConfirmed}
											onCheckedChange={(checked) => setDeleteRecursiveConfirmed(checked === true)}
											className='mt-0.5'
										/>
										<span className='text-xs text-amber-200'>
											Yes, recursively delete this directory and all contents
										</span>
									</label>
								</>
							) : (
								<p>
									Delete <span className='font-mono text-text-primary'>{deleteTarget.name}</span>? This cannot be undone.
								</p>
							)}
						</div>
					)}
					<DialogFooter>
						<button
							onClick={() => {
								setDeleteTarget(null)
								setDeleteRecursiveConfirmed(false)
							}}
							className='rounded-lg bg-surface-1 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2'
						>
							Cancel
						</button>
						<button
							onClick={handleDeleteConfirm}
							disabled={
								deleteMutation.isPending ||
								(deleteTarget?.type === 'dir' && !deleteRecursiveConfirmed)
							}
							className='rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50'
						>
							{deleteMutation.isPending ? 'Deleting...' : 'Delete'}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
