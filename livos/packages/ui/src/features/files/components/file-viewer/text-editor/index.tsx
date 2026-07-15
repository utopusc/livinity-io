import {javascript} from '@codemirror/lang-javascript'
import {json} from '@codemirror/lang-json'
import {markdown} from '@codemirror/lang-markdown'
import type {Extension} from '@codemirror/state'
import CodeMirror from '@uiw/react-codemirror'
import {useEffect, useState} from 'react'
import {toast} from 'sonner'

import DownloadDialog from '@/features/files/components/file-viewer/downloader'
import {ViewerWrapper} from '@/features/files/components/file-viewer/viewer-wrapper'
import {FileSystemItem} from '@/features/files/types'
import {t} from '@/utils/i18n'

interface TextEditorViewerProps {
	item: FileSystemItem
}

// Pick a CodeMirror language extension from the file name; plain text = no highlighting.
function getLangExtension(name: string): Extension[] {
	const ext = name.split('.').pop()?.toLowerCase()
	switch (ext) {
		case 'md':
		case 'markdown':
			return [markdown()]
		case 'json':
			return [json()]
		case 'js':
		case 'jsx':
		case 'mjs':
		case 'cjs':
			return [javascript({jsx: true})]
		case 'ts':
			return [javascript({typescript: true})]
		case 'tsx':
			return [javascript({jsx: true, typescript: true})]
		default:
			return []
	}
}

type LoadState = 'loading' | 'ready' | 'over-cap' | 'error'

export default function TextEditorViewer({item}: TextEditorViewerProps) {
	const [content, setContent] = useState('')
	const [loadState, setLoadState] = useState<LoadState>('loading')
	const [saving, setSaving] = useState(false)
	const previewUrl = `/api/files/view?path=${encodeURIComponent(item.path)}`

	// Load content, but honor the 329-07 server-side size signal: files larger than the
	// edit ceiling (X-Edit-Max-Bytes) route to the DownloadDialog rather than the editor.
	useEffect(() => {
		let cancelled = false
		const load = async () => {
			try {
				const res = await fetch(previewUrl)
				// /view hard-413s past the 25 MB preview ceiling.
				if (res.status === 413) {
					if (!cancelled) setLoadState('over-cap')
					return
				}
				if (!res.ok) {
					if (!cancelled) setLoadState('error')
					return
				}
				const fileSize = Number(res.headers.get('X-File-Size') ?? '0')
				const editMax = Number(res.headers.get('X-Edit-Max-Bytes') ?? '0')
				// Over the edit cap (but under the preview ceiling) → not editable, download instead.
				if (editMax > 0 && fileSize > editMax) {
					if (!cancelled) setLoadState('over-cap')
					return
				}
				const text = await res.text()
				if (!cancelled) {
					setContent(text)
					setLoadState('ready')
				}
			} catch {
				if (!cancelled) setLoadState('error')
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [previewUrl])

	// Over-cap text falls back to the standard download confirmation (per the server size signal).
	if (loadState === 'over-cap') return <DownloadDialog />

	const handleSave = async () => {
		setSaving(true)
		try {
			// MUST use the 329-07 quota + writable gated route — never /upload.
			const res = await fetch('/api/files/save-text', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({path: item.path, content}),
			})
			if (!res.ok) {
				if (res.status === 413) {
					toast.error(t('files-editor.error-quota'))
				} else if (res.status === 403) {
					toast.error(t('files-editor.error-not-allowed'))
				} else {
					toast.error(t('files-editor.error-save'))
				}
				return
			}
			toast.success(t('files-editor.saved'))
		} catch {
			toast.error(t('files-editor.error-save'))
		} finally {
			setSaving(false)
		}
	}

	return (
		<ViewerWrapper dontCloseOnSpacebar>
			<div
				className='flex h-[80svh] w-[min(1024px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white text-black shadow-lg'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2'>
					<span className='truncate text-sm font-medium'>{item.name}</span>
					<button
						type='button'
						onClick={handleSave}
						disabled={saving || loadState !== 'ready'}
						className='shrink-0 rounded-md bg-black px-3 py-1 text-sm font-medium text-white transition-opacity disabled:opacity-40'
					>
						{saving ? t('files-editor.saving') : t('files-editor.save')}
					</button>
				</div>
				<div className='min-h-0 flex-1 overflow-auto'>
					{loadState === 'loading' && <div className='p-4 text-sm text-black/50'>{t('files-editor.loading')}</div>}
					{loadState === 'error' && <div className='p-4 text-sm text-red-600'>{t('files-editor.error-load')}</div>}
					{loadState === 'ready' && (
						<CodeMirror
							value={content}
							height='100%'
							extensions={getLangExtension(item.name)}
							onChange={(val) => setContent(val)}
							className='h-full text-sm'
						/>
					)}
				</div>
			</div>
		</ViewerWrapper>
	)
}
