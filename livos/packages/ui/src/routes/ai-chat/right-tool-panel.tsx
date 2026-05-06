/**
 * RightToolPanel — fixed 480px right overlay showing tool call activity
 * during agent streaming.
 *
 * Usage:
 *   <RightToolPanel
 *     messages={agent.messages}
 *     isStreaming={agent.isStreaming}
 *     open={toolPanelOpen}
 *     onClose={() => setToolPanelOpen(false)}
 *   />
 *
 * The panel auto-opens when the first tool call arrives during streaming.
 * Cmd+I (Mac) / Ctrl+I (Win/Linux) toggles it from the parent via onClose.
 */

import {useEffect, useRef, useState} from 'react'

import {AnimatePresence, motion} from 'framer-motion'
import {
	IconChevronDown,
	IconChevronRight,
	IconCheck,
	IconLoader2,
	IconAlertCircle,
	IconTool,
	IconTerminal2,
	IconFile,
	IconBox,
	IconDeviceDesktop,
	IconWorld,
	IconX,
	IconActivity,
} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'
import type {ChatMessage, ChatToolCall} from '@/hooks/use-agent-socket'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PanelToolCall extends ChatToolCall {
	/** Timestamp when this tool call was first observed (ms since epoch) */
	startedAt: number
}

// ---------------------------------------------------------------------------
// Helpers — tool classification
// ---------------------------------------------------------------------------

