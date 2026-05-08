/**
 * Phase 93-06 — /ws/stream/:id WS upgrade handler.
 *
 * Source-string assertion tests, mirroring the existing ws-desktop.test.ts
 * pattern. We do NOT boot a real server — the handler block is verified by
 * grepping the index.ts source for required code patterns.
 *
 * Required behaviour (D-93-06):
 *   - Path-match: pathname.startsWith('/ws/stream/') with regex extraction
 *   - JWT auth: query token → cookie fallback → 401 if missing → verifyToken →
 *     401 if invalid
 *   - Ownership check: streamManager.listStreams({userId}).find(...) — 404
 *     (NOT 403) on mismatch (STRIDE I — info disclosure)
 *   - Upgrade: WebSocketServer({noServer:true}).handleUpgrade,
 *     ws.binaryType = 'nodebuffer', streamManager.addSubscriber(streamId, ws)
 *   - Cleanup: ws.on('close') removeSubscriber
 *   - Block positioned AFTER /ws/desktop and BEFORE the generic
 *     this.webSocketRouter.get(pathname) fallback
 */

import {describe, it, expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const serverSource = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf-8')

function extractStreamBlock(source: string): string {
	const marker = "pathname.startsWith('/ws/stream/')"
	const startIdx = source.indexOf(marker)
	if (startIdx === -1) return ''
	const ifStart = source.lastIndexOf('if (', startIdx)
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

describe('/ws/stream/:id WebSocket upgrade handler', () => {
	it('Test 1: path match uses pathname.startsWith("/ws/stream/")', () => {
		expect(serverSource).toContain("pathname.startsWith('/ws/stream/')")
	})

	it('Test 2: extracts streamId via regex from the path', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/pathname\.match\(/)
		// Source contains the literal regex /^\/ws\/stream\/([0-9a-f-]+)$/i —
		// look for the streamId capture group
		expect(block).toContain('/ws/stream/')
		expect(block).toMatch(/\[0-9a-f-\]/)
	})

	it('Test 3: JWT auth — token from query param then LIVINITY_SESSION cookie fallback', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/searchParams\.get\(['"]token['"]\)/)
		expect(block).toMatch(/LIVINITY_SESSION/)
	})

	it('Test 4: returns 401 Unauthorized when token missing', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toContain('401 Unauthorized')
	})

	it('Test 5: calls verifyToken and returns 401 on invalid token', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/verifyToken/)
		// Two 401s expected: missing-token + invalid-token. Count occurrences.
		const occurrences = (block.match(/401 Unauthorized/g) ?? []).length
		expect(occurrences).toBeGreaterThanOrEqual(2)
	})

	it('Test 6: ownership check uses streamManager.listStreams({userId:...})', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/streamManager/)
		expect(block).toMatch(/listStreams\(\{userId/)
		expect(block).toMatch(/\.find\(/)
	})

	it('Test 7: returns 404 (NOT 403) on foreign stream lookup — STRIDE I', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toContain('404 Not Found')
		// Sanity: no 403 leak path in this block
		expect(block).not.toContain('403 Forbidden')
	})

	it('Test 8: upgrades via WebSocketServer({noServer:true}).handleUpgrade', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/new WebSocketServer\(\{noServer:\s*true\}\)/)
		expect(block).toMatch(/handleUpgrade\(request,\s*socket,\s*head/)
	})

	it('Test 9: sets ws.binaryType = "nodebuffer"', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/binaryType\s*=\s*['"]nodebuffer['"]/)
	})

	it('Test 10: calls streamManager.addSubscriber(streamId, ws)', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/addSubscriber\(streamId,\s*ws\)/)
	})

	it('Test 11: removes subscriber on ws close (cleanup)', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toMatch(/ws\.on\(['"]close['"]/)
		expect(block).toMatch(/removeSubscriber\(ws\)/)
	})

	it('Test 12: handler positioned after /ws/desktop and before generic router fallback', () => {
		const desktopIdx = serverSource.indexOf("pathname === '/ws/desktop'")
		const streamIdx = serverSource.indexOf("pathname.startsWith('/ws/stream/')")
		const routerIdx = serverSource.indexOf('this.webSocketRouter.get(pathname)')
		expect(desktopIdx).toBeGreaterThan(-1)
		expect(streamIdx).toBeGreaterThan(-1)
		expect(routerIdx).toBeGreaterThan(-1)
		expect(streamIdx).toBeGreaterThan(desktopIdx)
		expect(streamIdx).toBeLessThan(routerIdx)
	})

	it('Test 13: returns 503 when StreamManager unavailable (defensive)', () => {
		const block = extractStreamBlock(serverSource)
		expect(block).toContain('503 Service Unavailable')
	})
})

// ============================================================================
// Phase 99-04 — VNC dispatch source-string assertions (2 new cases)
// ============================================================================

describe('/ws/stream/:id WebSocket upgrade handler — VNC dispatch (Phase 99-04)', () => {
	it('Test 14: imports attachVncBridge from ../streaming/vnc-bridge.js', () => {
		expect(serverSource).toMatch(
			/import\s*\{\s*attachVncBridge\s*\}\s*from\s*['"]\.\.\/streaming\/vnc-bridge\.js['"]/,
		)
	})

	it('Test 15: dispatches on session.kind: vnc → attachVncBridge; else → addSubscriber', () => {
		const block = extractStreamBlock(serverSource)
		// The vnc branch must reference attachVncBridge, host:'127.0.0.1', and session.rfbPort.
		expect(block).toMatch(/streamManager\.getSession\(streamId\)/)
		expect(block).toMatch(/session\.kind\s*===?\s*['"]vnc['"]/)
		expect(block).toMatch(/attachVncBridge\(\s*ws/)
		expect(block).toMatch(/host:\s*['"]127\.0\.0\.1['"]/)
		expect(block).toMatch(/port:\s*session\.rfbPort/)
		// The else branch (fmp4) MUST still call addSubscriber — D-99-04 preserves
		// the existing fmp4 fanout path for mode:'desktop'.
		expect(block).toMatch(/streamManager\.addSubscriber\(streamId,\s*ws\)/)
	})
})
