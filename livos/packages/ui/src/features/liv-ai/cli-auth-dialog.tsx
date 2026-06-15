/* =========================================================
   CliAuthDialog — Phase 267-02 (the no-terminal CLI install + auth dialog).

   Replaces the old `use-cli-auth-bridge.ts` Terminal-routing flow. The Liv AI
   "Local Agents" panel (and the onboarding CLI step) used to open the LivOS
   Terminal and run `bash …/cli/<name>.sh` / `<cli> auth login` in a PTY tab.
   The operator wants that GONE. This dialog drives the WHOLE flow over tRPC:

     1. INSTALL  — `cliInstaller.install({name})` with a spinner. No terminal.
     2. AUTH     — branched by `cliInstaller.getAuthMethod(name).branch`:
        • device  — call `cliInstaller.auth({name})` (a long-running mutation
                    that resolves with {ok} when the login process exits — THAT
                    resolution is the completion signal; there is NO separate
                    status-read route). WHILE it runs we poll
                    `cliInstaller.getDeviceCode({name})` for the live {url,code}
                    that authCli parses out of the login's own stdout/stderr
                    (267-01) and render an "Open link ↗" button + the code.
                    SECURITY: the URL is server-parsed from the CLI's stdout,
                    NOT user input — but we STILL require an explicit user click
                    before navigating to it (no auto-redirect; 267-02 threat
                    model). When the auth mutation resolves ok → success state →
                    auto-close after ~1.4s.
        • apikey  — a <PasswordInput> "API key" field → `setApiKey({name,key})`
                    → re-`detect` to confirm. The key is NEVER echoed back,
                    never logged, never stored in localStorage (267-02 threat
                    model: type=password, sent only to setApiKey).
        • browser — open the login URL in the LivOS embedded browser window
                    (window-manager) on an explicit click, with an api-key
                    paste fallback (apiKeyEnv) for headless boxes.
        • n/a     — not auth-able (aion-cli); show an explanatory message.

   3. ADVANCED  — every branch shows a small "Advanced: run in Terminal
      instead" affordance that falls back to the OLD bridge behavior (the
      Terminal path is DEMOTED, not deleted, so power users keep it). It calls
      the exported `runCliInTerminalFallback` from use-cli-auth-bridge.ts.

   MOUNTING: this dialog self-mounts in the desktop shell and owns its own open
   state by listening for the `CLI_AUTH_DIALOG_EVENT` window CustomEvent. The
   bridge hook (use-cli-auth-bridge.ts) dispatches that event from its origin-
   validated postMessage handler, so the RCE boundary (NAME-only) is unchanged
   and the hook keeps its `(): void` signature.
   ========================================================= */

import {useCallback, useEffect, useRef, useState} from 'react'

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/shadcn-components/ui/dialog'
import {Button} from '@/shadcn-components/ui/button'
import {Input, PasswordInput, AnimatedInputError} from '@/shadcn-components/ui/input'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {trpcReact, type RouterOutput} from '@/trpc/trpc'

import {runCliInTerminalFallback} from '@/hooks/use-cli-auth-bridge'

// The branch discriminant the dialog switches on (mirror of the backend
// CLI_AUTH_METHODS.branch — see auth-methods.ts). Derived from the tRPC output
// type so a backend contract change surfaces here at compile time.
type AuthMethod = RouterOutput['cliInstaller']['getAuthMethod']

/**
 * Window CustomEvent that opens the dialog. The bridge hook dispatches it after
 * validating the iframe postMessage origin + mapping to a known CLI NAME. The
 * detail carries the CLI name and which flow the trigger asked for ('install'
 * vs 'auth'); the dialog still re-derives the real flow from getAuthMethod +
 * detect, so 'mode' is only the initial intent.
 */
export const CLI_AUTH_DIALOG_EVENT = 'livos:cli-auth-dialog'

export interface CliAuthDialogDetail {
	cli: string
	/** 'install' opens on the install step; 'auth' jumps toward auth. */
	mode?: 'install' | 'auth'
}

/** Imperatively open the dialog from anywhere (onboarding, panels). */
export function openCliAuthDialog(detail: CliAuthDialogDetail): void {
	window.dispatchEvent(new CustomEvent(CLI_AUTH_DIALOG_EVENT, {detail}))
}

// ── Display labels (UI-only; the backend whitelist is the security boundary) ──
const CLI_LABELS: Readonly<Record<string, string>> = {
	'claude-code': 'Claude Code',
	opencode: 'OpenCode',
	gemini: 'Gemini',
	openclaw: 'OpenClaw',
	'aion-cli': 'Aion CLI',
	codex: 'Codex',
	'qwen-code': 'Qwen Code',
	augment: 'Augment',
	'github-copilot': 'GitHub Copilot',
	codebuddy: 'CodeBuddy',
	'qoder-cli': 'Qoder',
	goose: 'Goose',
	'factory-droid': 'Factory Droid',
	'cursor-agent': 'Cursor Agent',
	'kimi-cli': 'Kimi CLI',
	'mistral-vibe': 'Mistral Vibe',
	'hermes-agent': 'Hermes Agent',
	nanobot: 'Nanobot',
	'snow-cli': 'Snow CLI',
	kiro: 'Kiro',
}

