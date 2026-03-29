import {useEffect, useState} from 'react'

import {AnimatePresence, motion} from 'framer-motion'
import {
	IconAlertTriangle,
	IconBox,
	IconCheck,
	IconChevronDown,
	IconChevronRight,
	IconFile,
	IconLoader2,
	IconTerminal2,
	IconTool,
	IconX,
} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'
import type {ChatMessage, ChatToolCall} from '@/hooks/use-agent-socket'

import {StreamingMessage} from './streaming-message'

// --- Helpers ---

/** Strip mcp__servername__ prefix for display */
function formatToolName(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

/** Get the raw tool name for classification (strip mcp prefix) */
function getRawToolName(name: string): string {
	return formatToolName(name).toLowerCase()
}

/** Determine tool-specific icon and color from tool name */
function getToolIcon(name: string): {icon: typeof IconTool; color: string} {
	const raw = getRawToolName(name)
	if (/shell|command|bash|exec/.test(raw)) {
		return {icon: IconTerminal2, color: 'text-amber-400'}
	}
	if (/file|read|write|edit/.test(raw)) {
		return {icon: IconFile, color: 'text-blue-400'}
	}
	if (/docker|container/.test(raw)) {
		return {icon: IconBox, color: 'text-cyan-400'}
	}
	return {icon: IconTool, color: 'text-blue-400'}
}

/** Check if tool is a shell/command type */
function isShellTool(name: string): boolean {
	return /shell|command|bash|exec/.test(getRawToolName(name))
}

/** Check if tool is a file read type */
function isFileReadTool(name: string): boolean {
	return /read_file|file_read/.test(getRawToolName(name))
}

/** Format elapsed seconds for display */
function formatElapsed(seconds: number): string {
	if (seconds < 1) return '<1s'
	if (seconds < 60) return `${seconds.toFixed(1)}s`
	const mins = Math.floor(seconds / 60)
	const secs = seconds % 60
	return `${mins}m ${secs.toFixed(0)}s`
}

// --- Tool Output Rendering ---

function renderToolInput(toolCall: ChatToolCall): React.ReactNode {
	const raw = getRawToolName(toolCall.name)

	// Shell commands: show just the command string
	if (isShellTool(toolCall.name) && toolCall.input.command) {
		return (
			<div className='rounded bg-surface-2 p-2 font-mono text-xs text-text-primary'>
				<span className='text-text-tertiary'>$ </span>
				{String(toolCall.input.command)}
			</div>
		)
	}

	// File operations: show just the path
	if (/file|read|write|edit/.test(raw)) {
		const path = toolCall.input.path || toolCall.input.file_path || toolCall.input.filename
		if (path) {
			return (
				<div className='rounded bg-surface-2 px-2 py-1.5 font-mono text-xs text-text-primary'>
					{String(path)}
				</div>
			)
		}
	}

	// Default: prettified JSON
	return (
		<pre className='overflow-x-auto whitespace-pre-wrap text-xs text-text-secondary'>
			{JSON.stringify(toolCall.input, null, 2)}
		</pre>
	)
}

function ToolOutput({toolCall}: {toolCall: ChatToolCall}) {
	const [showFull, setShowFull] = useState(false)

	if (toolCall.output == null) return null

	const output = toolCall.output
	const isLong = output.length > 1500
	const displayOutput = !showFull && isLong ? output.slice(0, 1500) + '...' : output

	// Shell commands: monospace pre with command header
	if (isShellTool(toolCall.name)) {
		return (
			<div>
				<pre className='max-h-60 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 font-mono text-xs text-text-primary'>
					{displayOutput}
				</pre>
				{isLong && (
					<button
						onClick={(e) => {
							e.stopPropagation()
							setShowFull(!showFull)
						}}
						className='mt-1 text-xs text-blue-400 hover:text-blue-300'
					>
						{showFull ? 'Show less' : `Show more (${output.length.toLocaleString()} chars)`}
					</button>
				)}
			</div>
		)
	}

	// File read: filename header + content
	if (isFileReadTool(toolCall.name)) {
		const filePath = (toolCall.input.path || toolCall.input.file_path) as string | undefined
		return (
			<div>
				{filePath && (
					<div className='mb-1 font-mono text-xs text-text-tertiary'>{filePath}</div>
				)}
				<pre className='max-h-80 overflow-auto whitespace-pre-wrap rounded bg-surface-2 p-2 font-mono text-xs text-text-primary'>
					{displayOutput}
				</pre>
				{isLong && (
					<button
						onClick={(e) => {
							e.stopPropagation()
							setShowFull(!showFull)
						}}
						className='mt-1 text-xs text-blue-400 hover:text-blue-300'
					>
						{showFull ? 'Show less' : `Show more (${output.length.toLocaleString()} chars)`}
					</button>
				)}
			</div>
		)
	}

	// Default: scrollable output
	return (
		<div>
			<pre className='max-h-60 overflow-auto whitespace-pre-wrap text-xs text-text-secondary'>
				{displayOutput}
			</pre>
			{isLong && (
				<button
					onClick={(e) => {
						e.stopPropagation()
						setShowFull(!showFull)
					}}
					className='mt-1 text-xs text-blue-400 hover:text-blue-300'
				>
					{showFull ? 'Show less' : `Show more (${output.length.toLocaleString()} chars)`}
				</button>
			)}
		</div>
	)
}

// --- AgentToolCallDisplay (Claude Code inline style) ---

/** Build a brief one-line input summary for the tool header */
function toolInputSummary(toolCall: ChatToolCall): string {
	const raw = getRawToolName(toolCall.name)
	if (isShellTool(toolCall.name) && toolCall.input.command) {
		const cmd = String(toolCall.input.command).trim()
		return cmd.length > 80 ? cmd.slice(0, 77) + '...' : cmd
	}
	if (/file|read|write|edit/.test(raw)) {
		const path = toolCall.input.path || toolCall.input.file_path || toolCall.input.filename
		if (path) return String(path)
	}
	if (/docker/.test(raw) && toolCall.input.action) {
		return String(toolCall.input.action) + (toolCall.input.name ? ` ${toolCall.input.name}` : '')
	}
	const keys = Object.keys(toolCall.input).slice(0, 2)
	if (keys.length === 0) return ''
	return keys.map(k => {
		const v = String(toolCall.input[k]).slice(0, 40)
		return `${k}=${v}`
	}).join(', ')
}

export function AgentToolCallDisplay({toolCall}: {toolCall: ChatToolCall}) {
	const [expanded, setExpanded] = useState(false)

	// Auto-expand on error
	useEffect(() => {
		if (toolCall.status === 'error') {
			setExpanded(true)
		}
	}, [toolCall.status])

	const {icon: ToolIcon, color: iconColor} = getToolIcon(toolCall.name)
	const summary = toolInputSummary(toolCall)

	const statusDot = (() => {
		switch (toolCall.status) {
			case 'running':
				return <IconLoader2 size={12} className='flex-shrink-0 animate-spin text-blue-400' />
			case 'complete':
				return <span className='flex-shrink-0 inline-block h-2 w-2 rounded-full bg-green-400' />
			case 'error':
				return <span className='flex-shrink-0 inline-block h-2 w-2 rounded-full bg-red-400' />
		}
	})()

	return (
		<div className='my-1'>
			{/* Compact header — Claude Code style */}
			<button
				onClick={() => setExpanded(!expanded)}
				className='group flex w-full items-center gap-1.5 text-left text-xs hover:bg-surface-1/50 rounded px-1 py-0.5 -mx-1'
			>
				{statusDot}
				<ToolIcon size={13} className={cn(iconColor, 'flex-shrink-0')} />
				<span className={cn('font-mono font-medium', iconColor)}>{formatToolName(toolCall.name)}</span>
				{summary && (
					<span className='truncate font-mono text-text-secondary'>
						{isShellTool(toolCall.name) ? `$ ${summary}` : summary}
					</span>
				)}
				{toolCall.elapsedSeconds != null && toolCall.status === 'running' && (
					<span className='ml-auto font-mono text-text-secondary'>{formatElapsed(toolCall.elapsedSeconds)}</span>
				)}
				<IconChevronRight size={12} className={cn('ml-auto flex-shrink-0 text-text-secondary transition-transform', expanded && 'rotate-90')} />
			</button>

			{/* Expandable output */}
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						key='content'
						initial={{height: 0, opacity: 0}}
						animate={{height: 'auto', opacity: 1}}
						exit={{height: 0, opacity: 0}}
						transition={{duration: 0.15, ease: 'easeInOut'}}
						className='overflow-hidden'
					>
						<div className='ml-5 mt-0.5 border-l-2 border-surface-2 pl-3 pb-1'>
							{/* Error */}
							{toolCall.status === 'error' && (toolCall.errorMessage || toolCall.output) && (
								<div className='rounded bg-red-500/10 px-2 py-1 text-xs text-red-400'>
									{toolCall.errorMessage || toolCall.output}
								</div>
							)}

							{/* Output */}
							{toolCall.output != null && toolCall.status !== 'error' && (
								<ToolOutput toolCall={toolCall} />
							)}

							{/* Input details (only if no output yet) */}
							{toolCall.output == null && toolCall.status === 'running' && (
								<div className='text-xs text-text-secondary'>{renderToolInput(toolCall)}</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

// --- UserMessage ---

export function UserMessage({message}: {message: ChatMessage}) {
	return (
		<div className='flex justify-end'>
			<div className='max-w-[85%] rounded-2xl rounded-br-md bg-blue-600/90 px-4 py-2.5 text-white'>
				<p className='whitespace-pre-wrap text-sm'>{message.content}</p>
			</div>
		</div>
	)
}

// --- AssistantMessage ---

export function AssistantMessage({message}: {message: ChatMessage}) {
	return (
		<div className='flex justify-start'>
			<div className='max-w-[90%] border-l-2 border-violet-500/30 pl-4'>
				{/* Thinking indicator — only while streaming with no content yet */}
				{message.isStreaming && !message.content && (!message.toolCalls || message.toolCalls.length === 0) && (
					<div className='flex items-center gap-2 py-1 text-sm text-text-secondary'>
						<IconLoader2 size={14} className='animate-spin text-violet-400' />
						<span>Thinking...</span>
					</div>
				)}
				{/* Tool calls shown inline — Claude Code style */}
				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className='mb-1'>
						{message.toolCalls.map((tc) => (
							<AgentToolCallDisplay key={tc.id} toolCall={tc} />
						))}
					</div>
				)}
				<StreamingMessage content={message.content} isStreaming={message.isStreaming} />
			</div>
		</div>
	)
}

// --- SystemMessage ---

export function SystemMessage({message}: {message: ChatMessage}) {
	return (
		<div className='py-2 text-center'>
			<span className='text-xs italic text-text-tertiary'>{message.content}</span>
		</div>
	)
}

// --- ErrorMessage ---

export function ErrorMessage({message}: {message: ChatMessage}) {
	return (
		<div className='flex justify-start'>
			<div className='w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400'>
				<div className='flex items-start gap-2'>
					<IconAlertTriangle size={16} className='mt-0.5 flex-shrink-0' />
					<span className='whitespace-pre-wrap'>{message.content}</span>
				</div>
			</div>
		</div>
	)
}

// --- ChatMessageItem (dispatcher) ---

/**
 * Detect error messages dispatched by the ADD_ERROR reducer action.
 * These messages have role='system' and id starting with 'err_'.
 */
function isErrorMessage(message: ChatMessage): boolean {
	return message.id.startsWith('err_')
}

export function ChatMessageItem({message}: {message: ChatMessage}) {
	if (message.role === 'user') {
		return <UserMessage message={message} />
	}

	if (message.role === 'assistant') {
		return <AssistantMessage message={message} />
	}

	// System messages -- check if it's an error
	if (isErrorMessage(message)) {
		return <ErrorMessage message={message} />
	}

	return <SystemMessage message={message} />
}
