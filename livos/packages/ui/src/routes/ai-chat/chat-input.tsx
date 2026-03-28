import {useEffect, useRef, useState} from 'react'

import {IconPlayerStop, IconSend} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

import {SlashCommandMenu, type SlashCommand} from './slash-command-menu'

interface ChatInputProps {
	value: string
	onChange: (value: string) => void
	onSend: () => void
	onStop: () => void
	isStreaming: boolean
	isConnected: boolean
	disabled?: boolean
	onSlashAction?: (action: string) => void
}

export function ChatInput({value, onChange, onSend, onStop, isStreaming, isConnected, disabled, onSlashAction}: ChatInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const [filteredCount, setFilteredCount] = useState(0)
	const filteredCommandsRef = useRef<SlashCommand[]>([])

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
		setTimeout(() => onSend(), 0)
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
			if (value.trim()) {
				onSend()
			}
		}
	}

	const placeholder = !isConnected ? 'Reconnecting...' : isStreaming ? 'Type to send a follow-up...' : 'Message Liv...'

	const isDisabled = disabled || false

	return (
		<div className='border-t border-border-default bg-surface-base p-3 md:p-4'>
			<div className='relative mx-auto flex max-w-3xl items-end gap-3'>
				{showSlashMenu && (
					<SlashCommandMenu
						filter={slashFilter}
						selectedIndex={selectedIndex}
						onSelect={handleSelectCommand}
						onFilteredCountChange={setFilteredCount}
						filteredCommandsRef={filteredCommandsRef}
					/>
				)}
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => handleChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={isDisabled}
					rows={1}
					className={cn(
						'w-full resize-none rounded-lg border border-border-default bg-surface-1 px-4 py-3 text-sm text-text-primary',
						'placeholder:text-text-tertiary outline-none transition-colors',
						'focus:border-brand/50 focus:ring-1 focus:ring-brand/20',
						'disabled:opacity-50',
					)}
				/>
				{isStreaming ? (
					<>
						<button
							onClick={onSend}
							disabled={!value.trim()}
							className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600/80 text-white transition-colors hover:bg-blue-500 disabled:opacity-40'
							title='Send follow-up'
						>
							<IconSend size={18} />
						</button>
						<button
							onClick={onStop}
							className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20'
							title='Stop'
						>
							<IconPlayerStop size={18} />
						</button>
					</>
				) : (
					<button
						onClick={onSend}
						disabled={!value.trim() || !isConnected}
						className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40'
						title='Send'
					>
						<IconSend size={18} />
					</button>
				)}
			</div>
			{!isConnected && !isStreaming && (
				<div className='mx-auto mt-1 max-w-3xl'>
					<span className='text-xs text-text-tertiary'>Disconnected -- attempting to reconnect...</span>
				</div>
			)}
		</div>
	)
}