function labelFor(cli: string): string {
	return CLI_LABELS[cli] ?? cli
}

// Safely render the host of a device URL so the user can sanity-check WHERE the
// "Open link" button will take them (267-02 phishing/open-redirect mitigation).
function hostOf(url: string): string {
	try {
		return new URL(url).host
	} catch {
		return url
	}
}

type Phase =
	| {kind: 'loading'} // resolving getAuthMethod + detect
	| {kind: 'install'} // not installed → show Install button
	| {kind: 'installing'}
	| {kind: 'install-failed'; message: string}
	| {kind: 'auth-device'} // device flow running, polling for code + completion
	// Phase 268-04 — paste-back flow: the bare login prints a URL (device-style,
	// shown via the SAME getDeviceCode poll) AND blocks on stdin. We render the
	// "Open link" URL block + a masked code paste field → cliInstaller.sendAuthInput.
	// The login child stays alive across the round-trip (the live-child registry,
	// plan 01); its eventual {ok} resolution (the authM mutation below) flips us to
	// 'ready'. The pasted code is a bearer-like secret — cleared from React state
	// the instant it is submitted (never echoed/stored; E-9).
	| {kind: 'auth-paste-back'}
	| {kind: 'auth-apikey'} // apikey paste field
	| {kind: 'auth-browser'} // browser flow (open url) + apikey fallback
	| {kind: 'auth-na'} // not auth-able
	| {kind: 'authenticating'} // apikey submit in flight
	| {kind: 'auth-failed'; message: string}
	// Phase 267-03 — terminal SUCCESS state. The auth/key-write already
	// succeeded. Phase 269-01 (kill the restart storm): the success NO LONGER
	// auto-restarts liv-assistant — it just landed here with the change marked
	// pending server-side. `applying=false` → show an "Apply changes (refresh Liv
	// AI)" button (NO auto-poll). Clicking it calls cliInstaller.applyAgentChanges
	// (the ONE debounced restart) then flips `applying=true`, which arms the
	// EXISTING agentRefreshStatus poll: `applied=false` → "Applying…";
	// `applied=true` (restart done OR graceful timeout) → "ready — open Liv AI to
	// use it" + an Open Liv AI button.
	| {kind: 'ready'; message: string; applied: boolean; applying: boolean}

