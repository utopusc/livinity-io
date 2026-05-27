/**
 * Phase 224 — Liv Assistant migration banner.
 *
 * Shown at the top of App Store + Settings while the v42 migration is
 * active. Tells operators WHY the AI-shaped surfaces are hidden (App
 * Store `ai` category, Settings → MCP Servers) and points them to Liv
 * Assistant (dock icon, installed by Phase 223 on Mini PC port 3020).
 *
 * Dismissible per-session via `useState` only (NO browser storage, NO
 * Redis). Spec choice: re-appears on next session / fresh tab so
 * operators don't forget the legacy surfaces are temporarily hidden
 * during the migration window.
 *
 * Rendering is GATED at the call-site by `useV42MigrationActive()` —
 * this component itself does NOT consume the hook, so the test harness
 * can mount it directly without tRPC provider scaffolding.
 *
 * Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED — UI only.
 */
import {useState} from 'react'
import {TbX} from 'react-icons/tb'

export interface V42MigrationBannerProps {
	context: 'app-store' | 'settings'
}

export const V42_MIGRATION_BANNER_TEXT =
	'AI integrations temporarily disabled during Liv Assistant migration. Open Liv Assistant from the dock to use AI features.'

export function V42MigrationBanner({context}: V42MigrationBannerProps) {
	const [dismissed, setDismissed] = useState(false)
	if (dismissed) return null
	return (
		<div
			role='status'
			data-context={context}
			data-testid='v42-migration-banner'
			className='mb-4 flex items-start gap-3 rounded-radius-md border border-line bg-surface-2 px-4 py-3 text-body-sm text-text-secondary'
		>
			<span className='flex-1 leading-relaxed'>{V42_MIGRATION_BANNER_TEXT}</span>
			<button
				type='button'
				onClick={() => setDismissed(true)}
				aria-label='Dismiss banner'
				className='flex h-6 w-6 shrink-0 items-center justify-center rounded-radius-sm text-text-tertiary transition-colors hover:bg-surface-base hover:text-text-primary'
			>
				<TbX className='h-3.5 w-3.5' />
			</button>
		</div>
	)
}
