import {useEffect, useRef, useState, type RefObject} from 'react'
import {AnimatePresence, motion, useAnimationControls, type Variants} from 'framer-motion'
import {useNavigate} from 'react-router-dom'
import {TbBrandDocker, TbLogout, TbPalette, TbPencil, TbRefresh} from 'react-icons/tb'
import {Activity, Bug, Maximize2, Minimize2, Monitor, Moon, Search, Sun, Terminal} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {useCurrentUser} from '@/hooks/use-current-user'
import {useIsMobile} from '@/hooks/use-is-mobile'
import {useLinkToDialog} from '@/utils/dialog'
import {useUserName} from '@/hooks/use-user-name'
import {useClockPrefs} from '@/hooks/use-clock-prefs'
import {formatClockParts} from '@/lib/intl'
import {onWindowDragDrop, setDisplaysButtonRect, useWindowDragState} from '@/providers/window-drag-state'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {systemAppsKeyed} from '@/providers/apps'
import {useTheme} from '@/hooks/use-theme'
import {openCommandPalette} from '@/components/cmdk'
import {DisplaysSurfaceLive} from './displays-surface'
import {LivCommandInput, LivAnswerPanel, LivApprovalView, LivApprovalPanel, LivBrandMarkInner, type LivState} from './liv-command-input'
import {runLivCommand, type LivApprovalOption, type LivCommandRun} from './liv-command-aionui'
import {FeedbackDialog} from './feedback-dialog'
import {greeting, wmoGlyph} from './clock-helpers'
import {cn} from '@/shadcn-lib/utils'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {AnimatedInputError, Input} from '@/shadcn-components/ui/input'
import {Button} from '@/shadcn-components/ui/button'
import {Popover, PopoverContent, PopoverTrigger} from '@/shadcn-components/ui/popover'
import {LiveUsagePanel} from './live-usage-popover'
import {t} from '@/utils/i18n'

/**
 * v36 LivOS Design Port — TopBar v2 (Phase 130-05 + 130-06 expand).
 *
 * Reference: `Downloads/topbar.html` (user-supplied 2026-05-15).
 *
 * COMPACT state (default, max-width 720px):
 *   Left   — avatar + name pill (click → dropdown).
 *   Center — brand donut (40×40 round button, donut mark 24×24).
 *   Right  — live clock + "Istanbul · 18°C" location row.
 *
 * EXPANDED state (max-width 1180px, ~550ms ease-out):
 *   The bar widens and reveals six nav-launcher pills on either side of
 *   the brand donut:
 *     Home · Apps · Files       — left of logo
 *     Liv  · Storage · Settings — right of logo
 *   Each link opens its corresponding dock window via windowManager
 *   (window-only paradigm preserved per feedback_livos_window_logic).
 *
 * Trigger: hovering THE LOGO toggles expansion; cursor leaving the
 * whole bar collapses it again. This way once expanded the user can
 * use the revealed nav links without the bar snapping shut. Per
 * 2026-05-15 user direction ("Logonun uzerine geldigimde buyumesi
 * gerekiyordu ... genislemesi").
 *
 * Reuses the old DockProfile dropdown actions (ChangeName + ChangeIcon
 * popups) inline so the entry point and the destination both move with
 * the avatar.
 */

const ANIMAL_EMOJIS = [
	'🦊', '🐼', '🦄', '🐸', '🦁', '🐧', '🦋', '🐬', '🦉', '🐺', '🦈', '🐮',
	'🐯', '🐰', '🦜', '🐻', '🦒', '🐙', '🦝', '🐨', '🦩', '🐵', '🦕', '🐢',
]

// Phase 260.2 — the navbar⇄displays swap spring (shared by both crossfade
// layers so the pill sliding up and the strip sliding down move as one).
const SWAP_SPRING = {type: 'spring', stiffness: 320, damping: 30} as const

// Phase 260.2 — utility buttons (Displays, Live Usage) live in the EXPANDED
// navbar only (revealed on LivOS-logo hover / during a window drag). Each pops
// in with a staggered scale/opacity spring ("buton açılma animasyonları").
const navUtilGroup: Variants = {
	// CLOSE must be FAST + UN-staggered. The pill's max-width collapse is heavily
	// front-loaded (ease-out-v36 ≈ easeOutExpo → compact width in ~140ms), but the
	// old reverse-staggered (`staggerDirection:-1`) ~300ms-tween exit with
	// `when:'afterChildren'` left all 7 icons fully visible INSIDE the already-
	// compact pill for ~250ms ("kapandığında ikonlar görünüyor" — measured frame
	// by frame 2026-06-08: icons still vis=7 at navW=580 from c+143 → c+216, not
	// gone until c+427). Drop afterChildren/stagger on HIDE so the group + children
	// fade together in ~0.14s, synced with the pill gulping shut. The delightful
	// staggered pop-in is KEPT on SHOW (only the exit changed).
	hidden: {opacity: 0, width: 0, transition: {duration: 0.14, ease: 'easeOut'}},
	show: {opacity: 1, width: 'auto', transition: {when: 'beforeChildren', staggerChildren: 0.06, delayChildren: 0.04}},
}
const navUtilItem: Variants = {
	// Fast exit (0.12s) so an individual icon never lingers past the pill collapse.
	hidden: {opacity: 0, scale: 0.5, x: 8, transition: {duration: 0.12, ease: 'easeOut'}},
	show: {opacity: 1, scale: 1, x: 0, transition: {type: 'spring', stiffness: 480, damping: 26}},
}

export function TopBar() {
	const isMobile = useIsMobile()
	if (isMobile) return null
	return <TopBarDesktop />
}

