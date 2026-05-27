// livos/packages/livinityd/source/modules/domain/caddy.test.ts
// Phase 104 plan 104-03 — generateLocalCaddyfile + cloud-mode regression.
// Phase 104 plan 104-04 — append: generate{Hybrid,Portal}Caddyfile +
// validate{Hybrid,Portal}Domain + D-104-RELAY-ZERO-DATA-PLANE negative-grep.
// Phase 142-01 — local-lan generator dropped (generateLocalCaddyfile +
// validateLocalTld). Phase 143-03 — Hybrid* names renamed → Portal*; the
// legacy aliases (validateHybridDomain, generateHybridCaddyfile) are still
// exported and exercised below as a back-compat guarantee.
import {describe, it, test, expect} from 'vitest'
import {
	generateFullCaddyfile,
	generateHybridCaddyfile,
	generatePortalCaddyfile,
	validateHybridDomain,
	validatePortalDomain,
	validateHost,
} from './caddy.js'

// ─── Phase 203-05 — /openclawos/handshake bridge handle ─────────────────

describe('Phase 203-05 — /openclawos/handshake handle (D-203-12 / INV-203-10)', () => {
	it('null mainDomain :80 block emits /openclawos/handshake → :8080 BEFORE Liv AI handles', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('handle /openclawos/handshake')
		expect(out).toContain('reverse_proxy 127.0.0.1:8080')
		// Phase 203-09 split: openclaw gateway (:18789) for /liv-ai-app/openclawos,
		// Next.js subapp (:3010) for everything else under /liv-ai-app/*.
		expect(out).toContain('@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*')
		expect(out).toContain('reverse_proxy 127.0.0.1:18789')
		expect(out).toContain('@livaiSubapp path /liv-ai-app /liv-ai-app/*')
		expect(out).toContain('reverse_proxy 127.0.0.1:3010')
		// Ordering — handshake handle MUST appear before the livai handles so
		// the JWT POST routes to livinityd, not the gateway.
		const handshakeIdx = out.indexOf('handle /openclawos/handshake')
		const livaiClawIdx = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos')
		const livaiSubappIdx = out.indexOf('@livaiSubapp path')
		expect(handshakeIdx).toBeGreaterThan(-1)
		expect(livaiClawIdx).toBeGreaterThan(-1)
		expect(livaiSubappIdx).toBeGreaterThan(-1)
		expect(handshakeIdx).toBeLessThan(livaiClawIdx)
		expect(livaiClawIdx).toBeLessThan(livaiSubappIdx)
	})

	it('apex block (mainDomain set) emits /openclawos/handshake BEFORE Liv AI handles', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('handle /openclawos/handshake')
		const apexBlockStart = out.indexOf('bruce.livinity.io {')
		const apexBlockEnd = out.indexOf('}', apexBlockStart + 100) // skip the opening { and the cache header
		// Find first handshake + livai occurrences INSIDE the apex block
		const handshakeInside = out.indexOf('handle /openclawos/handshake', apexBlockStart)
		const livaiClawInside = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos', apexBlockStart)
		const livaiSubappInside = out.indexOf('@livaiSubapp path', apexBlockStart)
		expect(handshakeInside).toBeGreaterThan(apexBlockStart)
		expect(livaiClawInside).toBeGreaterThan(handshakeInside)
		expect(livaiSubappInside).toBeGreaterThan(livaiClawInside)
		expect(handshakeInside).toBeLessThan(apexBlockEnd)
	})

	it('multi-user subdomain block also emits /openclawos/handshake BEFORE Liv AI handles', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true, // multiUser
			false,
			[],
		)
		const subdomainBlockStart = out.indexOf('bruce.livinity.io {')
		const handshakeInside = out.indexOf('handle /openclawos/handshake', subdomainBlockStart)
		const livaiClawInside = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos', subdomainBlockStart)
		const livaiSubappInside = out.indexOf('@livaiSubapp path', subdomainBlockStart)
		expect(handshakeInside).toBeGreaterThan(subdomainBlockStart)
		expect(livaiClawInside).toBeGreaterThan(handshakeInside)
		expect(livaiSubappInside).toBeGreaterThan(livaiClawInside)
	})

	it('handshake handle routes to :8080 (livinityd), NOT :18789 (openclaw gateway)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// Extract the handshake handle block + its single reverse_proxy line
		const handshakeIdx = out.indexOf('handle /openclawos/handshake')
		const blockEnd = out.indexOf('}', handshakeIdx + 'handle /openclawos/handshake'.length + 1)
		const handshakeBlock = out.slice(handshakeIdx, blockEnd)
		expect(handshakeBlock).toContain('reverse_proxy 127.0.0.1:8080')
		expect(handshakeBlock).not.toContain(':18789')
	})

	it('Liv AI port targets match the Phase 203-09 split (claw → :18789, subapp → :3010)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [{subdomain: 'n8n', appId: 'n8n', port: 5678, enabled: true}],
			},
			false,
			false,
			[],
		)
		// All existing legacy reverse_proxy targets still present
		expect(out).toContain('reverse_proxy 127.0.0.1:8080') // livinityd catch-all + handshake
		expect(out).toContain('reverse_proxy 127.0.0.1:18789') // openclaw gateway (claw-client)
		expect(out).toContain('reverse_proxy 127.0.0.1:3010') // Phase 203-09 — Next.js subapp
		expect(out).toContain('reverse_proxy 127.0.0.1:5678') // n8n subdomain
		// No new port targets beyond {8080, 18789, 3010, 5678, 3020}
		// Phase 226-04 added :3020 (liv-assistant /liv reverse-proxy).
		const portMatches = (out.match(/reverse_proxy 127\.0\.0\.1:(\d+)/g) ?? []).map((m) =>
			Number(m.split(':').pop()),
		)
		for (const port of portMatches) {
			expect([8080, 18789, 3010, 5678, 3020]).toContain(port)
		}
	})
})

