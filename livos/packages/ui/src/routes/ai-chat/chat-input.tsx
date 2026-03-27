import {useEffect, useRef} from 'react'

import {IconPlayerStop, IconSend} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

interface ChatInputProps {
	value: string
	onChange: (value: string) => void
	onSend: () => void
	onStop: () => void
	isStreaming: boolean
	isConnected: boolean
	disabled?: boolean
}

export function ChatInput({value, onChange, onSend, onStop, isStreaming, isConnected, disabled}: ChatInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)

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

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault()
			if (!isStreaming && value.trim()) {
				onSend()
			}
		}
	}

	const placeholder = !isConnected ? 'Reconnecting...' : isStreaming ? 'Agent is working...' : 'Message Liv...'

	const isDisabled = disabled || isStreaming

	return (
		<div className='border-t border-zinc-800 bg-zinc-950 p-3 md:p-4'>
			<div className='mx-auto flex max-w-3xl items-end gap-3'>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => handleChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={isDisabled}
					rows={1}
					className={cn(
						'w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100',
						'placeholder:text-zinc-500 outline-none transition-colors',
						'focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20',
						'disabled:opacity-50',
						!isConnected && 'opacity-50',
					)}
				/>
				{isStreaming ? (
					<button
						onClick={onStop}
						className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20'
						title='Stop'
					>
						<IconPlayerStop size={18} />
					</button>
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
					<span className='text-xs text-zinc-500'>Disconnected -- attempting to reconnect...</span>
				</div>
			)}
		</div>
	)
}
