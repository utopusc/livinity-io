// Phase 175-04 — AgentDetail view.
//
// The most feature-dense detail view in Phase 175. Sections:
//   1. Title (item.name + Bot icon — visual continuity with sidebar row)
//   2. System prompt editor — textarea (Edit tab) + streamdown preview (Preview tab)
//   3. Allowed tools list — checkbox per tool, onToolToggle callback
//   4. MCP servers list — read-only string list (mcp install UI is a Phase 177 concern)
//   5. Schedule — cron string input + Pause + Run Now buttons
//   6. Inbox preview — first 3 entries, clickable
//   7. Last-run log — link (present only when lastRunLogPath prop set)
//
// Phase 177 will plumb real data into `inbox`, `lastRunLogPath`, and wire
// the onPause / onRunNow callbacks to scheduler.runNow / .pause tRPC mutations.
// 175-04 ships the UI surface with prop-passed data + callback stubs so the
// unit tests stay deterministic.

import {Bot, FileText, Inbox, Pause, Play} from 'lucide-react'
import {Streamdown} from 'streamdown'
import {useState} from 'react'
import {trpcReact} from '@/trpc/trpc'

export interface AgentTool {
	name: string
	enabled: boolean
}

/** Phase 177-04 — shape of an inbox entry as returned by vault.inbox.listByAgent */
export interface InboxEntry {
	id: string
	agentId: string
	runId: string
	runAt: string
	triggeredBy: 'cron' | 'manual'
	durationMs: number
	status: 'success' | 'failed'
	read: boolean
	filePath: string
}

export interface AgentDetailProps {
	item: {id: string; name: string}
	systemPrompt?: string
	onPromptChange?: (next: string) => void
	tools?: readonly AgentTool[]
	onToolToggle?: (toolName: string, nextEnabled: boolean) => void
	mcpServers?: readonly string[]
	schedule?: string
	onScheduleChange?: (next: string) => void
	onPause?: () => void
	onRunNow?: () => void
	lastRunLogPath?: string
	onOpenLastRunLog?: (path: string) => void
}

type Tab = 'edit' | 'preview'

