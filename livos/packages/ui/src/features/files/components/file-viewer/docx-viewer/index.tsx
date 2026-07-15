import DOMPurify from 'dompurify'
import mammoth from 'mammoth'
import {useEffect, useState} from 'react'

import DownloadDialog from '@/features/files/components/file-viewer/downloader'
import {ViewerWrapper} from '@/features/files/components/file-viewer/viewer-wrapper'
import {FileSystemItem} from '@/features/files/types'
import {t} from '@/utils/i18n'

interface DocxViewerProps {
	item: FileSystemItem
}

type LoadState = 'loading' | 'ready' | 'over-cap' | 'error'

// Read-only docx preview: mammoth converts to HTML, which is UNTRUSTED (multi-user box —
// documents may come from other users) → ALWAYS sanitized through DOMPurify before innerHTML.
export default function DocxViewer({item}: DocxViewerProps) {
	const [safeHtml, setSafeHtml] = useState('')
	const [loadState, setLoadState] = useState<LoadState>('loading')
	const previewUrl = `/api/files/view?path=${encodeURIComponent(item.path)}`

	useEffect(() => {
		let cancelled = false
		const load = async () => {
			try {
				const res = await fetch(previewUrl)
				// /view hard-413s past the 25 MB preview ceiling → download instead.
				if (res.status === 413) {
					if (!cancelled) setLoadState('over-cap')
					return
				}
				if (!res.ok) {
					if (!cancelled) setLoadState('error')
					return
				}
				const arrayBuffer = await res.arrayBuffer()
				const result = await mammoth.convertToHtml({arrayBuffer})
				// NO raw-innerHTML path: sanitize before it can ever reach the DOM.
				const clean = DOMPurify.sanitize(result.value)
				if (!cancelled) {
					setSafeHtml(clean)
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

	if (loadState === 'over-cap') return <DownloadDialog />

	return (
		<ViewerWrapper>
			<div
				className='flex h-[80svh] w-[min(900px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white text-black shadow-lg'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='border-b border-black/10 px-4 py-2'>
					<span className='truncate text-sm font-medium'>{item.name}</span>
				</div>
				<div className='min-h-0 flex-1 overflow-auto'>
					{loadState === 'loading' && <div className='p-4 text-sm text-black/50'>{t('files-editor.loading')}</div>}
					{loadState === 'error' && <div className='p-4 text-sm text-red-600'>{t('files-editor.error-load')}</div>}
					{loadState === 'ready' && (
						<div
							className='prose prose-sm max-w-none p-6'
							// safeHtml is DOMPurify-sanitized mammoth output (see load() above)
							dangerouslySetInnerHTML={{__html: safeHtml}}
						/>
					)}
				</div>
			</div>
		</ViewerWrapper>
	)
}