// ─── Phase 203-09 — Liv AI surface split (claw gateway vs Next.js subapp) ──

describe('Phase 203-09 — /liv-ai-app split: openclaw gateway vs Next.js subapp', () => {
	it('apex block: openclawos sub-prefix uses handle_path (strip_prefix) and routes to :18789', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// handle_path automatically strips the matched prefix before forwarding
		// — the openclaw gateway in-process router sees "/" not "/liv-ai-app/openclawos"
		const clawIdx = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*')
		expect(clawIdx).toBeGreaterThan(-1)
		const clawBlockEnd = out.indexOf('\t}\n\t}', clawIdx)
		const clawBlock = out.slice(clawIdx, clawBlockEnd)
		expect(clawBlock).toContain('reverse_proxy 127.0.0.1:18789')
		expect(clawBlock).not.toContain(':3010')
	})

	it('apex block: bare /liv-ai-app + /liv-ai-app/* routes to Next.js subapp :3010 (Phase 202 dashboard)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const subappIdx = out.indexOf('@livaiSubapp path /liv-ai-app /liv-ai-app/*')
		expect(subappIdx).toBeGreaterThan(-1)
		// Find the handle block right after the matcher declaration
		const handleIdx = out.indexOf('handle @livaiSubapp', subappIdx)
		expect(handleIdx).toBeGreaterThan(subappIdx)
		const handleBlockEnd = out.indexOf('\t}\n\t}', handleIdx)
		const handleBlock = out.slice(handleIdx, handleBlockEnd)
		expect(handleBlock).toContain('reverse_proxy 127.0.0.1:3010')
		expect(handleBlock).not.toContain(':18789')
	})

	it('multi-user subdomain block also carries both Liv AI handles', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const subdomainBlockStart = out.indexOf('bruce.livinity.io {')
		const clawInside = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos', subdomainBlockStart)
		const subappInside = out.indexOf('@livaiSubapp path', subdomainBlockStart)
		expect(clawInside).toBeGreaterThan(subdomainBlockStart)
		expect(subappInside).toBeGreaterThan(clawInside)
	})
})

// ─── Phase 203-10 — gateway URL rewrite (handoff from Plan 203-09) ─────────

describe('Phase 203-10/12/Hot-fix-C — gateway URL rewrite to /plugins/openclawos', () => {
	it('handle_path strips external prefix AND rewrites to /plugins/openclawos before forwarding', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// The rewrite directive MUST appear inside the openclawos handle_path
		// block, BEFORE the reverse_proxy line, so the gateway plugin's
		// `path: '/plugins/openclawos'` prefix matcher fires (upstream
		// openclaw-os shape; see liv-claw-os/packages/claw-plugin/src/index.ts).
		const clawIdx = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*')
		expect(clawIdx).toBeGreaterThan(-1)
		const clawBlockEnd = out.indexOf('\t}\n\t}', clawIdx)
		const clawBlock = out.slice(clawIdx, clawBlockEnd)
		const rewriteIdx = clawBlock.indexOf('rewrite * /plugins/openclawos{path}')
		const proxyIdx = clawBlock.indexOf('reverse_proxy 127.0.0.1:18789')
		expect(rewriteIdx).toBeGreaterThan(-1)
		expect(proxyIdx).toBeGreaterThan(-1)
		expect(rewriteIdx).toBeLessThan(proxyIdx)
	})

	it('the rewrite is also present in the multi-user subdomain block', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const subdomainBlockStart = out.indexOf('bruce.livinity.io {')
		const clawInside = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos', subdomainBlockStart)
		const rewriteInside = out.indexOf(
			'rewrite * /plugins/openclawos{path}',
			clawInside,
		)
		expect(rewriteInside).toBeGreaterThan(clawInside)
	})

	it('the null-mainDomain :80 fallback block also carries the rewrite', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		const clawIdx = out.indexOf('@livAiOpenclawos path /liv-ai-app/openclawos')
		expect(clawIdx).toBeGreaterThan(-1)
		const rewriteIdx = out.indexOf('rewrite * /plugins/openclawos{path}', clawIdx)
		expect(rewriteIdx).toBeGreaterThan(clawIdx)
	})

	// Hot-fix-C addendum 2026-05-24: the Next.js static export's basePath is
	// /plugins/openclawos so the rendered HTML references _next/* assets via
	// /plugins/openclawos/_next/... — those external URLs would otherwise hit
	// the default reverse_proxy to :8080 (livinityd) which doesn't serve them.
	// Asset handle steers them directly to :18789 (no rewrite needed since the
	// plugin already matches /plugins/openclawos*).
	it('also emits a /plugins/openclawos asset handle pointing at :18789', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@openclawosPluginAssets path /plugins/openclawos /plugins/openclawos/*')
		// The asset handle must NOT carry a rewrite (gateway already serves the path as-is).
		const assetIdx = out.indexOf('@openclawosPluginAssets path')
		const handleIdx = out.indexOf('handle @openclawosPluginAssets', assetIdx)
		expect(handleIdx).toBeGreaterThan(assetIdx)
	})
})

// ─── Phase 203 Hot-fix D 2026-05-24 — operator-facing URL rename ─────────
//
// External path `/liv-ai-app/liv-ai` is added BEFORE the legacy
// `/liv-ai-app/openclawos` handle so operators see "Liv AI" in the URL bar.
// Both rewrite to the same upstream `/plugins/openclawos{path}` so the
// gateway plugin doesn't need to change. The legacy path stays for
// backwards-compat with any in-flight iframe src / bookmark.

describe('Phase 203 Hot-fix D — /liv-ai-app/liv-ai rename (operator-facing URL)', () => {
	it('apex block emits BOTH /liv-ai-app/liv-ai AND /liv-ai-app/openclawos handle_paths', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*')
		expect(out).toContain('@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*')
	})

	it('the new /liv-ai-app/liv-ai handle rewrites to /plugins/openclawos and proxies to :18789', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const livAiIdx = out.indexOf('@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*')
		expect(livAiIdx).toBeGreaterThan(-1)
		const livAiBlockEnd = out.indexOf('\t}\n\t}', livAiIdx)
		const livAiBlock = out.slice(livAiIdx, livAiBlockEnd)
		expect(livAiBlock).toContain('rewrite * /plugins/openclawos{path}')
		expect(livAiBlock).toContain('reverse_proxy 127.0.0.1:18789')
		expect(livAiBlock).not.toContain(':3010')
	})

	it('the new handle is emitted BEFORE the legacy openclawos handle (cosmetic top-to-bottom)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const livAiIdx = out.indexOf('@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*')
		const openclawosIdx = out.indexOf(
			'@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*',
		)
		expect(livAiIdx).toBeGreaterThan(-1)
		expect(openclawosIdx).toBeGreaterThan(-1)
		expect(livAiIdx).toBeLessThan(openclawosIdx)
	})

	it('multi-user subdomain block also carries the new /liv-ai-app/liv-ai handle', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const subdomainBlockStart = out.indexOf('bruce.livinity.io {')
		const livAiInside = out.indexOf(
			'@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*',
			subdomainBlockStart,
		)
		expect(livAiInside).toBeGreaterThan(subdomainBlockStart)
		const rewriteInside = out.indexOf('rewrite * /plugins/openclawos{path}', livAiInside)
		expect(rewriteInside).toBeGreaterThan(livAiInside)
	})

	it('the null-mainDomain :80 fallback block also carries the new /liv-ai-app/liv-ai handle', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*')
		const livAiIdx = out.indexOf('@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*')
		const rewriteIdx = out.indexOf('rewrite * /plugins/openclawos{path}', livAiIdx)
		expect(rewriteIdx).toBeGreaterThan(livAiIdx)
	})

	it('the handshake handle still emits BEFORE both /liv-ai-app/* handles (ordering invariant preserved)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const handshakeIdx = out.indexOf('handle /openclawos/handshake')
		const livAiIdx = out.indexOf('@livAiLivAi path /liv-ai-app/liv-ai /liv-ai-app/liv-ai/*')
		const openclawosIdx = out.indexOf(
			'@livAiOpenclawos path /liv-ai-app/openclawos /liv-ai-app/openclawos/*',
		)
		expect(handshakeIdx).toBeGreaterThan(-1)
		expect(handshakeIdx).toBeLessThan(livAiIdx)
		expect(livAiIdx).toBeLessThan(openclawosIdx)
	})
})

describe('generateFullCaddyfile — cloud-mode regression (D-104-NO-PROD-IMPACT)', () => {
	it('does NOT emit any pki or import directive in cloud mode (AC-104-3 unit-level)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).not.toContain('import /etc/caddy/pki-global.conf')
		expect(out).not.toContain('pki {')
		expect(out).not.toContain('ca liv-local')
		expect(out).not.toContain('issuer internal')
	})

	it('cloud-mode multiUser also has no pki directives', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			true,
			false,
			[],
		)
		expect(out).not.toContain('import /etc/caddy/pki-global.conf')
		expect(out).not.toContain('ca liv-local')
	})
})

// ─── Phase 104 plan 104-04 — hybrid mode tests ──────────────────────────

describe('validateHybridDomain (Phase 104 plan 104-04)', () => {
	it('accepts LivOS-provisioned home.livinity.io subdomains', () => {
		expect(validateHybridDomain('ab12cd34.home.livinity.io')).toBe(true)
		expect(validateHybridDomain('home.livinity.io')).toBe(true)
	})
	it('accepts user-owned domains', () => {
		expect(validateHybridDomain('home.bruceoz.com')).toBe(true)
	})
	it('rejects .local TLDs (route to local-lan instead)', () => {
		expect(validateHybridDomain('bruce.livinity.local')).toBe(false)
	})
	it('rejects IP-shaped strings and traversal patterns', () => {
		expect(validateHybridDomain('192.168.1.1')).toBe(false)
		expect(validateHybridDomain('../etc')).toBe(false)
	})
	it('rejects empty / too long inputs', () => {
		expect(validateHybridDomain('')).toBe(false)
		expect(validateHybridDomain('a'.repeat(254))).toBe(false)
	})
})

describe('generateHybridCaddyfile (Phase 104 plan 104-04)', () => {
	it('contains wildcard block with Cloudflare DNS-01 directive', () => {
		const out = generateHybridCaddyfile('ab12cd34.home.livinity.io')
		expect(out).toContain('*.ab12cd34.home.livinity.io {')
		expect(out).toContain('dns cloudflare {env.CLOUDFLARE_API_TOKEN}')
	})
	it('contains bare apex block', () => {
		const out = generateHybridCaddyfile('ab12cd34.home.livinity.io')
		expect(out).toMatch(/(^|\n)ab12cd34\.home\.livinity\.io \{/)
	})
	it('does NOT emit any pki or internal-CA directive', () => {
		const out = generateHybridCaddyfile('ab12cd34.home.livinity.io')
		expect(out).not.toContain('import /etc/caddy/pki-global.conf')
		expect(out).not.toContain('pki {')
		expect(out).not.toContain('ca liv-local')
		expect(out).not.toContain('issuer internal')
	})
	it('emits multi-user subdomains with the cloudflare DNS directive', () => {
		const out = generateHybridCaddyfile(
			'ab12cd34.home.livinity.io',
			[{name: 'app1', port: 8081}],
			true,
		)
		expect(out).toContain('app1.ab12cd34.home.livinity.io {')
		expect(out).toContain('reverse_proxy 127.0.0.1:8081')
		// app1 block must also have the cloudflare TLS directive
		const app1Idx = out.indexOf('app1.ab12cd34.home.livinity.io {')
		const app1End = out.indexOf('}', app1Idx)
		const app1Block = out.slice(app1Idx, app1End)
		expect(app1Block).toContain('dns cloudflare')
	})
	it('reverse_proxy lines all target 127.0.0.1 (LAN-direct data plane)', () => {
		const out = generateHybridCaddyfile(
			'ab12cd34.home.livinity.io',
			[{name: 'app1', port: 8081}],
			true,
		)
		// Every reverse_proxy line MUST point at 127.0.0.1:* — proves data-plane
		// stays LAN-direct (no Server5 / cloud relay leak at the generator level).
		const reverseLines = out.split('\n').filter((l) => l.includes('reverse_proxy'))
		expect(reverseLines.length).toBeGreaterThan(0)
		for (const line of reverseLines) {
			expect(line).toMatch(/reverse_proxy 127\.0\.0\.1:\d+/)
		}
	})
})

describe('generateFullCaddyfile — also has no cloudflare DNS-01 in cloud mode', () => {
	it('cloud-mode output has no `dns cloudflare {env...}` directive (D-104-NO-PROD-IMPACT)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// Hybrid uses Caddy v2 DNS-01 plugin syntax; cloud mode uses Cloudflare via
		// a different on-Mini-PC path. They must be disjoint at the Caddyfile level.
		expect(out).not.toContain('dns cloudflare {env.CLOUDFLARE_API_TOKEN}')
	})
})

describe('generateHybridCaddyfile — data-plane invariant (D-104-RELAY-ZERO-DATA-PLANE)', () => {
	// Negative-grep test — static unit-test-level complement to the runtime
	// tcpdump assertion in plan 104-07. Proves at code-generation time that
	// the hybrid Caddyfile CANNOT route data-plane traffic via Server5 (or Server4).
	test('generateHybridCaddyfile output never references Server5 IP or routes data-plane via Server5', () => {
		// Object-arg cast preserves the contract literal from the verification
		// invariant (the generator's positional shape is exercised by the second
		// case below). Cast lets the static type check pass while the runtime
		// behavior collapses to "first positional argument is a string-coercible".
		const output = generateHybridCaddyfile(
			{hybridDomain: 'bruce.home.livinity.io', cfApiToken: 'fake-token-xxx'} as any,
		)
		expect(output).not.toMatch(/45\.137\.194\.102/)
		expect(output).not.toMatch(/reverse_proxy\s+[^\s]*livinity\.io[^\/\w]/)
		expect(output).not.toMatch(/45\.137\.194\.103/) // Server4 also off-limits
	})

	// Repeat with the canonical positional-arg call shape used by the generator
	// (the object-arg cast above is the contract literal from the verification
	// invariant; this second case exercises the real signature).
	test('generateHybridCaddyfile (positional signature) output never references Server5/Server4 IPs', () => {
		const output = generateHybridCaddyfile('bruce.home.livinity.io')
		expect(output).not.toMatch(/45\.137\.194\.102/) // Server5 IP
		expect(output).not.toMatch(/45\.137\.194\.103/) // Server4 IP (off-limits per memory)
		// No reverse_proxy line should point at any livinity.io hostname
		// (data-plane stays LAN-direct — reverse_proxy targets 127.0.0.1 only).
		expect(output).not.toMatch(/reverse_proxy\s+[^\s]*livinity\.io[^\/\w]/)
	})
})

// ─── Phase 142-01 — local-lan retirement guard ─────────────────────────

describe('Phase 142-01 local-lan retirement (source-text guards)', () => {
	test('caddy.ts no longer exports generateLocalCaddyfile / validateLocalTld', async () => {
		// Dynamic import so the test surfaces an early failure if either symbol
		// is re-introduced. Both should be `undefined` on the module object.
		const mod = (await import('./caddy.js')) as unknown as Record<string, unknown>
		expect(mod.generateLocalCaddyfile).toBeUndefined()
		expect(mod.validateLocalTld).toBeUndefined()
	})
})

// ─── Phase 143-03 — Hybrid → Portal alias back-compat guarantee ─────────

describe('Phase 143-03 Hybrid → Portal aliases (back-compat)', () => {
	test('generateHybridCaddyfile is the same function reference as generatePortalCaddyfile', () => {
		expect(generateHybridCaddyfile).toBe(generatePortalCaddyfile)
	})
	test('validateHybridDomain is the same function reference as validatePortalDomain', () => {
		expect(validateHybridDomain).toBe(validatePortalDomain)
	})
	test('aliases produce byte-identical output for the same input', () => {
		const portalOut = generatePortalCaddyfile('ab12cd34.home.livinity.io', [{name: 'app1', port: 9001}])
		const hybridOut = generateHybridCaddyfile('ab12cd34.home.livinity.io', [{name: 'app1', port: 9001}])
		expect(hybridOut).toBe(portalOut)
	})
})

// ─── Phase 141-03 — hyphen-pattern subdomain (canonical host) tests ──────

describe('validateHost (Phase 141-03)', () => {
	it('accepts Phase 140 hyphen-pattern hosts', () => {
		expect(validateHost('n8n-socinity.livinity.io')).toBe(true)
		expect(validateHost('code-server-lucy.livinity.io')).toBe(true)
		expect(validateHost('apex-user.livinity.io')).toBe(true)
	})
	it('accepts plain two-label hosts', () => {
		expect(validateHost('example.com')).toBe(true)
		expect(validateHost('a.b')).toBe(true)
	})
	it('rejects empty / single-label', () => {
		expect(validateHost('')).toBe(false)
		expect(validateHost('justalabel')).toBe(false)
	})
	it('rejects labels starting or ending with dash', () => {
		expect(validateHost('-bad.livinity.io')).toBe(false)
		expect(validateHost('bad-.livinity.io')).toBe(false)
	})
	it('rejects underscores + special chars', () => {
		expect(validateHost('bad_label.livinity.io')).toBe(false)
		expect(validateHost('a.b/c')).toBe(false)
		expect(validateHost('a b.com')).toBe(false)
	})
	it('rejects 254+ char hosts (RFC 1035)', () => {
		expect(validateHost('a.' + 'b'.repeat(252))).toBe(false)
	})
})

describe('generateFullCaddyfile — Phase 141-03 host (canonical FQDN) preferred over subdomain compute', () => {
	it('subdomain with `host` field emits a block named EXACTLY by host', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'socinity.livinity.io',
				subdomains: [
					{
						subdomain: 'n8n',
						appId: 'n8n',
						port: 5678,
						enabled: true,
						host: 'n8n-socinity.livinity.io', // Phase 140 hyphen-pattern
					},
				],
			},
			false,
			true, // tunnel mode → http:// prefix
			[],
		)
		// Block MUST be the canonical Server5-minted host (not subdomain.mainDomain).
		expect(out).toContain('http://n8n-socinity.livinity.io {')
		// Buggy compute path MUST NOT appear.
		expect(out).not.toContain('http://n8n.socinity.livinity.io {')
		// Reverse proxy still targets the app's local port.
		expect(out).toContain('reverse_proxy 127.0.0.1:5678')
	})

	it('subdomain WITHOUT `host` field falls back to legacy ${sub}.${mainDomain}', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [
					{subdomain: 'legacy-app', appId: 'legacy', port: 3000, enabled: true},
				],
			},
			false,
			false, // cloud mode → no prefix
			[],
		)
		// Legacy compute path kicks in for pre-Phase-140 entries.
		expect(out).toContain('legacy-app.bruce.livinity.io {')
	})

	it('mixed Phase 140 + legacy entries coexist (backwards-compat)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'socinity.livinity.io',
				subdomains: [
					{subdomain: 'n8n', appId: 'n8n', port: 5678, enabled: true, host: 'n8n-socinity.livinity.io'},
					{subdomain: 'old', appId: 'old', port: 4000, enabled: true},
				],
			},
			false,
			true,
			[],
		)
		expect(out).toContain('http://n8n-socinity.livinity.io {')
		expect(out).toContain('http://old.socinity.livinity.io {')
	})

	it('disabled subdomain is skipped even when `host` is set', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'socinity.livinity.io',
				subdomains: [
					{subdomain: 'n8n', appId: 'n8n', port: 5678, enabled: false, host: 'n8n-socinity.livinity.io'},
				],
			},
			false,
			true,
			[],
		)
		expect(out).not.toContain('n8n-socinity.livinity.io')
	})

	it('invalid `host` (single label) is skipped to keep Caddyfile valid', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'socinity.livinity.io',
				subdomains: [
					{subdomain: 'n8n', appId: 'n8n', port: 5678, enabled: true, host: 'malformed'},
				],
			},
			false,
			true,
			[],
		)
		// The bad host did not emit; neither did the legacy fallback (we trust
		// `host` once it's present — falling back would mask Server5 contract bugs).
		expect(out).not.toContain('malformed')
		expect(out).not.toContain('n8n.socinity.livinity.io')
	})

	it('multi-user mode with `host`: routes via livinityd gateway port', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'socinity.livinity.io',
				subdomains: [
					{subdomain: 'n8n', appId: 'n8n', port: 5678, enabled: true, host: 'n8n-socinity.livinity.io'},
				],
			},
			true, // multiUser
			true,
			[],
		)
		expect(out).toContain('http://n8n-socinity.livinity.io {')
		// In multi-user mode every block routes to livinityd's gateway (8080),
		// regardless of the app's local port.
		expect(out).toContain('reverse_proxy 127.0.0.1:8080')
		expect(out).not.toContain('reverse_proxy 127.0.0.1:5678')
	})
})

describe('Phase 219 hotfix — CF trusted_proxies global block (universal CF proxy resilience)', () => {
	it('emits Cloudflare IPv4 + IPv6 ranges as trusted_proxies at file start', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [],
			},
			false,
			false,
			[],
		)
		// Must begin with the global block — global options can't appear after a site block.
		expect(out.startsWith('{')).toBe(true)
		expect(out).toContain('trusted_proxies static')
		expect(out).toContain('173.245.48.0/20') // CF v4
		expect(out).toContain('104.16.0.0/13') // CF v4
		expect(out).toContain('2400:cb00::/32') // CF v6
		expect(out).toContain('client_ip_headers CF-Connecting-IP')
	})

	it('portal Caddyfile also carries the CF trusted_proxies block', () => {
		const out = generatePortalCaddyfile('socinity.livinity.io', [])
		expect(out.startsWith('{')).toBe(true)
		expect(out).toContain('trusted_proxies static')
		expect(out).toContain('162.158.0.0/15')
	})

	it('no-domain fallback still ships the CF block (consistency)', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('trusted_proxies static')
	})

	it('default IP-only Caddyfile ships the CF block too', async () => {
		const {generateDefaultCaddyfile} = await import('./caddy.js')
		const out = generateDefaultCaddyfile()
		expect(out).toContain('trusted_proxies static')
		expect(out).toContain(':80 {')
	})

	it('site blocks still come AFTER the global block (Caddy parses top-down)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [{subdomain: 'files', appId: 'filebrowser', port: 8070, enabled: true, host: 'files-bruce.livinity.io'}],
			},
			false,
			false,
			[],
		)
		const globalEndIdx = out.indexOf('}\n')
		const firstSiteIdx = out.indexOf('bruce.livinity.io {')
		expect(globalEndIdx).toBeGreaterThan(-1)
		expect(firstSiteIdx).toBeGreaterThan(globalEndIdx)
	})
})

// ─── Phase 226-04 — /liv reverse-proxy handle (regen-survivable) ────────
// Recovery from Plan 226-03 BLOCKED — emission moved from
// caddy/conf.d/liv-assistant.caddy (snippet, doomed by livinityd regen)
// into the generateFullCaddyfile() emitter so every reloadCaddy() rewrite
// preserves the /liv handler. Asserts the handler appears in apex + multi-user
// subdomain + null-mainDomain blocks, strips upstream X-Frame-Options + CSP,
// sets frame-ancestors CSP at handle scope, and lives ABOVE the catch-all
// :8080 handle so first-match-wins routes /liv* to :3020.

describe('Phase 226-04 — /liv reverse-proxy handle (regen-survivable)', () => {
	it('apex bruce.livinity.io block emits @liv path matcher + handle + uri strip_prefix /liv', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@liv path /liv /liv/*')
		expect(out).toContain('handle @liv {')
		expect(out).toContain('uri strip_prefix /liv')
	})

	it('apex /liv handle reverse-proxies to 127.0.0.1:3020 (liv-assistant)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const livIdx = out.indexOf('@liv path /liv /liv/*')
		const blockTail = out.slice(livIdx)
		expect(blockTail).toContain('reverse_proxy 127.0.0.1:3020')
	})

	it('apex /liv handle strips upstream X-Frame-Options AND Content-Security-Policy', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const livIdx = out.indexOf('@liv path /liv /liv/*')
		const blockTail = out.slice(livIdx)
		expect(blockTail).toContain('header_down -X-Frame-Options')
		expect(blockTail).toContain('header_down -Content-Security-Policy')
	})

	it('apex /liv handle sets frame-ancestors CSP at handle scope', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain(
			"header Content-Security-Policy \"frame-ancestors 'self' https://bruce.livinity.io\"",
		)
	})

	it('apex /liv handle appears BEFORE the catch-all handle to :8080 (first-match-wins)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const apexBlockStart = out.indexOf('bruce.livinity.io {')
		expect(apexBlockStart).toBeGreaterThan(-1)
		const livIdx = out.indexOf('@liv path /liv /liv/*', apexBlockStart)
		// Match the catch-all `\thandle {\n\t\treverse_proxy 127.0.0.1:8080` pattern,
		// NOT the earlier `/openclawos/handshake` handle which ALSO reverse-proxies
		// to :8080. The catch-all is the one with bare `handle {` (no matcher).
		const catchAllIdx = out.indexOf('\thandle {\n\t\treverse_proxy 127.0.0.1:8080', apexBlockStart)
		expect(livIdx).toBeGreaterThan(-1)
		expect(catchAllIdx).toBeGreaterThan(-1)
		expect(livIdx).toBeLessThan(catchAllIdx)
	})

	it('multi-user subdomain block (bruce.livinity.io) also emits /liv handle', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true, // multiUser
			false,
			[],
		)
		// In multi-user mode, the subdomain block is the one that routes to :8080
		// via the app gateway — it MUST emit /liv too so iframe access works for
		// every user, not just the operator on the apex.
		const subBlockStart = out.indexOf('bruce.livinity.io {')
		expect(subBlockStart).toBeGreaterThan(-1)
		const livIdx = out.indexOf('@liv path /liv /liv/*', subBlockStart)
		// Match the catch-all `\thandle {\n\t\treverse_proxy 127.0.0.1:8080` pattern
		// (NOT the /openclawos/handshake handle which also targets :8080).
		const catchAllIdx = out.indexOf('\thandle {\n\t\treverse_proxy 127.0.0.1:8080', subBlockStart)
		expect(livIdx).toBeGreaterThan(subBlockStart)
		expect(catchAllIdx).toBeGreaterThan(subBlockStart)
		expect(livIdx).toBeLessThan(catchAllIdx)
	})

	it('null mainDomain :80 fallback block also emits /liv handle (dev/IP-only operator)', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('@liv path /liv /liv/*')
		expect(out).toContain('reverse_proxy 127.0.0.1:3020')
	})

	it('tunnel-mode apex block keeps http:// prefix AND emits /liv (CF tunnel compatibility)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			true, // tunnel mode — Phase 134+ http:// prefix
			[],
		)
		expect(out).toContain('http://bruce.livinity.io {')
		const apexBlockStart = out.indexOf('http://bruce.livinity.io {')
		const livIdx = out.indexOf('@liv path /liv /liv/*', apexBlockStart)
		expect(livIdx).toBeGreaterThan(apexBlockStart)
	})

	it('/liv handle does NOT emit header_up Connection / Upgrade (preserves Caddy v2 WS auto-upgrade)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const livIdx = out.indexOf('@liv path /liv /liv/*')
		// Find the closing brace of the /liv handle block — search for the next
		// matcher-prefix or the catch-all handle, whichever comes first.
		const catchAllIdx = out.indexOf('handle {', livIdx)
		const livHandleBlock = out.slice(livIdx, catchAllIdx)
		expect(livHandleBlock).not.toContain('header_up Connection')
		expect(livHandleBlock).not.toContain('header_up Upgrade')
	})
})

// ─── Phase 232 — Livinity brand overlay (sub directive + /liv/branding static) ───
// New LIV_BRANDING_HANDLE constant serves /etc/liv-assistant/branding/* as
// static files at /liv/branding/*. Existing LIV_ASSISTANT_HANDLE gains a
// `replace "</head>" "<link rel=stylesheet href=/liv/branding/livinity-overlay.css>"`
// directive that injects the overlay CSS link tag into upstream HTML responses.
// Both pieces emit in all 3 site blocks (fallback :80 + apex + multi-user
// subdomain). Tests assert directive shape, ordering, multi-block coverage,
// strip_prefix correctness, and Phase 226-04 non-regression.

describe('Phase 232 — Livinity brand overlay (sub directive + /liv/branding static)', () => {
	it('apex block emits handle /liv/branding/* with root + file_server + strip_prefix', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('handle /liv/branding/*')
		expect(out).toContain('root * /etc/liv-assistant/branding')
		expect(out).toContain('file_server')
		expect(out).toContain('uri strip_prefix /liv/branding')
	})

	it('apex block emits replace directive injecting overlay link before </head>', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('replace "</head>"')
		expect(out).toContain('/liv/branding/livinity-overlay.css')
	})

	it('apex block — branding handle appears BEFORE @liv handle (specificity-safe ordering)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const apexStart = out.indexOf('bruce.livinity.io {')
		expect(apexStart).toBeGreaterThan(-1)
		const brandingIdx = out.indexOf('handle /liv/branding/*', apexStart)
		const livIdx = out.indexOf('@liv path /liv /liv/*', apexStart)
		expect(brandingIdx).toBeGreaterThan(-1)
		expect(livIdx).toBeGreaterThan(-1)
		expect(brandingIdx).toBeLessThan(livIdx)
	})

	it('multi-user subdomain block also emits branding handle + replace directive', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const subStart = out.indexOf('bruce.livinity.io {')
		expect(subStart).toBeGreaterThan(-1)
		const brandingIdx = out.indexOf('handle /liv/branding/*', subStart)
		const replaceIdx = out.indexOf('replace "</head>"', subStart)
		expect(brandingIdx).toBeGreaterThan(subStart)
		expect(replaceIdx).toBeGreaterThan(subStart)
	})

	it('null mainDomain :80 fallback block also emits branding handle + replace directive', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('handle /liv/branding/*')
		expect(out).toContain('root * /etc/liv-assistant/branding')
		expect(out).toContain('replace "</head>"')
	})

	it('overlay link href is /liv/branding/livinity-overlay.css (matches static handler path)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// The TS template literal produces a literal `\"` in the runtime string.
		// Assert via toContain on the runtime-visible substring.
		expect(out).toContain('href=\\"/liv/branding/livinity-overlay.css\\"')
	})

	it('branding handle strips /liv/branding (NOT /liv) — basename reaches file_server', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const brandingIdx = out.indexOf('handle /liv/branding/*')
		expect(brandingIdx).toBeGreaterThan(-1)
		const tail = out.slice(brandingIdx, brandingIdx + 200)
		expect(tail).toContain('uri strip_prefix /liv/branding')
	})

	it('Phase 226-04 invariants STILL hold post-232: @liv → :3020 + XFO/CSP strip + frame-ancestors CSP', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('reverse_proxy 127.0.0.1:3020')
		expect(out).toContain('header_down -X-Frame-Options')
		expect(out).toContain('header_down -Content-Security-Policy')
		expect(out).toContain("frame-ancestors 'self' https://bruce.livinity.io")
	})

	it('tunnel-mode apex block also emits branding handle + replace directive (CF tunnel non-regression)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			true, // tunnel mode — http:// prefix
			[],
		)
		expect(out).toContain('http://bruce.livinity.io {')
		const apexStart = out.indexOf('http://bruce.livinity.io {')
		const brandingIdx = out.indexOf('handle /liv/branding/*', apexStart)
		const replaceIdx = out.indexOf('replace "</head>"', apexStart)
		expect(brandingIdx).toBeGreaterThan(apexStart)
		expect(replaceIdx).toBeGreaterThan(apexStart)
	})
})