export function AgentDetail({
	item,
	systemPrompt = '',
	onPromptChange,
	tools,
	onToolToggle,
	mcpServers,
	schedule = '',
	onScheduleChange,
	onPause,
	onRunNow,
	lastRunLogPath,
	onOpenLastRunLog,
}: AgentDetailProps) {
	const [tab, setTab] = useState<Tab>('edit')

	// Phase 177-04 — live inbox data from tRPC (replaces Phase 175 inbox prop stub)
	const inboxQuery = trpcReact.vault.inbox.listByAgent.useQuery({agentId: item.id})
	const markReadMutation = trpcReact.vault.inbox.markRead.useMutation()
	const inboxSlice = (inboxQuery.data?.entries ?? []).slice(0, 3)

	return (
		<div className='flex h-full flex-col gap-4 overflow-y-auto p-4'>
			{/* Title */}
			<div className='flex items-center gap-2'>
				<Bot size={20} className='lucide-bot text-accent-blue' />
				<h2 className='text-lg font-semibold'>{item.name}</h2>
			</div>

			{/* System prompt — Edit / Preview tabs */}
			<section>
				<div className='mb-2 flex items-center gap-2'>
					<h3 className='text-sm font-semibold text-text-secondary'>System prompt</h3>
					<div className='ml-auto flex gap-1'>
						<button
							type='button'
							data-testid='prompt-tab-edit'
							onClick={() => setTab('edit')}
							className={`rounded px-2 py-0.5 text-xs ${
								tab === 'edit' ? 'bg-surface-2' : 'text-text-secondary'
							}`}
						>
							Edit
						</button>
						<button
							type='button'
							data-testid='prompt-tab-preview'
							onClick={() => setTab('preview')}
							className={`rounded px-2 py-0.5 text-xs ${
								tab === 'preview' ? 'bg-surface-2' : 'text-text-secondary'
							}`}
						>
							Preview
						</button>
					</div>
				</div>
				{tab === 'edit' ? (
					<textarea
						data-testid='prompt-textarea'
						value={systemPrompt}
						onChange={(e) => onPromptChange?.(e.target.value)}
						rows={8}
						className='w-full rounded border border-line bg-bg p-2 font-mono text-sm'
					/>
				) : (
					<div
						data-testid='prompt-preview'
						className='prose prose-sm max-w-none rounded border border-line p-2'
					>
						<Streamdown>{systemPrompt}</Streamdown>
					</div>
				)}
			</section>

			{/* Allowed tools */}
			<section>
				<h3 className='mb-2 text-sm font-semibold text-text-secondary'>Allowed tools</h3>
				{tools && tools.length > 0 ? (
					<ul data-testid='tools-list' className='flex flex-col gap-1'>
						{tools.map((t) => (
							<li
								key={t.name}
								data-testid={`tool-row-${t.name}`}
								className='flex items-center gap-2 text-sm'
							>
								<input
									type='checkbox'
									checked={t.enabled}
									onChange={(e) => onToolToggle?.(t.name, e.target.checked)}
								/>
								<span>{t.name}</span>
							</li>
						))}
					</ul>
				) : (
					<p data-testid='tools-empty' className='text-xs text-text-secondary'>
						No tools enabled — agent runs with default subset
					</p>
				)}
			</section>

			{/* MCP servers */}
			<section>
				<h3 className='mb-2 text-sm font-semibold text-text-secondary'>MCP servers</h3>
				{mcpServers && mcpServers.length > 0 ? (
					<ul data-testid='mcp-servers-list' className='flex flex-col gap-1'>
						{mcpServers.map((name) => (
							<li
								key={name}
								data-testid={`mcp-row-${name}`}
								className='text-sm text-text-secondary'
							>
								{name}
							</li>
						))}
					</ul>
				) : (
					<p data-testid='mcp-empty' className='text-xs text-text-secondary'>
						No MCP servers configured
					</p>
				)}
			</section>

			{/* Schedule + Pause + Run Now */}
			<section>
				<h3 className='mb-2 text-sm font-semibold text-text-secondary'>Schedule</h3>
				<div className='flex items-center gap-2'>
					<input
						data-testid='schedule-input'
						type='text'
						value={schedule}
						onChange={(e) => onScheduleChange?.(e.target.value)}
						placeholder='e.g. 0 9 * * *'
						className='flex-1 rounded border border-line bg-bg p-2 font-mono text-sm'
					/>
					<button
						type='button'
						data-testid='pause-btn'
						onClick={() => onPause?.()}
						className='flex items-center gap-1 rounded border border-line px-2 py-1 text-xs hover:bg-surface-2'
					>
						<Pause size={12} />
						Pause
					</button>
					<button
						type='button'
						data-testid='run-now-btn'
						onClick={() => {
							onRunNow?.()
							// Phase 177-04: refetch inbox after run is triggered
							inboxQuery.refetch()
						}}
						className='flex items-center gap-1 rounded bg-accent-blue px-2 py-1 text-xs text-bg'
					>
						<Play size={12} />
						Run Now
					</button>
				</div>
			</section>

			{/* Inbox preview */}
			<section>
				<div className='mb-2 flex items-center gap-2'>
					<Inbox size={14} className='text-text-secondary' />
					<h3 className='text-sm font-semibold text-text-secondary'>Inbox</h3>
				</div>
				{inboxSlice.length > 0 ? (
					<ul data-testid='inbox-preview' className='flex flex-col gap-1'>
						{inboxSlice.map((e) => (
							<li
								key={e.id}
								data-testid={`inbox-row-${e.id}`}
								onClick={() =>
									markReadMutation.mutate(
										{filePath: e.filePath},
										{onSuccess: () => inboxQuery.refetch()},
									)
								}
								className='cursor-pointer rounded px-2 py-1 text-sm hover:bg-surface-2'
							>
								<span className='truncate'>
									{new Date(e.runAt).toLocaleDateString()} — {e.status}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p data-testid='inbox-empty' className='text-xs text-text-secondary'>
						Inbox is empty
					</p>
				)}
			</section>

			{/* Last-run log link */}
			{lastRunLogPath && (
				<section>
					<button
						type='button'
						data-testid='last-run-link'
						onClick={() => onOpenLastRunLog?.(lastRunLogPath)}
						className='flex items-center gap-1 text-xs text-accent-blue hover:underline'
					>
						<FileText size={12} />
						Open last run log
					</button>
				</section>
			)}
		</div>
	)
}
