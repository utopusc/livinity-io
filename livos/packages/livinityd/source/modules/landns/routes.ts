// livos/packages/livinityd/source/modules/landns/routes.ts
//
// Phase 347-03 (LANDNS-01, D-347-3/4/5/7) — opt-in LAN-DNS + mDNS control plane.
//
// DISJOINT-FROM-CF BY CONSTRUCTION. This module lives in its OWN NEW directory
// (deliberately NOT the CF-portal DNS module's directory) precisely so the never-clobber-
// CF guarantee (D-347-5) is obvious structurally: it imports NOTHING from the CF-portal
// DNS module, the portal-provision helper, the free-tier own-zone primitive, or the
// reverse-proxy config module; references NO CF/portal symbol (the portal token secret
// path / the portal A-record writer / the portal Redis mode keys / the CF API), touches
// NO Redis, and writes its OWN dedicated top-level `landns` store key. A box in portal
// (CF) mode and a box in LANDNS mode therefore coexist without either ever writing the
// other's state. The source-level disjointness test (landns-routes.test.ts) pins this:
// a grep of the forbidden CF/portal substrings against this file MUST be zero.
//
// The control plane drives the root-owned closed-enum wrapper built in 347-02
// (the livos LAN-DNS install-script → deployed /usr/local/lib/livos/livos-landns.sh)
// through the scoped /etc/sudoers.d/livos-landns NOPASSWD grant. The wrapper owns the
// dnsmasq split-horizon config (/etc/dnsmasq.d/livos-landns.conf) + the avahi box-
// discovery unit — those files are the source of truth; the `landns` store key is a
// DISPLAY-ONLY mirror written AFTER a successful wrapper action so the Settings card can
// render last-known state even when the wrapper is undeployed / unreachable.
//
// OPT-IN, default-off. LANDNS never auto-becomes the sole LAN resolver — the operator
// points router-DHCP / LAN clients at the box explicitly (documented in the 347-04 UI).
//
// Defense-in-depth: hostIp/domain are zod-validated at this route boundary (own IPv4 +
// own FQDN regex, `.local` rejected) BEFORE they reach the wrapper, which re-validates
// (T-347-10). runLandns never throws → an undeployed wrapper degrades to {ok:false}
// instead of 500-ing the card (T-347-13). All 6 procedures are admin-gated (T-347-11).

import {spawn} from 'child_process'
import {z} from 'zod'
import {router, adminProcedure} from '../server/trpc/trpc.js'

const LANDNS_WRAPPER = '/usr/local/lib/livos/livos-landns.sh'

// ── runLandns — never-throw sudo spawn ──────────────────────────────────────
// Clone of the runPower discriminated-union contract (system/routes.ts): a Promise-
// wrapped spawn('sudo', ['-n', WRAPPER, ...args]) with a 300s ceiling (the `install`
// action runs apt-get install dnsmasq avahi-daemon). ENOENT/EACCES/timeout degrade to
// {ok:false} — this helper NEVER throws, so an undeployed wrapper (or a Windows dev
// host) yields a graceful {ok:false} instead of crashing the Settings card.
async function runLandns(args: string[]): Promise<{ok: true; stdout: string} | {ok: false; reason: string}> {
	return new Promise((resolve) => {
		const timeoutMs = 300_000
		let settled = false
		let stdout = ''
		let stderr = ''
		const settle = (result: {ok: true; stdout: string} | {ok: false; reason: string}): void => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(result)
		}

		const child = spawn('sudo', ['-n', LANDNS_WRAPPER, ...args], {
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		})

		const timer = setTimeout(() => {
			try {
				child.kill('SIGTERM')
			} catch {
				/* best-effort */
			}
			settle({ok: false, reason: `timeout after ${timeoutMs}ms`})
		}, timeoutMs)

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf8')
		})
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf8')
		})
		// ENOENT (sudo not on PATH) / EACCES — degrade, do not throw.
		child.on('error', (err: Error) => {
			settle({ok: false, reason: err.message || 'sudo spawn failed'})
		})
		child.on('close', (code) => {
			if (code === 0) {
				settle({ok: true, stdout})
				return
			}
			settle({
				ok: false,
				reason: stderr.trim().slice(0, 500) || `wrapper exited with code ${code ?? 'unknown'}`,
			})
		})
	})
}

