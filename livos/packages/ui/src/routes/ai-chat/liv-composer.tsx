/**
 * LivComposer — Phase 70-01.
 *
 * Auto-grow textarea + file attachment carry-over (drag/drop/paste/click) +
 * slash/mention trigger detection. Ports `chat-input.tsx` logic verbatim with
 * P66 design-token replacement and adds new mention-trigger detection. NO
 * menus rendered internally — slash menu (70-02) and mention menu (70-07) are
 * mounted by the integration plan (70-08); this component only emits derived
 * `data-show-slash` / `data-show-mention` attributes for tests + integration.
 *
 * The stop button and model badge are rendered as STUBS so 70-06 (LivStopButton)
 * and 70-08 (real LivModelBadge) can swap them cleanly via prop shape.
 *
 * Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` SHA
 * `4f868d318abff71f8c8bfbcf443b2393a553018b` is NOT touched by this component.
 *
 * Design refs:
 *   - 70-CONTEXT D-07 D-NO-NEW-DEPS — uses only existing deps.
 *   - 70-CONTEXT D-08 D-NO-DELETE — `chat-input.tsx` is left alone.
 *   - 70-CONTEXT D-18..D-21 — auto-grow / submit / file / trigger contracts.
 *   - 70-CONTEXT D-30 — VoiceButton imported AS-IS, no rewrite.
 *   - P66 design tokens — `var(--liv-*)` for all colors.
 */

import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'

import {
	IconFile,
	IconPaperclip,
	IconPhoto,
	IconX,
} from '@tabler/icons-react'

import {useIsMobile} from '@/hooks/use-is-mobile'
import {useKeyboardHeight} from '@/hooks/use-keyboard-height'
import {cn} from '@/shadcn-lib/utils'

import {LivMentionMenu, type Mention} from './components/liv-mention-menu'
import {LivModelBadge} from './components/liv-model-badge'
import {executeImmediateCommand, LivSlashMenu, type SlashCommand} from './components/liv-slash-menu'
import {LivStopButton} from './components/liv-stop-button'
import {VoiceButton} from './voice-button'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileAttachment {
	name: string
	mimeType: string
	data: string // base64
	size: number
}

