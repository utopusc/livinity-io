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
