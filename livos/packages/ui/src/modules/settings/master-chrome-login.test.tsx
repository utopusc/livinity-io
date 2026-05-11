// @vitest-environment jsdom
//
// Phase 102-07 Task 4 — MasterChromeLogin source-text invariants.
// Phase 103-02 Task 1 — extended for embedded noVNC viewer + chromeMaster.input.*
// wiring (REQ-103-A2, REQ-103-A3).
//
// `@testing-library/react` is NOT installed in @livos/ui (D-NO-NEW-DEPS).
// Mirrors the dock/native-app-icon.test.tsx pattern: source-text grep
// invariants over the component file + a smoke-import. Verifies the
// component wires the right tRPC hooks, button labels, AlertDialog, and
// admin-gated reset confirm.
//
// The behavioral tests from 103-02-PLAN.md (mouse/wheel/key/type dispatch on
// the viewer container) are encoded as source-text invariants over the
// wiring patterns — same pattern that protected r14a theme tokens in the
// original 102-07 suite (also driven by source-grep + smoke-import without
// rendering through react-testing-library).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const SRC_PATH = resolve(__dirname, 'master-chrome-login.tsx')
const SRC = readFileSync(SRC_PATH, 'utf8')

describe('MasterChromeLogin — title + status indicator', () => {
	it('renders "Chrome Master Login" title (D-102-MASTER-LOGIN-UI)', () => {
		expect(SRC).toMatch(/Chrome Master Login/)
	})

	it('renders "Logged in" / "Not logged in" status text (driven by status.data.hasCookies)', () => {
		expect(SRC).toMatch(/Logged in/)
		expect(SRC).toMatch(/Not logged in/)
		// The branch is keyed off hasCookies
		expect(SRC).toMatch(/hasCookies/)
	})

	it('renders "Master Chrome running" indicator (driven by status.data.running)', () => {
		expect(SRC).toMatch(/Master Chrome running/)
		expect(SRC).toMatch(/\.running/)
	})

	it('applies green class when loggedIn === true', () => {
		// loggedIn ? 'text-green-...' : 'text-...' ternary
		expect(SRC).toMatch(/text-green-/)
	})
})

describe('MasterChromeLogin — tRPC wiring', () => {
	it('polls trpcReact.chromeMaster.status (refetchInterval keeps the indicator current)', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.status\.useQuery/)
		expect(SRC).toMatch(/refetchInterval/)
	})

	it('startLogin button calls trpcReact.chromeMaster.startLogin.useMutation().mutate', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.startLogin\.useMutation/)
		expect(SRC).toMatch(/startMut\.mutate/)
	})

	it('reset confirm calls trpcReact.chromeMaster.reset.useMutation().mutate({backup: true})', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.reset\.useMutation/)
		expect(SRC).toMatch(/resetMut\.mutate\(\s*\{\s*backup\s*:\s*true\s*\}/)
	})

	it('invalidates chromeMaster.status after successful mutations', () => {
		expect(SRC).toMatch(/utils\.chromeMaster\.status\.invalidate/)
	})
})

describe('MasterChromeLogin — button labels + AlertDialog confirm', () => {
	it('shows "Open Master Chrome" button label', () => {
		expect(SRC).toMatch(/Open Master Chrome/)
	})

	it('shows "Reset Master Profile" destructive button (T-102-07c confirm gate)', () => {
		expect(SRC).toMatch(/Reset Master Profile/)
		// destructive variant signals data-loss UI affordance
		expect(SRC).toMatch(/variant=['"]destructive['"]/)
	})

	it('Reset button opens an AlertDialog (confirm-before-destroy)', () => {
		expect(SRC).toMatch(/<AlertDialog\b/)
		expect(SRC).toMatch(/<AlertDialogContent\b/)
		expect(SRC).toMatch(/<AlertDialogAction\b/)
		expect(SRC).toMatch(/<AlertDialogCancel\b/)
	})

	it('Reset AlertDialog mentions /opt/livos/data/chrome-master.backup (user-visible recovery path)', () => {
		expect(SRC).toMatch(/chrome-master\.backup/)
	})
})

describe('MasterChromeLogin — disabled-when-running affordances', () => {
	it('Open Master Chrome button is disabled while running (singleton-lock UX)', () => {
		// disabled={running || startMut.isPending}
		expect(SRC).toMatch(/disabled=\{[^}]*running[^}]*\}/)
	})

	it('Reset Master Profile button is disabled while running (cannot reset while master Chrome holds dir)', () => {
		// At least two disabled={...running...} sites — start + reset
		const matches = SRC.match(/disabled=\{[^}]*running[^}]*\}/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(2)
	})
})

describe('MasterChromeLogin — exports + smoke import', () => {
	it('exports MasterChromeLogin as a named export', () => {
		expect(SRC).toMatch(/export\s+function\s+MasterChromeLogin\b/)
	})

	it('module loads without throwing', async () => {
		await expect(import('./master-chrome-login')).resolves.toBeTruthy()
	})
})

