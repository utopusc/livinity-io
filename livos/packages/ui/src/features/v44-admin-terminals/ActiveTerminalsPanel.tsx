/**
 * Phase 246-05 Task 3 — Active Terminals admin panel.
 *
 * v44 admin surface for listing live PTY sessions and killing them. Lives
 * inside Settings → System (mounted from `src/modules/settings/system-section.tsx`).
 *
 * Visibility:
 *   - Self-gated by `useTerminalPanelEnabled()` — section renders `null` when
 *     the v43 feature flag (`livos:v43:terminal_panel`) is OFF, mirroring the
 *     dock entry gate so flipping the flag cleanly removes the surface.
 *   - Data flows through `trpcReact.ptySessions.listSessions` and
 *     `trpcReact.ptySessions.killSession`, both `adminProcedure`-gated by the
 *     246-03 admin sub-router (T-246-05-04/05 double-gate).
 *
 * Layout: simple list of rows — name, id (truncated), createdAt, lastAttachAt
 * (rendered with a small `formatRelative` helper to keep the bundle dep-free),
 * plus a Kill button. On successful kill the listSessions query is invalidated
 * so the row disappears in the next render tick.
 *
 * Drift-locks:
 *   - `data-testid='active-terminals-panel'` — Test #1 asserts this is absent
 *     when the flag is OFF.
 *   - `data-testid={\`session-row-\${id}\`}` — Test #3 counts rendered rows.
 *   - `data-testid={\`kill-button-\${id}\`}` — Test #4 clicks the row's Kill.
 *
 * v44 = single-user. Per-user scoping deferred to v45; the underlying admin
 * router already returns whatever SessionManager has, which today maps to
 * the single bruce user.
 */

import {useTerminalPanelEnabled} from '@/hooks/use-terminal-panel-enabled'
import {trpcReact} from '@/trpc/trpc'

function formatRelative(iso: string): string {
	const t = Date.parse(iso)
	if (!Number.isFinite(t)) return iso
	const deltaMs = Date.now() - t
	const deltaMin = Math.max(0, Math.round(deltaMs / 60_000))
	if (deltaMin < 1) return 'just now'
	if (deltaMin < 60) return `${deltaMin}m ago`
	const deltaH = Math.round(deltaMin / 60)
	if (deltaH < 48) return `${deltaH}h ago`
	const deltaD = Math.round(deltaH / 24)
	return `${deltaD}d ago`
}

export function ActiveTerminalsPanel() {
	const enabled = useTerminalPanelEnabled()

	const list = trpcReact.ptySessions.listSessions.useQuery(undefined, {
		// Cheap query — pulls in-memory map. Refetch every 5s while the
		// admin is staring at the panel so freshly-attached sessions appear
		// without a manual reload.
		refetchInterval: enabled ? 5_000 : false,
		enabled,
	})

	const kill = trpcReact.ptySessions.killSession.useMutation({
		onSuccess: () => {
			list.refetch()
		},
	})

	// Self-gate AFTER the hook calls — React's rules-of-hooks forbid early
	// `return null` before useQuery/useMutation. The `enabled: false` flag
	// above keeps the query inactive when the panel is gated off.
	if (!enabled) return null

	return (
		<section
			data-testid='active-terminals-panel'
			data-test='active-terminals-panel'
			className='flex flex-col gap-3'
		>
			<header className='flex items-baseline justify-between'>
				<h3 className='text-body font-semibold'>Active terminals</h3>
				<span className='text-caption text-text-tertiary'>
					{list.data ? `${list.data.length} live` : '...'}
				</span>
			</header>

			{list.isLoading && (
				<p className='text-caption text-text-tertiary'>Loading sessions...</p>
			)}

			{list.isError && (
				<p className='text-caption text-[#f87171]'>
					Failed to load sessions: {list.error?.message ?? 'unknown error'}
				</p>
			)}

			{!list.isLoading && !list.isError && (list.data?.length ?? 0) === 0 && (
				<p
					data-testid='active-terminals-empty'
					className='text-caption text-text-tertiary'
				>
					No active terminal sessions.
				</p>
			)}

			{list.data && list.data.length > 0 && (
				<ul className='flex flex-col gap-1.5'>
					{list.data.map((s) => (
						<li
							key={s.id}
							data-testid={`session-row-${s.id}`}
							data-test-session-row={s.id}
							className='flex items-center justify-between gap-3 rounded-radius-sm border border-line bg-surface-base px-3 py-2'
						>
							<div className='flex min-w-0 flex-1 items-baseline gap-3'>
								<span className='text-body-sm font-medium'>{s.name}</span>
								<span className='font-mono text-caption text-text-tertiary'>
									id: {s.id.slice(0, 8)}…
								</span>
								<span className='text-caption text-text-tertiary'>
									created {formatRelative(s.createdAt)}
								</span>
								<span className='text-caption text-text-tertiary'>
									last attach {formatRelative(s.lastAttachAt)}
								</span>
							</div>
							<button
								type='button'
								data-testid={`kill-button-${s.id}`}
								data-test-kill-button={s.id}
								disabled={kill.isPending}
								onClick={() => kill.mutate({id: s.id})}
								className='shrink-0 rounded-radius-sm border border-line px-2 py-1 text-caption font-medium text-[#f87171] transition-colors hover:bg-[#f87171]/10 disabled:opacity-40'
							>
								Kill
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
