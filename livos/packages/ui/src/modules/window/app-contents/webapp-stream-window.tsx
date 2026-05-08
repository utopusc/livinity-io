// Phase 95-08 — WebAppStreamWindow.
//
// Root content for a WebApp window. Composes:
//   - top toolbar (95-07.A)
//   - top pane: VNC stream from useWebAppVnc (95-04)
//   - resizable handle (react-resizable-panels via 95-03 shadcn)
//   - bottom pane: WebAppAgentPanel (mode selector 95-07.B + chat surface
//     wired to useWebAppAgent 95-06)
//
// Lifecycle:
//   - On mount: fire `webapp.window.spawn({webappId, url})`. Capture wsUrl.
//   - On unmount: fire `webapp.window.close({webappId})` (D-95-CLEANUP,
//     fire-and-forget; window manager owns idle cleanup as a backstop).
//   - SERVICE_UNAVAILABLE from spawn (P93 returns this until P98 lifecycle
//     hookup) → render an inline error banner over the VNC pane with a
//     retry button (D-95-12). Agent panel stays functional below.
//
// Resize persistence (D-95-04):
//   - Per-WebApp localStorage key `liv:webapp-stream:split:<webappId>`.
//   - Initial sizes hydrated from localStorage if present + within
//     [20, 90] range; else fallback 70/30.
//   - Persist via `onLayout` write — react-resizable-panels' built-in
//     `autoSaveId` uses a different key shape, so we own the wire format
//     to keep it under the `liv:` namespace.
//
// File budget per PLAN: < 400 lines. WebAppAgentPanel lives inline below.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'
import {AlertTriangle, RefreshCw, Square} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {useWebAppAgent} from '@/hooks/use-webapp-agent'
import {useTeachRecorder, type ActionLog} from '@/hooks/use-teach-recorder'

import {WebAppToolbar} from '../webapp-toolbar'
import {WebAppModeSelector, type WebAppMode} from '../webapp-mode-selector'
import {WebAppSkillsSidebar} from '../webapp-skills-sidebar'
import {SkillReplayScrubber} from '../skill-replay-scrubber'

import {ChatMessageItem} from '@/routes/ai-chat/chat-messages'
import {ChatInput, type FileAttachment} from '@/routes/ai-chat/chat-input'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from '@/shadcn-components/ui/resizable'

// noVNC keysyms — X11 keysymdef. Locked here as constants so the toolbar
// chord wiring stays readable.
const KEY_ALT_LEFT = 0xffe9 // XK_Alt_L
const KEY_ARROW_LEFT = 0xff51
const KEY_ARROW_RIGHT = 0xff53
const KEY_F5 = 0xffc2

const SPLIT_KEY_PREFIX = 'liv:webapp-stream:split:'
const DEFAULT_TOP_PCT = 70
const DEFAULT_BOTTOM_PCT = 30
const MIN_PCT = 20
const MAX_PCT = 90

// Phase 96-04 — privacy-warning ack key (96-CONTEXT §gray-area #2).
// Persisted in localStorage so the toast doesn't nag forever once the
// user has acknowledged it. Per-session re-fire would be more naggy than
// the per-install dismissal that the v32 toast convention favours.
const TEACH_PRIVACY_ACK_KEY = 'liv:webapp:teach:warning-ack:v1'

const TEACH_PRIVACY_TEXT =
	'Do not enter passwords during teach mode. Screenshots may capture typed text.'

// Slug-safe skill name validator — mirrors the SLUG_RE in skills-router.ts.
const SKILL_NAME_RE = /^[A-Za-z0-9 _-]{1,80}$/

interface WebAppStreamWindowProps {
	webappId: string
}

interface PersistedLayout {
	top: number
	bottom: number
}

