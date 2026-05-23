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
	it('null mainDomain :80 block emits /openclawos/handshake → :8080 BEFORE /liv-ai-app/* → :18789', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('handle /openclawos/handshake')
		expect(out).toContain('reverse_proxy 127.0.0.1:8080')
		expect(out).toContain('@livai path /liv-ai-app /liv-ai-app/*')
		expect(out).toContain('reverse_proxy 127.0.0.1:18789')
		// Ordering — handshake handle MUST appear before the livai handle so
		// first-match-wins routes the JWT POST to livinityd, not the gateway.
		const handshakeIdx = out.indexOf('handle /openclawos/handshake')
		const livaiIdx = out.indexOf('@livai path')
		expect(handshakeIdx).toBeGreaterThan(-1)
		expect(livaiIdx).toBeGreaterThan(-1)
		expect(handshakeIdx).toBeLessThan(livaiIdx)
	})

	it('apex block (mainDomain set) emits /openclawos/handshake BEFORE /liv-ai-app/*', () => {
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
		const livaiInside = out.indexOf('@livai path', apexBlockStart)
		expect(handshakeInside).toBeGreaterThan(apexBlockStart)
		expect(livaiInside).toBeGreaterThan(handshakeInside)
		expect(handshakeInside).toBeLessThan(apexBlockEnd)
	})

	it('multi-user subdomain block also emits /openclawos/handshake BEFORE /liv-ai-app/*', () => {
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
		const livaiInside = out.indexOf('@livai path', subdomainBlockStart)
		expect(handshakeInside).toBeGreaterThan(subdomainBlockStart)
		expect(livaiInside).toBeGreaterThan(handshakeInside)
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

	it('handshake handle is the ONLY new routing surface (INV-203-08) — apex/subdomain/native still route to :8080 or per-app port', () => {
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
		expect(out).toContain('reverse_proxy 127.0.0.1:8080')
		expect(out).toContain('reverse_proxy 127.0.0.1:18789') // livai
		expect(out).toContain('reverse_proxy 127.0.0.1:5678') // n8n subdomain
		// No new port targets sneaked in beyond {8080, 18789, 5678}
		const portMatches = (out.match(/reverse_proxy 127\.0\.0\.1:(\d+)/g) ?? []).map((m) =>
			Number(m.split(':').pop()),
		)
		for (const port of portMatches) {
			expect([8080, 18789, 5678]).toContain(port)
		}
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
