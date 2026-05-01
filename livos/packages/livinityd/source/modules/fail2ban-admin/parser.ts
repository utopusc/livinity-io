/**
 * Phase 46 Plan 02 — fail2ban text parsers (PURE FUNCTIONS).
 *
 * Four pure transforms over fail2ban-client / who -u / auth.log text. NO I/O,
 * NO side effects, NO `node:*` imports. Caller (client.ts / active-sessions.ts)
 * handles the spawn / file-read and feeds stdout strings into these.
 *
 * Throws `Error('parse: ...')` on malformed input. Caller in client.ts wraps
 * to `Fail2banClientError({kind: 'parse-failed'})`.
 *
 * Fixture corpus (see 46-01-DIAGNOSTIC.md):
 *   - parseJailList:           `fail2ban-client status`             — Mini PC LIVE + 2 SYNTHETIC variants
 *   - parseJailStatus:         `fail2ban-client status <jail>`      — Mini PC LIVE (Journal matches: variant) + 1 SYNTHETIC (File list: variant)
 *   - parseAuthLogForLastUser: `/var/log/auth.log` Failed-password lines
 *   - parseWhoOutput:          `who -u`                             — Mini PC LIVE (no-IP rows) + SYNTHETIC (parens-IP rows)
 *
 * The parser MUST tolerate BOTH `Journal matches:` (journald-integrated sshd
 * on Ubuntu 24.04, captured live on Mini PC) AND `File list:` (classic file-
 * watcher) as the filter source line in parseJailStatus output. Per
 * 46-01-DIAGNOSTIC.md "Plan 02 contract" item #7.
 */

/**
 * Parse the output of `fail2ban-client status` (no jail arg) and extract the
 * comma-separated jail names from the `Jail list:` line.
 *
 * Real format (LIVE Mini PC, single jail):
 * ```
 * Status
 * |- Number of jail:    1
 * `- Jail list:    sshd
 * ```
 *
 * Multi-jail (SYNTHETIC, format-compliant):
 * ```
 * `- Jail list:    sshd, recidive
 * ```
 *
 * @returns Array of jail names (trimmed, empties filtered). Empty list when
 *   `Jail list:` is followed by only whitespace.
 * @throws `Error('parse: jail list line not found')` when no `Jail list:`
 *   line is present.
 */
export function parseJailList(stdout: string): string[] {
	const match = /Jail list:\s*(.*?)\s*$/m.exec(stdout)
	if (!match) {
		throw new Error('parse: jail list line not found')
	}
	const raw = match[1] ?? ''
	if (raw.trim() === '') return []
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
}

/**
 * Parse the output of `fail2ban-client status <jail>` and extract the five
 * counter/list fields.
 *
 * Real format (LIVE Mini PC, journal-based filter, zero-banned):
 * ```
 * Status for the jail: sshd
 * |- Filter
 * |  |- Currently failed:   0
 * |  |- Total failed:       0
 * |  `- Journal matches:    _SYSTEMD_UNIT=sshd.service + _COMM=sshd
 * `- Actions
 *    |- Currently banned:   0
 *    |- Total banned:       0
 *    `- Banned IP list:
 * ```
 *
 * @returns Counts and bannedIps array. `bannedIps` is `[]` when the line is
 *   `Banned IP list:` followed by only whitespace.
 * @throws `Error('parse: ...')` when any of the five required keys is missing.
 */
export function parseJailStatus(stdout: string): {
	currentlyFailed: number
	totalFailed: number
	currentlyBanned: number
	totalBanned: number
	bannedIps: string[]
} {
	const findNumber = (key: string): number => {
		const re = new RegExp(`${escapeRegex(key)}\\s*(\\d+)`, 'm')
		const m = re.exec(stdout)
		if (!m) {
			throw new Error(`parse: missing required field '${key}' in jail status output`)
		}
		return Number.parseInt(m[1]!, 10)
	}

	const currentlyFailed = findNumber('Currently failed:')
	const totalFailed = findNumber('Total failed:')
	const currentlyBanned = findNumber('Currently banned:')
	const totalBanned = findNumber('Total banned:')

	// Banned IP list: line is final — capture whatever follows on the same line.
	// Trailing whitespace / empty -> [] (zero-banned case is the LIVE Mini PC fixture).
	const ipLineMatch = /Banned IP list:\s*(.*?)\s*$/m.exec(stdout)
	if (!ipLineMatch) {
		throw new Error("parse: missing required field 'Banned IP list:' in jail status output")
	}
	const ipsRaw = ipLineMatch[1] ?? ''
	const bannedIps =
		ipsRaw.trim() === ''
			? []
			: ipsRaw
					.split(/\s+/)
					.map((s) => s.trim())
					.filter((s) => s.length > 0)

	return {currentlyFailed, totalFailed, currentlyBanned, totalBanned, bannedIps}
}

