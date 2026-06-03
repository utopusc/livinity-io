/**
 * Phase 257-03 Task 1 (WS-D — luse file exposure, LIVOS-010 / SC-D).
 *
 * `isPathAllowed` (computer_read_file's path guard) used to allow the WHOLE
 * `/home/<slug>/` prefix — so a computer-use agent driven by injected on-screen
 * or web content could read the operator's live AI-provider OAuth credentials
 * (~/.claude/.credentials.json, ~/.gemini/oauth_creds.json, ~/.kimi/*, ~/.ssh)
 * and exfiltrate the tokens via the base64-to-model read.
 *
 * These tests pin the credential/secret-dotfile DENYLIST (deny wins, enforced
 * AFTER the allowlist admit) that closes LIVOS-010 while keeping legitimate home
 * reads (Downloads / livos-files), the uploads dir, and the runtime tmp prefix
 * working. Mirrors the 256-01 files-sandbox "deny wins" + path-boundary shape.
 *
 * 6 cases:
 *   1. creds denied        — /home/bruce/.claude/.credentials.json → false
 *   2. gemini denied       — /home/bruce/.gemini/oauth_creds.json  → false
 *   3. kimi/ssh/config denied
 *   4. legit home allowed  — Downloads / livos-files               → true
 *   5. uploads + tmp allowed
 *   6. traversal/realpath guard intact — realpathed ../.claude target denied
 */

import {describe, expect, test, vi} from 'vitest'

// Mock the native primitives so importing tools.ts does not try to spawn
// xdotool/maim (isPathAllowed is pure, but the module pulls native at load).
vi.mock('../native/index.js', () => ({
	captureScreenshot: vi.fn(async () => ({base64: 'AAAA', mimeType: 'image/png', width: 1, height: 1})),
	moveMouse: vi.fn(async () => undefined),
	traceMouse: vi.fn(async () => undefined),
	clickMouse: vi.fn(async () => undefined),
	pressMouse: vi.fn(async () => undefined),
	dragMouse: vi.fn(async () => undefined),
	scroll: vi.fn(async () => undefined),
	typeKeys: vi.fn(async () => undefined),
	pressKeys: vi.fn(async () => undefined),
	typeText: vi.fn(async () => undefined),
	pasteText: vi.fn(async () => undefined),
	getCursorPosition: vi.fn(async () => ({x: 0, y: 0})),
}))

import {isPathAllowed, LIVOS_ROOT, LUSE_TMP_PREFIX} from './tools.js'

const SLUG = 'bruce'
const UID = 'bruce'

describe('isPathAllowed — LIVOS-010 credential/secret denylist (deny wins)', () => {
	test('Test 1 — ~/.claude/.credentials.json is DENIED', () => {
		expect(isPathAllowed('/home/bruce/.claude/.credentials.json', SLUG, UID)).toBe(false)
	})

	test('Test 2 — ~/.gemini/oauth_creds.json is DENIED', () => {
		expect(isPathAllowed('/home/bruce/.gemini/oauth_creds.json', SLUG, UID)).toBe(false)
	})

	test('Test 3 — ~/.kimi, ~/.ssh, ~/.config (and bare ~/.claude.json) are DENIED', () => {
		expect(isPathAllowed('/home/bruce/.kimi/credentials/x.json', SLUG, UID)).toBe(false)
		expect(isPathAllowed('/home/bruce/.ssh/id_ed25519', SLUG, UID)).toBe(false)
		expect(isPathAllowed('/home/bruce/.config/anything', SLUG, UID)).toBe(false)
		// LIVOS-034 — poisoned Claude Code project config must not be read back.
		expect(isPathAllowed('/home/bruce/.claude.json', SLUG, UID)).toBe(false)
	})

	test('Test 4 — legitimate home reads (Downloads / livos-files) are ALLOWED', () => {
		expect(isPathAllowed('/home/bruce/Downloads/report.pdf', SLUG, UID)).toBe(true)
		expect(isPathAllowed('/home/bruce/livos-files/a.txt', SLUG, UID)).toBe(true)
		// Path-boundary safety — a sibling whose name merely PREFIXES a denied
		// dir (`.claudeX`) must NOT be falsely denied.
		expect(isPathAllowed('/home/bruce/.claudeX/notes.txt', SLUG, UID)).toBe(true)
	})

	test('Test 5 — uploads dir + runtime tmp prefix still ALLOWED', () => {
		expect(isPathAllowed(`${LIVOS_ROOT}/data/uploads/${UID}/file.bin`, SLUG, UID)).toBe(true)
		expect(isPathAllowed(`${LUSE_TMP_PREFIX}abc/screenshot.png`, SLUG, UID)).toBe(true)
	})

	test('Test 6 — realpathed traversal target into a denied dir is DENIED', () => {
		// The production caller realpaths FIRST; the unit passes the realpathed
		// string to mirror that — `Downloads/../.claude/...` resolves to the
		// credential dir, which the denylist rejects.
		expect(
			isPathAllowed('/home/bruce/.claude/.credentials.json', SLUG, UID),
		).toBe(false)
	})
})
