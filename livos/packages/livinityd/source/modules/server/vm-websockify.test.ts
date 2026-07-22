/**
 * Tests for the /vm/<id>/websockify WebSocket-to-WebSocket bridge handler
 * (Phase 353-01, VMVIEW-01 — the VM noVNC screen WS leg).
 *
 * THE LOAD-BEARING SECURITY PROPERTY: Caddy routes the VM websockify path to
 * :8080 UNCONDITIONALLY (@vm_screen_ws carries NO forward_auth — that would
 * hijack the Upgrade subrequest -> 502, the documented e336afdd regression). THIS
 * Express upgrade branch is the SOLE auth gate for the WS leg (T-353-01). This
 * tripwire asserts, source-grep style over server/index.ts (no live server,
 * mirroring ws-desktop.test.ts), that an unauthenticated WS upgrade is REFUSED
 * before any bridging, and that the bridge target is registry-sourced.
 */
import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const serverSource = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf-8')

describe('/vm/:id/websockify WebSocket-to-WebSocket bridge handler (auth tripwire)', () => {
	it('branch exists and matches the dockur WS endpoint allowlist (websockify|status|audio)', () => {
		// Fix-forward 2026-07-22: the dockur/qemus viewer opens /websockify (VNC) AND
		// /status (install-progress; reload-loops if unroutable) AND /audio — the
		// bridge covers all three under the SAME admin gate, preserving the endpoint.
		expect(serverSource).toContain('const vmWsMatch = pathname.match(/^\\/vm\\/([^/]+)\\/(websockify|status|audio)$/)')
		expect(serverSource).toContain('if (vmWsMatch)')
		expect(serverSource).toContain('const vmWsEndpoint = vmWsMatch[2]')
	})

	it('(a) Origin check runs BEFORE the token check', () => {
		const block = extractVmWsBlock(serverSource)
		const originIdx = block.indexOf('request.headers.origin')
		const tokenIdx = block.search(/searchParams\.get\('token'\)/)
		const verifyIdx = block.indexOf('verifySessionFull')
		expect(originIdx).toBeGreaterThan(-1)
		expect(tokenIdx).toBeGreaterThan(-1)
		expect(verifyIdx).toBeGreaterThan(-1)
		expect(originIdx).toBeLessThan(tokenIdx)
		expect(originIdx).toBeLessThan(verifyIdx)
		// Origin mismatch is rejected with 403.
		expect(block).toContain('403 Forbidden')
		expect(block).toMatch(/livos:domain:config/)
	})

	it('(b) a token is REQUIRED (query ?token= OR LIVINITY_SESSION cookie) before any bridging', () => {
		const block = extractVmWsBlock(serverSource)
		expect(block).toMatch(/searchParams\.get\('token'\)/)
		expect(block).toMatch(/LIVINITY_SESSION=\(\[\^;\]\+\)/)
		// The no-token guard rejects before the bridge is ever constructed.
		const noTokenIdx = block.search(/if \(!vmToken\)/)
		const bridgeIdx = block.indexOf('new WebSocket(')
		expect(noTokenIdx).toBeGreaterThan(-1)
		expect(bridgeIdx).toBeGreaterThan(-1)
		expect(noTokenIdx).toBeLessThan(bridgeIdx)
	})

	it('(c) verifySessionFull is called (WR-02: jti-revocation + active-user, not bare verifyToken), and it gates BEFORE the bridge', () => {
		const block = extractVmWsBlock(serverSource)
		const verifyIdx = block.indexOf('this.verifySessionFull(vmToken)')
		const bridgeIdx = block.indexOf('new WebSocket(')
		expect(verifyIdx).toBeGreaterThan(-1)
		expect(bridgeIdx).toBeGreaterThan(verifyIdx)
		// WR-02: the WS leg must NOT downgrade to the weaker verifyToken
		// (signature+exp only) — that would keep a revoked/logged-out token live.
		expect(block).not.toContain('this.verifyToken(vmToken)')
	})

	it('(c2) CR-01: an admin-role gate is present and rejects non-admin members with 403 BEFORE the bridge', () => {
		const block = extractVmWsBlock(serverSource)
		// The gate mirrors adminProcedure: a userId-bearing (multi-user) token
		// must have role === 'admin'; a legacy no-userId token is single-user
		// admin-equivalent. This pins CR-01 so it cannot silently regress.
		const roleIdx = block.search(/role\s*!==\s*'admin'/)
		expect(roleIdx).toBeGreaterThan(-1)
		expect(block).toMatch(/vmSession\.userId\s*&&\s*vmSession\.role\s*!==\s*'admin'/)
		// Non-admin rejection is 403 Forbidden (distinct from the 401 no/bad token).
		expect(block).toContain('403 Forbidden')
		// The role gate precedes the bridge construction.
		const bridgeIdx = block.indexOf('new WebSocket(')
		expect(bridgeIdx).toBeGreaterThan(roleIdx)
	})

	it('(d) missing/invalid token → 401 Unauthorized + socket.destroy()', () => {
		const block = extractVmWsBlock(serverSource)
		expect(block).toContain('401 Unauthorized')
		expect(block).toMatch(/socket\.destroy\(\)/)
		// Both the no-token and invalid-token guards write 401.
		const count = (block.match(/401 Unauthorized/g) || []).length
		expect(count).toBeGreaterThanOrEqual(2)
	})

	it('(e) bridge target is built ONLY from vm.novncPort (registry), never request input', () => {
		const block = extractVmWsBlock(serverSource)
		// The upstream URL is loopback + the registry-sourced novncPort; the endpoint
		// (websockify|status|audio) comes from the vetted allowlist match, not raw input.
		expect(block).toContain('ws://127.0.0.1:${vmView.novncPort}/${vmWsEndpoint}')
		// The id is UUID-validated before the registry lookup (SSRF discipline).
		expect(block).toMatch(/VM_ID_RE\.test\(vmId\)/)
		// The target host is a hardcoded loopback literal — never derived from
		// request headers / host / origin.
		expect(block).not.toMatch(/new WebSocket\(`ws:\/\/\$\{[^}]*request/)
		expect(block).not.toMatch(/new WebSocket\(`ws:\/\/\$\{[^}]*host/)
	})

	it('unknown/non-UUID id → 404, not-running VM → 409 (never bridge to a wrong/absent port)', () => {
		const block = extractVmWsBlock(serverSource)
		expect(block).toContain('404 Not Found')
		expect(block).toContain('409 Conflict')
		expect(block).toMatch(/this\.livinityd\.vm\.get\(vmId\)/)
		expect(block).toMatch(/vmView\.state !== 'running'/)
	})

	it('WS-to-WS bridge sets binaryType nodebuffer and attaches heartbeat', () => {
		const block = extractVmWsBlock(serverSource)
		expect(block).toMatch(/binaryType\s*=\s*['"]nodebuffer['"]/)
		expect(block).toMatch(/attachWsHeartbeat/)
	})

	it('positioned inside the shared upgrade router, before /ws/desktop', () => {
		const vmIdx = serverSource.indexOf('const vmWsMatch = pathname.match')
		const desktopIdx = serverSource.indexOf("pathname === '/ws/desktop'")
		expect(vmIdx).toBeGreaterThan(-1)
		expect(desktopIdx).toBeGreaterThan(-1)
		expect(vmIdx).toBeLessThan(desktopIdx)
	})
})

/**
 * Extract the `if (vmWsMatch) { ... }` block from server source by brace
 * matching (template-literal `${}` braces are balanced, so the counter stays
 * correct). Mirrors ws-desktop.test.ts's extractDesktopBlock.
 */
function extractVmWsBlock(source: string): string {
	const marker = 'if (vmWsMatch)'
	const ifStart = source.indexOf(marker)
	if (ifStart === -1) return ''
	let braceCount = 0
	let blockStart = -1
	for (let i = ifStart; i < source.length; i++) {
		if (source[i] === '{') {
			if (blockStart === -1) blockStart = i
			braceCount++
		} else if (source[i] === '}') {
			braceCount--
			if (braceCount === 0) {
				return source.slice(ifStart, i + 1)
			}
		}
	}
	return source.slice(ifStart)
}
