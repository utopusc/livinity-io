/**
 * Phase 263-01 (LIVOS-064, Critical) — pure security helpers for the
 * `/api/chrome/*` express routes.
 *
 * These extract the two security-critical decisions out of the inline route
 * closures in `index.ts` so they can be unit-tested in isolation:
 *
 *   1. chromeSessionGate — the unauth 401 gate. ALL THREE chrome routes
 *      (launch/kill/status) call this BEFORE any shell-out. Fail-closed: a
 *      missing cookie, a verifier that returns null, OR a verifier that throws
 *      all resolve to a 401 result. The route mounts pass
 *      `Server.verifySessionFull` as `verify` (jti-revocation + active-user
 *      re-check), the strongest HTTP-surface verifier.
 *
 *   2. buildCdpNewTabUrl / buildChromeLaunchArgv — the two `request.body.url`
 *      sinks that previously flowed RAW into `$({shell:true})`. The launch
 *      handler now uses `fetch(buildCdpNewTabUrl(url))` (URL-encoded query, no
 *      shell at all) and `spawn('sudo', buildChromeLaunchArgv(user, url))`
 *      (argv array, url is a single element — never a shell token). A url of
 *      `$(id>/tmp/pwn)` can therefore never reach a shell interpreter.
 *
 * LIVE end-to-end verification (unauth curl -> 401; `$(id>/tmp/pwn)` -> no
 * /tmp/pwn) is MANDATORY and lives in plan 263-06 against the running daemon —
 * string-level tests cannot catch a fail-open gate (the LIVOS-041 lesson).
 */

/** The CDP debugging endpoint the launcher talks to (loopback only). */
const CDP_BASE = 'http://127.0.0.1:9222'

/** The root-owned launcher script installed by install.sh. */
const LAUNCHER_PATH = '/usr/local/bin/livos-launch-chrome'

export type ChromeGateResult =
	| {ok: true; session: unknown}
	| {ok: false; status: 401; body: {error: 'unauthorized'}}

/**
 * Session gate for the chrome routes. Fail-closed in every branch:
 *   - no LIVINITY_SESSION cookie        -> 401
 *   - verify(token) resolves null/false -> 401
 *   - verify(token) throws              -> 401
 *   - verify(token) resolves a payload  -> ok:true (proceed)
 *
 * `cookies` is `request.cookies` (cookie-parser populated); `verify` is wired
 * to `Server.verifySessionFull` at the mount.
 */
export async function chromeSessionGate(
	cookies: Record<string, string> | undefined,
	verify: (token: string) => Promise<unknown>,
): Promise<ChromeGateResult> {
	const unauthorized: ChromeGateResult = {ok: false, status: 401, body: {error: 'unauthorized'}}
	const sessionToken = cookies?.LIVINITY_SESSION
	if (!sessionToken) return unauthorized
	try {
		const session = await verify(sessionToken)
		if (!session) return unauthorized
		return {ok: true, session}
	} catch {
		return unauthorized
	}
}

/**
 * SINK 1 — the CDP "open new tab" URL. The url becomes a single URL-encoded
 * query value; no shell is involved (the route calls `fetch(...)`). A url of
 * `$(id>/tmp/pwn)` is percent-escaped and can never be a shell token.
 */
export function buildCdpNewTabUrl(url: string): string {
	return `${CDP_BASE}/json/new?${encodeURIComponent(url)}`
}

/**
 * SINK 2 — the argv array for `spawn('sudo', argv)`. The url, when present, is
 * appended as a SINGLE trailing element (never word-split, never shell-parsed).
 * An empty url omits the trailing element entirely. `desktopUser` is admin-set
 * Redis (`livos:desktop:user`), not request-tainted.
 */
export function buildChromeLaunchArgv(desktopUser: string, url: string): string[] {
	return ['-u', desktopUser, 'nohup', LAUNCHER_PATH, ...(url ? [url] : [])]
}
