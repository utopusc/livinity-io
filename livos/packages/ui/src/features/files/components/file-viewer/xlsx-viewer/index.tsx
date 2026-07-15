import ExcelJS from 'exceljs'
import {useEffect, useState} from 'react'

import DownloadDialog from '@/features/files/components/file-viewer/downloader'
import {ViewerWrapper} from '@/features/files/components/file-viewer/viewer-wrapper'
import {FileSystemItem} from '@/features/files/types'
import {t} from '@/utils/i18n'

interface XlsxViewerProps {
	item: FileSystemItem
}

type LoadState = 'loading' | 'ready' | 'over-cap' | 'error'

interface SheetData {
	name: string
	rows: string[][]
	truncated: boolean
}

// Read-only render caps (defense-in-depth on top of the 329-07 server 25 MB preview ceiling).
const MAX_ROWS = 500
const MAX_COLS = 50

export default function XlsxViewer({item}: XlsxViewerProps) {
	const [sheets, setSheets] = useState<SheetData[]>([])
	const [activeSheet, setActiveSheet] = useState(0)
	const [loadState, setLoadState] = useState<LoadState>('loading')
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
				const arrayBuffer = await res.arrayBuffer()
				const workbook = new ExcelJS.Workbook()
				await workbook.xlsx.load(arrayBuffer)
				const parsed: SheetData[] = workbook.worksheets.map((ws) => {
					const rows: string[][] = []
					let truncated = false
					ws.eachRow({includeEmpty: true}, (row, rowNumber) => {
						if (rowNumber > MAX_ROWS) {
							truncated = true
							return
						}
						const cells: string[] = []
						for (let c = 1; c <= Math.min(ws.columnCount, MAX_COLS); c++) {
							cells.push(row.getCell(c).text ?? '')
						}
						if (ws.columnCount > MAX_COLS) truncated = true
						rows.push(cells)
					})
					return {name: ws.name, rows, truncated}
				})
				if (!cancelled) {
					setSheets(parsed)
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

	const current = sheets[activeSheet]

	return (
		<ViewerWrapper>
			<div
				className='flex h-[80svh] w-[min(1200px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg bg-white text-black shadow-lg'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2'>
					<span className='truncate text-sm font-medium'>{item.name}</span>
					<span className='shrink-0 text-xs text-black/40'>{t('files-editor.readonly')}</span>
				</div>
				{loadState === 'ready' && sheets.length > 1 && (
					<div className='flex shrink-0 gap-1 overflow-x-auto border-b border-black/10 px-2 py-1'>
						{sheets.map((s, i) => (
							<button
								key={s.name + i}
								type='button'
								onClick={() => setActiveSheet(i)}
								className={`shrink-0 rounded px-2 py-1 text-xs ${i === activeSheet ? 'bg-black text-white' : 'hover:bg-black/5'}`}
							>
								{s.name}
							</button>
						))}
					</div>
				)}
				<div className='min-h-0 flex-1 overflow-auto'>
					{loadState === 'loading' && <div className='p-4 text-sm text-black/50'>{t('files-editor.loading')}</div>}
					{loadState === 'error' && <div className='p-4 text-sm text-red-600'>{t('files-editor.error-load')}</div>}
					{loadState === 'ready' && current && (
						<div className='p-2'>
							<table className='border-collapse text-xs'>
								<tbody>
									{current.rows.map((row, ri) => (
										<tr key={ri}>
											{row.map((cell, ci) => (
												<td key={ci} className='max-w-[240px] truncate border border-black/10 px-2 py-1'>
													{cell}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
							{current.truncated && <div className='p-2 text-xs text-black/40'>{t('files-editor.truncated')}</div>}
						</div>
					)}
				</div>
			</div>
		</ViewerWrapper>
	)
}
