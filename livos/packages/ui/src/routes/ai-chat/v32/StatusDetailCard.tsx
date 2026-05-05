/**
 * StatusDetailCard.tsx — Phase 88 (V32-MIGRATE-02)
 *
 * Renders the current `status_detail` payload (P87 Hermes-inspired chunk)
 * as a compact animated row above the streaming caret in the latest
 * assistant message.
 *
 * Visual contract (D-LIV-STYLED, NO Hermes KAWAII):
 *   - flex row, small text, muted foreground
 *   - phase icon (pulse-dots / wrench / hourglass)
 *   - phrase text (lower-case verb from THINKING_VERBS / WAITING_VERBS)
 *   - elapsed ms tag in secondary opacity
 *
 * The icon is determined entirely by `phase` — no emoji, no ASCII frames,
 * no kawaii faces. All Liv tokens.
 */

import {IconHourglass, IconTool} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

import type {StatusDetailPayload} from './lib/sse-adapter'

interface StatusDetailCardProps {
	status: StatusDetailPayload
	className?: string
}

export function StatusDetailCard({status, className}: StatusDetailCardProps) {
	const {phase, phrase, elapsed} = status
	return (
		<div
			role='status'
			aria-live='polite'
			className={cn(
				'inline-flex items-center gap-2 rounded-md',
				'text-sm text-liv-muted-foreground',
				'transition-opacity duration-150',
				className,
			)}
		>
			<PhaseIcon phase={phase} />
			<span className='lowercase'>{phrase}</span>
			<span className='font-mono text-xs opacity-50' aria-hidden='true'>
				{formatElapsed(elapsed)}
			</span>
		</div>
	)
}

// ── Phase icon variants ────────────────────────────────────────────────

interface PhaseIconProps {
	phase: StatusDetailPayload['phase']
}

function PhaseIcon({phase}: PhaseIconProps) {
	if (phase === 'tool_use') {
		return (
			<IconTool
				size={14}
				className='animate-pulse text-liv-secondary'
				aria-hidden='true'
			/>
		)
	}
	if (phase === 'waiting') {
		return (
			<IconHourglass
				size={14}
				className='animate-pulse text-liv-muted-foreground'
				aria-hidden='true'
			/>
		)
	}
	// 'thinking' — animated three-dot pulse
	return <ThinkingDots />
}

function ThinkingDots() {
	return (
		<span
			className='inline-flex items-center gap-0.5'
			aria-hidden='true'
		>
			<Dot delay='0ms' />
			<Dot delay='150ms' />
			<Dot delay='300ms' />
			<style>{`
				@keyframes v88-thinking-dot {
					0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
					40% { opacity: 1; transform: translateY(-2px); }
				}
			`}</style>
		</span>
	)
}

function Dot({delay}: {delay: string}) {
	return (
		<span
			style={{
				display: 'inline-block',
				width: '4px',
				height: '4px',
				borderRadius: '9999px',
				backgroundColor: 'var(--liv-primary)',
				animation: `v88-thinking-dot 1.4s ease-in-out infinite`,
				animationDelay: delay,
			}}
		/>
	)
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '0ms'
	if (ms < 1000) return `${Math.round(ms)}ms`
	const sec = ms / 1000
	if (sec < 60) return `${sec.toFixed(1)}s`
	const min = Math.floor(sec / 60)
	const rem = Math.floor(sec % 60)
	return `${min}m${rem.toString().padStart(2, '0')}s`
}
