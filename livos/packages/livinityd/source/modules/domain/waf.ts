// livos/packages/livinityd/source/modules/domain/waf.ts
//
// Phase 332 (WAF-01/WAF-02) — per-app STOCK-CADDY protection primitives.
//
// D-332-1: the box runs the STOCK apt Caddy binary (D-134 upheld — no xcaddy,
// no plugins; an unrecognized directive rejects the ENTIRE Caddyfile, Phase-232
// lesson). Everything emitted here uses ONLY stock v2 features:
//   - IP/CIDR ban   → `remote_ip` request matcher + `handle { respond 403 }`
//   - UA/bot block  → `header_regexp User-Agent` matcher + `handle { respond 403 }`
//   - abuse logging → per-site `log { output file ... format json }` consumed by
//     the livos-caddy fail2ban jail (332-03) — the zero-proxy-risk rate-abuse leg.
// True in-proxy rate_limit is DEFERRED (third-party module; add-package removed
// from Caddy core in v2.11 — see 332-CONTEXT D-332-1).
//
// EMISSION SHAPE (load-bearing): the denial is a `handle @matcher { respond 403 }`
// block emitted FIRST inside the vhost — NOT a bare top-level `respond @m 403`.
// Caddy's default directive order sorts `handle` BEFORE `respond`, so a bare
// respond would lose to the app's catch-all handle and the ban would never fire;
// sibling `handle` blocks are first-match-wins in emission order, which is the
// same mechanism the 259 SSO carve-out relies on.
//
// SECURITY (D-332-5 — Caddyfile injection is the #1 threat here): every operator
// -supplied value is validated against a STRICT charset before it can reach the
// generated Caddyfile (mirrors the 257-06 safeBearer gate). IP entries must match
// the IPv4/IPv6/CIDR regexes below (charset alone already excludes whitespace,
// braces and quotes — full syntax nonsense is additionally caught by the
// `caddy validate` stage in writeCaddyfile, which leaves the live config
// untouched). UA entries are LITERAL TOKENS (no operator-authored regex, no
// spaces) that get regex-escaped at emit. Anything invalid is REJECTED at the
// route layer and — defense in depth — silently SKIPPED at emit.

// ── Types (the dedicated top-level `appSecurity` StoreSchema key, D-332-6) ───
// `type` (not interface) so the implicit index signature keeps the key
// assignable to FileStore's Serializable constraint (storagePool recipe).

export type AppWafConfig = {
	/** IP/CIDR ban list — matched via stock `remote_ip`, denied with 403. */
	banIps?: string[]
	/** Literal UA substrings (case-insensitive) — matched via header_regexp, 403. */
	banUserAgents?: string[]
	/** Opt this app's vhost into JSON access logging for the livos-caddy fail2ban jail. */
	abuseBan?: boolean
}

export type AppSecurityJailConfig = {
	/** Offenses within findtime before a ban. */
	maxretry?: number
	/** Sliding window, SECONDS (integer — wrapper param validation stays trivial). */
	findtime?: number
	/** Ban duration, SECONDS. */
	bantime?: number
}

export type AppSecurityState = {
	apps: Record<string, AppWafConfig>
	jail?: AppSecurityJailConfig
}

// ── Validation (strict, injection-killing) ───────────────────────────────────

// IPv4 or IPv4/CIDR — octet-strict (mirrors local-dns IPV4_RE) + /0-32.
const IPV4_CIDR_RE =
	/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}(\/([0-9]|[12][0-9]|3[0-2]))?$/
