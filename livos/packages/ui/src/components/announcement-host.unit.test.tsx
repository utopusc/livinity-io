// @vitest-environment jsdom
//
// Phase 292 — AnnouncementHost source-invariant tests. Mocking the full
// trpcReact + theme provider tree is heavy in this RTL-absent package, so this
// locks the security/behavior-critical invariants by source text (same lightest
// precedent the iframe test uses for its no-inline-render assertion).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

// vitest cwd is the ui package root.
const SOURCE = readFileSync(
	resolve(process.cwd(), 'src/components/announcement-host.tsx'),
	'utf8',
)
const DIALOG_SOURCE = readFileSync(
	resolve(process.cwd(), 'src/shadcn-components/ui/dialog.tsx'),
	'utf8',
)
const TOPBAR_SOURCE = readFileSync(
	resolve(process.cwd(), 'src/modules/desktop/top-bar.tsx'),
	'utf8',
)

describe('AnnouncementHost (source invariants)', () => {
	it('reads the box cache via announcements.listActive', () => {
		expect(SOURCE).toContain('announcements.listActive')
	})

	it('routes raw HTML through the sandboxed iframe and never inline', () => {
		expect(SOURCE).toContain('AnnouncementIframe')
		expect(SOURCE).not.toContain('dangerouslySetInnerHTML')
	})

	it('wires markSeen / submitVote / submitFeedback through tRPC', () => {
		expect(SOURCE).toContain('markSeen')
		expect(SOURCE).toContain('submitVote')
		expect(SOURCE).toContain('submitFeedback')
	})

	it('renders both native blocks and the raw-HTML path', () => {
		expect(SOURCE).toContain('BlockView')
		expect(SOURCE).toContain('raw_html_sanitized')
	})

	it('has no hardcoded hex colors (theme-token classes only)', () => {
		expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{6}/)
	})
})

// DEC-12 (RESEARCH Pitfall 11) — the announcement dialog must stack ABOVE the
// Phase-291 command bar so its dismiss control is never obscured. The dialog
// uses zIndex 99999 (dialog.tsx); the command-bar motion.nav uses Tailwind
// z-50 (top-bar.tsx). A future refactor that drops the dialog below the nav
// fails this test.
describe('DEC-12 — announcement dialog stacks above the Phase-291 command bar', () => {
	it('dialog zIndex 99999 > command-bar z-50', () => {
		const dialogMatch = DIALOG_SOURCE.match(/zIndex:\s*(\d+)/)
		const navMatch = TOPBAR_SOURCE.match(/relative z-(\d+)/)
		const dialogZ = dialogMatch ? Number(dialogMatch[1]) : 0
		const navZ = navMatch ? Number(navMatch[1]) : 0
		expect(DIALOG_SOURCE).toContain('zIndex: 99999')
		expect(TOPBAR_SOURCE).toContain('z-50')
		expect(dialogZ).toBe(99999)
		expect(navZ).toBe(50)
		expect(dialogZ).toBeGreaterThan(navZ)
	})
})
