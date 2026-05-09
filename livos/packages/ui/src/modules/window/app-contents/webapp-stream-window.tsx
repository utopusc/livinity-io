// Phase 95-08 / 100-03 — WebAppStreamWindow.
//
// Root content for a WebApp window. Composes:
//   - VNC stream from useWebAppVnc (95-04) — full-bleed, fills the window.
//   - Overlays: spawn-error banner, VNC overlay, teach overlays, replay
//     scrubber. All absolute-positioned over the stream pane.
//
// Phase 100-03 (V33-MULTI-02 / G-100-E E1):
//   - Top webapp-toolbar (URL bar + back/forward/refresh chord) DROPPED.
//     Chrome `--app=URL` mode (P100-02 backend swap) renders chromeless,
//     so the LivOS-side URL display is doubly redundant.
//   - Inline resizable vertical split DROPPED. The bottom
//     pane that used to host the agent panel + mode selector +
//     skills sidebar is removed; those surfaces relocate into
//     drawers in 100-04. Stream area becomes `flex-1` of a single column.
//   - Root wrapper switched to `relative flex h-full w-full flex-col` so
//     100-04's bottom action-bar can absolute-anchor at `bottom-0`.
//   - Stream wrapper carries `pb-9` (Plan A locked) reserving the 36px
//     bottom-bar overlay space (`absolute inset-x-0 bottom-0 z-20 h-9`).
//
// Lifecycle (preserved byte-for-byte from 95-08 / 95-07.B / 99-04):
//   - On mount: fire `webapp.window.spawn({webappId, url})`. Capture wsUrl.
//   - On unmount: fire `webapp.window.close({webappId})` (D-95-CLEANUP,
//     fire-and-forget; window manager owns idle cleanup as a backstop).
//   - SERVICE_UNAVAILABLE from spawn → render inline error banner over the
//     VNC pane with a retry button (D-95-12).

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'
import {AlertTriangle, Bot, Eye, GraduationCap, MessageCircle, RefreshCw, Square} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'
import {useWebAppVnc} from '@/hooks/use-webapp-vnc'
import {useWebAppAgent} from '@/hooks/use-webapp-agent'
import {useTeachRecorder, type ActionLog} from '@/hooks/use-teach-recorder'

import {WEBAPP_MODE_CHANGE_EVENT, type WebAppMode} from '../webapp-mode-selector'
import {SkillReplayScrubber} from '../skill-replay-scrubber'

import {WebAppChatDrawer} from './webapp-chat-drawer'
import {WebAppTeachDrawer} from './webapp-teach-drawer'
import {WebAppWatchDrawer} from './webapp-watch-drawer'
import {WebAppAutoDrawer} from './webapp-auto-drawer'

import {Sheet, SheetContent} from '@/shadcn-components/ui/sheet'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Input} from '@/shadcn-components/ui/input'

// noVNC keysyms — X11 keysymdef. Preserved here as constants for 100-04's
// drawer hosts to lift back/forward/refresh chord wiring (the chord helpers
// themselves were removed with the toolbar in 100-03; the keysyms stay as
// the canonical X11 values so the lift is a pure paste).
const KEY_ALT_LEFT = 0xffe9 // XK_Alt_L
const KEY_ARROW_LEFT = 0xff51
const KEY_ARROW_RIGHT = 0xff53
const KEY_F5 = 0xffc2

// Phase 96-04 — privacy-warning ack key (96-CONTEXT §gray-area #2).
// Persisted in localStorage so the toast doesn't nag forever once the
// user has acknowledged it. Per-session re-fire would be more naggy than
// the per-install dismissal that the v32 toast convention favours.
const TEACH_PRIVACY_ACK_KEY = 'liv:webapp:teach:warning-ack:v1'

const TEACH_PRIVACY_TEXT =
	'Do not enter passwords during teach mode. Screenshots may capture typed text.'

// Slug-safe skill name validator — mirrors the SLUG_RE in skills-router.ts.
const SKILL_NAME_RE = /^[A-Za-z0-9 _-]{1,80}$/

// Phase 100-04 — bottom action-bar drawer mode constants. Each icon
// toggles its own Sheet drawer (G-100-D D2). Lucide icon set is the
// project convention for window subsystem files.
type DrawerMode = 'chat' | 'teach' | 'watch' | 'auto'

const MODE_ICONS = {
	chat: MessageCircle,
	teach: GraduationCap,
	watch: Eye,
	auto: Bot,
} as const

