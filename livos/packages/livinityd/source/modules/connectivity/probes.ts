// livos/packages/livinityd/source/modules/connectivity/probes.ts
//
// Phase 333 (DIAG-01/02) — the LIVE connectivity probes. Each probe is READ-ONLY
// (D-333-2 — never mutates DNS/cert/network/firewall) and NEVER throws. Every
// live-I/O call is behind an injectable `deps` seam so the orchestrator + handler
// are unit-tested with canned data (no real DNS/TLS/network in tests). Live
// behavior is exercised only on the box (333-HUMAN-UAT).

import tls from 'node:tls'
import dns from 'node:dns/promises'
import {$} from 'execa'

import {verifyDns, getPublicIp} from '../domain/dns-check.js'
import {getTunnelStatus} from '../domain/tunnel.js'
import type {CheckResult, CheckCategory, CheckStatus} from './checks.js'

// ── Injectable I/O seam ──────────────────────────────────────────────────────
// Defaults wire the real probes; tests pass fakes. Every method resolves (never
// rejects) — a failed probe is a `fail`/`warn` CheckResult, not an exception.

export interface ProbeDeps {
	now: () => number
	/** Resolve the box's public IPv4 (for the DNS-drift comparison). */
	publicIp: () => Promise<string | null>
	/** DNS A-record resolution for a host (tunnel-aware match). */
	verifyDns: (host: string, expectedIp: string, tunnelMode: boolean) => Promise<{resolved: boolean; currentIp: string | null; match: boolean}>
	/** TLS peer-cert notAfter (epoch ms) for host:443, or null on connect failure. */
	certNotAfter: (host: string, timeoutMs: number) => Promise<number | null>
	/** Is a local TCP port accepting connections (loopback listen check). */
	portListening: (port: number, timeoutMs: number) => Promise<boolean>
	/** cloudflared.service (canonical) active? */
	cloudflaredActive: () => Promise<boolean>
	/** Legacy livos-tunnel relay status. */
	tunnelStatus: () => Promise<{installed: boolean; running: boolean}>
	/** MX records for a domain (mail check). */
	resolveMx: (domain: string) => Promise<{exchange: string; priority: number}[]>
	/** Reverse-DNS (PTR) names for an IP (mail check). */
	reverseDns: (ip: string) => Promise<string[]>
}

// ── Default (real) implementations ───────────────────────────────────────────

async function realCertNotAfter(host: string, timeoutMs: number): Promise<number | null> {
	return new Promise((resolve) => {
		let settled = false
		const done = (v: number | null) => {
			if (settled) return
			settled = true
			try {
				socket.destroy()
			} catch {
				/* ignore */
			}
			resolve(v)
		}
		const socket = tls.connect(
			{host, port: 443, servername: host, timeout: timeoutMs, rejectUnauthorized: false},
			() => {
				const cert = socket.getPeerCertificate()
				if (!cert || !cert.valid_to) return done(null)
				const ms = Date.parse(cert.valid_to)
				done(Number.isNaN(ms) ? null : ms)
			},
		)
		socket.on('error', () => done(null))
		socket.on('timeout', () => done(null))
	})
}

async function realPortListening(port: number, timeoutMs: number): Promise<boolean> {
	// Loopback listen check (mirrors firewall.checkPortAccessible but with a bounded
	// timeout arg). Read-only: opens + immediately closes a TCP connection.
	const net = await import('node:net')
	return new Promise((resolve) => {
		let settled = false
		const done = (v: boolean) => {
			if (settled) return
			settled = true
			try {
				socket.destroy()
			} catch {
				/* ignore */
			}
			resolve(v)
		}
		const socket = net.connect({host: '127.0.0.1', port, timeout: timeoutMs}, () => done(true))
		socket.on('error', () => done(false))
		socket.on('timeout', () => done(false))
	})
}

async function realCloudflaredActive(): Promise<boolean> {
	try {
		const res = await $({reject: false})`systemctl is-active cloudflared`
		return (res.stdout ?? '').trim() === 'active'
	} catch {
		return false
	}
}