function TopBarDesktop() {
	const navigate = useNavigate()
	const linkToDialog = useLinkToDialog()
	const {user} = useCurrentUser()
	const windowManager = useWindowManagerOptional()
	// Phase 260.2 (operator-chosen 2026-06-08) — left-side feature buttons read the
	// theme provider (TopBar is inside ThemeProvider, like the dock).
	const {resolvedTheme, setTheme} = useTheme()

	const userQ = trpcReact.user.get.useQuery()
	const userName = userQ.data?.name || user?.name || 'User'
	// User shape varies between legacy single-user (no `id`) and multi-user
	// modes; fall back to the avatar-storage default for legacy mode.
	const userId = (userQ.data as {id?: string} | undefined)?.id ?? 'default'
	const initial = (userName.trim().charAt(0) || 'L').toUpperCase()

	const [menuOpen, setMenuOpen] = useState(false)
	// Phase 260.2 — navbar⇄displays swap. Clicking the 🖥️ Displays icon slides
	// the navbar pill UP and the displays strip DOWN into its place (replaces the
	// 260.1 hover dropdown). Cleared by Escape, clicking a display, or re-clicking
	// the icon. `showDisplays` will also OR in the drag-reveal in a later step.
	const [surfaceClicked, setSurfaceClicked] = useState(false)
	const showDisplays = surfaceClicked
	// Strip container — anything clicked OUTSIDE it (while open) returns the navbar.
	const surfaceRef = useRef<HTMLDivElement>(null)

	// Phase 260.2 — Escape OR a click anywhere outside the strip returns the
	// navbar (closes the displays surface).
	useEffect(() => {
		if (!surfaceClicked) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setSurfaceClicked(false)
		}
		const onPointerDown = (e: MouseEvent) => {
			// Ignore clicks on the Displays toggle button (it handles its own toggle)
			// and clicks inside the strip itself; everything else returns the navbar.
			const target = e.target as Node
			if (surfaceRef.current?.contains(target)) return
			if (dropZoneRef.current?.contains(target)) return
			setSurfaceClicked(false)
		}
		window.addEventListener('keydown', onKey)
		// mousedown (capture) so the navbar returns on the very next click anywhere.
		document.addEventListener('mousedown', onPointerDown, true)
		return () => {
			window.removeEventListener('keydown', onKey)
			document.removeEventListener('mousedown', onPointerDown, true)
		}
	}, [surfaceClicked])

	// Phase 260.1-03 (SC-A) — the Displays button plays an "intake" spring
	// scale-pop + ring flash when a dragged window docks (drop INSIDE the button),
	// confirming it absorbed the window. Fired AFTER pinWindowToTopBar in the drop
	// subscriber. The 500/18 spring is a snappier cousin of the badge's 500/28 —
	// a deliberate pop. intakeFlash toggles the same accent ring as isDragOverShelf
	// so the flash reads as the same accent, then self-clears after ~350ms.
	const intakeControls = useAnimationControls()
	const [intakeFlash, setIntakeFlash] = useState(false)

	const [showChangeName, setShowChangeName] = useState(false)
	const [showChangeIcon, setShowChangeIcon] = useState(false)
	// Report-a-problem / feedback dialog (opened from the Bug button in the LEFT
	// quick-controls cluster).
	const [showFeedback, setShowFeedback] = useState(false)
	const [isHoverExpanded, setIsHoverExpanded] = useState(false)
	// Phase 296 — the Live Usage navbar dropdown's open state. OR'd into
	// `isExpanded` below so the navbar (and thus the trigger button) stays
	// mounted while the popover is open — otherwise a hover-collapse would
	// unmount the Radix trigger and slam the dropdown shut.
	const [liveUsageOpen, setLiveUsageOpen] = useState(false)
	// ── Liv command bar → AionUi (the live Liv) ───────────────────────────────
	const [livState, setLivState] = useState<LivState>('idle')
	const [livPrompt, setLivPrompt] = useState('')           // in-flight prompt
	const [livAnswer, setLivAnswer] = useState<string | null>(null) // in-flight streaming text
	// Completed Q&A turns for THIS session. The answer panel renders this
	// transcript; answers never appear in the pill (operator: "answer iki yerde
	// de yazmasın sadece aşağıdaki kutuda yazsın").
	const [livTurns, setLivTurns] = useState<Array<{prompt: string; answer: string}>>([])
	// Persistent conversation id for the session — reused for FOLLOW-UP questions
	// so AionUi keeps the context (operator: "aynı session'da bir tane daha soru
	// soracağım"). Cleared on close.
	const livConvIdRef = useRef<string>('')
	// True once the operator clicked the done-logo to reveal the panel — keeps the
	// transcript visible through subsequent working/done turns in the session.
	const [livRevealed, setLivRevealed] = useState(false)
		// Phase 302 R2 — true while the operator is TYPING a follow-up in 'answer'
		// state; hides the old answer panel until submit (or the input is cleared).
		const [livEditingFollowup, setLivEditingFollowup] = useState(false)
	// Show the "Open in Liv ↗" escape hatch when a turn needs the full window
	// (tool approval pending) or dispatch fell back (backend unreachable / a
	// protocol assumption missed on this box).
	const [livNeedsWindow, setLivNeedsWindow] = useState(false)
	// Phase 291 R4 — the pending tool-approval prompt (question + option buttons),
	// rendered inline in the bar instead of bailing to "Open in Liv". `confirm`
	// echoes the chosen option back to Liv and keeps the stream alive.
	const [livApproval, setLivApproval] = useState<{
		question: string
		options: LivApprovalOption[]
		confirm: (value: unknown) => void
	} | null>(null)
	const livRunRef = useRef<LivCommandRun | null>(null)
	const answerPanelRef = useRef<HTMLDivElement>(null)
	const approvalPanelRef = useRef<HTMLDivElement>(null)
	// The pill shows the Liv composer (instead of the navbar) in compose + answer.
	// working/done keep the navbar so the center logo is visible + animating.
	const isLivOverlay = livState === 'compose' || livState === 'answer' || livState === 'approval'
	const enterCompose = () => {
		setIsHoverExpanded(false)
		setSurfaceClicked(false)
		setLivState('compose')
	}
	// Logo click: idle → compose · done → answer (reveal transcript + follow-up).
	const onLogoClick = () => {
		if (livState === 'idle') enterCompose()
		else if (livState === 'done') {
			setLivRevealed(true)
			setLivState('answer')
		}
	}
	// Open the full Liv (AionUi) window — escape hatch for tool/approval flows
	// the tiny bar can't render, and the fallback when direct dispatch can't
	// reach the backend.
	const openLivWindow = () => {
		const app = systemAppsKeyed['LIVINITY_liv-assistant']
		if (windowManager && app) {
			windowManager.openWindow('LIVINITY_liv-assistant', app.systemAppTo, app.name, app.icon)
		} else if (app) {
			navigate(app.systemAppTo)
		}
		livClose()
	}
	// Dispatch a command (or same-session follow-up) to AionUi and drive the state
	// machine from the live stream: working (logo pulses) → text streams into the
	// panel → done (dot) / answer. Follow-ups reuse livConvIdRef so the thread
	// keeps context. Errors/approvals surface the Open-in-Liv hatch.
	const livSubmit = (payload: {
		prompt: string
		agentId: string | undefined
		modelId: string | undefined
		mode: string
		files: string[]
		injectSkills: string[]
	}) => {
		livRunRef.current?.abort()
		setLivPrompt(payload.prompt)
		setLivAnswer(null)
		setLivEditingFollowup(false) // new turn → panel reappears with the streaming reply
		setLivNeedsWindow(false)
		// A revealed session keeps the composer open after each turn (answer);
		// the very first turn rests at done so the operator clicks to reveal.
		const restState: LivState = livRevealed ? 'answer' : 'done'
		const finish = (answer: string, needsWindow: boolean) => {
			setLivTurns((t) => [...t, {prompt: payload.prompt, answer}])
			setLivAnswer(null)
			setLivNeedsWindow(needsWindow)
			setLivState(restState)
		}
		livRunRef.current = runLivCommand(
			{
				...payload,
				// Auto-run (bypassPermissions) auto-approves tool calls silently.
				// Every other mode (default / plan / accept-edits) now surfaces the
				// confirmation INLINE (question in the bar + option buttons below)
				// via onApprovalNeeded — no more dead-end "Open in Liv".
				autoApprove: payload.mode === 'bypassPermissions',
				conversationId: livConvIdRef.current || undefined,
			},
			{
				onWorking: () => setLivState('working'),
				onConversation: (id) => {
					livConvIdRef.current = id
				},
				onText: (full) => setLivAnswer(full),
				onDone: (full) => finish(full, false),
				onError: (message, {fallback}) => finish(message, fallback),
				// Render the approval inline: question in the bar, option buttons in
				// the panel below. The operator approves/declines without leaving the
				// command bar.
				onApprovalNeeded: ({title, options, confirm}) => {
					setLivAnswer(null)
					setLivApproval({question: title || 'Liv wants to run an action. Approve to continue.', options, confirm})
					setLivState('approval')
				},
			},
		)
	}
	// Operator picked a confirmation option — echo it back to Liv and resume the
	// stream (working). Another confirmation simply re-enters the approval state.
	const livChooseApproval = (value: unknown) => {
		livApproval?.confirm(value)
		setLivApproval(null)
		setLivState('working')
	}
	const livClose = () => {
		livRunRef.current?.abort()
		livRunRef.current = null
		livConvIdRef.current = ''
		setLivState('idle')
		setLivAnswer(null)
		setLivPrompt('')
		setLivTurns([])
		setLivRevealed(false)
			setLivEditingFollowup(false)
		setLivNeedsWindow(false)
		setLivApproval(null)
	}
	// Transcript the panel shows: completed turns + the in-flight turn while
	// working (so a follow-up streams live once the panel is revealed).
	const livOnInputChange = (hasText: boolean) => {
			if (livState === 'answer') setLivEditingFollowup(hasText)
		}
		const livDisplayTurns =
		livState === 'working' ? [...livTurns, {prompt: livPrompt, answer: livAnswer ?? ''}] : livTurns
	// Panel reveals on the done-click (answer), then stays through the session.
	const livPanelVisible =
		(livState === 'answer' && !livEditingFollowup) ||
			(livRevealed && (livState === 'working' || livState === 'done'))
	const profileWrapRef = useRef<HTMLDivElement>(null)
	// Phase 260.2 — nav element ref for the hover-collapse safety net (bug fix).
	const navRef = useRef<HTMLElement>(null)
	// Phase 260-03 (SC4) — dropZoneRef now points at the Displays/Monitor
	// BUTTON (right cluster), not the old center shelf div. Typed as a
	// generic HTMLElement so it can attach to the <button> trigger; the
	// hit-test only reads getBoundingClientRect, which every element has.
	const dropZoneRef = useRef<HTMLElement>(null)

	// Phase 305 R9 — the Displays {n} count BADGE was removed (it showed a WRONG
	// count: `displays.list` returns STALE/GHOST Redis display records — no
	// server-side liveness check — so it over-counted, e.g. 7 for 4 real displays;
	// DisplayRecord has no alive field to correct it client-side). The button is now
	// icon-only; the popover still lists displays. A correct live counter needs a
	// server-side reap-on-read in display-manager.list() — follow-up.
	//
	// R9.1 FIX — but KEEP this always-on `displays.list` poll (badge gone, poll
	// stays). The global React Query staleTime is 60s (trpc-provider.tsx) and the
	// Displays popover (displays-surface.tsx) SHARES this exact query key, so this
	// background poll keeps the shared cache warm → the popover reflects
	// opened/minimized/closed displays LIVE the moment it opens. Removing it in R9
	// regressed the popover to up-to-60s-stale-until-page-refresh (operator:
	// "display kısmı eş zamanlı gözükmüyor"). Bare call — its only job is the
	// shared-cache refresh; no UI reads its return value anymore.
	trpcReact.displays.list.useQuery(undefined, {refetchInterval: 4000})

	// Open the ⌘K command palette. TopBar is mounted OUTSIDE CmdkProvider, so we
	// can't call useCmdkOpen() here — use the module-level opener the provider
	// registers (same setOpen the ⌘K handler uses).
	const triggerCmdk = () => openCommandPalette()

	// Phase 260.2 (operator-chosen 2026-06-08) — LEFT feature buttons.
	// Show Desktop: collect (minimize) all VISIBLE windows; toggle restores them.
	// Pinned/docked windows are intentionally stowed, so they're left untouched.
	const hasVisibleWindows = (windowManager?.windows ?? []).some((w) => !w.isMinimized && !w.isPinnedToTopBar)
	const toggleShowDesktop = () => {
		const wins = (windowManager?.windows ?? []).filter((w) => !w.isPinnedToTopBar)
		if (wins.some((w) => !w.isMinimized)) {
			wins.forEach((w) => !w.isMinimized && windowManager?.minimizeWindow(w.id))
		} else {
			wins.forEach((w) => windowManager?.restoreWindow(w.id))
		}
	}
	// Theme: one-click dark ⇄ light (iridescent counts as "dark-ish" → goes light).
	const isDark = resolvedTheme !== 'light'
	const toggleTheme = () => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')

	// Phase 130-09 — bar expands either while a window is being dragged
	// (drag-to-pin gesture) OR while the cursor is hovering the bar (so
	// the user can see the shelf without having to drag). User direction
	// 2026-05-15: "fare ile ustune geldigimde acilsin yinede goreyim".
	//
	// Phase 260-03 (SC4) — REMOVED the `|| pinnedWindows.length > 0` term.
	// That term kept the navbar PERMANENTLY EXPANDED whenever any window
	// was pinned and wedged the dropped pill in the navbar center (the
	// "Hermes Agent pill stuck in the navbar" operator bug). Docking now
	// targets the Displays button (slide-RIGHT into it) instead of a
	// center shelf, so the bar must COLLAPSE the instant the drag ends.
	// Pinned windows are surfaced by the {n} badge (260-04 / SC5) + the
	// Displays popover list (260-04 / SC3), not a center chip shelf.
	const dragState = useWindowDragState()
	const isExpanded = dragState.isDragging || isHoverExpanded || isLivOverlay || liveUsageOpen
	const [isDragOverShelf, setIsDragOverShelf] = useState(false)

	// Hit-test cursor against the drop-zone rect while a drag is active.
	useEffect(() => {
		if (!dragState.isDragging) {
			setIsDragOverShelf(false)
			return
		}
		const onMove = (e: MouseEvent) => {
			const rect = dropZoneRef.current?.getBoundingClientRect()
			if (!rect) return
			const inside = e.clientX >= rect.left && e.clientX <= rect.right
				&& e.clientY >= rect.top && e.clientY <= rect.bottom
			setIsDragOverShelf(inside)
		}
		document.addEventListener('mousemove', onMove)
		return () => document.removeEventListener('mousemove', onMove)
	}, [dragState.isDragging])

	// Phase 260-03 (SC4) — publish the Displays-button center coords so the
	// pin "shrink-to-chip" morph in window.tsx lands ON the button. Recompute
	// on mount and on window resize; clear on unmount so a stale rect never
	// drives the animation. dropZoneRef points at the Displays/Monitor button.
	useEffect(() => {
		const publish = () => {
			const rect = dropZoneRef.current?.getBoundingClientRect()
			if (rect) {
				setDisplaysButtonRect({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2})
			}
		}
		publish()
		window.addEventListener('resize', publish)
		return () => {
			window.removeEventListener('resize', publish)
			setDisplaysButtonRect(null)
		}
		// Phase 260.2 — re-publish when the button mounts/unmounts with the
		// expanded navbar (the button is hidden in the compact bar now).
	}, [isExpanded])

	// Drop subscriber: when the user releases over the Displays button, pin.
	useEffect(() => {
		const unsubscribe = onWindowDragDrop((event) => {
			const rect = dropZoneRef.current?.getBoundingClientRect()
			if (!rect) return
			const inside = event.clientX >= rect.left && event.clientX <= rect.right
				&& event.clientY >= rect.top && event.clientY <= rect.bottom
			if (inside) {
				windowManager?.pinWindowToTopBar(event.windowId)
				// Phase 260.1-03 (SC-A) — fire the intake pop + ring flash AFTER the
				// keep-alive pin so the button visibly "absorbs" the docked window as
				// the morph in window.tsx slides it into this button's rect.
				void intakeControls.start(
					{scale: [1, 1.28, 1]},
					{type: 'spring', stiffness: 500, damping: 18, mass: 0.6},
				)
				setIntakeFlash(true)
				setTimeout(() => setIntakeFlash(false), 350)
			}
		})
		return unsubscribe
	}, [windowManager, intakeControls])

	useEffect(() => {
		if (!menuOpen) return
		const handler = (e: MouseEvent) => {
			if (profileWrapRef.current && !profileWrapRef.current.contains(e.target as Node)) {
				setMenuOpen(false)
			}
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [menuOpen])

	// Liv command bar — abort any in-flight dispatch on unmount.
	useEffect(
		() => () => {
			livRunRef.current?.abort()
		},
		[],
	)
	// Close the Liv overlay on a click outside the bar AND the answer panel
	// (Escape is handled inside the Liv components). Selector dropdowns render
	// inside navRef, so using them never dismisses the overlay.
	useEffect(() => {
		if (!isLivOverlay) return
		const onDown = (e: MouseEvent) => {
			const target = e.target as Node
			if (navRef.current?.contains(target)) return
			if (answerPanelRef.current?.contains(target)) return
			// Phase 305 — the approval option buttons live in a SEPARATE panel below
			// the bar (not inside navRef). Without this exemption a mousedown on
			// Approve/Decline fires livClose() FIRST → aborts the run + unmounts the
			// buttons before their onClick (livChooseApproval) runs, so the approval
			// is unreachable ("stays in the background") AND the AionUi conversation
			// is left awaiting a confirm → next message 409s (breaks even YOLO).
			if (approvalPanelRef.current?.contains(target)) return
			livClose()
		}
		document.addEventListener('mousedown', onDown)
		return () => document.removeEventListener('mousedown', onDown)
	}, [isLivOverlay])

	// Phase 260.2 (bug fix 2026-06-08) — robust hover-collapse. The lone
	// <nav onMouseLeave> misses cases where the bar goes pointer-events:none
	// (displays surface opens) or a click opens a dialog/window OVER the bar →
	// the revealed utility icons would stay stuck visible. Two backstops:
	//   (1) collapse the instant the displays surface opens;
	//   (2) a document mousemove that collapses as soon as the cursor is
	//       measurably (>24px) outside the nav rect — no missed leave survives.
	useEffect(() => {
		if (showDisplays) setIsHoverExpanded(false)
	}, [showDisplays])
	useEffect(() => {
		if (!isHoverExpanded) return
		const onMove = (e: MouseEvent) => {
			const rect = navRef.current?.getBoundingClientRect()
			if (!rect) return
			const pad = 24
			if (
				e.clientX < rect.left - pad || e.clientX > rect.right + pad ||
				e.clientY < rect.top - pad || e.clientY > rect.bottom + pad
			) {
				setIsHoverExpanded(false)
			}
		}
		document.addEventListener('mousemove', onMove)
		return () => document.removeEventListener('mousemove', onMove)
	}, [isHoverExpanded])

	// Phase 260-03 (SC4) — the center-shelf chip restore/close handlers
	// (restorePinnedWindow / closePinnedWindow) were removed along with the
	// shelf. Recall + close of docked windows moves to the Displays popover
	// list in plan 260-04 (SC3), which reuses windowManager.unpinWindowFromTopBar
	// directly. (The 260-04 Displays badge + its `pinnedWindows`/`displays.list`
	// derivation were removed in 305 R9.)

	const menuItems: Array<
		| {icon: typeof TbPencil; label: string; action: () => void; danger?: boolean}
		| {divider: true}
	> = [
		{icon: TbPencil, label: 'Change name', action: () => { setMenuOpen(false); setShowChangeName(true) }},
		{icon: TbPalette, label: 'Change icon', action: () => { setMenuOpen(false); setShowChangeIcon(true) }},
		{divider: true},
		{icon: TbRefresh, label: 'Restart', action: () => { setMenuOpen(false); navigate(linkToDialog('restart')) }},
		{icon: TbLogout, label: 'Log out', action: () => { setMenuOpen(false); navigate(linkToDialog('logout')) }, danger: true},
	]

	return (
		<>
			<motion.div
				initial={{translateY: -40, opacity: 0}}
				animate={{translateY: 0, opacity: 1}}
				transition={{type: 'spring', stiffness: 280, damping: 24, delay: 0.1}}
				className='pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-6 pt-[18px]'
				role='banner'
				aria-label='Top bar'
			>
				<motion.nav
					ref={navRef}
					onMouseLeave={() => setIsHoverExpanded(false)}
					// Phase 260.2 — slide UP + fade out when the displays surface shows.
					initial={false}
					animate={showDisplays ? {y: -56, opacity: 0} : {y: 0, opacity: 1}}
					transition={SWAP_SPRING}
					style={{pointerEvents: showDisplays ? 'none' : 'auto'}}
					aria-hidden={showDisplays}
					className={cn(
						// Phase 260.2 — SYMMETRIC columns [1fr auto 1fr] so the brand logo
						// (center, auto-sized) stays pinned to the bar centre and NEVER
						// shifts when the right cluster reveals the utility buttons or the
						// bar expands (both 1fr sides grow equally around the centre).
						// Phase 291 R3 — z-50 on the nav itself. The nav's framer transform
						// (y/opacity animate) creates a stacking context that TRAPPED the
						// +menu / chip dropdowns (z-50) inside it, while the answer-panel
						// sibling div below (z-auto, later in DOM) painted on top. Promoting
						// the nav to z-50 lifts its whole subtree above the panel so the
						// dropdowns render in front. (No portal needed.)
						'pointer-events-auto relative z-50 grid h-16 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 rounded-full border bg-card-bg/78 px-3.5 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/55',
						// Compact 580 ➜ expand wide enough for 3 left features + 4 right
						// utilities. CRITICAL: minmax(0,1fr) — NOT plain 1fr (= minmax(auto,
						// 1fr)) — so BOTH side columns are forced exactly equal regardless of
						// content min-width; the centre logo can never drift mid-animation
						// when one side is heavier (logo-shift bug fix 2026-06-08).
						'transition-[max-width,border-color,box-shadow] duration-[700ms] ease-out-v36',
						isExpanded
							? 'max-w-[800px] border-line-strong shadow-[0_18px_50px_-28px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_50px_-20px_rgba(0,0,0,0.6)]'
							: 'max-w-[580px] border-line shadow-none',
					)}
					aria-label='Top bar'
				>
					{/* LEFT — profile + feature buttons (revealed on hover/drag). */}
					<div className={cn('flex min-w-0 items-center justify-start gap-1.5 transition-opacity duration-200', isLivOverlay && 'pointer-events-none opacity-0')}>
						<div ref={profileWrapRef} className='relative min-w-0'>
							<button
								type='button'
								onClick={() => setMenuOpen((open) => !open)}
								className='inline-flex max-w-full items-center gap-2.5 rounded-full px-2 py-2 text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
								aria-haspopup='menu'
								aria-expanded={menuOpen}
							>
								<span
									className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white'
									style={{
										background: 'linear-gradient(135deg, #ff8a65, #f06292)',
										boxShadow: '0 4px 12px -4px rgba(240, 98, 146, 0.5)',
										letterSpacing: '-0.01em',
									}}
									aria-hidden='true'
								>
									{initial}
								</span>
								<span className='truncate pr-2 text-[14px] font-medium tracking-[-0.005em]'>
									{userName}
								</span>
							</button>

							{menuOpen && (
								<motion.div
									initial={{opacity: 0, y: -8, scale: 0.97}}
									animate={{opacity: 1, y: 0, scale: 1}}
									transition={{duration: 0.12}}
									className='absolute left-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-line bg-card-bg py-1.5 backdrop-blur-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]'
									role='menu'
								>
									<div className='flex items-center gap-2.5 px-3.5 pb-2 pt-2'>
										<span
											className='grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white'
											style={{
												background: 'linear-gradient(135deg, #ff8a65, #f06292)',
												boxShadow: '0 6px 18px -6px rgba(240, 98, 146, 0.55)',
											}}
											aria-hidden='true'
										>
											{initial}
										</span>
										<div className='min-w-0'>
											<p className='truncate text-[13px] font-semibold text-[color:var(--fg)]'>{userName}</p>
											<p className='text-[11px] text-[color:var(--fg-faint)]'>Admin</p>
										</div>
									</div>
									<div className='mx-3 my-1 h-px bg-line' />
									{menuItems.map((item, i) => {
										if ('divider' in item) return <div key={i} className='mx-3 my-1 h-px bg-line' />
										const Icon = item.icon
										return (
											<button
												key={i}
												type='button'
												onClick={item.action}
												className={`flex w-full items-center gap-2.5 px-3.5 py-[7px] text-left text-[13px] font-medium transition-colors ${
													item.danger
														? 'text-red-500 hover:bg-red-500/10'
														: 'text-[color:var(--fg-dim)] hover:bg-[color:var(--bg-2)] hover:text-[color:var(--fg)]'
												}`}
												role='menuitem'
											>
												<Icon className='h-[15px] w-[15px] shrink-0' />
												{item.label}
											</button>
										)
									})}
								</motion.div>
							)}
						</div>

						{/* Phase 260.2 (operator-chosen, re-split 2026-06-08) — LEFT = quick
						    controls (revealed on hover/drag): Show Desktop, theme toggle,
						    Search. System tools (Live Usage/Displays/Docker/Terminal) sit on
						    the RIGHT, grouped by function per operator direction. */}
						<AnimatePresence>
							{isExpanded && (
								<motion.div
									key='nav-features'
									className='flex items-center gap-1.5'
									variants={navUtilGroup}
									initial='hidden'
									animate='show'
									exit='hidden'
								>
									{/* Show Desktop — collect (minimize) all windows / restore. */}
									<motion.button
										variants={navUtilItem}
										type='button'
										aria-label='Show desktop'
										title={hasVisibleWindows ? 'Show desktop' : 'Restore windows'}
										onClick={toggleShowDesktop}
										className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
									>
										{hasVisibleWindows ? <Minimize2 className='h-4 w-4' /> : <Maximize2 className='h-4 w-4' />}
									</motion.button>

									{/* Theme — one-click dark ⇄ light. */}
									<motion.button
										variants={navUtilItem}
										type='button'
										aria-label='Toggle theme'
										title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
										onClick={toggleTheme}
										className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
									>
										{isDark ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
									</motion.button>

									{/* Search — opens the ⌘K command palette (a quick action). */}
									<motion.button
										variants={navUtilItem}
										type='button'
										aria-label='Search'
										title='Search (⌘K)'
										onClick={triggerCmdk}
										className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
									>
										<Search className='h-4 w-4' />
									</motion.button>

									{/* Report a problem — opens the feedback dialog. */}
									<motion.button
										variants={navUtilItem}
										type='button'
										aria-label='Report a problem'
										title='Report a problem'
										onClick={() => setShowFeedback(true)}
										className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
									>
										<Bug className='h-4 w-4' />
									</motion.button>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					{/* CENTER — brand donut + hover trigger.
					    Phase 260-03 (SC4) — the old center "pinned-windows drop-zone
					    shelf" is REMOVED. Docking no longer lands a chip here (that
					    wedged the navbar open). The drop target moved to the Displays
					    button on the RIGHT (see dropZoneRef below). While dragging the
					    bar still expands (isExpanded) so the gesture reads, but the
					    center now only ever shows the brand donut. */}
					<div className={cn('flex min-w-0 items-center justify-center transition-opacity duration-200', isLivOverlay && 'pointer-events-none opacity-0')}>
						<button
							type='button'
							onMouseEnter={() => setIsHoverExpanded(true)}
							onClick={onLogoClick}
							// Logo grows clearly on hover (operator request 2026-06-08
							// "Logonun üzerine geldiğimde büyüsün"). scale-125 reads as a
							// deliberate grow, not the old barely-there scale-[1.04].
							className='relative grid h-10 w-10 cursor-pointer place-items-center rounded-full transition-[transform,background] duration-200 ease-out hover:scale-110 hover:bg-[color:var(--bg-2)]'
							aria-label='LivOS'
						>
							<LivBrandMarkInner state={livState} donutSize={24} />
						</button>
					</div>

					{/* RIGHT — single 🖥️ Displays popover + clock + location.
					    Phase 255-04 replaces the Phase 159 grid-icon windows-manager
					    popover with ONE Displays popover (display cards + ~2s screenshot
					    thumbs + folded-in windows rows). The 254-04 top-edge hover strip
					    is also gone (deleted in 255-04 Task 4) — this is now the SINGLE
					    navbar display/windows surface. Existing pinned-window shelf in
					    the Center drop-zone stays untouched. */}
					<div className={cn('flex min-w-0 items-center justify-end gap-1.5 pr-1.5 transition-opacity duration-200', isLivOverlay && 'pointer-events-none opacity-0')}>
						{/* Phase 260.2 — utility buttons (Live Usage + Displays) live in the
						    EXPANDED navbar ONLY (revealed on LivOS-logo hover / during a
						    window drag, since isExpanded = isHoverExpanded || isDragging).
						    Hidden in the compact bar; pop in with a staggered spring. */}
						<AnimatePresence>
							{isExpanded && (
								<motion.div
									key='nav-utils'
									// No overflow-hidden — it was CLIPPING the Displays {n} badge
									// (-top-1 -right-1), which made "display N" disappear. The
									// collapse is handled by the group's opacity/width variant.
									className='flex items-center gap-1.5'
									variants={navUtilGroup}
									initial='hidden'
									animate='show'
									exit='hidden'
								>
									{/* Phase 296 — Live Usage opens a compact 3-gauge dropdown
									    (CPU/Memory/Storage) anchored below the navbar, replacing
									    the old full-screen `?dialog=live-usage`. Controlled so the
									    navbar stays expanded while open (see `liveUsageOpen`). */}
									<Popover open={liveUsageOpen} onOpenChange={setLiveUsageOpen}>
										<PopoverTrigger asChild>
											<motion.button
												variants={navUtilItem}
												type='button'
												aria-label='Live Usage'
												title='Live Usage'
												className={cn(
													'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]',
													liveUsageOpen && 'bg-[color:var(--bg-2)] ring-2 ring-[color:var(--fg)] ring-offset-1',
												)}
											>
												<Activity className='h-4 w-4' />
											</motion.button>
										</PopoverTrigger>
										<PopoverContent
											align='end'
											sideOffset={10}
											className='w-auto rounded-2xl border-line bg-card-bg/95 p-3 text-text-primary backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/60'
										>
											<LiveUsagePanel />
										</PopoverContent>
									</Popover>

									{/* Displays — toggles the navbar⇄displays swap. Wrapped so the
									    reveal variant lives on the outer div while the button keeps
									    its imperative intake-pop (animate={intakeControls}) +
									    dropZoneRef for the drag-dock drop target. */}
									<motion.div variants={navUtilItem} className='shrink-0'>
										<motion.button
											ref={dropZoneRef as RefObject<HTMLButtonElement>}
											type='button'
											aria-label='Displays'
											title='Displays'
											onClick={() => setSurfaceClicked((v) => !v)}
											animate={intakeControls}
											className={cn(
												'relative grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[color:var(--bg-2)]',
												(isDragOverShelf || showDisplays) && 'bg-[color:var(--bg-2)] ring-2 ring-[color:var(--fg)] ring-offset-1',
												intakeFlash && 'ring-2 ring-[color:var(--fg)] ring-offset-1',
											)}
										>
											<Monitor className='h-4 w-4' />
										</motion.button>
									</motion.div>

									{/* Docker — opens the Docker window (operator-chosen 4th
									    utility 2026-06-08). */}
									<motion.button
										variants={navUtilItem}
										type='button'
										aria-label='Docker'
										title='Docker'
										onClick={() =>
											windowManager
												? windowManager.openWindow('LIVINITY_docker', '/docker', 'Docker', systemAppsKeyed['LIVINITY_docker'].icon)
												: navigate(systemAppsKeyed['LIVINITY_docker'].systemAppTo)
										}
										className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
									>
										<TbBrandDocker className='h-4 w-4' />
									</motion.button>

									{/* Terminal — opens the Terminal window (dev tool, operator-added 2026-06-08). */}
										<motion.button
											variants={navUtilItem}
											type='button'
											aria-label='Terminal'
											title='Terminal'
											onClick={() =>
												windowManager
													? windowManager.openWindow('LIVINITY_terminal', '/terminal', 'Terminal', systemAppsKeyed['LIVINITY_terminal'].icon)
													: navigate(systemAppsKeyed['LIVINITY_terminal'].systemAppTo)
											}
											className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--fg)] transition-colors hover:bg-[color:var(--bg-2)]'
										>
											<Terminal className='h-4 w-4' />
										</motion.button>

										{/* Divider — separates the utility controls from the clock so
									    they don't read as "crammed too far right" and the {n} badge
									    has clear room. */}
									<motion.span variants={navUtilItem} className='mx-0.5 h-5 w-px shrink-0 bg-line' aria-hidden />
								</motion.div>
							)}
						</AnimatePresence>
						<ClockWithLocation />
					</div>
					{/* Liv overlay — the composer / answer morph, animated in over the faded
					    navbar columns. Same pill; AnimatePresence crossfades compose↔answer. */}
					<AnimatePresence>
						{isLivOverlay && (
							<motion.div
								key={livState}
								initial={{opacity: 0, y: 6, scale: 0.985}}
								animate={{opacity: 1, y: 0, scale: 1}}
								exit={{opacity: 0, y: 6, scale: 0.985}}
								transition={{type: 'spring', stiffness: 460, damping: 34}}
								className='absolute inset-0 flex items-center px-3.5'
							>
								{/* compose (first question) AND answer (follow-up) both show the
								    composer — the answer itself lives only in the panel below.
								    approval shows the question Liv is asking (buttons render in
								    the panel below). */}
								{livState === 'approval' && livApproval ? (
									<LivApprovalView question={livApproval.question} onClose={livClose} />
								) : (
									<LivCommandInput onClose={livClose} onSubmit={livSubmit} onInputChange={livOnInputChange} />
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</motion.nav>

				{/* Liv answer / approval panel — dropped just below the bar. The
				    approval panel (option buttons) takes priority while a tool is
				    waiting on the operator; otherwise the answer transcript shows. */}
				<div className='pointer-events-none absolute inset-x-0 top-[92px] flex justify-center'>
					<AnimatePresence>
						{livState === 'approval' && livApproval ? (
							<motion.div
								key='liv-approval'
								ref={approvalPanelRef}
								initial={{opacity: 0, y: -10, scale: 0.98}}
								animate={{opacity: 1, y: 0, scale: 1}}
								exit={{opacity: 0, y: -10, scale: 0.98}}
								transition={{type: 'spring', stiffness: 420, damping: 32}}
								className='pointer-events-auto'
							>
								<LivApprovalPanel
									question={livApproval.question}
									options={livApproval.options}
									onChoose={livChooseApproval}
									onOpenInLiv={openLivWindow}
								/>
							</motion.div>
						) : livPanelVisible && livDisplayTurns.length > 0 ? (
							<motion.div
								key='liv-answer'
								ref={answerPanelRef}
								initial={{opacity: 0, y: -10, scale: 0.98}}
								animate={{opacity: 1, y: 0, scale: 1}}
								exit={{opacity: 0, y: -10, scale: 0.98}}
								transition={{type: 'spring', stiffness: 420, damping: 32}}
								className='pointer-events-auto'
							>
								<LivAnswerPanel
									turns={livDisplayTurns}
									working={livState === 'working'}
									onOpenInLiv={livNeedsWindow ? openLivWindow : undefined}
								/>
							</motion.div>
						) : null}
					</AnimatePresence>
				</div>
				{/* Phase 260.2 — displays strip layer. Slides DOWN into the navbar's
				    place (and the pill slides up) when showDisplays. The OUTER div
				    handles centering (flex) so the INNER motion layer's transform is
				    free for the y/opacity crossfade — framer's inline transform would
				    otherwise clobber a Tailwind -translate-x-1/2. */}
				<div className='pointer-events-none absolute inset-x-0 top-[18px] flex justify-center'>
					<motion.div
						ref={surfaceRef}
						initial={false}
						animate={showDisplays ? {y: 0, opacity: 1} : {y: -24, opacity: 0}}
						transition={SWAP_SPRING}
						style={{pointerEvents: showDisplays ? 'auto' : 'none'}}
						aria-hidden={!showDisplays}
					>
						<DisplaysSurfaceLive open={showDisplays} onActivate={() => setSurfaceClicked(false)} />
					</motion.div>
				</div>
			</motion.div>

			<ChangeNamePopup open={showChangeName} onOpenChange={setShowChangeName} />
			<ChangeIconPopup open={showChangeIcon} onOpenChange={setShowChangeIcon} userId={userId} />
			<FeedbackDialog open={showFeedback} onOpenChange={setShowFeedback} />
		</>
	)
}

// ── Pinned-window chip (REMOVED — Phase 260-03 / SC4) ───────────────
//
// The center-shelf PinnedWindowChip was deleted: docking no longer renders
// a chip in the navbar center (that wedged the bar open). Docked windows are
// now represented by the {n} badge on the Displays button (plan 260-04 / SC5)
// and listed in the Displays popover (plan 260-04 / SC3, reusing
// WindowsManagerPanel). The chip's restore/close verbs map to
// windowManager.unpinWindowFromTopBar / closeWindow there.

// ── Clock + Location ────────────────────────────────────────────────

/**
 * Fetches the current temperature for the supplied `city` from open-meteo.com
 * (free, no API key, no auth). The fetch is one-shot per city with a
 * localStorage cache + 1-hour TTL so the network call doesn't repeat on every
 * render. Failures fall back gracefully to just the city, then to no location
 * row at all.
 *
 * Phase 271 — `city` is the SELECTED city from useClockPrefs (was browser-tz
 * derived). A null/empty city short-circuits the geocode.
 */
function useLocationWeather(cityInput: string | null) {
	const city = cityInput && cityInput.trim() ? cityInput.trim() : null
	const [tempC, setTempC] = useState<number | null>(null)
	// Phase 255-04 — additive: WMO weather_code + is_day power the navbar
	// glow-up (glyph + day/night accent). Both nullable; a missing field never
	// breaks the clock (silent-fallback try/catch preserved below).
	const [weatherCode, setWeatherCode] = useState<number | null>(null)
	const [isDay, setIsDay] = useState<0 | 1 | null>(null)

	useEffect(() => {
		if (!city || typeof window === 'undefined') return
		const cacheKey = `liv:topbar:weather:${city}`
		try {
			const raw = window.localStorage.getItem(cacheKey)
			if (raw) {
				const cached = JSON.parse(raw) as {at: number; tempC: number; weatherCode?: number; isDay?: 0 | 1}
				if (Date.now() - cached.at < 60 * 60 * 1000) {
					setTempC(cached.tempC)
					if (typeof cached.weatherCode === 'number') setWeatherCode(cached.weatherCode)
					if (cached.isDay === 0 || cached.isDay === 1) setIsDay(cached.isDay)
					return
				}
			}
		} catch {}

		let cancelled = false
		async function fetchWeather() {
			try {
				const geoRes = await fetch(
					`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city!)}&count=1&language=en&format=json`,
				)
				if (!geoRes.ok) return
				const geo = await geoRes.json() as {results?: Array<{latitude: number; longitude: number}>}
				const first = geo.results?.[0]
				if (!first) return
				const wxRes = await fetch(
					`https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=temperature_2m,weather_code,is_day`,
				)
				if (!wxRes.ok) return
				const wx = await wxRes.json() as {current?: {temperature_2m?: number; weather_code?: number; is_day?: number}}
				const t = wx.current?.temperature_2m
				if (typeof t !== 'number' || cancelled) return
				const code = typeof wx.current?.weather_code === 'number' ? wx.current.weather_code : null
				const day = wx.current?.is_day === 0 || wx.current?.is_day === 1 ? (wx.current.is_day as 0 | 1) : null
				setTempC(Math.round(t))
				if (code !== null) setWeatherCode(code)
				if (day !== null) setIsDay(day)
				window.localStorage.setItem(
					cacheKey,
					JSON.stringify({at: Date.now(), tempC: Math.round(t), weatherCode: code ?? undefined, isDay: day ?? undefined}),
				)
			} catch {
				// Network failure / blocked — silent fallback to city-only.
			}
		}
		fetchWeather()
		return () => {
			cancelled = true
		}
	}, [city])

	return {city, tempC, weatherCode, isDay}
}

function ClockWithLocation() {
	const [now, setNow] = useState(() => new Date())
	// Phase 271 — the SELECTED location + clock format drive the navbar clock.
	const {city, timezone, hourCycle, locale} = useClockPrefs()
	const {tempC, weatherCode, isDay} = useLocationWeather(city)
	// Phase 255-04 — additive: source the operator name from the SAME cached
	// tRPC query the profile button uses (no new fetch) so the greeting reads
	// e.g. "Good evening, Bruce". Falls back to the bare greeting if absent.
	const userQ = trpcReact.user.get.useQuery()
	const userName = userQ.data?.name || undefined

	useEffect(() => {
		// Tick every 30s — we only display HH:MM so per-second is wasteful.
		const id = window.setInterval(() => setNow(new Date()), 30_000)
		return () => window.clearInterval(id)
	}, [])

	// Phase 271 — render the time in the SELECTED timezone honoring the chosen
	// hour-cycle. formatClockParts returns HH:MM + an AM/PM badge ONLY when
	// hourCycle === 'h12' (null otherwise → no stray badge in 24-hour mode).
	const {time, dayPeriod} = formatClockParts(now, {locale, timeZone: timezone, hourCycle})

	// Greeting / day-night accent need the hour IN THE SELECTED TIMEZONE, not the
	// browser's. Pull it from a 24h-forced formatter so the band logic is sound.
	const h24 = (() => {
		try {
			const hourStr = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				hour: '2-digit',
				hourCycle: 'h23',
			}).format(now)
			const parsed = Number.parseInt(hourStr, 10)
			return Number.isFinite(parsed) ? parsed : now.getHours()
		} catch {
			return now.getHours()
		}
	})()

	// Phase 255-04 — additive glow-up (D-255-NAVBAR-ADDITIVE): a small greeting
	// line, a weather glyph beside the temp, and a day/night accent tint on the
	// greeting/glyph text ONLY. Layout (pill/donut/profile + the time + city/temp
	// rows) stays structurally intact.
	const dayLike = isDay !== null ? isDay === 1 : h24 >= 6 && h24 < 20
	// Warmer tint by day, cooler tint by night — text-color swap only.
	const accentColor = dayLike ? '#f5b042' : '#7aa2ff'

	return (
		<div className='flex flex-col items-end gap-px rounded-xl px-2.5 py-1 text-right leading-[1.05] transition-colors hover:bg-[color:var(--bg-2)]'>
			<span className='whitespace-nowrap text-[10.5px] font-medium' style={{color: accentColor}}>
				{greeting(h24, userName)}
			</span>
			<span className='whitespace-nowrap font-mono text-[14.5px] font-medium tracking-[-0.01em] text-[color:var(--fg)] tabular-nums'>
				{time}
				{dayPeriod && (
					<span className='ml-1 text-[10.5px] font-medium text-[color:var(--fg-mute)]'>{dayPeriod}</span>
				)}
			</span>
			{city && (
				<span className='inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-normal text-[color:var(--fg-mute)]'>
					<svg
						viewBox='0 0 24 24'
						fill='none'
						stroke='currentColor'
						strokeWidth='2'
						strokeLinecap='round'
						strokeLinejoin='round'
						className='h-2.5 w-2.5 shrink-0'
						aria-hidden='true'
					>
						<path d='M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z' />
						<circle cx='12' cy='10' r='3' />
					</svg>
					<span>
						{city}
						{tempC !== null && (
							<>
								{' · '}
								{weatherCode !== null && (
									<span aria-hidden style={{color: accentColor}}>
										{wmoGlyph(weatherCode)}{' '}
									</span>
								)}
								<span className='text-[color:var(--fg-dim)] tabular-nums'>{tempC}°C</span>
							</>
						)}
					</span>
				</span>
			)}
		</div>
	)
}

// ── Change Name Popup (ported from dock-profile.tsx) ────────────────

function ChangeNamePopup({open, onOpenChange}: {open: boolean; onOpenChange: (v: boolean) => void}) {
	const {name, setName, handleSubmit, formError, isLoading} = useUserName({
		onSuccess: () => onOpenChange(false),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent asChild>
					<form onSubmit={handleSubmit}>
						<fieldset disabled={isLoading} className='flex flex-col gap-5'>
							<DialogHeader>
								<DialogTitle>{t('change-name', {defaultValue: 'Change name'})}</DialogTitle>
							</DialogHeader>
							<Input
								placeholder={t('change-name.input-placeholder', {defaultValue: 'Your name'})}
								value={name}
								onValueChange={setName}
							/>
							<div className='-my-2.5'>
								<AnimatedInputError>{formError}</AnimatedInputError>
							</div>
							<DialogFooter>
								<Button type='submit' size='dialog' variant='primary'>
									{t('confirm', {defaultValue: 'Confirm'})}
								</Button>
								<Button type='button' size='dialog' onClick={() => onOpenChange(false)}>
									{t('cancel', {defaultValue: 'Cancel'})}
								</Button>
							</DialogFooter>
						</fieldset>
					</form>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}

// ── Change Icon Popup (ported from dock-profile.tsx) ────────────────

function ChangeIconPopup({open, onOpenChange, userId}: {open: boolean; onOpenChange: (v: boolean) => void; userId: string}) {
	const currentEmoji = localStorage.getItem(`livinity-avatar-${userId}`) || null
	const [selectedEmoji, setSelectedEmoji] = useState<string | null>(currentEmoji)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Choose your avatar</DialogTitle>
					</DialogHeader>
					<div className='grid grid-cols-6 gap-2 py-2'>
						{ANIMAL_EMOJIS.map((emoji) => (
							<button
								key={emoji}
								onClick={() => setSelectedEmoji(emoji)}
								className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl transition-all ${
									selectedEmoji === emoji
										? 'bg-brand/10 ring-2 ring-brand scale-110'
										: 'hover:bg-surface-1 hover:scale-105'
								}`}
							>
								{emoji}
							</button>
						))}
					</div>
					<DialogFooter>
						<Button
							size='dialog'
							variant='primary'
							disabled={!selectedEmoji}
							onClick={() => {
								if (selectedEmoji) {
									localStorage.setItem(`livinity-avatar-${userId}`, selectedEmoji)
									window.dispatchEvent(new StorageEvent('storage', {key: `livinity-avatar-${userId}`, newValue: selectedEmoji}))
								}
								onOpenChange(false)
							}}
						>
							Save
						</Button>
						<Button size='dialog' onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogContent>
			</DialogPortal>
		</Dialog>
	)
}
