import {useState} from 'react'

import {
	IconAlertTriangle,
	IconChevronDown,
	IconChevronRight,
	IconLoader2,
	IconTool,
} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'
import type {ChatMessage, ChatToolCall} from '@/hooks/use-agent-socket'

import {StreamingMessage} from './streaming-message'

// --- AgentToolCallDisplay ---

/** Strip mcp__servername__ prefix for display */
function formatToolName(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

export function AgentToolCallDisplay({toolCall}: {toolCall: ChatToolCall}) {
	const [expanded, setExpanded] = useState(false)

	const statusBadge = (() => {
		switch (toolCall.status) {
			case 'running':
				return <IconLoader2 size={14} className='ml-auto animate-spin text-zinc-400' />
			case 'complete':
				return <span className='ml-auto text-xs text-green-400'>OK</span>
			case 'error':
				return <span className='ml-auto text-xs text-red-400'>FAIL</span>
		}
	})()

	return (
		<div className='rounded-lg border border-zinc-700/50 bg-zinc-900/50 text-sm'>
			<button
				onClick={() => setExpanded(!expanded)}
				className='flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50'
			>
				{expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
				<IconTool size={14} className='text-blue-400' />
				<span className='font-mono font-medium text-blue-400'>{formatToolName(toolCall.name)}</span>
				{statusBadge}
			</button>
			{expanded && (
				<div className='border-t border-zinc-700/50 px-3 py-2'>
					<div className='mb-1 text-xs uppercase text-zinc-500'>Input</div>
					<pre className='mb-2 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-400'>
						{JSON.stringify(toolCall.input, null, 2)}
					</pre>
					{toolCall.output != null && (
						<>
							<div className='mb-1 text-xs uppercase text-zinc-500'>Output</div>
							<pre className='max-h-40 overflow-auto whitespace-pre-wrap text-xs text-zinc-400'>
								{toolCall.output.slice(0, 2000)}
							</pre>
						</>
					)}
				</div>
			)}
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
				<StreamingMessage content={message.content} isStreaming={message.isStreaming} />
				{message.toolCalls && message.toolCalls.length > 0 && (
					<div className='mt-2 space-y-1'>
						{message.toolCalls.map((tc) => (
							<AgentToolCallDisplay key={tc.id} toolCall={tc} />
						))}
					</div>
				)}
			</div>
		</div>
	)
}

// --- SystemMessage ---

export function SystemMessage({message}: {message: ChatMessage}) {
	return (
		<div className='py-2 text-center'>
			<span className='text-xs italic text-zinc-500'>{message.content}</span>
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
