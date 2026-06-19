import {useEffect, useState} from 'react'

import {trpcReact, UserApp} from '@/trpc/trpc'
import {appToUrl} from '@/utils/misc'

/**
 * Phase 287 — verify-live DNS gate (frontend).
 *
 * `useAppOpenReady(appId)` is the single source of truth for "is it safe to
 * form a DNS query for this app's host yet?" Every open affordance in Wave 3
 * (the dock/launchpad/cmdk/app-icon gate in Plan 05 and the store-iframe gate
 * in Plan 06) routes through this hook (or the synchronous `isHostReady`
 * accessor below) so the system NEVER hands the operator a clickable /
 * resolvable `{app}-{user}.livinity.io` link before the record is confirmed
 * live from the operator's OWN resolver.
 *
 * Phases:
 *  - 'provisioning' — backend `subdomainReady` is unset/false. We poll
 *    apps.list (~every 3s) for the flag to flip. NO DNS query is formed for
 *    the host in this phase (the favicon probe is gated — see the INVARIANT).
 *  - 'rechecking'   — `subdomainReady === true`, but we have not yet proven
 *    the operator's own client resolver is warm. A client-side cache-busting
 *    favicon probe runs; until it passes we stay here.
 *  - 'ready'        — the probe passed (or this host was cached ready). Safe
 *    to open.
 *
 * GUARD — DO NOT re-introduce speculative-DNS surfaces. Adding any rendered
 * `<a href>`, `<link rel=preconnect|dns-prefetch|prefetch>`, `<iframe src>`,
 * an auto-open toast, or a server-side post-install HTTP probe to the per-app
 * host silently re-introduces the pre-live NXDOMAIN poisoning this phase
 * exists to prevent. The host's FIRST network touch must be intentional and
 * only after `subdomainReady === true`.
 */

export type AppOpenPhase = 'provisioning' | 'rechecking' | 'ready'

export interface AppOpenReady {
	phase: AppOpenPhase
	host: string | undefined
	/** Seconds until the next backend poll / probe retry (for a UI countdown). */
	retryIn: number
}

/**
 * Module-level cache of hosts proven resolvable by a passing client probe.
 * Lives OUTSIDE the hook so a re-click from any component (or the non-hook
 * `isHostReady` accessor in Plan 05) is instant — no re-probe.
 */
const readyHosts = new Set<string>()

/** How often we re-read apps.list while waiting for the backend flag (ms). */
const POLL_INTERVAL_MS = 3000
/** Per-probe DNS-resolution timeout (ms). A firing timeout = still provisioning. */
const PROBE_TIMEOUT_MS = 5000
/** Backoff before re-probing after a failed (timed-out) probe (ms). */
const PROBE_RETRY_MS = 4000

/**
 * Synchronous accessor over the module-level ready cache. Exported so the
 * non-hook open path (Plan 05's `useLaunchApp` per-call callback, where React
 * hooks cannot be called) can gate `window.open` against the SAME cache this
 * hook populates — without re-probing.
 */
export function isHostReady(host: string): boolean {
	return readyHosts.has(host)
}

/**
 * Client-side cache-busting favicon probe. Reuses the dual-resolve `Image`
 * pattern from `preloadImage` (utils/misc.ts): BOTH `onload` AND `onerror`
 * mean DNS resolved (a 404/403/TLS error AFTER the name resolves still proves
 * name -> TLS succeeded). Only the `setTimeout` firing means "DNS not yet"
 * (still provisioning). The `?cb=${Date.now()}` defeats any cached image.
 *
 * INVARIANT (287 failure-mode #3): never probe before subdomainReady===true - a speculative probe self-poisons the resolver.
 * Firing this on install-start would create the exact NXDOMAIN negative cache
 * the phase prevents. The single most dangerous ordering bug. Every caller
 * MUST gate this on `subdomainReady === true`.
 */
function probeResolvable(host: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
	return new Promise((resolve) => {
		const img = new Image()
		let timer: ReturnType<typeof setTimeout> | undefined
		const done = (ok: boolean) => {
			img.onload = null
			img.onerror = null
			if (timer) clearTimeout(timer)
			resolve(ok)
		}
		img.onload = () => done(true) // loaded -> resolved
		img.onerror = () => done(true) // 404/403/TLS error AFTER DNS -> still resolved
		img.src = `https://${host}/favicon.ico?cb=${Date.now()}`
		timer = setTimeout(() => done(false), timeoutMs) // timeout -> DNS not yet -> still provisioning
	})
}

