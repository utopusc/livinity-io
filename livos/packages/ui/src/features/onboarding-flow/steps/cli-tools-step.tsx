/* =========================================================
   CliToolsStep — Phase 239 (replaces the legacy onboarding provider step).

   Operator picks which CLI agents to install for use with Liv AI.
   Each card has 4 states: not-installed / installing / installed / failed.
   Continue is enabled without requiring any installs (D-239-14) — installs
   are optional, operator may skip and install later from Settings.

   Auth deferred to post-onboarding (D-239-17). This step ONLY installs
   binaries; first auth happens when operator opens Liv AI and picks an
   agent.

   Security: install requests go through tRPC adminProcedure
   (cliInstaller.install). Whitelist enforcement lives in livinityd —
   the UI cannot bypass it even if the SUPPORTED_CLI_DISPLAY array is
   mutated client-side (T-239-02-01 accept disposition).

   Drift-lock vs Plan 239-01: SUPPORTED_CLI_DISPLAY mirrors
   `SUPPORTED_CLIS` from
   `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts`
   (same ids + same order + 5 entries). Display metadata (name,
   subtitle) is UI-only — backend whitelist is the security boundary.
   ========================================================= */

import {useCallback, useEffect, useReducer} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {FooterBar} from '../footer-bar'
import {Icon} from '../icon'
import type {OnboardingData} from '../constants'

type Props = {
	data: OnboardingData
	setData: (d: OnboardingData) => void
	onContinue: () => void
	onSkip: () => void
	onBack: () => void
}

export type CliId =
	| 'claude-code'
	| 'opencode'
	| 'gemini'
	| 'openclaw'
	| 'aion-cli'

export type CliCardSpec = {
	id: CliId
	name: string
	subtitle: string
}

/**
 * Display order is the Phase 240 contract (D-239-10) and mirrors the
 * backend `SUPPORTED_CLIS` tuple exactly. Reordering or extending this
 * array requires a coordinated Phase 240 backend bump.
 */
export const SUPPORTED_CLI_DISPLAY: readonly CliCardSpec[] = [
	{id: 'claude-code', name: 'Claude Code', subtitle: 'Anthropic agentic coding CLI'},
	{id: 'opencode', name: 'OpenCode', subtitle: 'xAI / Grok terminal agent'},
	{id: 'gemini', name: 'Gemini', subtitle: 'Google Gemini CLI'},
	{id: 'openclaw', name: 'OpenClaw', subtitle: 'Liv-native agent framework'},
	{id: 'aion-cli', name: 'Aion CLI', subtitle: 'Aion agent CLI'},
] as const

type CardState =
	| {kind: 'not-installed'}
	| {kind: 'installing'}
	| {kind: 'installed'; version?: string}
	| {kind: 'failed'; message: string}

type CardsState = Record<CliId, CardState>

type CardAction = {type: 'set'; id: CliId; state: CardState}

function cardsReducer(prev: CardsState, action: CardAction): CardsState {
	return {...prev, [action.id]: action.state}
}

const INITIAL_CARDS: CardsState = {
	'claude-code': {kind: 'not-installed'},
	opencode: {kind: 'not-installed'},
	gemini: {kind: 'not-installed'},
	openclaw: {kind: 'not-installed'},
	'aion-cli': {kind: 'not-installed'},
}

