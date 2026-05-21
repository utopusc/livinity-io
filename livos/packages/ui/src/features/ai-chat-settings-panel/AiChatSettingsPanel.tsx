// v38.2 hotfix — AI Chat-scoped Settings panel (NOT global Settings window).
//
// Triggered by the gear icon at the bottom of SidebarFooter. Operator's UAT
// feedback 2026-05-21: "Settings butonu AI Chat'e ÖZEL olacak demistim ...
// MCP Server Settings içinde olmali ... bir onceki MCP config dosyasini gorup
// duzenleyebiliyorduk daha iyiydi".
//
// This panel renders as an absolute overlay over the AI Chat right pane (not a
// LivOS window) with 2 tabs:
//   - "MCP Servers" → classic 1316-line MCP UI restored from git
//                     (features/ai-chat-settings-panel/McpPanelClassic.tsx;
//                     was orphan-deleted in Phase 186-03)
//   - "Claude Code"  → CC PTY config form (7 fields, reads Redis via
//                      trpc.ccPty.getConfig — same backend as Phase 182-03
//                      Settings page, lighter wrapper)
//
// Close = backdrop click or X button. The parent (AI Chat route) owns
// open/close state.

import {useCallback, useEffect, useState} from 'react'
import {ArrowLeft} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {Switch} from '@/shadcn-components/ui/switch'
import {Input} from '@/shadcn-components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'

import McpPanelClassic from './McpPanelClassic'

export interface AiChatSettingsPanelProps {
	open: boolean
	onClose: () => void
}

type PanelTab = 'mcp' | 'claude'

export function AiChatSettingsPanel({open, onClose}: AiChatSettingsPanelProps) {
	const [tab, setTab] = useState<PanelTab>('mcp')

	// Keyboard: Esc closes.
	useEffect(() => {
		if (!open) return
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open, onClose])

	if (!open) return null

	return (
		<div
			data-testid='ai-chat-settings-panel'
			className='absolute inset-0 z-40 flex flex-col bg-bg'
		>
			{/* Header — Geri (back) button on left, tab nav centered */}
			<div className='flex items-center gap-3 border-b border-border px-4 py-2'>
				<button
					type='button'
					aria-label='Geri'
					data-testid='settings-back-btn'
					onClick={onClose}
					className='flex items-center gap-1.5 rounded px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<ArrowLeft size={16} />
					<span>Geri</span>
				</button>
				<div className='flex items-center gap-2'>
					<button
						type='button'
						data-testid='settings-tab-mcp'
						onClick={() => setTab('mcp')}
						className={`px-3 py-1.5 text-sm ${tab === 'mcp' ? 'border-b-2 border-primary font-medium text-primary' : 'text-text-secondary'}`}
					>
						MCP Servers
					</button>
					<button
						type='button'
						data-testid='settings-tab-claude'
						onClick={() => setTab('claude')}
						className={`px-3 py-1.5 text-sm ${tab === 'claude' ? 'border-b-2 border-primary font-medium text-primary' : 'text-text-secondary'}`}
					>
						Claude Code
					</button>
				</div>
			</div>
			{/* Body */}
			<div className='flex-1 overflow-y-auto'>
				{tab === 'mcp' ? <McpPanelClassic /> : <CcPtyConfigSection />}
			</div>
		</div>
	)
}

// ── Claude Code (CC PTY) config form ──────────────────────────────────────────
// Lean variant of Phase 182-03 settings page — same trpc.ccPty.* backend,
// no SettingsPageLayout chrome.

function CcPtyConfigSection() {
	const configQ = trpcReact.ccPty.getConfig.useQuery()
	const setConfig = trpcReact.ccPty.setConfig.useMutation({
		onSuccess: () => configQ.refetch(),
	})

	const cfg = configQ.data

	const set = useCallback(
		(patch: Record<string, unknown>) => {
			setConfig.mutate(patch as any)
		},
		[setConfig],
	)

	if (configQ.isLoading) {
		return <div className='p-6 text-sm text-text-secondary'>Loading…</div>
	}
	if (configQ.error || !cfg) {
		return (
			<div className='p-6 text-sm text-destructive'>
				Could not load Claude Code config:{' '}
				{configQ.error?.message ?? 'unknown error'}
			</div>
		)
	}

	return (
		<div className='flex flex-col gap-4 p-6'>
			<Field label='Dangerously Skip Permissions' hint='Passes --dangerously-skip-permissions to Claude Code. Required for autonomous operation.' danger>
				<Switch
					data-testid='cfg-skip-perms'
					checked={cfg.skip_perms}
					onCheckedChange={(v) => set({skip_perms: v})}
				/>
			</Field>
			<Field label='Default Working Directory'>
				<Input
					data-testid='cfg-default-cwd'
					defaultValue={cfg.default_cwd}
					onBlur={(e) => set({default_cwd: e.target.value})}
				/>
			</Field>
			<Field label='Idle Timeout (hours)'>
				<Input
					data-testid='cfg-idle-h'
					type='number'
					min={1}
					max={168}
					defaultValue={cfg.idle_h}
					onBlur={(e) => set({idle_h: parseInt(e.target.value, 10)})}
				/>
			</Field>
			<Field label='Max Concurrent Sessions'>
				<Input
					data-testid='cfg-max-sessions'
					type='number'
					min={1}
					max={50}
					defaultValue={cfg.max_sessions}
					onBlur={(e) => set({max_sessions: parseInt(e.target.value, 10)})}
				/>
			</Field>
			<Field label='Allowed Paths' hint='One per line. Used by CC PTY sandbox allowlist.'>
				<textarea
					data-testid='cfg-allowed-paths'
					defaultValue={cfg.allowed_paths}
					rows={4}
					onBlur={(e) => set({allowed_paths: e.target.value})}
					className='w-full rounded border border-line bg-bg p-2 text-sm'
				/>
			</Field>
			<Field label='Force Terminal on Phone' hint='Always open a terminal window on mobile instead of chat UI.'>
				<Switch
					data-testid='cfg-force-terminal-phone'
					checked={cfg.force_terminal_phone}
					onCheckedChange={(v) => set({force_terminal_phone: v})}
				/>
			</Field>
			<Field label='Default Chat Model'>
				<Select
					value={cfg.default_model}
					onValueChange={(v) => set({default_model: v as typeof cfg.default_model})}
				>
					<SelectTrigger data-testid='cfg-default-model' className='w-full'>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='claude-opus-4-7'>Opus 4.7 — best quality (default)</SelectItem>
						<SelectItem value='claude-sonnet-4-6'>Sonnet 4.6 — balanced</SelectItem>
						<SelectItem value='claude-haiku-4-5-20251001'>Haiku 4.5 — fast</SelectItem>
					</SelectContent>
				</Select>
			</Field>
		</div>
	)
}

function Field({
	label,
	hint,
	danger,
	children,
}: {
	label: string
	hint?: string
	danger?: boolean
	children: React.ReactNode
}) {
	return (
		<div className='flex items-start gap-4 rounded-lg border border-border bg-surface-2 p-4'>
			<div className='flex flex-1 flex-col gap-1'>
				<div className='flex items-center gap-2'>
					<span className='text-sm font-medium'>{label}</span>
					{danger && (
						<span className='rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive'>
							Dangerous
						</span>
					)}
				</div>
				{hint && <span className='text-xs text-text-secondary'>{hint}</span>}
			</div>
			<div className='flex w-[180px] justify-end'>{children}</div>
		</div>
	)
}
