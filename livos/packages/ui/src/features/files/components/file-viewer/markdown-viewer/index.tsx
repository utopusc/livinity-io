import {markdown} from '@codemirror/lang-markdown'
import CodeMirror from '@uiw/react-codemirror'
import DOMPurify from 'dompurify'
import {marked} from 'marked'
import {useEffect, useMemo, useState} from 'react'
import {toast} from 'sonner'

import DownloadDialog from '@/features/files/components/file-viewer/downloader'
import {ViewerWrapper} from '@/features/files/components/file-viewer/viewer-wrapper'
import {FileSystemItem} from '@/features/files/types'
import {t} from '@/utils/i18n'

interface MarkdownViewerProps {
	item: FileSystemItem
}

type LoadState = 'loading' | 'ready' | 'over-cap' | 'error'

export default function MarkdownViewer({item}: MarkdownViewerProps) {
	const [content, setContent] = useState('')
	const [loadState, setLoadState] = useState<LoadState>('loading')
	const [saving, setSaving] = useState(false)
	const [showPreview, setShowPreview] = useState(true)
	const previewUrl = `/api/files/view?path=${encodeURIComponent(item.path)}`

	useEffect(() => {
		let cancelled = false
		const load = async () => {
			try {
				const res = await fetch(previewUrl)
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

	// marked output is UNTRUSTED (multi-user box) → ALWAYS sanitize through DOMPurify before innerHTML.
	const safeHtml = useMemo(() => {
		const rendered = marked.parse(content, {async: false}) as string
		return DOMPurify.sanitize(rendered)
	}, [content])

	if (loadState === 'over-cap') return <DownloadDialog />

	const handleSave = async () => {
		setSaving(true)
		try {
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
				className='flex h-[80svh] w-[min(1200px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white text-black shadow-lg'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2'>
					<span className='truncate text-sm font-medium'>{item.name}</span>
					<div className='flex shrink-0 items-center gap-2'>
						<button
							type='button'
							onClick={() => setShowPreview((v) => !v)}
							className='rounded-md border border-black/15 px-3 py-1 text-sm font-medium transition-colors hover:bg-black/5'
						>
							{showPreview ? t('files-editor.hide-preview') : t('files-editor.show-preview')}
						</button>
						<button
							type='button'
							onClick={handleSave}
							disabled={saving || loadState !== 'ready'}
							className='rounded-md bg-black px-3 py-1 text-sm font-medium text-white transition-opacity disabled:opacity-40'
						>
							{saving ? t('files-editor.saving') : t('files-editor.save')}
						</button>
					</div>
				</div>
				<div className='flex min-h-0 flex-1'>
					{loadState === 'loading' && <div className='p-4 text-sm text-black/50'>{t('files-editor.loading')}</div>}
					{loadState === 'error' && <div className='p-4 text-sm text-red-600'>{t('files-editor.error-load')}</div>}
					{loadState === 'ready' && (
						<>
							<div className={`min-h-0 overflow-auto ${showPreview ? 'w-1/2 border-r border-black/10' : 'w-full'}`}>
								<CodeMirror
									value={content}
									height='100%'
									extensions={[markdown()]}
									onChange={(val) => setContent(val)}
									className='h-full text-sm'
								/>
							</div>
							{showPreview && (
								<div
									className='prose prose-sm min-h-0 w-1/2 max-w-none overflow-auto p-4'
									// safeHtml is DOMPurify-sanitized marked output (see safeHtml memo above)
									dangerouslySetInnerHTML={{__html: safeHtml}}
								/>
							)}
						</>
					)}
				</div>
			</div>
		</ViewerWrapper>
	)
}