export interface LivComposerProps {
	value: string
	onChange: (value: string) => void
	onSend: (attachments?: FileAttachment[]) => void
	onStop: () => void
	isStreaming: boolean
	isConnected: boolean
	disabled?: boolean
	onSlashAction?: (action: string) => void
	// Placeholder for 70-07 (mention menu); composer only emits the show/filter
	// signal via data attribute today.
	onSelectMention?: (mention: string) => void
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB (D-20)
export const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,text/markdown,application/json'

export const MIN_HEIGHT_PX = 24 // D-18
export const MAX_HEIGHT_PX = 200 // D-18

// Slash trigger: starts with `/`, no space yet (D-21).
export const SLASH_PATTERN = /^\/[^\s]*$/

// Mention trigger: tail of input is `@xxx` after a space or at start (D-21).
// Capture group 2 is the filter substring (chars after the `@`).
export const MENTION_PATTERN = /(\s|^)@(\S*)$/

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Slash-menu visibility (D-21).
 *   shouldShowSlashMenu('/cle')   ⇒ true
 *   shouldShowSlashMenu('/clear ') ⇒ false (slash + space ⇒ menu closed)
 *   shouldShowSlashMenu('hello')  ⇒ false
 */
export function shouldShowSlashMenu(value: string): boolean {
	return SLASH_PATTERN.test(value)
}

/**
 * Mention-menu visibility (D-21) with mutual exclusion vs slash.
 *   shouldShowMentionMenu('@al')        ⇒ {show: true, filter: 'al'}
 *   shouldShowMentionMenu('hello @ag')  ⇒ {show: true, filter: 'ag'}
 *   shouldShowMentionMenu('/clear')     ⇒ {show: false, filter: ''} (slash priority)
 *   shouldShowMentionMenu('hello world')⇒ {show: false, filter: ''}
 */
export function shouldShowMentionMenu(value: string): {show: boolean; filter: string} {
	if (shouldShowSlashMenu(value)) return {show: false, filter: ''}
	const match = value.match(MENTION_PATTERN)
	return match ? {show: true, filter: match[2]} : {show: false, filter: ''}
}

/**
 * Auto-grow height calc (D-18). Clamps DOM `scrollHeight` to [MIN, MAX].
 *   calculateTextareaHeight(100) ⇒ 100
 *   calculateTextareaHeight(20)  ⇒ 24  (min)
 *   calculateTextareaHeight(300) ⇒ 200 (max)
 */
export function calculateTextareaHeight(scrollHeight: number): number {
	return Math.min(Math.max(scrollHeight, MIN_HEIGHT_PX), MAX_HEIGHT_PX)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const isImage = (mime: string) => mime.startsWith('image/')
const formatSize = (bytes: number) =>
	bytes < 1024
		? `${bytes}B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(0)}KB`
			: `${(bytes / (1024 * 1024)).toFixed(1)}MB`

// ── Component ────────────────────────────────────────────────────────────────

export function LivComposer({
	value,
	onChange,
	onSend,
	onStop,
	isStreaming,
	isConnected,
	disabled,
	onSlashAction,
	onSelectMention,
}: LivComposerProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [attachments, setAttachments] = useState<FileAttachment[]>([])
	const [isDragging, setIsDragging] = useState(false)

	// Slash + mention menu state (70-08 wires real menus). Selection indices
	// live in composer so keyboard nav (Up/Down/Enter/Esc) is centralized.
	const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
	const [slashFilteredCount, setSlashFilteredCount] = useState(0)
	const slashFilteredRef = useRef<SlashCommand[]>([])

	const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
	const [mentionFilteredCount, setMentionFilteredCount] = useState(0)
	const mentionFilteredRef = useRef<Mention[]>([])

	const keyboardHeight = useKeyboardHeight()
	const isMobile = useIsMobile()

	// Auto-grow on every value change (D-18). useLayoutEffect avoids visible
	// resize flash by syncing height before paint.
	useLayoutEffect(() => {
		const el = textareaRef.current
		if (!el) return
		el.style.height = 'auto'
		el.style.height = `${calculateTextareaHeight(el.scrollHeight)}px`
	}, [value])

	// Scroll input into view when iOS keyboard opens (port from chat-input.tsx).
	useEffect(() => {
		if (isMobile && keyboardHeight > 0 && textareaRef.current) {
			const timer = setTimeout(() => {
				textareaRef.current?.scrollIntoView({behavior: 'smooth', block: 'end'})
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [keyboardHeight, isMobile])

	// Focus textarea on mount.
	useEffect(() => {
		textareaRef.current?.focus()
	}, [])

	// File processing — ported verbatim from chat-input.tsx (D-20).
	const processFiles = useCallback((files: FileList | File[]) => {
		for (const file of Array.from(files)) {
			if (file.size > MAX_FILE_SIZE) {
				alert(`${file.name} is too large (max 20MB)`)
				continue
			}
			const reader = new FileReader()
			reader.onload = () => {
				const base64 = (reader.result as string).split(',')[1]
				setAttachments(prev => [
					...prev,
					{
						name: file.name,
						mimeType: file.type || 'application/octet-stream',
						data: base64,
						size: file.size,
					},
				])
			}
			reader.readAsDataURL(file)
		}
	}, [])

	const removeAttachment = useCallback((index: number) => {
		setAttachments(prev => prev.filter((_, i) => i !== index))
	}, [])

	// Drag/drop handlers (D-20).
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setIsDragging(false)
			if (e.dataTransfer.files.length > 0) {
				processFiles(e.dataTransfer.files)
			}
		},
		[processFiles],
	)

	// Paste handler (D-20).
	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const files = Array.from(e.clipboardData.items)
				.filter(item => item.kind === 'file')
				.map(item => item.getAsFile())
				.filter((f): f is File => f !== null)
			if (files.length > 0) {
				e.preventDefault()
				processFiles(files)
			}
		},
		[processFiles],
	)

	// Derived menu visibility (data attrs for tests + 70-08 integration).
	const slashOpen = shouldShowSlashMenu(value)
	const mention = shouldShowMentionMenu(value)
	const slashFilter = slashOpen ? value.slice(1).toLowerCase() : ''
	const showSlash = slashOpen && !disabled
	const showMention = mention.show && !slashOpen && !disabled
	const placeholder = !isConnected
		? 'Reconnecting...'
		: isStreaming
			? 'Type to send a follow-up...'
			: 'Message Liv...'
	const hasContent = value.trim().length > 0 || attachments.length > 0

	// Reset selection index when filtered count shrinks past current index.
	useEffect(() => {
		if (selectedSlashIndex >= slashFilteredCount && slashFilteredCount > 0) {
			setSelectedSlashIndex(0)
		}
	}, [slashFilteredCount, selectedSlashIndex])

	useEffect(() => {
		if (selectedMentionIndex >= mentionFilteredCount && mentionFilteredCount > 0) {
			setSelectedMentionIndex(0)
		}
	}, [mentionFilteredCount, selectedMentionIndex])

	// Slash command selection — immediate-fire commands clear input + dispatch
	// onSlashAction; arg-bearing commands prefill input with `cmd.name + ' '`.
	const handleSelectSlash = useCallback(
		(cmd: SlashCommand) => {
			if (executeImmediateCommand(cmd.name)) {
				onSlashAction?.(cmd.name)
				onChange('')
			} else {
				onChange(cmd.name + ' ')
			}
			setSelectedSlashIndex(0)
		},
		[onChange, onSlashAction],
	)

	// Mention selection — replace the trailing `@filter` capture with `@<name> `.
	const handleSelectMention = useCallback(
		(m: Mention) => {
			const replaced = value.replace(MENTION_PATTERN, (_match, leading: string) => `${leading}@${m.name} `)
			onChange(replaced)
			onSelectMention?.(m.name)
			setSelectedMentionIndex(0)
		},
		[value, onChange, onSelectMention],
	)

	// Send wrapper — used by LivStopButton + Enter handler.
	const handleSend = useCallback(() => {
		if (!value.trim() && attachments.length === 0) return
		onSend(attachments.length > 0 ? attachments : undefined)
		setAttachments([])
	}, [value, attachments, onSend])

	// Submit guard — Enter sends, Shift+Enter newline, IME suppresses (D-19).
	// Slash/mention menus take priority when visible.
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Slash menu navigation (priority over send, priority over mention).
		if (showSlash && slashFilteredCount > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedSlashIndex((i) => Math.min(i + 1, slashFilteredCount - 1))
				return
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedSlashIndex((i) => Math.max(i - 1, 0))
				return
			}
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault()
				const cmd = slashFilteredRef.current[selectedSlashIndex]
				if (cmd) handleSelectSlash(cmd)
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				onChange('')
				return
			}
		}
		// Mention menu navigation (only when slash isn't priority).
		if (showMention && mentionFilteredCount > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				setSelectedMentionIndex((i) => Math.min(i + 1, mentionFilteredCount - 1))
				return
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				setSelectedMentionIndex((i) => Math.max(i - 1, 0))
				return
			}
			if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault()
				const m = mentionFilteredRef.current[selectedMentionIndex]
				if (m) handleSelectMention(m)
				return
			}
			if (e.key === 'Escape') {
				e.preventDefault()
				// Strip trailing @filter so menu closes; preserve preceding text.
				onChange(value.replace(MENTION_PATTERN, (_m, leading: string) => leading))
				return
			}
		}
		// Default: send-on-enter.
		if (
			e.key === 'Enter' &&
			!e.shiftKey &&
			!e.nativeEvent.isComposing &&
			!disabled &&
			!isStreaming
		) {
			e.preventDefault()
			handleSend()
		}
	}

	return (
		<div
			className={cn(
				'liv-composer relative flex flex-col gap-2 rounded-xl border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-3 transition-colors',
				isDragging && 'border-[color:var(--liv-accent-cyan)]',
			)}
			data-tour='composer'
			data-show-slash={slashOpen}
			data-show-mention={mention.show ? 'true' : 'false'}
			data-mention-filter={mention.filter}
			style={isMobile && keyboardHeight > 0 ? {paddingBottom: `${keyboardHeight + 12}px`} : undefined}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={e => e.preventDefault()}
			onDrop={handleDrop}
		>
			{/* Attachment preview chips (D-20) */}
			{attachments.length > 0 && (
				<div className='flex flex-wrap gap-2 overflow-x-hidden'>
					{attachments.map((att, i) => (
						<div
							key={i}
							className='flex items-center gap-1.5 rounded-md border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-deep)] px-2 py-1 text-xs text-[color:var(--liv-text-secondary)]'
						>
							{isImage(att.mimeType) ? (
								<IconPhoto size={14} className='text-[color:var(--liv-accent-cyan)]' />
							) : (
								<IconFile size={14} className='text-[color:var(--liv-accent-amber)]' />
							)}
							<span className='max-w-[120px] truncate'>{att.name}</span>
							<span className='text-[color:var(--liv-text-tertiary)]'>({formatSize(att.size)})</span>
							<button
								type='button'
								onClick={() => removeAttachment(i)}
								className='ml-0.5 text-[color:var(--liv-text-tertiary)] transition-colors hover:text-[color:var(--liv-accent-rose)]'
								aria-label={`Remove ${att.name}`}
							>
								<IconX size={12} />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Textarea (D-18 / D-19) */}
			<textarea
				ref={textareaRef}
				value={value}
				onChange={e => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				placeholder={isDragging ? 'Drop files here...' : placeholder}
				disabled={disabled}
				rows={1}
				className={cn(
					'w-full resize-none border-0 bg-transparent text-sm text-[color:var(--liv-text-primary)] outline-none',
					'placeholder:text-[color:var(--liv-text-tertiary)]',
					'disabled:opacity-50',
				)}
				style={{minHeight: MIN_HEIGHT_PX, maxHeight: MAX_HEIGHT_PX}}
			/>

			{/* Footer row: attach, voice, model badge stub, slash hint, send/stop stub */}
			<div className='flex items-center gap-2'>
				<input
					ref={fileInputRef}
					type='file'
					multiple
					accept={ACCEPTED_TYPES}
					className='hidden'
					onChange={e => {
						if (e.target.files) processFiles(e.target.files)
						e.target.value = ''
					}}
				/>
				<button
					type='button'
					onClick={() => fileInputRef.current?.click()}
					disabled={disabled}
					aria-label='Attach file'
					title='Attach file'
					className='flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--liv-text-secondary)] transition-colors hover:bg-[color:var(--liv-bg-deep)] hover:text-[color:var(--liv-text-primary)] disabled:opacity-40'
				>
					<IconPaperclip size={18} />
				</button>

				{/* Voice button — reused as-is per D-30. Sets composer value via onTranscript. */}
				<VoiceButton
					disabled={disabled}
					onTranscript={text => onChange(value ? `${value} ${text}` : text)}
				/>

				<LivModelBadge />

				<span
					data-tour='slash-hint'
					className='ml-auto hidden text-xs text-[color:var(--liv-text-tertiary)] md:inline'
				>
					Press <kbd className='rounded border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-deep)] px-1 font-mono'>/</kbd> for commands
				</span>

				<LivStopButton
					isStreaming={isStreaming}
					hasContent={hasContent}
					disabled={disabled || !isConnected}
					onSend={handleSend}
					onStop={onStop}
				/>
			</div>

			{/* Slash + mention menus (mutually exclusive — slash priority via showMention guard) */}
			{showSlash && (
				<LivSlashMenu
					filter={slashFilter}
					selectedIndex={selectedSlashIndex}
					onSelect={handleSelectSlash}
					onFilteredCountChange={setSlashFilteredCount}
					filteredCommandsRef={slashFilteredRef}
				/>
			)}
			{showMention && (
				<LivMentionMenu
					filter={mention.filter}
					selectedIndex={selectedMentionIndex}
					onSelect={handleSelectMention}
					onFilteredCountChange={setMentionFilteredCount}
					filteredMentionsRef={mentionFilteredRef}
				/>
			)}

			{/* Drag overlay */}
			{isDragging && (
				<div className='pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-[color:var(--liv-accent-cyan)] bg-[color:var(--liv-bg-deep)]/80 text-sm text-[color:var(--liv-text-primary)]'>
					Drop files here
				</div>
			)}
		</div>
	)
}

export default LivComposer