/**
 * Scan auth.log content for the LAST line referencing the given IP and extract
 * the username from the standard sshd Failed-password message.
 *
 * Recognized line shapes:
 * ```
 * <ts> host sshd[N]: Failed password for invalid user <username> from <ip> port <port> ssh2
 * <ts> host sshd[N]: Failed password for <username> from <ip> port <port> ssh2
 * <ts> host sshd[N]: Invalid user <username> from <ip> port <port>
 * ```
 *
 * The captured username is treated as untrusted text (potentially attacker-
 * controlled). Per threat T-46-05, callers MUST surface this as text only —
 * never as a fail2ban-client argument or shell input.
 *
 * @param authLogContent  Full /var/log/auth.log text (caller reads file).
 * @param ip              Target IP — must be a literal IPv4 dotted-quad. Caller
 *                        in client.ts has already validated shape.
 * @returns Username from the LAST matching line, or `null` if no line matches.
 */
export function parseAuthLogForLastUser(authLogContent: string, ip: string): string | null {
	if (!authLogContent || authLogContent.length === 0) return null

	// Pre-filter on substring before regex — auth.log can be megabytes.
	if (!authLogContent.includes(ip)) return null

	const ipEsc = escapeRegex(ip)
	// `(?:invalid user )?` makes the prefix optional so both LINE shapes match.
	const re = new RegExp(
		`(?:Failed password for|Invalid user)\\s+(?:invalid user\\s+)?(\\S+)\\s+from\\s+${ipEsc}(?:\\s|$)`,
	)

	const lines = authLogContent.split(/\r?\n/)
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]!
		if (!line.includes(ip)) continue
		const m = re.exec(line)
		if (m && m[1]) return m[1]
	}
	return null
}

/**
 * Parse the output of `who -u` into per-session records.
 *
 * Field layout (verified against `man who` and Mini PC LIVE capture):
 * ```
 * USER     LINE         LOGIN-TIME   IDLE  PID    (HOST/DISPLAY)
 * bruce    pts/0        2026-05-01 12:34   .     9876   (203.0.113.5)
 * bruce    seat0        2026-04-29 10:54   ?     1984   (login screen)
 * root     pts/1        2026-05-01 11:37   01:34 1010411
 * ```
 *
 * The trailing `(...)` token is extracted ONLY when its inner contents look
 * like an IP (digits/dots/colons/hex). Tokens like `(login screen)` or `(:0)`
 * are descriptive labels (X11 display, console) — NOT extracted as sourceIp.
 *
 * The IPv4-mapped-IPv6 prefix `::ffff:` is stripped so callers always see a
 * dotted-quad IPv4 string for IPv4-mapped sessions.
 *
 * @returns One entry per non-empty input line. `sourceIp: null` when the
 *   trailing parens token is not an IP-shaped string. `since: null` when the
 *   timestamp columns can't be parsed (UI renders "?" — never throw).
 */
export function parseWhoOutput(stdout: string): Array<{
	user: string
	sourceIp: string | null
	since: Date | null
}> {
	if (!stdout || stdout.trim().length === 0) return []

	const out: Array<{user: string; sourceIp: string | null; since: Date | null}> = []
	const lines = stdout.split(/\r?\n/)

	for (const line of lines) {
		if (line.trim().length === 0) continue

		// User is the first whitespace-delimited token.
		const userMatch = /^\s*(\S+)/.exec(line)
		if (!userMatch) continue
		const user = userMatch[1]!

		// Trailing parens token (anchored to end of line).
		// Must contain ONLY IP-legal chars: digits, dots, colons, lowercase a-f
		// (for IPv6). This rejects `(login screen)` (spaces, letters), `(:0)`
		// (colon but no dotted-quad / no hex), etc.
		const parenMatch = /\(([0-9a-f.:]+)\)\s*$/.exec(line)
		let sourceIp: string | null = null
		if (parenMatch) {
			let ip = parenMatch[1]!
			if (ip.startsWith('::ffff:')) ip = ip.slice(7)
			// Final shape gate — must look like IPv4 dotted-quad OR contain a colon
			// (IPv6). `:0` (X11 display) won't match dotted-quad and has no IPv6
			// hex group → stays null.
			if (isIpShaped(ip)) {
				sourceIp = ip
			}
		}

		// Timestamp columns — `YYYY-MM-DD HH:MM` after the LINE column.
		// Best-effort: on parse failure, since=null (UI graceful).
		const tsMatch = /(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/.exec(line)
		let since: Date | null = null
		if (tsMatch) {
			const candidate = new Date(`${tsMatch[1]}T${tsMatch[2].padStart(5, '0')}:00Z`)
			if (!Number.isNaN(candidate.getTime())) since = candidate
		}

		out.push({user, sourceIp, since})
	}

	return out
}

// ---------------------------------------------------------------------------
// internals — NOT exported (pure helpers only)
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isIpShaped(s: string): boolean {
	// IPv4 dotted-quad
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return true
	// IPv6 — at least two colon-separated hex groups (rejects bare `:0`)
	if (/^[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){2,}$/i.test(s)) return true
	return false
}
