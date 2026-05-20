// Phase 182-03 — AI Chat Settings page (CC PTY session configuration).
//
// 7 form fields backed by Redis liv:config:cc_pty_* keys:
//   skip_perms, default_cwd, idle_h, max_sessions, allowed_paths,
//   force_terminal_phone, default_model
//
// Debounced auto-save (800ms) on text/number fields.
// Confirm AlertDialog fires when enabling skip_perms (false→true).

import {useCallback, useEffect, useRef, useState} from 'react'
import {TbAlertTriangle, TbCheck, TbX} from 'react-icons/tb'

import {trpcReact} from '@/trpc/trpc'
import {Switch} from '@/shadcn-components/ui/switch'
import {Input} from '@/shadcn-components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/shadcn-components/ui/select'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/shadcn-components/ui/alert-dialog'
import {SettingsPageLayout} from './_components/settings-page-layout'
import {SettingsPageHeader} from '@/components/settings-page-header'
import {FieldCard, FieldRow} from '@/components/field-card'
import {cn} from '@/shadcn-lib/utils'

const CHAT_MODELS = [
	{value: 'claude-opus-4-7', label: 'Opus 4.7 — best quality (default)'},
	{value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced'},
	{value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fastest, cheapest'},
] as const

export default function AiChatSettingsPage() {
	const utils = trpcReact.useUtils()
	const configQ = trpcReact.ccPty.getConfig.useQuery()
	const setConfig = trpcReact.ccPty.setConfig.useMutation({
		onSuccess: () => utils.ccPty.getConfig.invalidate(),
	})

	// Local form state
	const [skipPerms, setSkipPerms] = useState(true)
	const [defaultCwd, setDefaultCwd] = useState('/home/bruce/liv')
	const [idleH, setIdleH] = useState(24)
	const [maxSessions, setMaxSessions] = useState(10)
	const [allowedPaths, setAllowedPaths] = useState('/home/bruce/liv\n/home/bruce')
	const [forceTerminalPhone, setForceTerminalPhone] = useState(false)
	const [defaultModel, setDefaultModel] = useState<string>('claude-opus-4-7')
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [pathResults, setPathResults] = useState<Array<{path: string; exists: boolean; writable: boolean}>>([])

	// Sync from server
	useEffect(() => {
		if (!configQ.data) return
		setSkipPerms(configQ.data.skip_perms)
		setDefaultCwd(configQ.data.default_cwd)
		setIdleH(configQ.data.idle_h)
		setMaxSessions(configQ.data.max_sessions)
		setAllowedPaths(configQ.data.allowed_paths)
		setForceTerminalPhone(configQ.data.force_terminal_phone)
		setDefaultModel(configQ.data.default_model)
	}, [configQ.data])

	// Debounced save helper
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const debouncedSave = useCallback(
		(patch: Parameters<typeof setConfig.mutate>[0]) => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
			debounceRef.current = setTimeout(() => {
				setConfig.mutate(patch)
			}, 800)
		},
		[setConfig],
	)

	// skip_perms toggle handler — confirm dialog on enable (false→true)
	const handleSkipPermsChange = (next: boolean) => {
		if (next && !skipPerms) {
			setConfirmOpen(true)
		} else {
			setSkipPerms(next)
			setConfig.mutate({skip_perms: next})
		}
	}

	const confirmSkipPerms = () => {
		setSkipPerms(true)
		setConfig.mutate({skip_perms: true})
		setConfirmOpen(false)
	}

	// validatePaths on blur
	const handlePathsBlur = async () => {
		const paths = allowedPaths.split('\n').map((p) => p.trim()).filter(Boolean)
		if (paths.length === 0) return
		try {
			const result = await utils.ccPty.validatePaths.fetch({paths})
			setPathResults(result.results)
		} catch {
			// silent — validation is best-effort
		}
	}

	return (
		<SettingsPageLayout title='AI Chat Settings' description='CC PTY session configuration' hideHeader>
			<SettingsPageHeader
				eyebrow='09 · AI Chat'
				title='Configure CC PTY'
				titleAccent='session behaviour.'
				sub='These settings apply to new Claude Code PTY sessions. Existing sessions are unaffected.'
			/>
			<div className='h-6' />
			<div className='px-1 space-y-4'>

				{/* skip_perms */}
				<FieldCard>
					<FieldRow
						label='Dangerously Skip Permissions'
						value={
							<span className='text-xs text-white/50'>
								Passes --dangerously-skip-permissions to Claude Code. Required for autonomous operation.
							</span>
						}
						trailing={
							<div className='flex items-center gap-2'>
								{skipPerms && (
									<span
										data-testid='skip-perms-dangerous-chip'
										className='text-[10px] bg-red-500/20 text-red-400 border border-red-500/40 rounded px-1.5 py-0.5 font-medium'
									>
										DANGEROUS
									</span>
								)}
								<Switch
									data-testid='skip-perms-toggle'
									checked={skipPerms}
									onCheckedChange={handleSkipPermsChange}
								/>
							</div>
						}
					/>
				</FieldCard>

				{/* default_cwd */}
				<FieldCard>
					<FieldRow
						label='Default Working Directory'
						value={
							<Input
								data-testid='default-cwd-input'
								value={defaultCwd}
								onChange={(e) => {
									setDefaultCwd(e.target.value)
									debouncedSave({default_cwd: e.target.value})
								}}
								className='w-72 font-mono text-sm'
								placeholder='/home/bruce/liv'
							/>
						}
					/>
				</FieldCard>

				{/* idle_h */}
				<FieldCard>
					<FieldRow
						label='Idle Timeout (hours)'
						value={
							<Input
								data-testid='idle-h-input'
								type='number'
								min={1}
								max={168}
								value={idleH}
								onChange={(e) => {
									const v = parseInt(e.target.value, 10)
									if (!isNaN(v)) {
										setIdleH(v)
										debouncedSave({idle_h: Math.max(1, Math.min(168, v))})
									}
								}}
								className='w-24'
							/>
						}
					/>
				</FieldCard>

				{/* max_sessions */}
				<FieldCard>
					<FieldRow
						label='Max Concurrent Sessions'
						value={
							<Input
								data-testid='max-sessions-input'
								type='number'
								min={1}
								max={50}
								value={maxSessions}
								onChange={(e) => {
									const v = parseInt(e.target.value, 10)
									if (!isNaN(v)) {
										setMaxSessions(v)
										debouncedSave({max_sessions: Math.max(1, Math.min(50, v))})
									}
								}}
								className='w-24'
							/>
						}
					/>
				</FieldCard>

				{/* allowed_paths */}
				<FieldCard>
					<FieldRow
						label='Allowed Paths'
						value={
							<div className='space-y-2 w-full'>
								<textarea
									data-testid='allowed-paths-textarea'
									value={allowedPaths}
									onChange={(e) => {
										setAllowedPaths(e.target.value)
										debouncedSave({allowed_paths: e.target.value})
									}}
									onBlur={handlePathsBlur}
									className='w-72 font-mono text-sm h-20 resize-none rounded border border-border-default bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-brand'
									placeholder={'/home/bruce/liv\n/home/bruce'}
								/>
								{pathResults.length > 0 && (
									<div className='space-y-1'>
										{pathResults.map((r) => (
											<div key={r.path} className='flex items-center gap-1.5 text-xs'>
												{r.exists ? (
													<TbCheck className='text-green-400 shrink-0' size={12} />
												) : (
													<TbX className='text-red-400 shrink-0' size={12} />
												)}
												<span className={cn('font-mono', !r.exists && 'text-red-400')}>{r.path}</span>
												{r.exists && !r.writable && (
													<span className='text-yellow-400 text-[10px]'>read-only</span>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						}
					/>
				</FieldCard>

				{/* force_terminal_phone */}
				<FieldCard>
					<FieldRow
						label='Force Terminal on Phone'
						value={
							<span className='text-xs text-white/50'>
								Always open a terminal window on mobile devices instead of chat UI.
							</span>
						}
						trailing={
							<Switch
								data-testid='force-terminal-phone-toggle'
								checked={forceTerminalPhone}
								onCheckedChange={(v) => {
									setForceTerminalPhone(v)
									setConfig.mutate({force_terminal_phone: v})
								}}
							/>
						}
					/>
				</FieldCard>

				{/* default_model */}
				<FieldCard>
					<FieldRow
						label='Default Chat Model'
						value={
							<Select
								value={defaultModel}
								onValueChange={(v) => {
									setDefaultModel(v)
									setConfig.mutate({default_model: v as (typeof CHAT_MODELS)[number]['value']})
								}}
							>
								<SelectTrigger data-testid='default-model-select' className='w-64'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CHAT_MODELS.map((m) => (
										<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
									))}
								</SelectContent>
							</Select>
						}
					/>
				</FieldCard>

			</div>

			{/* Confirm dialog for dangerous skip_perms enable */}
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className='flex items-center gap-2'>
							<TbAlertTriangle className='text-red-400' size={18} />
							Enable Dangerous Mode?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Enabling "Dangerously Skip Permissions" removes all file system guardrails from Claude Code sessions.
							Only enable this if you understand the security implications and trust the agents running on this system.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							data-testid='confirm-skip-perms-btn'
							className='bg-red-500 hover:bg-red-600'
							onClick={confirmSkipPerms}
						>
							Enable Anyway
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsPageLayout>
	)
}
