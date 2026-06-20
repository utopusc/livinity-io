// Phase 290 R2 (R3) — custom icon picker.
//
// Two ways to set a shortcut icon: upload an image (read to a `data:` URL,
// capped at 256 KB, image/* only) OR paste an icon URL. Last-set wins. The
// `shortcuts.icon_url` column is TEXT and rendered as <img src> so a `data:`
// URL works directly — NO box Supabase round-trip (H2/H3 bound the size).

import {useRef, useState} from 'react'

const MAX_ICON_BYTES = 256 * 1024 // 256 KB (H2)

export type IconPickerProps = {
	/** Current icon value (http(s) URL or data: URL). */
	value: string
	onChange: (next: string) => void
	/** Optional id prefix for label/input wiring. */
	idPrefix?: string
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
		reader.onerror = () => reject(reader.error ?? new Error('read failed'))
		reader.readAsDataURL(file)
	})
}

export function IconPicker({value, onChange, idPrefix = 'icon-picker'}: IconPickerProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [error, setError] = useState<string | null>(null)
	const [urlDraft, setUrlDraft] = useState('')

	const handleFile = async (file: File | undefined) => {
		setError(null)
		if (!file) return
		if (!file.type.startsWith('image/')) {
			setError('Please choose an image file.')
			return
		}
		if (file.size > MAX_ICON_BYTES) {
			setError(`Image is too large (max ${Math.round(MAX_ICON_BYTES / 1024)} KB).`)
			return
		}
		try {
			const dataUrl = await readFileAsDataUrl(file)
			if (!dataUrl.startsWith('data:image/')) {
				setError('Could not read that image.')
				return
			}
			// Double-check the encoded length (a data: URL is ~4/3 of the bytes).
			if (dataUrl.length > 512000) {
				setError('Image is too large after encoding (max 256 KB).')
				return
			}
			onChange(dataUrl)
		} catch {
			setError('Could not read that image.')
		}
	}

	return (
		<div className='flex flex-col gap-2'>
			<div className='flex items-center gap-3'>
				<div className='flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50'>
					{value ? (
						// eslint-disable-next-line jsx-a11y/alt-text
						<img
							src={value}
							className='h-full w-full object-contain'
							onError={(e) => {
								;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
							}}
						/>
					) : (
						<span className='text-[10px] text-gray-400'>No icon</span>
					)}
				</div>
				<div className='flex flex-col gap-1.5'>
					<label
						htmlFor={`${idPrefix}-file`}
						className='inline-flex w-fit cursor-pointer items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100'
					>
						Upload image
					</label>
					<input
						id={`${idPrefix}-file`}
						ref={fileInputRef}
						type='file'
						accept='image/*'
						className='hidden'
						onChange={(e) => void handleFile(e.target.files?.[0])}
					/>
					{value ? (
						<button
							type='button'
							className='w-fit text-left text-[11px] text-gray-500 underline hover:text-gray-700'
							onClick={() => {
								onChange('')
								setError(null)
								if (fileInputRef.current) fileInputRef.current.value = ''
							}}
						>
							Remove icon
						</button>
					) : null}
				</div>
			</div>

			<div className='flex items-center gap-2'>
				<input
					id={`${idPrefix}-url`}
					placeholder='…or paste an icon URL'
					value={urlDraft}
					onChange={(e) => setUrlDraft(e.target.value)}
					className='min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400'
				/>
				<button
					type='button'
					className='shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50'
					disabled={!urlDraft.trim()}
					onClick={() => {
						setError(null)
						onChange(urlDraft.trim())
						setUrlDraft('')
					}}
				>
					Use URL
				</button>
			</div>

			{error ? <p className='text-xs text-red-600'>{error}</p> : null}
		</div>
	)
}