/** Resolve the canonical host for an app: prefer the minted `host`, else derive. */
function hostForApp(app: UserApp | undefined): string | undefined {
	if (!app) return undefined
	// Prefer the canonical hyphen-pattern FQDN the platform mints (apps.list
	// `host`). Fall back to `appToUrl` (the SAME resolver every open path uses)
	// — never hand-mint the FQDN here.
	const canonical = (app as {host?: string}).host
	if (canonical && canonical.length > 0) return canonical
	try {
		return new URL(appToUrl(app)).host
	} catch {
		return undefined
	}
}

export function useAppOpenReady(appId: string): AppOpenReady {
	// Own apps.list query instance so we can poll JUST while this app is
	// not-ready (refetchInterval flips to undefined once ready) without
	// disturbing the shared AppsProvider query's config.
	const [flagReady, setFlagReady] = useState(false)
	const appsQ = trpcReact.apps.list.useQuery(undefined, {
		// Poll for the backend flag only while we haven't seen it true yet.
		refetchInterval: flagReady ? undefined : POLL_INTERVAL_MS,
	})

	const app = (() => {
		const row = (appsQ.data ?? []).find((a) => 'id' in a && a.id === appId)
		if (!row || 'error' in row) return undefined
		return row as UserApp
	})()

	const host = hostForApp(app)
	const subdomainReady = Boolean((app as {subdomainReady?: boolean} | undefined)?.subdomainReady)

	const [phase, setPhase] = useState<AppOpenPhase>('provisioning')
	const [retryIn, setRetryIn] = useState<number>(POLL_INTERVAL_MS / 1000)

	// Keep the polling enabled/disabled in sync with the observed flag.
	useEffect(() => {
		if (subdomainReady && !flagReady) setFlagReady(true)
	}, [subdomainReady, flagReady])

	useEffect(() => {
		// Fast path: host already proven resolvable in this session.
		if (host && readyHosts.has(host)) {
			setPhase('ready')
			setRetryIn(0)
			return
		}

		// PROVISIONING: backend has not confirmed the record exists. Stay here
		// and let the polling apps.list query flip `subdomainReady`. The favicon
		// probe is deliberately NOT fired here — see the INVARIANT on
		// probeResolvable: a speculative pre-ready probe self-poisons the
		// resolver (287 failure-mode #3).
		if (!subdomainReady || !host) {
			setPhase('provisioning')
			setRetryIn(POLL_INTERVAL_MS / 1000)
			return
		}

		// RECHECKING: the record exists (subdomainReady === true). NOW — and only
		// now — it is safe to form a DNS query for the host. Probe the operator's
		// OWN resolver with the cache-busting favicon GET; on a pass, cache + go
		// ready; on a timeout, back off and re-probe (never spin the UI thread —
		// the probe is async, Plan 05/06 provide the "Open anyway" escape).
		let cancelled = false
		let retryTimer: ReturnType<typeof setTimeout> | undefined
		setPhase('rechecking')
		setRetryIn(PROBE_TIMEOUT_MS / 1000)

		const runProbe = () => {
			void probeResolvable(host).then((ok) => {
				if (cancelled) return
				if (ok) {
					readyHosts.add(host)
					setPhase('ready')
					setRetryIn(0)
				} else {
					// Timed out -> DNS not warm yet on the client resolver. Stay in
					// rechecking and re-probe on a short backoff.
					setPhase('rechecking')
					setRetryIn(PROBE_RETRY_MS / 1000)
					retryTimer = setTimeout(runProbe, PROBE_RETRY_MS)
				}
			})
		}
		runProbe()

		// Cleanup: cancel any in-flight result handling + pending re-probe so an
		// unmount mid-probe does not leak timers or flip state after teardown.
		// (probeResolvable's own Image handlers/timeout are torn down inside its
		// `done()`; `cancelled` neutralizes the resolved value here.)
		return () => {
			cancelled = true
			if (retryTimer) clearTimeout(retryTimer)
		}
	}, [host, subdomainReady])

	return {phase, host, retryIn}
}