// IPv6 (+ optional /0-128) — conservative: hex+colons only. The charset alone
// makes injection impossible; full syntactic validity is enforced by the
// `caddy validate` stage (a bad entry fails closed, live config untouched).
const IPV6_CIDR_RE = /^[0-9A-Fa-f:]{2,39}(\/([0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?$/
// UA block entries: literal tokens, NO whitespace/quotes/braces/backslashes —
// the emitted regex is a single unquoted Caddyfile token.
const UA_TOKEN_RE = /^[A-Za-z0-9._/-]{1,64}$/
// App ids ride into a log file path — same conservative shape the app layer uses.
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export const WAF_MAX_BAN_IPS = 100
export const WAF_MAX_BAN_UAS = 50

export function isValidBanIp(entry: string): boolean {
	return (IPV4_CIDR_RE.test(entry) || (entry.includes(':') && IPV6_CIDR_RE.test(entry))) && entry.length <= 64
}

export function isValidUaToken(entry: string): boolean {
	return UA_TOKEN_RE.test(entry)
}

/**
 * Route-layer validation: returns a list of human-readable problems (empty =
 * valid). The route REJECTS invalid configs; emit additionally skips invalid
 * entries so a stale/hand-edited store can never break the Caddyfile.
 */
export function validateWafConfig(cfg: AppWafConfig): string[] {
	const problems: string[] = []
	const ips = cfg.banIps ?? []
	const uas = cfg.banUserAgents ?? []
	if (ips.length > WAF_MAX_BAN_IPS) problems.push(`banIps exceeds ${WAF_MAX_BAN_IPS} entries`)
	if (uas.length > WAF_MAX_BAN_UAS) problems.push(`banUserAgents exceeds ${WAF_MAX_BAN_UAS} entries`)
	for (const ip of ips) {
		if (!isValidBanIp(ip)) problems.push(`invalid IP/CIDR: ${JSON.stringify(ip)}`)
	}
	for (const ua of uas) {
		if (!isValidUaToken(ua)) problems.push(`invalid user-agent token: ${JSON.stringify(ua)}`)
	}
	return problems
}

// ── Emit ─────────────────────────────────────────────────────────────────────

// Regex-escape a UA token for the header_regexp pattern. The token charset is
// already [A-Za-z0-9._/-]; only `.` (and defensively everything non-alnum)
// needs escaping. `/` and `-` are not regex metacharacters outside classes.
function escapeUaToken(token: string): string {
	return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The per-app WAF denial handles. Returns '' when nothing valid is configured —
 * the caller interpolates the result as a plain prefix so a non-opted (or
 * fully-invalid) config keeps the emitted vhost BYTE-IDENTICAL to pre-332
 * output (SC3; the SC5 golden tests prove it).
 *
 * Every returned line is tab-indented one level (vhost body) and the string,
 * when non-empty, ends WITH a trailing newline.
 */
export function renderWafHandles(cfg: AppWafConfig | undefined): string {
	if (!cfg) return ''
	const ips = (cfg.banIps ?? []).filter(isValidBanIp)
	const uas = (cfg.banUserAgents ?? []).filter(isValidUaToken)
	const parts: string[] = []
	if (ips.length > 0) {
		parts.push(
			`\t@livos_waf_ban_ip remote_ip ${ips.join(' ')}`,
			`\thandle @livos_waf_ban_ip {`,
			`\t\trespond 403`,
			`\t}`,
		)
	}
	if (uas.length > 0) {
		const pattern = `(?i)(${uas.map(escapeUaToken).join('|')})`
		parts.push(
			`\t@livos_waf_ban_ua header_regexp User-Agent ${pattern}`,
			`\thandle @livos_waf_ban_ua {`,
			`\t\trespond 403`,
			`\t}`,
		)
	}
	if (parts.length === 0) return ''
	return parts.join('\n') + '\n'
}

// The log root consumed by the 332-03 fail2ban jail (`/var/log/livos-caddy/*.log`).
// A DEDICATED directory — never /var/log/caddy — so the jail glob can only ever
// see files this emitter created.
export const WAF_LOG_DIR = '/var/log/livos-caddy'

/**
 * Per-site JSON access log for the fail2ban abuse jail (WAF-01 leg). Emitted
 * ONLY when the app opted into abuseBan. '' for an invalid app id (defense in
 * depth — the id rides into a filesystem path).
 * Non-empty result ends with a trailing newline (same prefix contract as
 * renderWafHandles).
 */
export function renderWafLogDirective(appId: string, enabled: boolean | undefined): string {
	if (!enabled) return ''
	if (!APP_ID_RE.test(appId)) return ''
	return [
		`\tlog {`,
		`\t\toutput file ${WAF_LOG_DIR}/access-${appId}.log {`,
		`\t\t\troll_size 10mb`,
		`\t\t\troll_keep 3`,
		`\t\t}`,
		`\t\tformat json`,
		`\t}`,
	].join('\n') + '\n'
}

/**
 * Convenience: the full per-vhost WAF prefix (denial handles first, then the
 * abuse log). '' when the app has no effective protection — the byte-identical
 * guarantee for non-opted apps.
 */
export function renderWafPrefix(appId: string, cfg: AppWafConfig | undefined): string {
	if (!cfg) return ''
	return renderWafHandles(cfg) + renderWafLogDirective(appId, cfg.abuseBan)
}
