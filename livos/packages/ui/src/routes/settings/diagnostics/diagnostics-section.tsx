/**
 * Phase 47 Plan 05 — Diagnostics Section (D-DIAGNOSTICS-CARD).
 *
 * Shared scaffold hosting the three Phase 47 diagnostic cards. The
 * `<DiagnosticCard>` primitive is defined ONCE here and consumed by:
 *   - registry-card.tsx       (Capability Registry — FR-TOOL-01/02)
 *   - model-identity-card.tsx (Model Identity      — FR-MODEL-01)
 *   - app-health-card.tsx     (App Health          — FR-PROBE-01)
 *
 * The shared shell saves ~25% LOC vs three independent banner-style
 * components — this is the locked decision D-DIAGNOSTICS-CARD.
 *
 * NO emojis in any UI string (project policy / G-13).
 */

import React from 'react'
import {
	TbAlertCircle,
	TbAlertTriangle,
	TbCircleCheck,
	TbCircle,
	TbLoader2,
} from 'react-icons/tb'

import {RegistryCard} from './registry-card'
import {ModelIdentityCard} from './model-identity-card'
import {AppHealthCard} from './app-health-card'

export type DiagnosticStatus = 'ok' | 'warn' | 'error' | 'idle' | 'loading'

interface DiagnosticCardProps {
	title: string
	status: DiagnosticStatus
	detail: React.ReactNode
	action?: {
		label: string
		onClick: () => void
		loading?: boolean
		disabled?: boolean
		tooltip?: string
	}
}

export function DiagnosticCard({title, status, detail, action}: DiagnosticCardProps) {
	const palette = {
		ok: {
			border: 'border-emerald-500/30',
			bg: 'bg-emerald-500/10',
			text: 'text-emerald-300',
			icon: TbCircleCheck,
		},
		warn: {
			border: 'border-amber-500/30',
			bg: 'bg-amber-500/10',
			text: 'text-amber-300',
			icon: TbAlertTriangle,
		},
		error: {
			border: 'border-red-500/30',
			bg: 'bg-red-500/10',
			text: 'text-red-300',
			icon: TbAlertCircle,
		},
		idle: {
			border: 'border-border-default',
			bg: 'bg-surface-raised',
			text: 'text-text-secondary',
			icon: TbCircle,
		},
		loading: {
			border: 'border-border-default',
			bg: 'bg-surface-raised',
			text: 'text-text-secondary',
			icon: TbLoader2,
		},
	}[status]
	const Icon = palette.icon

	return (
		<div className={`rounded-radius-sm border ${palette.border} ${palette.bg} p-3`}>
			<div className='flex items-center justify-between gap-2'>
				<div className='flex items-center gap-2'>
					<Icon
						className={`size-4 ${palette.text} ${status === 'loading' ? 'animate-spin' : ''}`}
					/>
					<div className='text-body font-medium'>{title}</div>
				</div>
				{action && (
					<button
						type='button'
						onClick={action.onClick}
						disabled={action.disabled || action.loading}
						title={action.tooltip}
						className='text-body-sm rounded-radius-sm border border-border-default px-2 py-1 hover:bg-surface-default disabled:cursor-not-allowed disabled:opacity-50'
					>
						{action.loading ? 'Working...' : action.label}
					</button>
				)}
			</div>
			<div className='text-body-sm text-text-secondary mt-2'>{detail}</div>
		</div>
	)
}

export function DiagnosticsSection() {
	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h2 className='text-body font-semibold'>Diagnostics</h2>
			</div>
			<RegistryCard />
			<ModelIdentityCard />
			<AppHealthCard />
		</div>
	)
}

export default DiagnosticsSection