const MODE_LABELS = {
	chat: 'Chat',
	teach: 'Teach',
	watch: 'Watch',
	auto: 'Auto',
} as const

interface WebAppStreamWindowProps {
	webappId: string
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

	// Phase 100-04 — drawer-open state coupled to the bottom action-bar
	// (G-100-D D2). Second click of the active icon closes; switching
	// swaps content. Toggling also fires the existing
	// WEBAPP_MODE_CHANGE_EVENT so Phase 96/97 listeners stay informed
	// without prop-drilling.
	const [openDrawer, setOpenDrawer] = useState<DrawerMode | null>(null)

	const toggleDrawer = useCallback((next: DrawerMode) => {
		setOpenDrawer((current) => (current === next ? null : next))
		try {
			window.dispatchEvent(
				new CustomEvent(WEBAPP_MODE_CHANGE_EVENT, {detail: {mode: next}}),
			)
		} catch {
			// JSDOM / older browsers may lack CustomEvent — non-blocking.
		}
	}, [])

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

	// 6. Render.
	//
	// Phase 100-03 (V33-MULTI-02 / G-100-E E1):
	//   - Top webapp-toolbar removed (Chrome `--app=URL` is chromeless).
	//   - Resizable vertical split removed; stream is `flex-1`
	//     of a single column.
	//   - Root wrapper switched to `relative flex h-full w-full flex-col`
	//     so 100-04's bottom action-bar can absolute-anchor at `bottom-0`.
	//   - Stream wrapper carries `pb-9` (Plan A locked) reserving the 36px
	//     bottom-bar overlay space (`absolute inset-x-0 bottom-0 z-20 h-9`).
	//   - Agent panel + mode selector + skills sidebar render sites are
	//     gone here; 100-04 reintroduces them inside drawers.
	//     Mode state, recorder wiring, composer state, and pendingSave
	//     dialog are preserved so 100-04 can lift them into the new
	//     drawer host without re-deriving the spawn lifecycle.

	return (
		<div className='relative flex h-full w-full flex-col bg-surface-base'>
			<div className='relative flex-1 min-h-0 overflow-hidden bg-black pb-9'>
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

			{/* Phase 100-04 — Bottom action-bar (V33-MULTI-03, G-100-C C1).
			    Plan A locked: overlays the stream wrapper's pb-9 reservation;
			    canonical z-index z-20. */}
			<TooltipProvider delayDuration={300}>
				<div
					className='absolute inset-x-0 bottom-0 z-20 flex h-9 items-center justify-center gap-1 border-t border-border-default bg-white/90 backdrop-blur-xl px-2'
				>
					{(['chat', 'teach', 'watch', 'auto'] as const).map((m) => {
						const Icon = MODE_ICONS[m]
						const active = openDrawer === m
						return (
							<Tooltip key={m}>
								<TooltipTrigger asChild>
									<button
										type='button'
										onClick={() => toggleDrawer(m)}
										aria-pressed={active}
										aria-label={MODE_LABELS[m]}
										className={cn(
											'flex h-8 w-8 items-center justify-center rounded-radius-sm transition-colors',
											active
												? 'bg-surface-2 text-text-primary'
												: 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
										)}
									>
										<Icon size={16} />
									</button>
								</TooltipTrigger>
								<TooltipContent side='top'>{MODE_LABELS[m]}</TooltipContent>
							</Tooltip>
						)
					})}
				</div>
			</TooltipProvider>

			{/* Phase 100-04 — Drawer host (V33-MULTI-04, G-100-D D2). */}
			<Sheet
				open={openDrawer !== null}
				onOpenChange={(o) => {
					if (!o) setOpenDrawer(null)
				}}
			>
				<SheetContent
					side='right'
					className='!w-[35%] !max-w-none overflow-hidden'
					closeButton={false}
				>
					<div className='relative z-10 flex h-full flex-col'>
						{openDrawer === 'chat' ? <WebAppChatDrawer webappId={webappId} /> : null}
						{openDrawer === 'teach' ? <WebAppTeachDrawer webappId={webappId} /> : null}
						{openDrawer === 'watch' ? <WebAppWatchDrawer webappId={webappId} /> : null}
						{openDrawer === 'auto' ? <WebAppAutoDrawer webappId={webappId} /> : null}
					</div>
				</SheetContent>
			</Sheet>
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