// ── The inner dialog body — remounted per CLI via `key` so all hooks reset ──
function CliAuthDialogBody({
	cli,
	mode,
	onClose,
}: {
	cli: string
	mode: 'install' | 'auth'
	onClose: () => void
}) {
	const windowManager = useWindowManagerOptional()
	const utils = trpcReact.useUtils()

	const [phase, setPhase] = useState<Phase>({kind: 'loading'})
	const [apiKey, setApiKey] = useState('')
	const [apiKeyError, setApiKeyError] = useState<string | undefined>(undefined)
	// Phase 268-04 — paste-back code field (a bearer-like secret; cleared the
	// instant it is submitted) + the inline Uninstall confirm gate.
	const [pasteCode, setPasteCode] = useState('')
	const [pasteError, setPasteError] = useState<string | undefined>(undefined)
	const [confirmUninstall, setConfirmUninstall] = useState(false)

	const authMethodQ = trpcReact.cliInstaller.getAuthMethod.useQuery(
		{name: cli},
		{retry: false, staleTime: 60_000},
	)
	const detectQ = trpcReact.cliInstaller.detect.useQuery(
		{name: cli},
		{retry: false, staleTime: 10_000},
	)

	const method: AuthMethod | undefined = authMethodQ.data

	// Device-code poll — enabled while the device flow OR the paste-back flow is
	// live so we don't hammer Redis for non-device CLIs. authCli sets
	// liv:cli:auth:url:<name> (EX 600) the instant the login prints the
	// verification URL + code; the bare paste-back login prints the URL the same
	// way (267-01 stdout parse), so paste-back reuses this exact poll to render
	// the "Open link" block (then it ALSO shows a code paste field).
	const devicePolling =
		phase.kind === 'auth-device' || phase.kind === 'auth-paste-back'
	const deviceCodeQ = trpcReact.cliInstaller.getDeviceCode.useQuery(
		{name: cli},
		{
			enabled: devicePolling,
			refetchInterval: devicePolling ? 1500 : false,
			retry: false,
		},
	)

	const installM = trpcReact.cliInstaller.install.useMutation()
	const authM = trpcReact.cliInstaller.auth.useMutation()
	const setApiKeyM = trpcReact.cliInstaller.setApiKey.useMutation()
	// Phase 268-04 — write the operator-pasted code to the live login's stdin;
	// remove a detected CLI (behind a confirm).
	const sendAuthInputM = trpcReact.cliInstaller.sendAuthInput.useMutation()
	const uninstallM = trpcReact.cliInstaller.uninstall.useMutation()
	// Phase 269-01 — the single, user-triggered "Apply changes" restart. auth/
	// setApiKey/uninstall no longer auto-restart liv-assistant; the operator
	// clicks Apply once to fire ONE debounced restart (no 502 storm).
	const applyAgentChangesM = trpcReact.cliInstaller.applyAgentChanges.useMutation()

	// Phase 269-01 — poll the debounced liv-assistant restart status ONLY after
	// the operator clicked "Apply changes" (phase.applying) and the restart hasn't
	// been confirmed applied yet. The success itself NO LONGER schedules a restart
	// (that caused the 502 storm); applyAgentChanges does, on the explicit click.
	// agentRefreshStatus flips 'restarting' → 'done' as AionUi re-scans. We degrade
	// gracefully (see the effect below) if it never flips.
	const ready = phase.kind === 'ready'
	const pollingRefresh = ready && phase.applying && !phase.applied
	const agentRefreshStatusQ =
		trpcReact.cliInstaller.agentRefreshStatus.useQuery(undefined, {
			enabled: pollingRefresh,
			refetchInterval: pollingRefresh ? 1200 : false,
			retry: false,
		})

	// Pick the auth phase for the resolved branch.
	const branchToAuthPhase = useCallback((m: AuthMethod): Phase => {
		switch (m.branch) {
			case 'device':
				return {kind: 'auth-device'}
			case 'apikey':
				return {kind: 'auth-apikey'}
			case 'browser':
				return {kind: 'auth-browser'}
			// Phase 268-04 — the CLI prints a login URL AND blocks on stdin; we show
			// the URL ("Open link", explicit click) + a code paste field.
			case 'paste-back':
				return {kind: 'auth-paste-back'}
			case 'n/a':
			default:
				return {kind: 'auth-na'}
		}
	}, [])

	// Resolve the initial phase once both queries land: not-installed → install;
	// installed → the branch's auth phase.
	useEffect(() => {
		if (phase.kind !== 'loading') return
		if (!method || detectQ.data === undefined) return
		const installed = detectQ.data.detected
		if (!installed && mode !== 'auth') {
			setPhase({kind: 'install'})
			return
		}
		setPhase(branchToAuthPhase(method))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [method, detectQ.data, mode])

	// When we enter the device phase, kick off the (long-running) auth mutation
	// exactly once. Its resolution {ok} IS the completion signal.
	const deviceStarted = useRef(false)
	useEffect(() => {
		if (phase.kind !== 'auth-device') return
		if (deviceStarted.current) return
		deviceStarted.current = true
		authM
			.mutateAsync({name: cli})
			.then((res) => {
				if (res.ok) {
					setPhase({
						kind: 'ready',
						message: `${labelFor(cli)} authenticated`,
						applied: false,
						applying: false,
					})
				} else {
					const tail = (res.output ?? '')
						.split('\n')
						.slice(-3)
						.join('\n')
						.slice(0, 400)
					setPhase({
						kind: 'auth-failed',
						message: tail || `Login failed (exit ${res.exitCode})`,
					})
				}
			})
			.catch((err) => {
				setPhase({
					kind: 'auth-failed',
					message: err instanceof Error ? err.message : 'Login failed',
				})
			})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase.kind, cli])

	// Phase 268-04 — when we enter the paste-back phase, kick off the (long-
	// running) auth mutation exactly once, EXACTLY like the device effect above.
	// Its resolution {ok} is the FINAL completion signal: the bare login prints
	// the URL (surfaced via the getDeviceCode poll), then BLOCKS on stdin until
	// sendAuthInput writes the operator-pasted code; once it consumes the code and
	// exits, this mutation resolves and we flip to 'ready'. The live-child registry
	// (plan 01) keeps the login alive across the browser round-trip. A separate ref
	// guards the fire-once so the device + paste-back effects never cross-trigger.
	const pasteStarted = useRef(false)
	useEffect(() => {
		if (phase.kind !== 'auth-paste-back') return
		if (pasteStarted.current) return
		pasteStarted.current = true
		// FIX 2 — if the user took the "Use an API key instead" fallback while this
		// (possibly-stalled) login was still in flight, a late/timed-out resolution
		// must NOT clobber the api-key success/state. Apply the result ONLY while
		// we're still in the paste-back phase (functional updater reads live phase).
		authM
			.mutateAsync({name: cli})
			.then((res) => {
				if (res.ok) {
					setPhase((p) =>
						p.kind === 'auth-paste-back'
							? {
									kind: 'ready',
									message: `${labelFor(cli)} authenticated`,
									applied: false,
									applying: false,
								}
							: p,
					)
				} else {
					const tail = (res.output ?? '')
						.split('\n')
						.slice(-3)
						.join('\n')
						.slice(0, 400)
					setPhase((p) =>
						p.kind === 'auth-paste-back'
							? {
									kind: 'auth-failed',
									message: tail || `Login failed (exit ${res.exitCode})`,
								}
							: p,
					)
				}
			})
			.catch((err) => {
				setPhase((p) =>
					p.kind === 'auth-paste-back'
						? {
								kind: 'auth-failed',
								message: err instanceof Error ? err.message : 'Login failed',
							}
						: p,
				)
			})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase.kind, cli])

	// Phase 267-03 — while in the "ready" state and not yet applied, flip to
	// applied=true the moment agentRefreshStatus reports 'done'. GRACEFUL
	// DEGRADE: never hard-block on the restart — if it doesn't confirm within
	// ~12s (slow AionUi cold-boot, or the status key never landed), flip to
	// applied=true anyway. The auth ALREADY succeeded; the restart is a
	// best-effort convenience, so we always reach the usable "Open Liv AI" state.
	const readyApplied = phase.kind === 'ready' && phase.applied
	useEffect(() => {
		// Phase 269-01 — only run the apply poll AFTER the operator clicked Apply
		// (phase.applying). Before that the success state just shows the Apply
		// button — no restart was scheduled.
		if (phase.kind !== 'ready' || !phase.applying || phase.applied) return
		const status = agentRefreshStatusQ.data?.status
		if (status === 'done') {
			setPhase({
				kind: 'ready',
				message: phase.message,
				applied: true,
				applying: true,
			})
			return
		}
		// Graceful timeout: don't make the user stare at "Applying…" forever.
		const t = setTimeout(() => {
			setPhase((p) =>
				p.kind === 'ready' && p.applying && !p.applied
					? {kind: 'ready', message: p.message, applied: true, applying: true}
					: p,
			)
		}, 12_000)
		return () => clearTimeout(t)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase.kind, readyApplied, agentRefreshStatusQ.data?.status])

	const handleInstall = useCallback(async () => {
		setPhase({kind: 'installing'})
		try {
			const res = await installM.mutateAsync({name: cli})
			if (res.ok) {
				// Refresh detect, then advance to the auth branch.
				await utils.cliInstaller.detect.invalidate({name: cli})
				setPhase(method ? branchToAuthPhase(method) : {kind: 'loading'})
			} else {
				const tail = (res.output ?? '')
					.split('\n')
					.slice(-3)
					.join('\n')
					.slice(0, 400)
				setPhase({
					kind: 'install-failed',
					message: tail || `Install failed (exit ${res.exitCode})`,
				})
			}
		} catch (err) {
			setPhase({
				kind: 'install-failed',
				message: err instanceof Error ? err.message : 'Install failed',
			})
		}
	}, [cli, installM, method, branchToAuthPhase, utils])

	const handleSubmitApiKey = useCallback(async () => {
		const key = apiKey.trim()
		if (!key) {
			setApiKeyError('Enter an API key')
			return
		}
		setApiKeyError(undefined)
		setPhase({kind: 'authenticating'})
		try {
			const res = await setApiKeyM.mutateAsync({name: cli, key})
			if (!res.ok) {
				setApiKey('')
				setPhase({kind: 'auth-apikey'})
				setApiKeyError('Could not save the key')
				return
			}
			// Confirm the CLI now detects (best-effort — key write is the real win).
			await utils.cliInstaller.detect.invalidate({name: cli})
			// Clear the key from component state immediately after use.
			setApiKey('')
			setPhase({
				kind: 'ready',
				message: `${labelFor(cli)} key saved`,
				applied: false,
				applying: false,
			})
		} catch (err) {
			setApiKey('')
			setPhase({kind: 'auth-apikey'})
			setApiKeyError(err instanceof Error ? err.message : 'Could not save the key')
		}
	}, [apiKey, cli, setApiKeyM, utils])

	// Phase 268-04 — submit the operator-pasted code to the live login's stdin.
	// Mirrors handleSubmitApiKey: trim, error-state, call the mutation, then CLEAR
	// the value from React state IMMEDIATELY after submit (the code may be a bearer
	// token — E-9; never log it, never persist it, never echo it). We stay in the
	// 'auth-paste-back' phase: the authM effect's resolution (the login child
	// exiting after it consumes the code) is what flips us to 'ready'.
	const handleSubmitPasteCode = useCallback(async () => {
		const code = pasteCode.trim()
		if (!code) {
			setPasteError('Paste the code from your browser')
			return
		}
		setPasteError(undefined)
		try {
			const res = await sendAuthInputM.mutateAsync({name: cli, code})
			// Clear the code the instant it leaves the field — success OR failure.
			setPasteCode('')
			if (!res.ok) {
				setPasteError('No sign-in is waiting for a code — try again')
			}
		} catch (err) {
			setPasteCode('')
			setPasteError(err instanceof Error ? err.message : 'Could not submit the code')
		}
	}, [pasteCode, cli, sendAuthInputM])

	// Phase 268-04 — remove a detected CLI (behind the inline confirm). Mirrors
	// handleInstall: try/catch around the mutation; on ok land in the EXISTING
	// 267-03 {kind:'ready', applied:false} state so the agentRefreshStatus poll
	// shows "Applying…" → "ready" while the removed agent disappears from
	// /api/agents (the router fires the debounced agent-refresh on uninstall ok; E-6).
	const handleUninstall = useCallback(async () => {
		setConfirmUninstall(false)
		setPhase({kind: 'authenticating'})
		try {
			const res = await uninstallM.mutateAsync({name: cli})
			if (res.ok) {
				setPhase({
					kind: 'ready',
					message: `${labelFor(cli)} removed`,
					applied: false,
					applying: false,
				})
			} else {
				setPhase({
					kind: 'auth-failed',
					message: res.output?.slice(-400) || 'Could not remove',
				})
			}
		} catch (err) {
			setPhase({
				kind: 'auth-failed',
				message: err instanceof Error ? err.message : 'Could not remove',
			})
		}
	}, [cli, uninstallM])

	// Phase 269-01 — the operator clicked "Apply changes (refresh Liv AI)". Fire
	// the single debounced liv-assistant restart (cliInstaller.applyAgentChanges),
	// THEN flip `applying=true` which arms the EXISTING agentRefreshStatus poll
	// (the L351-375 effect) → "Applying…" → "ready — open Liv AI". The auth/key
	// write/uninstall ALREADY succeeded; this only triggers the deferred restart.
	const handleApplyChanges = useCallback(async () => {
		// Optimistically arm the poll so the UI shows "Applying…" immediately; the
		// restart status flips it to applied (or the graceful 12s timeout does).
		setPhase((p) =>
			p.kind === 'ready' && !p.applying
				? {kind: 'ready', message: p.message, applied: false, applying: true}
				: p,
		)
		try {
			await applyAgentChangesM.mutateAsync()
		} catch {
			// Best-effort: even if the apply call errors, the poll's graceful timeout
			// still reaches the usable "Open Liv AI" state — never hard-block the user.
		}
	}, [applyAgentChangesM])

	// EXPLICIT user click → open the device/login URL. NEVER auto-navigated.
	const openUrl = useCallback(
		(url: string) => {
			window.open(url, '_blank', 'noopener,noreferrer')
		},
		[],
	)

	// browser branch — open the login URL in the LivOS embedded browser window.
	const openInLivosBrowser = useCallback(
		(url: string) => {
			if (windowManager) {
				windowManager.openWindow(
					'LIVINITY_browser',
					`/browser?url=${encodeURIComponent(url)}`,
					'Browser',
					'',
				)
			} else {
				openUrl(url)
			}
		},
		[windowManager, openUrl],
	)

	// Phase 267-03 — open (or focus) the Liv AI window so the user can use the
	// newly-ready agent immediately. Mirrors the systemApps registry entry
	// (id 'LIVINITY_liv-assistant', route '/liv-assistant', name 'Liv AI').
	// window-manager.openWindow focuses an already-open window instead of
	// duplicating it. Falls back to a same-tab navigation if no window manager
	// is mounted (e.g. onboarding flow).
	const openLivAi = useCallback(() => {
		if (windowManager) {
			windowManager.openWindow(
				'LIVINITY_liv-assistant',
				'/liv-assistant',
				'Liv AI',
				'/figma-exports/dock-ai-chat.svg?v=chat_2026_06_02',
			)
		} else {
			window.location.assign('/liv-assistant')
		}
		onClose()
	}, [windowManager, onClose])

	// Advanced: run in Terminal instead (the demoted OLD bridge behavior).
	const runInTerminal = useCallback(
		(type: 'cli-install' | 'cli-auth') => {
			runCliInTerminalFallback(windowManager, type, cli)
			onClose()
		},
		[windowManager, cli, onClose],
	)

	const deviceCode = deviceCodeQ.data ?? null

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>
					{phase.kind === 'install' || phase.kind === 'installing'
						? `Install ${labelFor(cli)}`
						: `Connect ${labelFor(cli)}`}
				</DialogTitle>
				<DialogDescription>
					{phase.kind === 'ready'
						? 'Done.'
						: 'Set up this CLI agent from here — no Terminal required.'}
				</DialogDescription>
			</DialogHeader>

			<div className='space-y-4 py-2'>
				{phase.kind === 'loading' && (
					<p className='text-sm text-text-tertiary'>Checking status…</p>
				)}

				{/* ── Install step ── */}
				{phase.kind === 'install' && (
					<p className='text-sm text-text-secondary'>
						{labelFor(cli)} is not installed yet. Install it now to continue.
					</p>
				)}
				{phase.kind === 'installing' && (
					<div className='flex items-center gap-2 text-sm text-text-secondary'>
						<Spinner /> Installing {labelFor(cli)}…
					</div>
				)}
				{phase.kind === 'install-failed' && (
					<p className='whitespace-pre-wrap text-sm text-destructive2-lightest'>
						{phase.message}
					</p>
				)}

				{/* ── Device branch ── */}
				{phase.kind === 'auth-device' && (
					<div className='space-y-3'>
						<p className='text-sm text-text-secondary'>
							Sign in to {labelFor(cli)} in your browser, then come back —
							this dialog finishes automatically.
						</p>
						{deviceCode ? (
							<div className='space-y-3 rounded-radius-lg border border-border-default bg-surface-base p-3'>
								<div className='space-y-1'>
									<div className='text-caption text-text-tertiary'>
										1 · Open this link
									</div>
									<div className='flex items-center gap-2'>
										<code className='truncate text-xs text-text-secondary'>
											{hostOf(deviceCode.url)}
										</code>
										<Button
											size='sm'
											variant='default'
											onClick={() => openUrl(deviceCode.url)}
										>
											Open link ↗
										</Button>
									</div>
								</div>
								<div className='space-y-1'>
									<div className='text-caption text-text-tertiary'>
										2 · Enter this code
									</div>
									<div className='flex items-center gap-2'>
										<code className='select-all rounded bg-surface-1 px-2 py-1 text-sm font-semibold tracking-widest text-text-primary'>
											{deviceCode.code}
										</code>
										<Button
											size='sm'
											variant='default'
											onClick={() =>
												void navigator.clipboard?.writeText(deviceCode.code)
											}
										>
											Copy
										</Button>
									</div>
								</div>
							</div>
						) : (
							<div className='flex items-center gap-2 text-sm text-text-tertiary'>
								<Spinner /> Waiting for the sign-in code…
							</div>
						)}
					</div>
				)}

				{/* ── Paste-back branch (268-04; AUTH-1/2/3 in 272-01) — open-link block
				    (only when a URL is parsed) + an ALWAYS-visible code field ── */}
				{phase.kind === 'auth-paste-back' && (
					<div className='space-y-3'>
						<p className='text-sm text-text-secondary'>
							Sign in at the link, then paste the code it shows back here.
						</p>
						<div className='space-y-3 rounded-radius-lg border border-border-default bg-surface-base p-3'>
							{/* 1 · Open link — only when authCli has parsed a URL from the
							    login's stdout. Bare `claude` may print no parseable URL/code,
							    so this is OPTIONAL — the paste field below is always shown
							    (AUTH-1: never strand the user on a spinner). */}
							{deviceCode ? (
								<div className='space-y-1'>
									<div className='text-caption text-text-tertiary'>
										1 · Open this link
									</div>
									<div className='flex items-center gap-2'>
										<code className='truncate text-xs text-text-secondary'>
											{hostOf(deviceCode.url)}
										</code>
										<Button
											size='sm'
											variant='default'
											onClick={() => openUrl(deviceCode.url)}
										>
											Open link ↗
										</Button>
									</div>
								</div>
							) : (
								<p className='text-caption text-text-tertiary'>
									If a sign-in link appears here, open it — then paste the code
									your browser shows below.
								</p>
							)}
							{/* 2 · Paste the code — ALWAYS rendered (AUTH-1). Visible input +
							    Enter-to-submit (AUTH-3). The code is still cleared on submit
							    and never logged/persisted (handleSubmitPasteCode; E-9). */}
							<div className='space-y-2'>
								<div className='text-caption text-text-tertiary'>
									{deviceCode ? '2 · ' : ''}Paste the code from your browser
								</div>
								<Input
									placeholder='Code'
									value={pasteCode}
									onValueChange={setPasteCode}
									variant={pasteError ? 'destructive' : undefined}
									sizeVariant='short'
									autoFocus
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault()
											void handleSubmitPasteCode()
										}
									}}
								/>
								<AnimatedInputError>{pasteError}</AnimatedInputError>
							</div>
						</div>
						{/* AUTH-2 — first-class API-key fallback. If the headless login never
						    prints a paste prompt (TTY-only — RESEARCH Open Question 1), the
						    operator has an OBVIOUS button (not a buried gray link) to switch
						    to the API-key flow so auth still works. NOT auto-switched. */}
						{method?.apiKeyEnv ? (
							<div className='border-t border-border-default pt-3'>
								<Button
									variant='default'
									className='w-full'
									onClick={() => {
										pasteStarted.current = false
										setPasteError(undefined)
										setPasteCode('')
										setPhase({kind: 'auth-apikey'})
									}}
								>
									Use an API key instead
								</Button>
							</div>
						) : null}
					</div>
				)}

				{/* ── API-key branch ── */}
				{(phase.kind === 'auth-apikey' || phase.kind === 'authenticating') && (
					<div
						className='space-y-2'
						onKeyDown={(e) => {
							// AUTH-3 — Enter submits the API key (only on the editable phase).
							if (e.key === 'Enter' && !e.shiftKey && phase.kind === 'auth-apikey') {
								e.preventDefault()
								void handleSubmitApiKey()
							}
						}}
					>
						<p className='text-sm text-text-secondary'>
							Paste your {labelFor(cli)} API key
							{method?.apiKeyEnv ? (
								<>
									{' '}
									(<code className='text-xs'>{method.apiKeyEnv}</code>)
								</>
							) : null}
							. It is stored only in this CLI&apos;s config on your server.
						</p>
						<PasswordInput
							label='API key'
							value={apiKey}
							onValueChange={setApiKey}
							error={apiKeyError}
							autoFocus
							sizeVariant='short'
						/>
					</div>
				)}

				{/* ── Browser branch ── */}
				{phase.kind === 'auth-browser' && (
					<div className='space-y-3'>
						<p className='text-sm text-text-secondary'>
							{labelFor(cli)} signs in through a browser. Open the login page,
							or paste an API key instead.
						</p>
						{method?.loginArgv ? (
							<Button
								variant='default'
								onClick={() =>
									openInLivosBrowser(
										`https://www.google.com/search?q=${encodeURIComponent(
											`${labelFor(cli)} cli login`,
										)}`,
									)
								}
							>
								Open sign-in in browser ↗
							</Button>
						) : null}
						{method?.apiKeyEnv ? (
							<div
								className='space-y-2 border-t border-border-default pt-3'
								onKeyDown={(e) => {
									// AUTH-3 — Enter submits the API key in the browser-branch fallback.
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault()
										void handleSubmitApiKey()
									}
								}}
							>
								<p className='text-sm text-text-secondary'>
									Or paste an API key (
									<code className='text-xs'>{method.apiKeyEnv}</code>):
								</p>
								<PasswordInput
									label='API key'
									value={apiKey}
									onValueChange={setApiKey}
									error={apiKeyError}
									sizeVariant='short'
								/>
							</div>
						) : null}
					</div>
				)}

				{/* ── Not auth-able ── */}
				{phase.kind === 'auth-na' && (
					<p className='text-sm text-text-secondary'>
						{labelFor(cli)} does not require a separate sign-in.
					</p>
				)}

				{phase.kind === 'authenticating' && (
					<div className='flex items-center gap-2 text-sm text-text-secondary'>
						<Spinner /> Saving…
					</div>
				)}

				{phase.kind === 'auth-failed' && (
					<p className='whitespace-pre-wrap text-sm text-destructive2-lightest'>
						{phase.message}
					</p>
				)}

				{/* ── Terminal SUCCESS / "Apply changes → ready" state (267-03 + 269-01) ── */}
				{phase.kind === 'ready' && (
					<div className='space-y-3'>
						<p className='text-sm font-medium text-success-light'>
							✓ {phase.message}
						</p>
						{/* Phase 269-01 — the success no longer auto-restarts Liv AI. Show an
						    explicit "Apply changes (refresh Liv AI)" button; clicking it
						    fires the ONE debounced restart, then the Applying…/ready poll
						    runs. Batches: the operator can do several actions and apply once. */}
						{!phase.applied && !phase.applying ? (
							<div className='space-y-2'>
								<p className='text-sm text-text-secondary'>
									Apply your changes to refresh Liv AI so {labelFor(cli)} shows
									up. You can do this once after several changes.
								</p>
								<Button variant='primary' onClick={handleApplyChanges}>
									Apply changes (refresh Liv AI)
								</Button>
							</div>
						) : !phase.applied ? (
							<div className='flex items-center gap-2 text-sm text-text-tertiary'>
								<Spinner /> Applying… (a few seconds)
							</div>
						) : (
							<p className='text-sm text-text-secondary'>
								{labelFor(cli)} is ready — open Liv AI to use it.
							</p>
						)}
					</div>
				)}

				{/* ── Uninstall affordance (268-04) — only on a DETECTED CLI, on the
				    auth and install-failed steps (NOT mid-install/auth/ready).
				    Two-step confirm guards against a destructive misclick (T-268-19).
				    On confirm → handleUninstall → the 267-03 ready/Applying poll runs
				    while the removed agent disappears from /api/agents. */}
				{detectQ.data?.detected === true &&
					phase.kind !== 'installing' &&
					phase.kind !== 'authenticating' &&
					phase.kind !== 'ready' &&
					phase.kind !== 'install' &&
					phase.kind !== 'loading' &&
					(!confirmUninstall ? (
						<button
							type='button'
							className='block text-caption text-destructive2-lightest underline-offset-2 hover:underline'
							onClick={() => setConfirmUninstall(true)}
						>
							Remove {labelFor(cli)}
						</button>
					) : (
						<div className='flex items-center gap-2 text-caption text-destructive2-lightest'>
							<span>Remove {labelFor(cli)} from this server?</span>
							<Button size='sm' variant='destructive' onClick={handleUninstall}>
								Remove
							</Button>
							<Button
								size='sm'
								variant='default'
								onClick={() => setConfirmUninstall(false)}
							>
								Cancel
							</Button>
						</div>
					))}

				{/* Advanced fallback — keep the OLD Terminal path for power users. */}
				{phase.kind !== 'ready' && phase.kind !== 'loading' && (
					<button
						type='button'
						className='text-caption text-text-tertiary underline-offset-2 hover:underline'
						onClick={() =>
							runInTerminal(
								phase.kind === 'install' || phase.kind === 'installing'
									? 'cli-install'
									: 'cli-auth',
							)
						}
					>
						Advanced: run in Terminal instead
					</button>
				)}
			</div>

			<DialogFooter>
				{phase.kind === 'install' && (
					<Button variant='primary' onClick={handleInstall}>
						Install
					</Button>
				)}
				{phase.kind === 'install-failed' && (
					<Button variant='primary' onClick={handleInstall}>
						Retry install
					</Button>
				)}
				{(phase.kind === 'auth-apikey' || phase.kind === 'auth-browser') &&
					(method?.apiKeyEnv || phase.kind === 'auth-apikey') && (
						<Button variant='primary' onClick={handleSubmitApiKey}>
							Save key
						</Button>
					)}
				{/* 268-04 — submit the pasted code to the live login's stdin. */}
				{phase.kind === 'auth-paste-back' && (
					<Button variant='primary' onClick={handleSubmitPasteCode}>
						Submit code
					</Button>
				)}
				{phase.kind === 'auth-failed' && (
					<Button
						variant='primary'
						onClick={() => {
							deviceStarted.current = false
							// 268-04 — let a failed paste-back login restart cleanly too.
							pasteStarted.current = false
							setConfirmUninstall(false)
							setPasteError(undefined)
							setPasteCode('')
							setPhase(method ? branchToAuthPhase(method) : {kind: 'loading'})
						}}
					>
						Retry
					</Button>
				)}
				{/* 267-03 — open the now-ready agent. Enabled once applied (or after
				    the graceful timeout); disabled while still "Applying…". */}
				{phase.kind === 'ready' && (
					<Button
						variant='primary'
						onClick={openLivAi}
						disabled={!phase.applied}
					>
						Open Liv AI
					</Button>
				)}
				<Button variant='default' onClick={onClose}>
					{phase.kind === 'ready' ? 'Done' : 'Close'}
				</Button>
			</DialogFooter>
		</DialogContent>
	)
}