function stripMcpPrefix(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

function rawName(name: string): string {
	return stripMcpPrefix(name).toLowerCase()
}

type ToolCategory = 'computer-use' | 'browser' | 'shell' | 'file' | 'docker' | 'other'

function classifyTool(name: string): ToolCategory {
	const r = rawName(name)
	if (/screenshot|computer_use|click|key_press|type_text|scroll/.test(r)) return 'computer-use'
	if (/browser_navigate|browser_click|browser_get_dom|browser_screenshot|browser_/.test(r)) return 'browser'
	if (/shell|bash|exec|command/.test(r)) return 'shell'
	if (/file|read|write|edit/.test(r)) return 'file'
	if (/docker|container/.test(r)) return 'docker'
	return 'other'
}

function categoryIcon(cat: ToolCategory): {icon: typeof IconTool; color: string} {
	switch (cat) {
		case 'computer-use':
			return {icon: IconDeviceDesktop, color: 'text-amber-400'}
		case 'browser':
			return {icon: IconWorld, color: 'text-sky-400'}
		case 'shell':
			return {icon: IconTerminal2, color: 'text-amber-400'}
		case 'file':
			return {icon: IconFile, color: 'text-blue-400'}
		case 'docker':
			return {icon: IconBox, color: 'text-cyan-400'}
		default:
			return {icon: IconTool, color: 'text-violet-400'}
	}
}

/** Check if an output string or the tool input carries a base64 image */
function extractScreenshot(toolCall: ChatToolCall): string | null {
	// Check input for screenshot_base64 or image_url keys
	const input = toolCall.input as Record<string, unknown>
	if (typeof input.screenshot_base64 === 'string' && input.screenshot_base64) {
		const b64 = input.screenshot_base64
		return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
	}
	if (typeof input.image_url === 'string' && input.image_url) {
		return input.image_url
	}
	// Check output — if it looks like a data URI
	if (toolCall.output) {
		const trimmed = toolCall.output.trim()
		if (trimmed.startsWith('data:image/')) return trimmed
		// Check if output JSON has a screenshot key
		try {
			const parsed = JSON.parse(trimmed)
			if (typeof parsed.screenshot_base64 === 'string') {
				const b64 = parsed.screenshot_base64
				return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`
			}
			if (typeof parsed.image_url === 'string') return parsed.image_url
		} catch {
			// not JSON, ignore
		}
	}
	return null
}

function formatElapsed(startedAt: number, completedAt?: number): string {
	const elapsed = ((completedAt ?? Date.now()) - startedAt) / 1000
	if (elapsed < 1) return '<1s'
	if (elapsed < 60) return `${elapsed.toFixed(1)}s`
	const mins = Math.floor(elapsed / 60)
	const secs = Math.round(elapsed % 60)
	return `${mins}m ${secs}s`
}

function toolInputSummary(toolCall: ChatToolCall, maxLen = 72): string {
	const r = rawName(toolCall.name)
	const inp = toolCall.input as Record<string, unknown>

	if (/shell|bash|exec|command/.test(r) && inp.command) {
		const cmd = String(inp.command).trim()
		return cmd.length > maxLen ? cmd.slice(0, maxLen - 1) + '…' : cmd
	}
	if (/file|read|write|edit/.test(r)) {
		const path = inp.path || inp.file_path || inp.filename
		if (path) {
			const p = String(path)
			return p.length > maxLen ? '…' + p.slice(-(maxLen - 1)) : p
		}
	}
	if (/browser_navigate/.test(r) && inp.url) {
		return String(inp.url).slice(0, maxLen)
	}
	if (/browser_click/.test(r)) {
		return inp.selector ? `selector: ${String(inp.selector).slice(0, maxLen - 10)}` : ''
	}
	if (/click/.test(r) && (inp.x != null || inp.coordinate)) {
		const coord = inp.coordinate || [inp.x, inp.y]
		return `click @ ${JSON.stringify(coord)}`
	}
	if (/type_text|type/.test(r) && inp.text) {
		const t = String(inp.text)
		return t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t
	}
	if (/key/.test(r) && inp.key) return `key: ${inp.key}`
	if (/scroll/.test(r)) {
		return inp.direction ? `scroll ${inp.direction}` : 'scroll'
	}

	// Fallback: first meaningful key=value pairs
	const keys = Object.keys(inp).slice(0, 2)
	if (keys.length === 0) return ''
	return keys.map((k) => {
		const v = String(inp[k]).slice(0, 30)
		return `${k}=${v}`
	}).join(', ')
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({status}: {status: ChatToolCall['status']}) {
	switch (status) {
		case 'running':
			return (
				<span className='flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400'>
					<IconLoader2 size={9} className='animate-spin' />
					running
				</span>
			)
		case 'complete':
			return (
				<span className='flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400'>
					<IconCheck size={9} />
					done
				</span>
			)
		case 'error':
			return (
				<span className='flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400'>
					<IconAlertCircle size={9} />
					error
				</span>
			)
	}
}

// ---------------------------------------------------------------------------
// ComputerUsePreview
// ---------------------------------------------------------------------------

function ComputerUsePreview({toolCall}: {toolCall: PanelToolCall}) {
	const screenshot = extractScreenshot(toolCall)
	const inp = toolCall.input as Record<string, unknown>
	const r = rawName(toolCall.name)

	return (
		<div className='space-y-2'>
			{screenshot && (
				<img
					src={screenshot}
					alt='Computer use screenshot'
					className='w-full rounded-lg border border-liv-border object-contain'
					style={{maxHeight: '240px'}}
				/>
			)}
			{/click/.test(r) && (inp.x != null || inp.coordinate) && (
				<div className='rounded-md bg-amber-500/5 px-2 py-1.5 text-xs text-amber-400 font-mono'>
					click @ {JSON.stringify(inp.coordinate || [inp.x, inp.y])}
				</div>
			)}
			{/type/.test(r) && inp.text && (
				<div className='rounded-md bg-amber-500/5 px-2 py-1.5 text-xs text-amber-400 font-mono'>
					type: &quot;{String(inp.text).slice(0, 80)}&quot;
				</div>
			)}
			{/key/.test(r) && inp.key && (
				<div className='rounded-md bg-amber-500/5 px-2 py-1.5 text-xs text-amber-400 font-mono'>
					key: {String(inp.key)}
				</div>
			)}
			{/scroll/.test(r) && (
				<div className='rounded-md bg-amber-500/5 px-2 py-1.5 text-xs text-amber-400 font-mono'>
					scroll {inp.direction ?? ''} {inp.amount != null ? `× ${inp.amount}` : ''}
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// BrowserPreview
// ---------------------------------------------------------------------------

function BrowserPreview({toolCall}: {toolCall: PanelToolCall}) {
	const screenshot = extractScreenshot(toolCall)
	const inp = toolCall.input as Record<string, unknown>
	const r = rawName(toolCall.name)

	// Extract DOM excerpt from output
	let domExcerpt = ''
	if (toolCall.output && /get_dom/.test(r)) {
		domExcerpt = toolCall.output.slice(0, 400)
	}

	return (
		<div className='space-y-2'>
			{inp.url && (
				<div className='flex items-center gap-1.5 rounded-md border border-liv-border bg-liv-muted px-2 py-1.5'>
					<IconWorld size={11} className='flex-shrink-0 text-sky-400' />
					<span className='truncate font-mono text-[11px] text-liv-foreground'>
						{String(inp.url)}
					</span>
				</div>
			)}
			{screenshot && (
				<img
					src={screenshot}
					alt='Browser screenshot'
					className='w-full rounded-lg border border-liv-border object-contain'
					style={{maxHeight: '240px'}}
				/>
			)}
			{domExcerpt && (
				<pre className='max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-liv-muted p-2 text-[10px] text-liv-muted-foreground'>
					{domExcerpt}{toolCall.output && toolCall.output.length > 400 ? '…' : ''}
				</pre>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// GenericPreview — collapsible JSON for args + result
// ---------------------------------------------------------------------------

function GenericPreview({toolCall}: {toolCall: PanelToolCall}) {
	const [showArgs, setShowArgs] = useState(false)
	const [showResult, setShowResult] = useState(false)
	const hasArgs = Object.keys(toolCall.input).length > 0
	const hasResult = toolCall.output != null

	return (
		<div className='space-y-1.5'>
			{hasArgs && (
				<div>
					<button
						onClick={() => setShowArgs((v) => !v)}
						className='flex items-center gap-1 text-[10px] font-medium text-liv-muted-foreground hover:text-liv-foreground'
					>
						{showArgs ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
						Args
					</button>
					{showArgs && (
						<pre className='mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-liv-muted p-2 text-[10px] text-liv-muted-foreground'>
							{JSON.stringify(toolCall.input, null, 2)}
						</pre>
					)}
				</div>
			)}
			{hasResult && (
				<div>
					<button
						onClick={() => setShowResult((v) => !v)}
						className='flex items-center gap-1 text-[10px] font-medium text-liv-muted-foreground hover:text-liv-foreground'
					>
						{showResult ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />}
						Result
					</button>
					{showResult && (
						<pre className='mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-liv-muted p-2 text-[10px] text-liv-muted-foreground'>
							{toolCall.output}
						</pre>
					)}
				</div>
			)}
		</div>
	)
}

// ---------------------------------------------------------------------------
// ToolCallCard
// ---------------------------------------------------------------------------

function ToolCallCard({toolCall, defaultExpanded}: {toolCall: PanelToolCall; defaultExpanded: boolean}) {
	const [expanded, setExpanded] = useState(defaultExpanded)
	const cat = classifyTool(toolCall.name)
	const {icon: CatIcon, color: iconColor} = categoryIcon(cat)
	const summary = toolInputSummary(toolCall)
	const displayName = stripMcpPrefix(toolCall.name)

	// Auto-expand on error
	useEffect(() => {
		if (toolCall.status === 'error') setExpanded(true)
	}, [toolCall.status])

	const completedAt = toolCall.status !== 'running' ? toolCall.startedAt + (toolCall.elapsedSeconds ?? 0) * 1000 : undefined

	return (
		<div className={cn(
			'rounded-xl border border-liv-border bg-liv-card transition-colors',
			toolCall.status === 'error' && 'border-red-500/30 bg-red-500/5',
		)}>
			{/* Card header — always visible */}
			<button
				onClick={() => setExpanded((v) => !v)}
				className='flex w-full items-start gap-2.5 px-3 py-2.5 text-left'
			>
				<div className='mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-liv-muted'>
					<CatIcon size={13} className={iconColor} />
				</div>
				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-2'>
						<span className='font-mono text-xs font-semibold text-liv-foreground truncate'>
							{displayName}
						</span>
						<StatusBadge status={toolCall.status} />
						<span className='ml-auto flex-shrink-0 font-mono text-[10px] text-liv-muted-foreground'>
							{formatElapsed(toolCall.startedAt, completedAt)}
						</span>
					</div>
					{summary && (
						<p className='mt-0.5 truncate font-mono text-[11px] text-liv-muted-foreground'>
							{summary}
						</p>
					)}
				</div>
				<div className='mt-0.5 flex-shrink-0 text-liv-muted-foreground'>
					{expanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
				</div>
			</button>

			{/* Expandable body */}
			<AnimatePresence initial={false}>
				{expanded && (
					<motion.div
						key='body'
						initial={{height: 0, opacity: 0}}
						animate={{height: 'auto', opacity: 1}}
						exit={{height: 0, opacity: 0}}
						transition={{duration: 0.15, ease: 'easeInOut'}}
						className='overflow-hidden'
					>
						<div className='border-t border-liv-border px-3 pb-3 pt-2.5'>
							{cat === 'computer-use' && <ComputerUsePreview toolCall={toolCall} />}
							{cat === 'browser' && <BrowserPreview toolCall={toolCall} />}
							{cat !== 'computer-use' && cat !== 'browser' && <GenericPreview toolCall={toolCall} />}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

// ---------------------------------------------------------------------------
// RightToolPanel — public export
// ---------------------------------------------------------------------------

export interface RightToolPanelProps {
	messages: ChatMessage[]
	isStreaming: boolean
	open: boolean
	onClose: () => void
}

export function RightToolPanel({messages, isStreaming, open, onClose}: RightToolPanelProps) {
	// Collect all tool calls from all assistant messages, newest first
	const [panelToolCalls, setPanelToolCalls] = useState<PanelToolCall[]>([])
	const seenIdsRef = useRef<Set<string>>(new Set())
	// Track when each tool call was first seen so we have a stable startedAt
	const startedAtMapRef = useRef<Map<string, number>>(new Map())

	useEffect(() => {
		const allCalls: PanelToolCall[] = []
		for (const msg of messages) {
			if (msg.role !== 'assistant') continue
			const toolCalls = msg.toolCalls ?? []
			for (const tc of toolCalls) {
				// Record startedAt on first encounter
				if (!startedAtMapRef.current.has(tc.id)) {
					startedAtMapRef.current.set(tc.id, Date.now())
				}
				seenIdsRef.current.add(tc.id)
				allCalls.push({
					...tc,
					startedAt: startedAtMapRef.current.get(tc.id)!,
				})
			}
		}
		// Newest first — reverse order so latest tool call is at top
		allCalls.reverse()
		setPanelToolCalls(allCalls)
	}, [messages])

	// Keyboard shortcut Cmd+I / Ctrl+I — handled in parent via onClose prop.
	// The panel also accepts its own Escape key to close.
	useEffect(() => {
		if (!open) return
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', handler)
		return () => document.removeEventListener('keydown', handler)
	}, [open, onClose])

	// Scroll-to-top ref when new calls arrive
	const scrollRef = useRef<HTMLDivElement>(null)
	const prevCountRef = useRef(0)
	useEffect(() => {
		if (panelToolCalls.length > prevCountRef.current && open) {
			scrollRef.current?.scrollTo({top: 0, behavior: 'smooth'})
		}
		prevCountRef.current = panelToolCalls.length
	}, [panelToolCalls.length, open])

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					key='right-tool-panel'
					initial={{x: 480}}
					animate={{x: 0}}
					exit={{x: 480}}
					transition={{type: 'spring', damping: 25, stiffness: 200}}
					className={cn(
						'fixed inset-y-0 right-0 z-30 flex w-[480px] flex-col',
						'border-l border-liv-border bg-liv-card shadow-2xl',
					)}
					aria-label='Tool Activity Panel'
					role='complementary'
				>
					{/* Sticky header */}
					<div className='flex flex-shrink-0 items-center justify-between border-b border-liv-border px-4 py-3'>
						<div className='flex items-center gap-2'>
							<IconActivity size={16} className='text-violet-400' />
							<span className='text-sm font-semibold text-liv-foreground'>Tool Activity</span>
							{isStreaming && panelToolCalls.length > 0 && (
								<span className='ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400' />
							)}
							{panelToolCalls.length > 0 && (
								<span className='rounded-full bg-liv-muted px-2 py-0.5 text-[10px] font-medium text-liv-muted-foreground'>
									{panelToolCalls.length}
								</span>
							)}
						</div>
						<div className='flex items-center gap-2'>
							<kbd className='hidden rounded border border-liv-border bg-liv-muted px-1.5 py-0.5 text-[10px] font-mono text-liv-muted-foreground sm:inline-flex'>
								⌘I
							</kbd>
							<button
								onClick={onClose}
								className={cn(
									'flex h-7 w-7 items-center justify-center rounded-lg',
									'text-liv-muted-foreground transition-colors',
									'hover:bg-liv-accent hover:text-liv-accent-foreground',
									'focus:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring',
								)}
								aria-label='Close tool panel'
							>
								<IconX size={15} />
							</button>
						</div>
					</div>

					{/* Scrollable body */}
					<div
						ref={scrollRef}
						className='flex-1 overflow-y-auto overflow-x-hidden p-3'
					>
						{panelToolCalls.length === 0 ? (
							<div className='flex h-full flex-col items-center justify-center gap-3 py-16 text-center'>
								<div className='flex h-12 w-12 items-center justify-center rounded-xl bg-liv-muted'>
									<IconActivity size={22} className='text-liv-muted-foreground/50' />
								</div>
								<p className='max-w-[240px] text-sm text-liv-muted-foreground'>
									No tool activity yet — start a task that uses tools.
								</p>
							</div>
						) : (
							<div className='space-y-2'>
								{panelToolCalls.map((tc, idx) => (
									<ToolCallCard
										key={tc.id}
										toolCall={tc}
										defaultExpanded={idx === 0}
									/>
								))}
							</div>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