function readPersistedLayout(webappId: string): PersistedLayout | null {
	try {
		const raw = localStorage.getItem(SPLIT_KEY_PREFIX + webappId)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed) || parsed.length !== 2) return null
		const [top, bottom] = parsed
		if (typeof top !== 'number' || typeof bottom !== 'number') return null
		// Out-of-range guard — if a previous session wrote degenerate sizes,
		// fall back to the default rather than mounting a 5/95 split.
		if (top < MIN_PCT || top > MAX_PCT) return null
		if (bottom < (100 - MAX_PCT) || bottom > (100 - MIN_PCT)) return null
		return {top, bottom}
	} catch {
		return null
	}
}

function writePersistedLayout(webappId: string, sizes: number[]): void {
	if (sizes.length !== 2) return
	try {
		localStorage.setItem(SPLIT_KEY_PREFIX + webappId, JSON.stringify(sizes))
	} catch {
		// localStorage may be unavailable (SSR, Safari private mode) — non-fatal.
	}
}

export default function WebAppStreamWindow({webappId}: WebAppStreamWindowProps) {
	// 1. Pull this WebApp's row from the persisted list (URL is needed for
	// the spawn input + the toolbar copy-URL action — D-95-15).
	const webappListQuery = trpcReact.webapp.list.useQuery(undefined, {
		staleTime: 30_000,
	})
	const webapp = useMemo(
		() => webappListQuery.data?.find((w) => w.id === webappId) ?? null,
		[webappListQuery.data, webappId],
	)

	// 2. Spawn the host Chrome window. webapp.window.spawn is registered
	// in httpOnlyPaths so survives WS reconnect (P93 / common.ts).
	const spawnMutation = trpcReact.webapp.window.spawn.useMutation()
	const closeMutation = trpcReact.webapp.window.close.useMutation()

	const [wsUrl, setWsUrl] = useState<string | null>(null)
	const [spawnError, setSpawnError] = useState<{code: string; message: string} | null>(null)

	// 2026-05-08 hotfix: useMutation returns a new object reference every
	// render, so any callback that closes over `spawnMutation` is unstable.
	// Putting `triggerSpawn` in a useEffect dep array caused the spawn call
	// to fire on every render → ERR_INSUFFICIENT_RESOURCES (browser ran out
	// of connection slots). Two-layer fix:
	//   1. Mutation reference is parked in a ref so triggerSpawn's deps
	//      reduce to {webapp, webappId} (stable across renders).
	//   2. spawnedForRef guards "fire once per webappId" — even if upstream
	//      churn rebuilds triggerSpawn, the effect won't re-fire the spawn.
	//      Ref resets only when the user navigates to a different WebApp.
	const spawnMutationRef = useRef(spawnMutation)
	spawnMutationRef.current = spawnMutation
	const spawnedForRef = useRef<string | null>(null)

	const triggerSpawn = useCallback(() => {
		if (!webapp) return
		setSpawnError(null)
		spawnMutationRef.current.mutate(
			{webappId, url: webapp.url, expectedTitle: webapp.title ?? undefined},
			{
				onSuccess: (res) => {
					setWsUrl(res.wsUrl)
				},
				onError: (err) => {
					// SERVICE_UNAVAILABLE is the expected pre-P98 state — surface a
					// friendly banner; keep the agent panel functional below.
					setSpawnError({
						code: err.data?.code ?? 'INTERNAL_SERVER_ERROR',
						message: err.message || 'Failed to start WebApp stream',
					})
				},
			},
		)
	}, [webapp, webappId])

	useEffect(() => {
		if (!webapp || wsUrl || spawnError) return
		if (spawnedForRef.current === webappId) return
		spawnedForRef.current = webappId
		triggerSpawn()
	}, [webapp, wsUrl, spawnError, webappId, triggerSpawn])

	// 3. Cleanup on unmount — fire-and-forget close (D-95-CLEANUP). The
	// window manager owns idle cleanup as a backstop; failure here is
	// logged not blocking.
	const closeMutationRef = useRef(closeMutation)
	useEffect(() => {
		closeMutationRef.current = closeMutation
	}, [closeMutation])

	useEffect(() => {
		return () => {
			try {
				closeMutationRef.current.mutate({webappId})
			} catch {
				// Non-blocking cleanup — log channel handled by tRPC error sink.
			}
		}
	}, [webappId])

	// 4. VNC + agent hooks.
	const vnc = useWebAppVnc(wsUrl ?? undefined)
	const agent = useWebAppAgent(webappId)

	// 5. Mode (D-95-10 default 'chat'; D-95-MODE-LOCAL = local state only).
	const [mode, setMode] = useState<WebAppMode>('chat')

	// 5a. Phase 96-05 — Skills sidebar collapse state + selected skill.
	// selectedSkillId is consumed by SkillReplayScrubber (96-06).
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)

	// 5b. Phase 96-04 — Teach-mode recorder + Save dialog state.
	const recorder = useTeachRecorder()
	const [pendingSave, setPendingSave] = useState<ActionLog | null>(null)
	const skillCreateMutation = trpcReact.webapp.skills.create.useMutation()
	const skillDiscardMutation = trpcReact.webapp.skills.discard.useMutation()
	const skillsListUtils = trpcReact.useUtils()

	// Privacy toast: fire on first Teach activation per install. The first
	// time the user picks Teach we surface the dismissable warning; once
	// acknowledged we persist the localStorage flag and never re-fire.
	const armPrivacyWarningOnce = useCallback(() => {
		try {
			if (localStorage.getItem(TEACH_PRIVACY_ACK_KEY) === '1') return
			toast.warning(TEACH_PRIVACY_TEXT, {
				duration: 8000,
				onDismiss: () => {
					try {
						localStorage.setItem(TEACH_PRIVACY_ACK_KEY, '1')
					} catch {
						/* localStorage may be unavailable */
					}
				},
				onAutoClose: () => {
					try {
						localStorage.setItem(TEACH_PRIVACY_ACK_KEY, '1')
					} catch {
						/* localStorage may be unavailable */
					}
				},
			})
		} catch {
			// localStorage / toast may be unavailable in JSDOM tests.
		}
	}, [])

	// Mode change → arm/disarm recorder. Switching INTO teach starts the
	// recorder; switching OUT (or unmount) stops + opens the Save dialog
	// when there is at least one captured event. Empty recordings short-
	// circuit straight to discard via the recorder's internal cleanup.
	const handleModeChange = useCallback(
		(next: WebAppMode) => {
			const prev = mode
			setMode(next)

			if (prev === 'teach' && next !== 'teach') {
				// Stop recording; if events captured, open Save dialog.
				void recorder.stop().then((log) => {
					if (log && log.events.length > 0) {
						setPendingSave(log)
					} else if (log && recorder.sessionId) {
						// Empty recording → discard server-side.
						skillDiscardMutation.mutate({sessionId: recorder.sessionId})
					}
				})
			}

			if (prev !== 'teach' && next === 'teach') {
				armPrivacyWarningOnce()
				recorder.start({webappId, vncRef: vnc.containerRef})
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[mode, recorder, webappId, vnc.containerRef, armPrivacyWarningOnce, skillDiscardMutation],
	)

	// On unmount while still recording → stop and discard (recorder hook
	// already discards on unmount; we additionally close any pending Save
	// dialog so it doesn't survive the parent unmount).
	useEffect(() => {
		return () => {
			setPendingSave(null)
		}
	}, [])

	const onStopRecording = useCallback(() => {
		void recorder.stop().then((log) => {
			if (log && log.events.length > 0) {
				setPendingSave(log)
			} else if (log && recorder.sessionId) {
				skillDiscardMutation.mutate({sessionId: recorder.sessionId})
			}
			// Whether or not we open Save dialog, leave Teach mode.
			setMode('watch')
		})
	}, [recorder, skillDiscardMutation])

	const onSavePending = useCallback(
		(name: string) => {
			const log = pendingSave
			if (!log) return
			const sessionId = log.meta.sessionId
			skillCreateMutation.mutate(
				{webappId, name, sessionId, actionLog: log},
				{
					onSuccess: () => {
						setPendingSave(null)
						void skillsListUtils.webapp.skills.list.invalidate({webappId})
						toast.success(`Saved skill "${name}"`)
					},
					onError: (err) => {
						toast.error(err.message || 'Failed to save skill')
					},
				},
			)
		},
		[pendingSave, skillCreateMutation, skillsListUtils, webappId],
	)

	const onCancelPending = useCallback(() => {
		const log = pendingSave
		if (log) {
			skillDiscardMutation.mutate({sessionId: log.meta.sessionId})
		}
		setPendingSave(null)
	}, [pendingSave, skillDiscardMutation])

	// 6. Toolbar handlers.
	const sendChord = useCallback(
		(modifierKeysym: number, keyKeysym: number, code: string, modCode: string) => {
			// Sequence: hold modifier → tap key (down+up) → release modifier.
			vnc.sendKey(modifierKeysym, modCode, true)
			vnc.sendKey(keyKeysym, code, true)
			vnc.sendKey(keyKeysym, code, false)
			vnc.sendKey(modifierKeysym, modCode, false)
		},
		[vnc],
	)
	const onBack = useCallback(
		() => sendChord(KEY_ALT_LEFT, KEY_ARROW_LEFT, 'ArrowLeft', 'AltLeft'),
		[sendChord],
	)
	const onForward = useCallback(
		() => sendChord(KEY_ALT_LEFT, KEY_ARROW_RIGHT, 'ArrowRight', 'AltLeft'),
		[sendChord],
	)
	const onRefresh = useCallback(() => {
		vnc.sendKey(KEY_F5, 'F5', true)
		vnc.sendKey(KEY_F5, 'F5', false)
	}, [vnc])
	const onCopyUrl = useCallback(() => {
		const url = webapp?.url
		if (!url) return
		try {
			void navigator.clipboard.writeText(url)
			toast.success('URL copied')
		} catch {
			toast.error('Could not copy URL')
		}
	}, [webapp?.url])
	const onFullscreen = useCallback(() => {
		void vnc.requestFullscreen()
	}, [vnc])

	// 7. Resizable initial layout — read once on first render.
	const initialLayout = useMemo<PersistedLayout>(() => {
		const stored = readPersistedLayout(webappId)
		return stored ?? {top: DEFAULT_TOP_PCT, bottom: DEFAULT_BOTTOM_PCT}
	}, [webappId])

	const onLayoutChange = useCallback(
		(sizes: number[]) => {
			writePersistedLayout(webappId, sizes)
		},
		[webappId],
	)

	// 8. Composer state — local string + sendMessage wiring. Disabled in
	// non-chat modes per PLAN 95-07.C.
	const [composerValue, setComposerValue] = useState('')
	const composerDisabled = mode !== 'chat'

	const onSend = useCallback(
		(attachments?: FileAttachment[]) => {
			if (composerDisabled) return
			const text = composerValue.trim()
			if (!text) return
			agent.sendMessage(text, attachments)
			setComposerValue('')
		},
		[agent, composerDisabled, composerValue],
	)
	const onStop = useCallback(() => {
		agent.interrupt()
	}, [agent])

	// 9. Render.
	const url = webapp?.url ?? ''

	// 9a. Skills sidebar visibility — hidden in Auto mode (P97 reveals
	// the same data differently). Per PLAN 96-05.
	const showSkillsSidebar = mode !== 'auto'

	return (
		<div className='flex h-full w-full flex-row bg-surface-base'>
			<ResizablePanelGroup
				direction='vertical'
				onLayout={onLayoutChange}
				className='flex-1'
			>
				<ResizablePanel defaultSize={initialLayout.top} minSize={MIN_PCT} maxSize={MAX_PCT}>
					<div className='flex h-full w-full flex-col'>
						<WebAppToolbar
							url={url}
							onBack={onBack}
							onForward={onForward}
							onRefresh={onRefresh}
							onCopyUrl={onCopyUrl}
							onFullscreen={onFullscreen}
							/* onPopout intentionally undefined — D-95-06 stub */
						/>
						<div className='relative flex-1 overflow-hidden bg-black'>
							<div ref={vnc.containerRef} className='h-full w-full' />
							{spawnError ? (
								<SpawnErrorBanner error={spawnError} onRetry={triggerSpawn} />
							) : null}
							{vnc.status === 'connecting' && !spawnError ? (
								<VncOverlay text='Connecting to stream…' />
							) : null}
							{vnc.status === 'error' && vnc.errorMessage ? (
								<VncOverlay text={vnc.errorMessage} variant='error' />
							) : null}
							{recorder.recording ? (
								<TeachRecordingOverlay
									eventCount={recorder.eventCount}
									droppedCount={recorder.droppedCount}
									onStop={onStopRecording}
								/>
							) : null}
							{recorder.autoStopped ? (
								<TeachAutoStopBanner
									onReview={onStopRecording}
									onDismiss={recorder.resetAutoStop}
								/>
							) : null}
							{selectedSkillId ? (
								<SkillReplayScrubber
									skillId={selectedSkillId}
									onClose={() => setSelectedSkillId(null)}
								/>
							) : null}
						</div>
					</div>
				</ResizablePanel>
				<ResizableHandle withHandle />
				<ResizablePanel
					defaultSize={initialLayout.bottom}
					minSize={100 - MAX_PCT}
					maxSize={100 - MIN_PCT}
				>
					<WebAppAgentPanel
						webappId={webappId}
						mode={mode}
						onModeChange={handleModeChange}
						composerValue={composerValue}
						onComposerChange={setComposerValue}
						composerDisabled={composerDisabled}
						onSend={onSend}
						onStop={onStop}
						messages={agent.messages}
						isStreaming={agent.isStreaming}
						isConnected={agent.isConnected}
						sessionStatus={agent.sessionStatus}
						onStartNewSession={agent.startNewSession}
					/>
				</ResizablePanel>
			</ResizablePanelGroup>
			{showSkillsSidebar ? (
				<WebAppSkillsSidebar
					webappId={webappId}
					onSelectSkill={(skillId) => setSelectedSkillId(skillId)}
					collapsed={sidebarCollapsed}
					onToggleCollapsed={setSidebarCollapsed}
				/>
			) : null}
			{pendingSave ? (
				<SaveSkillDialog
					open={pendingSave !== null}
					eventCount={pendingSave.events.length}
					durationMs={pendingSave.endedAt - pendingSave.startedAt}
					onSave={onSavePending}
					onCancel={onCancelPending}
					saving={skillCreateMutation.isPending}
				/>
			) : null}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components (kept inline — PLAN 95-07.C / file-budget guidance)
// ─────────────────────────────────────────────────────────────────────

interface SpawnErrorBannerProps {
	error: {code: string; message: string}
	onRetry: () => void
}

function SpawnErrorBanner({error, onRetry}: SpawnErrorBannerProps) {
	// SERVICE_UNAVAILABLE is the pre-P98 expected state — friendlier copy.
	const friendly =
		error.code === 'SERVICE_UNAVAILABLE'
			? 'WebApp stream is not yet available on this server. The agent panel below still works.'
			: error.message
	return (
		<div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-6 text-center'>
			<AlertTriangle className='h-8 w-8 text-amber-400' />
			<div className='max-w-md text-body text-text-primary'>{friendly}</div>
			<button
				type='button'
				onClick={onRetry}
				className='inline-flex h-8 items-center gap-2 rounded-radius-sm bg-surface-1 px-3 text-caption-sm text-text-primary hover:bg-surface-2'
			>
				<RefreshCw className='h-3.5 w-3.5' />
				Retry
			</button>
		</div>
	)
}

function VncOverlay({text, variant}: {text: string; variant?: 'error'}) {
	return (
		<div className='absolute inset-0 flex items-center justify-center bg-black/40 text-text-secondary'>
			<span className={cn('text-caption-sm', variant === 'error' && 'text-red-400')}>{text}</span>
		</div>
	)
}

interface WebAppAgentPanelProps {
	webappId: string
	mode: WebAppMode
	onModeChange: (m: WebAppMode) => void
	composerValue: string
	onComposerChange: (v: string) => void
	composerDisabled: boolean
	onSend: (attachments?: FileAttachment[]) => void
	onStop: () => void
	messages: ReturnType<typeof useWebAppAgent>['messages']
	isStreaming: boolean
	isConnected: boolean
	sessionStatus: ReturnType<typeof useWebAppAgent>['sessionStatus']
	onStartNewSession: () => void
}

function WebAppAgentPanel(props: WebAppAgentPanelProps) {
	const {
		webappId,
		mode,
		onModeChange,
		composerValue,
		onComposerChange,
		composerDisabled,
		onSend,
		onStop,
		messages,
		isStreaming,
		isConnected,
		sessionStatus,
		onStartNewSession,
	} = props

	const placeholderByMode: Record<WebAppMode, string> = {
		watch: 'Watch mode — recording arrives in P96',
		teach: 'Teach mode arrives in P96',
		auto: 'Auto mode arrives in P97',
		chat: 'Ask the agent anything about this WebApp…',
	}

	return (
		<div className='flex h-full w-full flex-col bg-surface-base'>
			<div className='flex h-9 items-center justify-between gap-2 border-b border-border-default bg-surface-base px-2'>
				<WebAppModeSelector mode={mode} onModeChange={onModeChange} webappId={webappId} />
				<div className='text-caption-sm text-text-tertiary'>Liv Default</div>
			</div>

			<div className='flex-1 overflow-y-auto px-3 py-2'>
				{sessionStatus === 'session-ended' ? (
					<div className='flex h-full flex-col items-center justify-center gap-3'>
						<div className='text-body text-text-secondary'>This session has ended.</div>
						<button
							type='button'
							onClick={onStartNewSession}
							className='inline-flex h-8 items-center gap-2 rounded-radius-sm bg-surface-1 px-3 text-caption-sm text-text-primary hover:bg-surface-2'
						>
							Start new session
						</button>
					</div>
				) : messages.length === 0 ? (
					<div className='flex h-full items-center justify-center text-caption-sm text-text-tertiary'>
						{mode === 'chat'
							? 'Send a message to start chatting about this WebApp.'
							: 'Switch to Chat to interact with the agent.'}
					</div>
				) : (
					<div className='flex flex-col gap-2'>
						{messages.map((m) => (
							<ChatMessageItem key={m.id} message={m} />
						))}
					</div>
				)}
			</div>

			<div className='border-t border-border-default'>
				<ChatInput
					value={composerValue}
					onChange={onComposerChange}
					onSend={onSend}
					onStop={onStop}
					isStreaming={isStreaming}
					isConnected={isConnected}
					disabled={composerDisabled}
					/* Placeholder is rendered inside ChatInput via the empty state — we
					 * pipe the mode-specific copy through onSlashAction's sibling path
					 * by leaning on the disabled flag. ChatInput honours `disabled`
					 * already; the mode hint surfaces via title attribute below. */
				/>
				{composerDisabled ? (
					<div className='px-3 pb-2 text-caption-sm text-text-tertiary'>
						{placeholderByMode[mode]}
					</div>
				) : null}
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Phase 96-04 — Teach-mode UI surfaces (overlay, banner, save dialog).
// ─────────────────────────────────────────────────────────────────────

interface TeachRecordingOverlayProps {
	eventCount: number
	droppedCount: number
	onStop: () => void
}

function TeachRecordingOverlay({eventCount, droppedCount, onStop}: TeachRecordingOverlayProps) {
	return (
		<div className='absolute right-3 top-3 z-10 flex items-center gap-2 rounded-radius-sm bg-black/70 px-3 py-1.5 text-caption-sm text-white shadow-lg backdrop-blur-sm'>
			<span
				className='inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500'
				aria-label='Recording'
				role='status'
			/>
			<span>
				Recording{eventCount > 0 ? ` · ${eventCount} events` : ''}
				{droppedCount > 0 ? ` · ${droppedCount} dropped` : ''}
			</span>
			<button
				type='button'
				onClick={onStop}
				className='ml-1 inline-flex h-6 items-center gap-1 rounded-radius-xs bg-red-500/90 px-2 text-caption-xs text-white hover:bg-red-500'
			>
				<Square className='h-3 w-3' />
				Stop
			</button>
		</div>
	)
}

interface TeachAutoStopBannerProps {
	onReview: () => void
	onDismiss: () => void
}

function TeachAutoStopBanner({onReview, onDismiss}: TeachAutoStopBannerProps) {
	return (
		<div className='absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-radius-sm bg-amber-500/90 px-3 py-2 text-caption-sm text-black shadow-lg'>
			<div className='flex items-center gap-3'>
				<span>Recording auto-stopped at 10 minutes — review and save?</span>
				<button
					type='button'
					onClick={onReview}
					className='rounded-radius-xs bg-black/20 px-2 py-1 text-caption-xs text-black hover:bg-black/30'
				>
					Review
				</button>
				<button
					type='button'
					onClick={onDismiss}
					className='rounded-radius-xs px-2 py-1 text-caption-xs text-black/80 hover:bg-black/10'
				>
					Dismiss
				</button>
			</div>
		</div>
	)
}

interface SaveSkillDialogProps {
	open: boolean
	eventCount: number
	durationMs: number
	saving: boolean
	onSave: (name: string) => void
	onCancel: () => void
}

function SaveSkillDialog({open, eventCount, durationMs, saving, onSave, onCancel}: SaveSkillDialogProps) {
	const [name, setName] = useState('')
	const trimmed = name.trim()
	const valid = SKILL_NAME_RE.test(trimmed)

	const submit = useCallback(() => {
		if (!valid) return
		onSave(trimmed)
	}, [valid, trimmed, onSave])

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onCancel()
			}}
		>
			<DialogContent className='max-w-md'>
				<DialogHeader>
					<DialogTitle>Save skill</DialogTitle>
					<DialogDescription>
						{eventCount} actions captured over {(durationMs / 1000).toFixed(1)}s. Give the skill a
						name to save it for this WebApp.
					</DialogDescription>
				</DialogHeader>
				<div className='flex flex-col gap-2'>
					<Input
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && valid) submit()
						}}
						placeholder='e.g. open-inbox'
						maxLength={80}
						aria-invalid={name.length > 0 && !valid}
					/>
					{name.length > 0 && !valid ? (
						<div className='text-caption-xs text-red-400'>
							Use 1-80 letters, digits, spaces, underscores or dashes.
						</div>
					) : null}
				</div>
				<DialogFooter>
					<button
						type='button'
						onClick={onCancel}
						className='inline-flex h-8 items-center rounded-radius-sm bg-surface-1 px-3 text-caption-sm text-text-primary hover:bg-surface-2'
						disabled={saving}
					>
						Cancel
					</button>
					<button
						type='button'
						onClick={submit}
						disabled={!valid || saving}
						className={cn(
							'inline-flex h-8 items-center rounded-radius-sm bg-blue-500 px-3 text-caption-sm text-white hover:bg-blue-600',
							(!valid || saving) && 'cursor-not-allowed opacity-50',
						)}
					>
						{saving ? 'Saving…' : 'Save'}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