// ── Own validators (route-side, LOCAL copies) ───────────────────────────────
// Deliberately NOT imported from any other module: a LOCAL FQDN regex keeps the
// disjointness proof trivial (importing a portal-side validator would trip the grep).
// Mirrors the same `.local`-rejection discipline the portal path uses, but as an
// independent implementation — the LANDNS split-horizon must target a REAL public FQDN
// (which already has a valid public cert), never `.local` (which never can).
const IPV4_RE = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
// 2+ dot-separated labels; each label 1-63 chars, alnum + internal hyphens; TLD alpha 2+.
const FQDN_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/

const hostIpSchema = z.string().refine((v) => IPV4_RE.test(v), 'invalid IPv4')
const domainSchema = z
	.string()
	.min(1)
	.max(253)
	.refine((d) => FQDN_RE.test(d), 'invalid FQDN')
	.refine((d) => !d.endsWith('.local'), '.local is not allowed for LAN-DNS')

// Display-only mirror shape (matches the `landns` StoreSchema key in index.ts).
type LandnsMirror = {
	dnsmasqEnabled?: boolean
	mdnsEnabled?: boolean
	hostIp?: string
	domain?: string
	lastAppliedAt?: number
}

const landns = router({
	// Read-only wrapper status probe (dnsmasq/avahi presence + enabled state + eligibility).
	landnsStatus: adminProcedure.query(async () => runLandns(['status'])),

	// apt-ensure dnsmasq + avahi-daemon (idempotent). No store write — install is a
	// prerequisite, not an enable.
	landnsInstall: adminProcedure.mutation(async () => runLandns(['install'])),

	// Enable dnsmasq split-horizon: answer the box's REAL FQDN space → the LAN host IP.
	// hostIp + domain are validated HERE before the wrapper (defense-in-depth).
	landnsEnable: adminProcedure
		.input(z.object({hostIp: hostIpSchema, domain: domainSchema}))
		.mutation(async ({ctx, input}) => {
			const result = await runLandns(['enable', input.hostIp, input.domain])
			if (result.ok) {
				const existing = ((await ctx.livinityd?.store.get('landns')) ?? {}) as LandnsMirror
				await ctx.livinityd?.store.set('landns', {
					...existing,
					dnsmasqEnabled: true,
					hostIp: input.hostIp,
					domain: input.domain,
					lastAppliedAt: Date.now(),
				})
			}
			return result
		}),

	// Disable dnsmasq split-horizon (removes the wrapper-owned conf, reloads).
	landnsDisable: adminProcedure.mutation(async ({ctx}) => {
		const result = await runLandns(['disable'])
		if (result.ok) {
			const existing = ((await ctx.livinityd?.store.get('landns')) ?? {}) as LandnsMirror
			await ctx.livinityd?.store.set('landns', {
				...existing,
				dnsmasqEnabled: false,
				lastAppliedAt: Date.now(),
			})
		}
		return result
	}),

	// Enable avahi box-discovery (<hostname>.local → box IP; discovery ONLY, no app vhosts).
	landnsMdnsEnable: adminProcedure.mutation(async ({ctx}) => {
		const result = await runLandns(['mdns-enable'])
		if (result.ok) {
			const existing = ((await ctx.livinityd?.store.get('landns')) ?? {}) as LandnsMirror
			await ctx.livinityd?.store.set('landns', {
				...existing,
				mdnsEnabled: true,
				lastAppliedAt: Date.now(),
			})
		}
		return result
	}),

	// Disable avahi box-discovery.
	landnsMdnsDisable: adminProcedure.mutation(async ({ctx}) => {
		const result = await runLandns(['mdns-disable'])
		if (result.ok) {
			const existing = ((await ctx.livinityd?.store.get('landns')) ?? {}) as LandnsMirror
			await ctx.livinityd?.store.set('landns', {
				...existing,
				mdnsEnabled: false,
				lastAppliedAt: Date.now(),
			})
		}
		return result
	}),
})

export default landns
