/**
 * Phase 47 Plan 05 — Capability Registry diagnostic card (FR-TOOL-01/02).
 *
 * Renders the 5-category breakdown from `capabilities.diagnoseRegistry` and
 * a Re-sync button calling `capabilities.flushAndResync`.
 *
 * W-12 button gating: the Re-sync button is disabled when
 * `missing.lost.length === 0` — there's nothing to recover by re-sync, so
 * showing an enabled button would be confusing. The tooltip explains why.
 *
 * Status palette mapping (operator-readable):
 *   ok    — categorized.missing.lost.length === 0 (registry healthy)
 *   warn  — lost.length > 0 (some manifests vanished, re-sync helps)
 *   error — query failed (Redis down, etc.)
 *   loading — first-load fetch in flight
 */

import React from 'react'

import {trpcReact} from '@/trpc/trpc'

import {DiagnosticCard, type DiagnosticStatus} from './diagnostics-section'

export function RegistryCard() {
	const q = trpcReact.capabilities.diagnoseRegistry.useQuery(undefined, {
		refetchOnWindowFocus: false,
	})
	const flush = trpcReact.capabilities.flushAndResync.useMutation({
		onSuccess: () => {
			q.refetch()
		},
	})

	const lostCount = q.data?.categorized.missing.lost.length ?? 0
	const presentCount = q.data?.categorized.expectedAndPresent.length ?? 0
	const preconditionCount = q.data?.categorized.missing.precondition.length ?? 0
	const disabledCount = q.data?.categorized.missing.disabledByUser.length ?? 0
	const extrasCount = q.data?.categorized.unexpectedExtras.length ?? 0

	const status: DiagnosticStatus = q.isLoading
		? 'loading'
		: q.error
			? 'error'
			: lostCount > 0
				? 'warn'
				: 'ok'

	return (
		<DiagnosticCard
			title='Capability Registry'
			status={status}
			detail={
				q.isLoading ? (
					<span>Loading registry state...</span>
				) : q.error ? (
					<span>Failed to load: {q.error.message}</span>
				) : (
					<div className='space-y-1'>
						<div>
							Redis manifests: <span className='font-mono'>{q.data?.redisManifestCount}</span>{' '}
							· Built-ins: <span className='font-mono'>{q.data?.builtInToolCount}</span>
						</div>
						<div>
							Last sync: <span className='font-mono'>{q.data?.syncedAt ?? 'never'}</span>
						</div>
						<div className='text-caption mt-2'>
							Present: {presentCount} · Lost (re-sync helps): {lostCount} · Precondition:{' '}
							{preconditionCount} · Disabled by user: {disabledCount} · Extras: {extrasCount}
						</div>
						{lostCount > 0 && q.data && (
							<div className='text-caption mt-1 text-amber-300'>
								Missing: {q.data.categorized.missing.lost.join(', ')}
							</div>
						)}
						{flush.error && (
							<div className='text-caption mt-1 text-red-300'>
								Re-sync failed: {flush.error.message}
							</div>
						)}
					</div>
				)
			}
			action={{
				label: 'Re-sync registry',
				loading: flush.isPending,
				disabled: q.isLoading || lostCount === 0,
				tooltip:
					lostCount === 0
						? 'No tools to recover by re-sync. Missing items are precondition-gated or user-disabled.'
						: undefined,
				onClick: () => flush.mutate({scope: 'builtins'}),
			}}
		/>
	)
}