function Spinner() {
	return (
		<span
			className='inline-block'
			style={{
				width: 14,
				height: 14,
				borderRadius: '50%',
				border: '2px solid var(--fg-mute, currentColor)',
				borderTopColor: 'transparent',
				animation: 'spin 0.8s linear infinite',
			}}
		/>
	)
}

/**
 * Self-mounting host. Drop ONE `<CliAuthDialog />` in the desktop shell; it
 * listens for `CLI_AUTH_DIALOG_EVENT` and renders the body keyed by CLI name so
 * every open starts from a clean hook state.
 */
export function CliAuthDialog() {
	const [state, setState] = useState<CliAuthDialogDetail | null>(null)

	useEffect(() => {
		function onOpen(e: Event) {
			const detail = (e as CustomEvent<CliAuthDialogDetail>).detail
			if (!detail || typeof detail.cli !== 'string' || !detail.cli) return
			setState({cli: detail.cli, mode: detail.mode ?? 'auth'})
		}
		window.addEventListener(CLI_AUTH_DIALOG_EVENT, onOpen)
		return () => window.removeEventListener(CLI_AUTH_DIALOG_EVENT, onOpen)
	}, [])

	const close = useCallback(() => setState(null), [])

	return (
		<Dialog open={state !== null} onOpenChange={(o) => !o && close()}>
			{state && (
				<CliAuthDialogBody
					key={state.cli}
					cli={state.cli}
					mode={state.mode ?? 'auth'}
					onClose={close}
				/>
			)}
		</Dialog>
	)
}
