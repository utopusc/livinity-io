// Phase 159 — Windows Manager Panel (Workstream C).
//
// Functional list view of every open window across all appId kinds:
// WebApp (WEBAPP_<id>), NativeApp (NATIVE_<id>), System (LIVINITY_<name>).
//
// Each row exposes Focus / Minimize-or-Restore / Pin-or-Unpin / Close
// using existing WindowManager methods — no new state, no new
// provider, no new route. Mounted via Radix Popover from TopBar
// right cluster (top-bar.tsx).
//
// Visual is intentionally utilitarian — Phase 159 scope explicitly
// defers frontend polish to a follow-up phase (no design system pass,
// no animations beyond Radix defaults).
//
// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.

import {useWindowManagerOptional, type WindowState} from '@/providers/window-manager'

const WEBAPP_APP_ID_PREFIX = 'WEBAPP_'
const NATIVE_APP_ID_PREFIX = 'NATIVE_'
const SYSTEM_APP_ID_PREFIX = 'LIVINITY_'

type WindowAppKind = 'webapp' | 'native' | 'system' | 'unknown'

function classifyAppId(appId: string): WindowAppKind {
	if (appId.startsWith(WEBAPP_APP_ID_PREFIX)) return 'webapp'
	if (appId.startsWith(NATIVE_APP_ID_PREFIX)) return 'native'
	if (appId.startsWith(SYSTEM_APP_ID_PREFIX)) return 'system'
	return 'unknown'
}

function describeState(w: WindowState): string {
	if (w.isMinimized) return 'Minimized'
	if (w.isPinnedToTopBar) return 'Pinned'
	return 'Visible'
}

export function WindowsManagerPanel() {
	const wm = useWindowManagerOptional()
	if (!wm) return null

	return (
		<div className='flex max-h-[480px] w-[340px] flex-col gap-1 overflow-y-auto p-2'>
			<div className='border-b border-line px-2 pb-2 pt-1 text-[12px] font-semibold uppercase tracking-wide text-text-secondary'>
				Windows ({wm.windows.length})
			</div>
			{wm.windows.length === 0 ? (
				<p className='px-2 py-3 text-[12px] text-text-tertiary'>No open windows</p>
			) : (
				wm.windows.map((w) => <WindowRow key={w.id} window={w} wm={wm} />)
			)}
		</div>
	)
}

function WindowRow({window: w, wm}: {window: WindowState; wm: NonNullable<ReturnType<typeof useWindowManagerOptional>>}) {
	const kind = classifyAppId(w.appId)
	const state = describeState(w)
	return (
		<div className='flex items-center gap-2 rounded-md border border-line px-2 py-1.5'>
			<span
				className='inline-block h-5 w-5 shrink-0 rounded bg-cover bg-center'
				style={w.icon ? {backgroundImage: `url(${w.icon})`} : undefined}
				aria-hidden
			/>
			<div className='min-w-0 flex-1'>
				<p className='truncate text-[13px] font-medium' title={w.title}>{w.title}</p>
				<p className='truncate text-[11px] text-text-tertiary'>
					{kind} · {state}
				</p>
			</div>
			<button
				type='button'
				onClick={() => wm.focusWindow(w.id)}
				className='rounded px-1.5 py-0.5 text-[11px] hover:bg-[color:var(--bg-2)]'
				title='Focus this window'
			>
				Focus
			</button>
			<button
				type='button'
				onClick={() => (w.isMinimized ? wm.restoreWindow(w.id) : wm.minimizeWindow(w.id))}
				className='rounded px-1.5 py-0.5 text-[11px] hover:bg-[color:var(--bg-2)]'
				title={w.isMinimized ? 'Restore from minimized' : 'Minimize'}
			>
				{w.isMinimized ? 'Restore' : 'Min'}
			</button>
			{/* Phase 260-04 (SC3) — for a DOCKED (pinned) window this button is the
			    RECALL affordance: clicking it calls unpinWindowFromTopBar, which
			    re-expands the still-mounted window (stream stays alive — NEVER
			    closeWindow). For a visible window it still docks via
			    pinWindowToTopBar. Label flips Recall ⇄ Dock accordingly. */}
			<button
				type='button'
				onClick={() => (w.isPinnedToTopBar ? wm.unpinWindowFromTopBar(w.id) : wm.pinWindowToTopBar(w.id))}
				className='rounded px-1.5 py-0.5 text-[11px] hover:bg-[color:var(--bg-2)]'
				title={w.isPinnedToTopBar ? 'Recall this docked window' : 'Dock to Displays'}
			>
				{w.isPinnedToTopBar ? 'Recall' : 'Dock'}
			</button>
			<button
				type='button'
				onClick={() => wm.closeWindow(w.id)}
				className='rounded px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10'
				title='Close window'
			>
				Close
			</button>
		</div>
	)
}
