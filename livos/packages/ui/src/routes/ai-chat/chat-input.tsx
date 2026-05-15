import {useEffect, useRef, useState, useCallback} from 'react'

import {IconPlayerStop, IconSend, IconPaperclip, IconX, IconFile, IconPhoto} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'
import {useKeyboardHeight} from '@/hooks/use-keyboard-height'
import {useIsMobile} from '@/hooks/use-is-mobile'

import {SlashCommandMenu, type SlashCommand} from './slash-command-menu'

export interface FileAttachment {
	name: string
	mimeType: string
	data: string // base64
	size: number
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,text/markdown,application/json'

interface ChatInputProps {
	value: string
	onChange: (value: string) => void
	onSend: (attachments?: FileAttachment[]) => void
	onStop: () => void
	isStreaming: boolean
	isConnected: boolean
	disabled?: boolean
	onSlashAction?: (action: string) => void
}

export function ChatInput({value, onChange, onSend, onStop, isStreaming, isConnected, disabled, onSlashAction}: ChatInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const [filteredCount, setFilteredCount] = useState(0)
	const filteredCommandsRef = useRef<SlashCommand[]>([])
	const [attachments, setAttachments] = useState<FileAttachment[]>([])
	const [isDragging, setIsDragging] = useState(false)
	const keyboardHeight = useKeyboardHeight()
	const isMobile = useIsMobile()

	// Scroll input into view when iOS keyboard opens
	useEffect(() => {
		if (isMobile && keyboardHeight > 0 && textareaRef.current) {
			// Small delay to let the viewport settle
			const timer = setTimeout(() => {
				textareaRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'})
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [keyboardHeight, isMobile])

	const processFiles = useCallback((files: FileList | File[]) => {
		for (const file of Array.from(files)) {
			if (file.size > MAX_FILE_SIZE) {
				alert(`${file.name} is too large (max 20MB)`)
				continue
			}
			const reader = new FileReader()
			reader.onload = () => {
				const base64 = (reader.result as string).split(',')[1]
				setAttachments(prev => [...prev, {
					name: file.name,
					mimeType: file.type || 'application/octet-stream',
					data: base64,
					size: file.size,
				}])
			}
			reader.readAsDataURL(file)
		}
	}, [])

	const removeAttachment = useCallback((index: number) => {
		setAttachments(prev => prev.filter((_, i) => i !== index))
	}, [])

	// Slash menu visibility: show when input starts with / and has no spaces
	const showSlashMenu = value.startsWith('/') && !value.includes(' ')
	const slashFilter = showSlashMenu ? value.slice(1).toLowerCase() : ''

	// Reset selectedIndex when filter changes
	useEffect(() => {
		setSelectedIndex(0)
	}, [slashFilter])

	// Focus textarea on mount
	useEffect(() => {
		textareaRef.current?.focus()
	}, [])

	// Auto-resize textarea
	const handleChange = (text: string) => {
		onChange(text)
		const el = textareaRef.current
		if (el) {
			el.style.height = 'auto'
			el.style.height = Math.min(el.scrollHeight, 144) + 'px'
		}
	}

	const handleSelectCommand = (command: SlashCommand) => {
		// UI-action commands handled locally
		if (command.name === '/new' || command.name === '/agents') {
			onChange('')
			onSlashAction?.(command.name)
			return
		}
		// All other commands: insert and send
		onChange(command.name)
		setTimeout(() => {
			onSend(attachments.length > 0 ? attachments : undefined)
			setAttachments([])
		}, 0)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Slash menu keyboard navigation takes priority
		if (showSlashMenu && filteredCount > 0) {
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedIndex((prev) => Math.max(0, prev - 1))
				return
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedIndex((prev) => Math.min(filteredCount - 1, prev + 1))
				return
			}
			if (e.key === 'Enter') {
				e.preventDefault()
				const cmd = filteredCommandsRef.current[selectedIndex]
				if (cmd) handleSelectCommand(cmd)
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				onChange('')
				return
			}
		}
		// Existing Enter-to-send logic (only fires when slash menu is NOT open)
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			if (value.trim() || attachments.length > 0) {
				onSend(attachments.length > 0 ? attachments : undefined)
				setAttachments([])
			}
		}
	}

	const placeholder = !isConnected ? 'Reconnecting...' : isStreaming ? 'Type to send a follow-up...' : 'Message Liv...'

	const isDisabled = disabled || false

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		if (e.dataTransfer.files.length > 0) {
			processFiles(e.dataTransfer.files)
		}
	}, [processFiles])

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
	}, [])

	const handlePaste = useCallback((e: React.ClipboardEvent) => {
		const files = Array.from(e.clipboardData.items)
			.filter(item => item.kind === 'file')
			.map(item => item.getAsFile())
			.filter((f): f is File => f !== null)
		if (files.length > 0) {
			e.preventDefault()
			processFiles(files)
		}
	}, [processFiles])

	const isImage = (mime: string) => mime.startsWith('image/')
	const formatSize = (bytes: number) => bytes < 1024 ? `${bytes}B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`

	return (
		<div
			className='border-t border-line bg-card-bg p-3 md:p-5'
			style={isMobile && keyboardHeight > 0 ? {paddingBottom: `${keyboardHeight + 12}px`} : undefined}
		>
			<div
				className={cn('relative mx-auto max-w-3xl', isDragging && 'rounded-[var(--r-xl)] ring-2 ring-[color:var(--fg)]/30 ring-offset-2 ring-offset-card-bg')}
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
			>
				{/* Attachment previews */}
				{attachments.length > 0 && (
					<div className='mb-2 flex flex-wrap gap-2 overflow-x-hidden'>
						{attachments.map((att, i) => (
							<div key={i} className='flex items-center gap-1.5 rounded-full border border-line bg-[color:var(--bg-2)] px-2.5 py-1 text-[12px] text-[color:var(--fg-mute)]'>
								{isImage(att.mimeType) ? <IconPhoto size={14} className='text-[color:var(--fg)]' /> : <IconFile size={14} className='text-[color:var(--fg-mute)]' />}
								<span className='max-w-[120px] truncate text-[color:var(--fg)]'>{att.name}</span>
								<span className='text-[color:var(--fg-faint)]'>({formatSize(att.size)})</span>
								<button onClick={() => removeAttachment(i)} className='ml-0.5 text-[color:var(--fg-faint)] hover:text-accent-red'>
									<IconX size={12} />
								</button>
							</div>
						))}
					</div>
				)}

				{showSlashMenu && (
					<SlashCommandMenu
						filter={slashFilter}
						selectedIndex={selectedIndex}
						onSelect={handleSelectCommand}
						onFilteredCountChange={setFilteredCount}
						filteredCommandsRef={filteredCommandsRef}
					/>
				)}

				{/* v36 composer pill — flex container morphs into a rounded-full
				    surface with an inline icon button + textarea + send button.
				    Border lights up on focus-within (the textarea inside takes
				    focus, but the wrapper styling stays put). */}
				<div className='flex items-end gap-1.5 rounded-full border border-line bg-[color:var(--bg-2)] pl-2 pr-1.5 py-1.5 transition-colors focus-within:border-line-strong focus-within:bg-[color:var(--bg)]'>
					{/* Attach button */}
					<input
						ref={fileInputRef}
						type='file'
						multiple
						accept={ACCEPTED_TYPES}
						className='hidden'
						onChange={(e) => {
							if (e.target.files) processFiles(e.target.files)
							e.target.value = ''
						}}
					/>
					<button
						onClick={() => fileInputRef.current?.click()}
						disabled={isDisabled}
						className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[color:var(--fg-mute)] transition-colors hover:bg-[color:var(--bg)] hover:text-[color:var(--fg)] disabled:opacity-40'
						title='Attach file'
					>
						<IconPaperclip size={18} />
					</button>

					<textarea
						ref={textareaRef}
						value={value}
						onChange={(e) => handleChange(e.target.value)}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
						placeholder={isDragging ? 'Drop files here...' : placeholder}
						disabled={isDisabled}
						rows={1}
						className={cn(
							'w-full min-h-[40px] resize-none bg-transparent px-2 py-2 text-[14px] leading-[1.5] text-[color:var(--fg)]',
							'placeholder:text-[color:var(--fg-faint)] outline-none border-none',
							'disabled:opacity-50',
						)}
					/>

					{isStreaming ? (
						<>
							<button
								onClick={() => { onSend(attachments.length > 0 ? attachments : undefined); setAttachments([]) }}
								disabled={!value.trim() && attachments.length === 0}
								className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-40'
								title='Send follow-up'
							>
								<IconSend size={16} />
							</button>
							<button
								onClick={onStop}
								className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-red/15 text-accent-red transition-colors hover:bg-accent-red/25'
								title='Stop'
							>
								<IconPlayerStop size={16} />
							</button>
						</>
					) : (
						<button
							onClick={() => { onSend(attachments.length > 0 ? attachments : undefined); setAttachments([]) }}
							disabled={(!value.trim() && attachments.length === 0) || !isConnected}
							className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--fg)] text-[color:var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-40'
							title='Send'
						>
							<IconSend size={16} />
						</button>
					)}
				</div>
			</div>
			{!isConnected && !isStreaming && (
				<div className='mx-auto mt-1 max-w-3xl'>
					<span className='text-[11px] text-[color:var(--fg-faint)]'>Disconnected -- attempting to reconnect...</span>
				</div>
			)}
		</div>
	)
}