export function CliToolsStep({data, setData, onContinue, onSkip, onBack}: Props) {
	const [cards, dispatch] = useReducer(cardsReducer, INITIAL_CARDS)
	const installM = trpcReact.cliInstaller.install.useMutation()

	// Fixed-shape fan-out: 5 unconditional detect queries so React rules-of-hooks
	// stays satisfied. `retry:false` + `staleTime:30s` prevents detect storms.
	const detectClaude = trpcReact.cliInstaller.detect.useQuery(
		{name: 'claude-code'},
		{staleTime: 30_000, retry: false},
	)
	const detectOpencode = trpcReact.cliInstaller.detect.useQuery(
		{name: 'opencode'},
		{staleTime: 30_000, retry: false},
	)
	const detectGemini = trpcReact.cliInstaller.detect.useQuery(
		{name: 'gemini'},
		{staleTime: 30_000, retry: false},
	)
	const detectOpenclaw = trpcReact.cliInstaller.detect.useQuery(
		{name: 'openclaw'},
		{staleTime: 30_000, retry: false},
	)
	const detectAion = trpcReact.cliInstaller.detect.useQuery(
		{name: 'aion-cli'},
		{staleTime: 30_000, retry: false},
	)

	// Sync detected → 'installed' state for any already-present CLI. We only
	// promote `not-installed` cards; an in-flight install or a recently failed
	// install must not be clobbered by a late-arriving detect refresh.
	useEffect(() => {
		const probes: Array<[CliId, {data?: {detected: boolean; version?: string}}]> = [
			['claude-code', detectClaude],
			['opencode', detectOpencode],
			['gemini', detectGemini],
			['openclaw', detectOpenclaw],
			['aion-cli', detectAion],
		]
		for (const [id, q] of probes) {
			if (q.data?.detected && cards[id].kind === 'not-installed') {
				dispatch({type: 'set', id, state: {kind: 'installed', version: q.data.version}})
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detectClaude.data, detectOpencode.data, detectGemini.data, detectOpenclaw.data, detectAion.data])

	const handleInstall = useCallback(
		async (id: CliId) => {
			dispatch({type: 'set', id, state: {kind: 'installing'}})
			try {
				const result = await installM.mutateAsync({name: id})
				if (result.ok) {
					dispatch({type: 'set', id, state: {kind: 'installed'}})
					const next = new Set(data.cliInstalled ?? [])
					next.add(id)
					setData({...data, cliInstalled: Array.from(next)})
				} else {
					// T-239-02-02 mitigation: tail-truncate output to last 3 lines + 400
					// chars max. No secrets expected in install scripts but defense in
					// depth keeps any future log additions safe-by-default.
					const tail = (result.output ?? '').split('\n').slice(-3).join('\n').slice(0, 400)
					dispatch({
						type: 'set',
						id,
						state: {
							kind: 'failed',
							message: tail || `Install failed (exit ${result.exitCode})`,
						},
					})
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Install failed'
				dispatch({type: 'set', id, state: {kind: 'failed', message: msg}})
			}
		},
		[data, installM, setData],
	)

	const handleRetry = useCallback((id: CliId) => {
		dispatch({type: 'set', id, state: {kind: 'not-installed'}})
	}, [])

	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
			<div className='fade-up'>
				<div className='onb-eyebrow'>05 · CLI Tools</div>
				<h1 className='onb-title' style={{marginTop: 8}}>
					Pick your CLI agents
				</h1>
				<p className='onb-sub' style={{marginTop: 10}}>
					Liv works with several CLI agents. Install the ones you want now —
					you can always install more later from Settings. Authentication
					happens the first time you open Liv AI and pick an agent.
				</p>
			</div>

			<div
				className='cli-tools-grid fade-up d2'
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
					gap: 12,
				}}
				data-testid='cli-tools-grid'
			>
				{SUPPORTED_CLI_DISPLAY.map((cli) => {
					const s = cards[cli.id]
					return (
						<div
							key={cli.id}
							className='cli-tool-card'
							data-testid={`cli-card-${cli.id}`}
							style={{
								padding: 16,
								borderRadius: 12,
								border: '1px solid var(--line)',
								background: 'var(--surface)',
								color: 'var(--fg)',
								display: 'flex',
								flexDirection: 'column',
								gap: 8,
								minHeight: 160,
							}}
						>
							<div style={{fontSize: 15, fontWeight: 600}}>{cli.name}</div>
							<div style={{fontSize: 13, color: 'var(--fg-mute)'}}>{cli.subtitle}</div>
							<div style={{flex: 1}} />
							{s.kind === 'not-installed' && (
								<button
									type='button'
									className='btn btn-primary'
									data-testid={`cli-install-${cli.id}`}
									onClick={() => handleInstall(cli.id)}
								>
									Install
								</button>
							)}
							{s.kind === 'installing' && (
								<div
									data-testid={`cli-installing-${cli.id}`}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										fontSize: 13,
									}}
								>
									<span
										style={{
											width: 14,
											height: 14,
											borderRadius: '50%',
											border: '2px solid var(--fg-mute)',
											borderTopColor: 'transparent',
											animation: 'spin 0.8s linear infinite',
										}}
									/>
									Installing…
								</div>
							)}
							{s.kind === 'installed' && (
								<div
									data-testid={`cli-installed-${cli.id}`}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 6,
										fontSize: 13,
										color: 'var(--green, #22c55e)',
									}}
								>
									<Icon name='check' size={14} /> Installed
								</div>
							)}
							{s.kind === 'failed' && (
								<div
									data-testid={`cli-failed-${cli.id}`}
									style={{
										display: 'flex',
										flexDirection: 'column',
										gap: 6,
										fontSize: 12,
									}}
								>
									<div title={s.message} style={{color: 'var(--red, #dc2626)'}}>
										Failed
									</div>
									<button
										type='button'
										className='btn btn-text'
										data-testid={`cli-retry-${cli.id}`}
										onClick={() => handleRetry(cli.id)}
									>
										Retry
									</button>
								</div>
							)}
						</div>
					)
				})}
			</div>

			<FooterBar
				onBack={onBack}
				onContinue={onContinue}
				onSkip={onSkip}
				continueLabel='Continue'
				continueDisabled={false}
				hint='↵ to continue · installs are optional'
			/>
		</div>
	)
}