// ---------------------------------------------------------------------------
// Phase 103-02 — Embedded noVNC viewer + input dispatch wiring
//
// REQ-103-A2 — viewer mounts when status.running && wsUrl
// REQ-103-A3 — viewer dispatches click/key/type/scroll via tRPC
// ---------------------------------------------------------------------------

describe('MasterChromeLogin — Phase 103-02 viewer mount gating (REQ-103-A2)', () => {
	it('imports useWebAppVnc from the hooks alias', () => {
		// Test 1: viewer hook must be imported (import + call site ≥ 2 hits)
		const hits = SRC.match(/useWebAppVnc/g) ?? []
		expect(hits.length).toBeGreaterThanOrEqual(2)
		expect(SRC).toMatch(/import\s*\{[^}]*useWebAppVnc[^}]*\}\s*from\s*['"]@\/hooks\/use-webapp-vnc['"]/)
	})

	it('reads wsUrl from status.data — gate is `running && wsUrl`', () => {
		// Test 2: wsUrl extracted from status query result
		expect(SRC).toMatch(/status\.data\?\.wsUrl/)
		// Render gate references both running + wsUrl
		expect(SRC).toMatch(/running\s*&&\s*wsUrl/)
	})

	it('renders viewer container with data-testid="master-chrome-viewer"', () => {
		// Test 2: viewer container is queryable by data-testid
		// Match both single and double quote variants
		const single = /data-testid='master-chrome-viewer'/.test(SRC)
		const double = /data-testid="master-chrome-viewer"/.test(SRC)
		expect(single || double).toBe(true)
	})

	it('attaches the noVNC RFB instance via vnc.containerRef', () => {
		// Test 2: hook's containerRef wired as ref={vnc.containerRef}
		expect(SRC).toMatch(/ref=\{vnc\.containerRef\}/)
	})

	it('viewer block is conditionally rendered (gated, not unconditional)', () => {
		// Test 1 + 8: when running:false the viewer block is NOT in the
		// returned JSX. Ternary `{running && wsUrl !== undefined ? (...) : null}`
		// (or the boolean-AND short-circuit form) IS the gate. Either is fine.
		const ternaryGate = /\{[^}]*running[^}]*wsUrl[^}]*\?\s*\(/.test(SRC)
		const ampGate = /\{[^}]*running\s*&&\s*wsUrl[^}]*\?/.test(SRC)
		expect(ternaryGate || ampGate).toBe(true)
	})

	it('viewer hook called with viewOnly: true', () => {
		// Hook contract: viewOnly:true disables RFB input forwarding so DOM
		// listeners on the container drive chromeMaster.input.* instead.
		expect(SRC).toMatch(/useWebAppVnc\([^)]*viewOnly:\s*true/)
	})
})