// 333-REVIEW F3: getPublicIp (dns-check.ts) does two fetch() calls with NO
// AbortSignal, so a stalled endpoint could hang the whole self-check on undici's
// ~300s default timeout and, via the scheduler's per-job inFlight mutex, skip
// subsequent hourly fires. Bound its contribution to the run with a hard deadline
// (the dangling fetch is harmless — getPublicIp catches internally).
async function boundedPublicIp(timeoutMs: number): Promise<string | null> {
	return Promise.race<string | null>([
		getPublicIp().catch(() => null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
	])
}

export const DEFAULT_PROBE_DEPS: ProbeDeps = {
	now: () => Date.now(),
	publicIp: async () => boundedPublicIp(PROBE_TIMEOUT_MS),
	verifyDns: async (host, expectedIp, tunnelMode) => {
		const r = await verifyDns(host, expectedIp, tunnelMode)
		return {resolved: r.resolved, currentIp: r.currentIp, match: r.match}
	},
	certNotAfter: realCertNotAfter,
	portListening: realPortListening,
	cloudflaredActive: realCloudflaredActive,
	tunnelStatus: async () => {
		const s = await getTunnelStatus()
		return {installed: s.installed, running: s.running}
	},
	resolveMx: async (domain) => {
		try {
			return await dns.resolveMx(domain)
		} catch {
			return []
		}
	},
	reverseDns: async (ip) => {
		try {
			return await dns.reverse(ip)
		} catch {
			return []
		}
	},
}

// ── Probe inputs (what the box knows about itself) ───────────────────────────

export interface ProbeContext {
	/** The active main domain, or null when none configured. */
	mainDomain: string | null
	/** Whether the box routes through a CF/relay tunnel (affects DNS match semantics). */
	tunnelMode: boolean
	/** Operator opt-in for the mail category. */
	mailEnabled: boolean
}

const CERT_WARN_DAYS = 14
const PROBE_TIMEOUT_MS = 5000
const MS_PER_DAY = 86_400_000

// ── Individual probes → CheckResult[] ────────────────────────────────────────

export async function probeDns(ctx: ProbeContext, deps: ProbeDeps): Promise<CheckResult[]> {
	if (!ctx.mainDomain) return []
	const at = deps.now()
	const publicIp = ctx.tunnelMode ? '' : (await deps.publicIp()) ?? ''
	const r = await deps.verifyDns(ctx.mainDomain, publicIp, ctx.tunnelMode)
	let status: CheckStatus
	let detail: string
	if (!r.resolved) {
		status = 'fail'
		detail = `${ctx.mainDomain} does not resolve`
	} else if (!r.match) {
		// Non-tunnel drift: resolves, but not to our public IP.
		status = 'warn'
		detail = `${ctx.mainDomain} resolves to ${r.currentIp ?? '?'} (expected ${publicIp || 'this box'})`
	} else {
		status = 'pass'
		detail = `${ctx.mainDomain} resolves${r.currentIp ? ` to ${r.currentIp}` : ''}`
	}
	return [{id: 'dns:main', category: 'dns' as CheckCategory, status, detail, remediationKey: 'dns', at}]
}

export async function probeCert(ctx: ProbeContext, deps: ProbeDeps): Promise<CheckResult[]> {
	if (!ctx.mainDomain) return []
	const at = deps.now()
	const notAfter = await deps.certNotAfter(ctx.mainDomain, PROBE_TIMEOUT_MS)
	let status: CheckStatus
	let detail: string
	if (notAfter === null) {
		status = 'fail'
		detail = `could not read a TLS certificate for ${ctx.mainDomain}`
	} else {
		const days = Math.floor((notAfter - at) / MS_PER_DAY)
		if (days < 0) {
			status = 'fail'
			detail = `TLS certificate for ${ctx.mainDomain} expired ${-days} day(s) ago`
		} else if (days < CERT_WARN_DAYS) {
			status = 'warn'
			detail = `TLS certificate for ${ctx.mainDomain} expires in ${days} day(s)`
		} else {
			status = 'pass'
			detail = `TLS certificate valid for ${days} more day(s)`
		}
	}
	return [{id: 'cert:main', category: 'cert' as CheckCategory, status, detail, remediationKey: 'cert', at}]
}

export async function probePorts(_ctx: ProbeContext, deps: ProbeDeps): Promise<CheckResult[]> {
	const at = deps.now()
	const results: CheckResult[] = []
	for (const port of [80, 443]) {
		const up = await deps.portListening(port, PROBE_TIMEOUT_MS)
		results.push({
			id: `ports:${port}`,
			category: 'ports' as CheckCategory,
			status: up ? 'pass' : 'fail',
			detail: up ? `port ${port} is listening` : `nothing is listening on port ${port}`,
			remediationKey: 'ports',
			at,
		})
	}
	return results
}

export async function probeTunnel(ctx: ProbeContext, deps: ProbeDeps): Promise<CheckResult[]> {
	// Only meaningful when the box is in a tunnel topology.
	if (!ctx.tunnelMode) return []
	const at = deps.now()
	const cf = await deps.cloudflaredActive()
	const legacy = await deps.tunnelStatus()
	const up = cf || (legacy.installed && legacy.running)
	return [
		{
			id: 'tunnel:main',
			category: 'tunnel' as CheckCategory,
			status: up ? 'pass' : 'fail',
			detail: up ? 'tunnel is active' : 'tunnel is configured but not running',
			remediationKey: 'tunnel',
			at,
		},
	]
}

export async function probeMail(ctx: ProbeContext, deps: ProbeDeps): Promise<CheckResult[]> {
	if (!ctx.mailEnabled || !ctx.mainDomain) return []
	const at = deps.now()
	const mx = await deps.resolveMx(ctx.mainDomain)
	if (mx.length === 0) {
		return [
			{
				id: 'mail:mx',
				category: 'mail' as CheckCategory,
				status: 'warn',
				detail: `no MX records for ${ctx.mainDomain}`,
				remediationKey: 'mail',
				at,
			},
		]
	}
	return [
		{
			id: 'mail:mx',
			category: 'mail' as CheckCategory,
			status: 'pass',
			detail: `${mx.length} MX record(s) for ${ctx.mainDomain}`,
			remediationKey: 'mail',
			at,
		},
	]
}

/**
 * Run every enabled probe and flatten the results. Never throws — a probe that
 * rejects (it shouldn't; each swallows internally) is isolated so one bad probe
 * can't abort the run.
 */
export async function runConnectivityChecks(ctx: ProbeContext, deps: ProbeDeps = DEFAULT_PROBE_DEPS): Promise<CheckResult[]> {
	const probes = [probeDns, probeCert, probePorts, probeTunnel, probeMail]
	const out: CheckResult[] = []
	for (const probe of probes) {
		try {
			out.push(...(await probe(ctx, deps)))
		} catch {
			// A probe should never reject; if one does, skip it (availability-first).
		}
	}
	return out
}