describe('MasterChromeLogin — Phase 103-02 input dispatch wiring (REQ-103-A3)', () => {
	it('wires chromeMaster.stopLogin.useMutation (Close button)', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.stopLogin\.useMutation/)
	})

	it('renders Close Master Chrome destructive button (Test 4)', () => {
		expect(SRC).toMatch(/Close Master Chrome/)
		// Close button calls stopMut.mutate (Test 4)
		expect(SRC).toMatch(/stopMut\.mutate\(\s*\)/)
	})

	it('Open button disabled while running (Test 3 setup) — disabled prop references running', () => {
		// Open button: disabled={running || startMut.isPending} — at least one
		// disabled clause references both running + startMut.isPending
		expect(SRC).toMatch(/disabled=\{[^}]*running[^}]*startMut\.isPending[^}]*\}/)
	})

	it('Close button disabled when NOT running (Test 4 setup)', () => {
		// disabled={!running || stopMut.isPending}
		expect(SRC).toMatch(/disabled=\{[^}]*!running[^}]*stopMut\.isPending[^}]*\}/)
	})

	it('wires chromeMaster.input.click.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.input\.click\.useMutation/)
	})

	it('wires chromeMaster.input.key.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.input\.key\.useMutation/)
	})

	it('wires chromeMaster.input.type.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.input\.type\.useMutation/)
	})

	it('wires chromeMaster.input.scroll.useMutation', () => {
		expect(SRC).toMatch(/trpcReact\.chromeMaster\.input\.scroll\.useMutation/)
	})

	it('Test 5 — mousedown handler dispatches inputClickMut.mutate({x, y, button, kind})', () => {
		// Handler shape per plan action step 5:
		//   inputClickMut.mutate({x: fb.x, y: fb.y, button, kind: 'mousedown'})
		expect(SRC).toMatch(/inputClickMut\.mutate\(\s*\{[^}]*x:\s*fb\.x[^}]*y:\s*fb\.y[^}]*button[^}]*kind:\s*['"]mousedown['"]/)
		expect(SRC).toMatch(/inputClickMut\.mutate\(\s*\{[^}]*kind:\s*['"]mouseup['"]/)
		// Button mapping mirrors webapp-stream-window.tsx: e.button===0 → 1
		expect(SRC).toMatch(/e\.button\s*===\s*1\s*\?\s*2\s*:\s*e\.button\s*===\s*2\s*\?\s*3\s*:\s*1/)
	})

	it('Test 6 — wheel handler dispatches inputScrollMut.mutate with direction + clicks', () => {
		// Plan step 5: direction='down' if deltaY > 0, clicks bounded [1, 50]
		expect(SRC).toMatch(/inputScrollMut\.mutate\(\s*\{[^}]*direction[^}]*clicks/)
		expect(SRC).toMatch(/deltaY\s*>\s*0\s*\?\s*['"]down['"]/)
		// clicks bounded
		expect(SRC).toMatch(/Math\.max\(1,\s*Math\.min\(50,/)
	})

	it('Test 7a — Enter key maps to "Return" via KEYSYM_MAP', () => {
		// KEYSYM_MAP['Enter'] === 'Return'
		expect(SRC).toMatch(/Enter:\s*['"]Return['"]/)
		// BackSpace, Escape, Tab, arrow keys all mapped
		expect(SRC).toMatch(/Backspace:\s*['"]BackSpace['"]/)
		expect(SRC).toMatch(/Escape:\s*['"]Escape['"]/)
		expect(SRC).toMatch(/Tab:\s*['"]Tab['"]/)
		expect(SRC).toMatch(/ArrowUp:\s*['"]Up['"]/)
		expect(SRC).toMatch(/ArrowDown:\s*['"]Down['"]/)
		expect(SRC).toMatch(/ArrowLeft:\s*['"]Left['"]/)
		expect(SRC).toMatch(/ArrowRight:\s*['"]Right['"]/)
	})

	it('Test 7b — special keys dispatch via inputKeyMut.mutate({key: mapped, kind: "keydown"})', () => {
		expect(SRC).toMatch(/inputKeyMut\.mutate\(\s*\{[^}]*key:\s*mapped[^}]*kind:\s*['"]keydown['"]/)
	})

	it('Test 7c — printable chars batched into inputTypeMut.mutate({text}) with 250ms debounce', () => {
		// Batching buffer + debounce flush:
		//   printableBuffer.current += e.key
		//   setTimeout(flushType, 250)
		//   inputTypeMut.mutate({text})
		expect(SRC).toMatch(/printableBuffer/)
		expect(SRC).toMatch(/setTimeout\(\s*flushType\s*,\s*250/)
		expect(SRC).toMatch(/inputTypeMut\.mutate\(\s*\{\s*text/)
		// Single-char printable detection
		expect(SRC).toMatch(/e\.key\.length\s*===\s*1/)
	})

	it('Test 8 — useEffect cleanup removes DOM listeners + clears flush timer', () => {
		// Cleanup return: removeEventListener for each + clearTimeout(flushTimerRef)
		expect(SRC).toMatch(/removeEventListener\(['"]mousedown['"]/)
		expect(SRC).toMatch(/removeEventListener\(['"]mouseup['"]/)
		expect(SRC).toMatch(/removeEventListener\(['"]wheel['"]/)
		expect(SRC).toMatch(/removeEventListener\(['"]keydown['"]/)
		expect(SRC).toMatch(/clearTimeout\(flushTimerRef/)
	})

	it('coord math — toFB converts client coords to FB coords with width/height guard', () => {
		// FB sizes locked to master Xvfb resolution
		expect(SRC).toMatch(/FB_WIDTH\s*=\s*1280/)
		expect(SRC).toMatch(/FB_HEIGHT\s*=\s*720/)
		// rect.width<=0 guard
		expect(SRC).toMatch(/rect\.width\s*<=\s*0/)
		// Integer rounding
		expect(SRC).toMatch(/Math\.round\(/)
	})

	it('input.* mutations omit the `display` argument (T-103-01-03 — derived from singleton)', () => {
		// Plan invariant: UI never passes display in mutation payload; the
		// backend reads currentMaster.display itself. Verify no input.*.mutate
		// call body contains a `display:` literal.
		const inputMutateBodies = SRC.match(/input(?:Click|Key|Type|Scroll)Mut\.mutate\(\s*\{[^}]+\}/g) ?? []
		expect(inputMutateBodies.length).toBeGreaterThan(0)
		for (const body of inputMutateBodies) {
			expect(body).not.toMatch(/\bdisplay\s*:/)
		}
	})
})

describe('MasterChromeLogin — Phase 103-02 theme preservation (Test 9 — r14a tokens MUST persist)', () => {
	// Hard contract from Phase 102 r14a (commit b7153be8) — these theme-aware
	// class tokens MUST NOT regress. If any of these grep checks ever turns
	// red, somebody hardcoded `text-white` etc. — revert immediately.
	it('preserves text-text-secondary (Status: label, etc.)', () => {
		expect(SRC).toMatch(/text-text-secondary/)
	})
	it('preserves text-text-primary (default text color)', () => {
		expect(SRC).toMatch(/text-text-primary/)
	})
	it('preserves text-green-600 dark:text-green-400 (logged-in indicator)', () => {
		expect(SRC).toMatch(/text-green-600 dark:text-green-400/)
	})
})
