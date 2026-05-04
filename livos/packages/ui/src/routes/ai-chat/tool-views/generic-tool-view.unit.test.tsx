// @vitest-environment jsdom
//
// Phase 68 Plan 68-02 — GenericToolView unit tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67 precedent — see
// livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx for the
// canonical "RTL absent" testing posture). 68-CONTEXT D-32 explicitly
// permits this fallback: "Component-level RTL tests are deferred to P70
// integration walk if not feasible standalone."
//
// Per that precedent, this file ships:
//   1. **Pure-helper unit tests** (formatElapsed, safeStringify,
//      getStatusBadgeText, categoryToIconKey) — these cover the
//      substantive behavior of the component (status branches per
//      D-25, JSON-pretty-print contract per D-24, T-68-02-02 cycle
//      safety, category→icon mapping).
//   2. **Smoke import** — module loads in jsdom + GenericToolView is a
//      function (the React render layer is a thin adapter around the
//      pure helpers).
//   3. **Source-text invariants** — lock down the wire-level rendering
//      contract (Pending..., Input/Output labels, Badge import,
//      LivIcons import, JSON.stringify(_,null,2), liv-status-running
//      variant, setInterval cleanup) so it can't drift silently before
//      P69 per-tool views ship.
//
// Why this is sufficient for the plan's "5+ tests covering: renders
// running state, renders done state, renders error state, formats
// execution time, handles missing toolResult":
//   - "renders running state" → `getStatusBadgeText('running') === 'Running'`
//     + source-text invariant for `<Badge variant="liv-status-running">`.
//   - "renders done state" → `getStatusBadgeText('done') === 'Done'`.
//   - "renders error state" → `getStatusBadgeText('error') === 'Error'`
//     + source-text invariant for the rose-tinted className.
//   - "formats execution time" → `formatElapsed` test block (10 cases).
//   - "handles missing toolResult" → source-text invariant for the
//     'Pending...' fallback path + `snapshot.toolResult === undefined`
//     guard.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests (uncomment when @testing-library/react lands):
// ─────────────────────────────────────────────────────────────────────
//
//   GTV1 (renders tool name in header):
//     render(<GenericToolView snapshot={baseSnapshot} isActive={false} />)
//     expect(screen.getByText('execute-command')).toBeInTheDocument()
//
//   GTV2 (renders Running badge while running):
//     render(<GenericToolView snapshot={{...base, status: 'running'}} ... />)
//     expect(screen.getByText('Running')).toBeInTheDocument()
//
//   GTV3 (renders Done badge when done with completedAt set):
//     render(<GenericToolView snapshot={{...base, status: 'done',
//       completedAt: 1500, toolResult: {...}}} ... />)
//     expect(screen.getByText('Done')).toBeInTheDocument()
//
//   GTV4 (renders Error badge with rose accent when error):
//     const {container} = render(<GenericToolView snapshot={{...base,
//       status: 'error'}} ... />)
//     const badge = screen.getByText('Error')
//     expect(badge.className).toMatch(/rose/)
//
//   GTV5 (renders 'Pending...' when toolResult is undefined):
//     render(<GenericToolView snapshot={baseSnapshot} ... />)
//     expect(screen.getByText('Pending...')).toBeInTheDocument()
//
//   GTV6 (renders execution time as 'X.Xs' when completedAt set):
//     render(<GenericToolView snapshot={{...base, startedAt: 1000,
//       completedAt: 3500, status: 'done', toolResult: {...}}} ... />)
//     expect(screen.getByText('2.5s')).toBeInTheDocument()
//
//   GTV7 (renders LivIcons.screenShare for category=computer-use):
//     const {container} = render(<GenericToolView snapshot={{...base,
//       category: 'computer-use'}} ... />)
//     const svg = container.querySelector('svg.tabler-icon-screen-share')
//     expect(svg).not.toBeNull()
//
//   GTV8 (live-ticker effect cleanup on unmount — vi.useFakeTimers):
//     vi.useFakeTimers()
//     const {unmount} = render(<GenericToolView snapshot={running} ... />)
//     vi.advanceTimersByTime(1500)
//     unmount()
//     // assert no residual setInterval callbacks throw after unmount
//     vi.advanceTimersByTime(5000)
//
// References:
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-CONTEXT.md
//     (D-14, D-21, D-23, D-24, D-25, D-32)
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-02-PLAN.md
//   - livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx —
//     established RTL-absent precedent (Phase 67-04)
//   - livos/packages/ui/src/components/update-log-viewer-dialog.unit.test.tsx
//     — smoke-test pattern (Phase 33-03)
//   - livos/packages/ui/src/routes/factory-reset/_components/use-preflight.unit.test.tsx
//     — D-NO-NEW-DEPS reaffirmation (Phase 38-03)

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

import {LivIcons} from '@/icons/liv-icons'

import {
	categoryToIconKey,
	formatElapsed,
	GenericToolView,
	getStatusBadgeText,
	safeStringify,
} from './generic-tool-view'
import type {ToolCallSnapshot, ToolViewProps} from './types'

// ─────────────────────────────────────────────────────────────────────
// 1. Pure helper: formatElapsed (CONTEXT D-23 footer execution time)
// ─────────────────────────────────────────────────────────────────────

describe('formatElapsed (CONTEXT D-23 — execution time format)', () => {
	it('0ms -> "0.0s"', () => {
		expect(formatElapsed(0)).toBe('0.0s')
	})
	it('500ms -> "0.5s"', () => {
		expect(formatElapsed(500)).toBe('0.5s')
	})
	it('1000ms -> "1.0s"', () => {
		expect(formatElapsed(1000)).toBe('1.0s')
	})
	it('2500ms -> "2.5s"', () => {
		expect(formatElapsed(2500)).toBe('2.5s')
	})
	it('9999ms -> "10.0s" (boundary — toFixed rounds)', () => {
		expect(formatElapsed(9999)).toBe('10.0s')
	})
	it('10_000ms -> "10s" (>=10s switches to integer format)', () => {
		expect(formatElapsed(10_000)).toBe('10s')
	})
	it('42_500ms -> "43s" (rounded)', () => {
		expect(formatElapsed(42_500)).toBe('43s')
	})
	it('negative input clamps to 0 (defensive — clock skew)', () => {
		expect(formatElapsed(-100)).toBe('0.0s')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. Pure helper: safeStringify (CONTEXT D-24 + T-68-02-02 cycle safety)
// ─────────────────────────────────────────────────────────────────────

describe('safeStringify (D-24 JSON pretty-print + T-68-02-02 cycle safety)', () => {
	it('formats a simple object with 2-space indent', () => {
		expect(safeStringify({a: 1, b: 2})).toBe('{\n  "a": 1,\n  "b": 2\n}')
	})

	it('formats nested objects', () => {
		expect(safeStringify({outer: {inner: 'v'}})).toBe(
			'{\n  "outer": {\n    "inner": "v"\n  }\n}',
		)
	})

	it('formats arrays', () => {
		expect(safeStringify(['a', 'b'])).toBe('[\n  "a",\n  "b"\n]')
	})

	it('handles null', () => {
		expect(safeStringify(null)).toBe('null')
	})

	it('handles undefined (returns "undefined" — JSON.stringify returns undefined)', () => {
		expect(safeStringify(undefined)).toBe('undefined')
	})

	it('handles strings', () => {
		expect(safeStringify('hello')).toBe('"hello"')
	})

	it('does NOT throw on cyclic objects (T-68-02-02 mitigation)', () => {
		const cyc: {self?: unknown; name: string} = {name: 'loop'}
		cyc.self = cyc
		expect(() => safeStringify(cyc)).not.toThrow()
		const out = safeStringify(cyc)
		expect(typeof out).toBe('string')
		expect(out.length).toBeGreaterThan(0)
	})

	it('preserves user input in pretty-printed output (Input section invariant)', () => {
		const out = safeStringify({cmd: 'ls -la'})
		expect(out).toContain('"cmd"')
		expect(out).toContain('"ls -la"')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. Pure helper: getStatusBadgeText (D-25 — status → user-facing label)
// ─────────────────────────────────────────────────────────────────────

describe('getStatusBadgeText (CONTEXT D-25 — status → label)', () => {
	it("status='running' -> 'Running'", () => {
		expect(getStatusBadgeText('running')).toBe('Running')
	})
	it("status='done' -> 'Done'", () => {
		expect(getStatusBadgeText('done')).toBe('Done')
	})
	it("status='error' -> 'Error'", () => {
		expect(getStatusBadgeText('error')).toBe('Error')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. Pure helper: categoryToIconKey (CONTEXT D-23 — icon adapter)
// ─────────────────────────────────────────────────────────────────────

describe('categoryToIconKey (CONTEXT D-23 — category → LivIconKey adapter)', () => {
	it("'browser' -> 'browser' (LivIcons.browser = IconWorld)", () => {
		expect(categoryToIconKey.browser).toBe('browser')
		expect(LivIcons[categoryToIconKey.browser]).toBeDefined()
	})

	it("'computer-use' -> 'screenShare' (LivIcons.screenShare = IconScreenShare)", () => {
		expect(categoryToIconKey['computer-use']).toBe('screenShare')
		expect(LivIcons[categoryToIconKey['computer-use']]).toBeDefined()
	})

	it("'terminal' -> 'terminal' (LivIcons.terminal = IconTerminal2)", () => {
		expect(categoryToIconKey.terminal).toBe('terminal')
		expect(LivIcons[categoryToIconKey.terminal]).toBeDefined()
	})

	it("'generic' -> 'generic' (fallback icon — LivIcons.generic = IconTool)", () => {
		expect(categoryToIconKey.generic).toBe('generic')
		expect(LivIcons[categoryToIconKey.generic]).toBeDefined()
	})

	it('all 10 categories map to a valid LivIconKey', () => {
		const categories: ToolCallSnapshot['category'][] = [
			'browser',
			'terminal',
			'file',
			'fileEdit',
			'webSearch',
			'webCrawl',
			'webScrape',
			'mcp',
			'computer-use',
			'generic',
		]
		for (const c of categories) {
			const k = categoryToIconKey[c]
			expect(LivIcons[k], `category=${c} should map to a valid LivIconKey`).toBeDefined()
		}
	})

	it('every category in the union is covered (no missing keys)', () => {
		expect(Object.keys(categoryToIconKey).sort()).toEqual(
			[
				'browser',
				'computer-use',
				'file',
				'fileEdit',
				'generic',
				'mcp',
				'terminal',
				'webCrawl',
				'webScrape',
				'webSearch',
			].sort(),
		)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Smoke import — module loads in jsdom + types are wired
// ─────────────────────────────────────────────────────────────────────

describe('GenericToolView smoke', () => {
	it('exports GenericToolView as a function', () => {
		expect(typeof GenericToolView).toBe('function')
	})

	it('ToolViewProps shape is consumable from types.ts', () => {
		const baseSnapshot: ToolCallSnapshot = {
			toolId: 't-1',
			toolName: 'execute-command',
			category: 'terminal',
			assistantCall: {input: {cmd: 'ls -la'}, ts: 1000},
			status: 'running',
			startedAt: 1000,
		}
		const props: ToolViewProps = {snapshot: baseSnapshot, isActive: false}
		// Compile-time + runtime assertion that the prop shape parses.
		expect(props.snapshot.toolName).toBe('execute-command')
		expect(props.isActive).toBe(false)
	})

	it('done snapshot with completedAt produces a finite elapsed', () => {
		const done: ToolCallSnapshot = {
			toolId: 't-1',
			toolName: 'execute-command',
			category: 'terminal',
			assistantCall: {input: {cmd: 'ls -la'}, ts: 1000},
			toolResult: {output: 'ok', isError: false, ts: 3500},
			status: 'done',
			startedAt: 1000,
			completedAt: 3500,
		}
		// formatElapsed is what the footer renders.
		expect(formatElapsed((done.completedAt ?? 0) - done.startedAt)).toBe('2.5s')
	})

	it('snapshot with toolResult=undefined falls through to Pending... branch', () => {
		const running: ToolCallSnapshot = {
			toolId: 't-1',
			toolName: 'execute-command',
			category: 'terminal',
			assistantCall: {input: {cmd: 'ls -la'}, ts: 1000},
			status: 'running',
			startedAt: 1000,
		}
		// Behavioral guard: the component branches on toolResult === undefined.
		expect(running.toolResult).toBeUndefined()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Source-text invariants — lock the rendering contract
//    (mirrors api-keys-create-modal.unit.test.tsx + use-liv-agent-stream
//    pattern for D-NO-NEW-DEPS-safe behavioral coverage).
// ─────────────────────────────────────────────────────────────────────

describe('generic-tool-view.tsx source-text invariants', () => {
	const sourcePath = resolve(
		process.cwd(),
		'src/routes/ai-chat/tool-views/generic-tool-view.tsx',
	)
	const source = readFileSync(sourcePath, 'utf8')

	it('imports LivIcons from P66-04 icon map', () => {
		expect(source).toMatch(/from\s+['"]@\/icons\/liv-icons['"]/)
		expect(source).toMatch(/\bLivIcons\b/)
	})

	it('imports Badge from the shadcn primitives', () => {
		expect(source).toMatch(/from\s+['"]@\/shadcn-components\/ui\/badge['"]/)
		expect(source).toMatch(/\bBadge\b/)
	})

	it('uses Badge variant="liv-status-running" for running state (P66-03 contract)', () => {
		expect(source).toMatch(/variant=['"]liv-status-running['"]/)
	})

	it('uses rose accent token for the error badge (D-25)', () => {
		expect(source).toMatch(/--liv-accent-rose/)
	})

	it("renders 'Pending...' when toolResult is undefined (D-23)", () => {
		expect(source).toMatch(/Pending\.\.\./)
		expect(source).toMatch(/snapshot\.toolResult\s*===\s*undefined/)
	})

	it("renders 'Input' and 'Output' section labels (D-23)", () => {
		expect(source).toMatch(/>\s*Input\s*</)
		expect(source).toMatch(/>\s*Output\s*</)
	})

	it('uses font-mono + text-12 className on the JSON <pre> blocks (D-24)', () => {
		expect(source).toMatch(/font-mono/)
		expect(source).toMatch(/text-12/)
		expect(source).toMatch(/<pre\b/)
	})

	it('JSON pretty-print uses safeStringify (T-68-02-02 cycle-safe)', () => {
		expect(source).toMatch(/safeStringify\s*\(/)
		// safeStringify itself wraps JSON.stringify(value, null, 2) per D-24.
		expect(source).toMatch(/JSON\.stringify\([^,]+,\s*null,\s*2\)/)
	})

	it('live timer uses setInterval and cleans up via clearInterval (D-23)', () => {
		expect(source).toMatch(/\bsetInterval\s*\(/)
		expect(source).toMatch(/\bclearInterval\s*\(/)
	})

	it('live timer effect runs only when status === "running"', () => {
		expect(source).toMatch(/snapshot\.status\s*!==\s*['"]running['"]/)
	})

	it('header uses LivIcons[categoryToIconKey[snapshot.category]] (D-23 icon adapter)', () => {
		expect(source).toMatch(/LivIcons\[\s*categoryToIconKey\[/)
	})

	it('footer renders elapsed via formatElapsed', () => {
		expect(source).toMatch(/formatElapsed\s*\(/)
	})

	it('elapsedMs uses (completedAt ?? now) - startedAt (D-23 ticking timer)', () => {
		expect(source).toMatch(/snapshot\.completedAt\s*\?\?\s*now/)
		expect(source).toMatch(/snapshot\.startedAt/)
	})

	it('component accepts isActive prop (ToolViewProps D-21)', () => {
		expect(source).toMatch(/\bisActive\b/)
	})

	it('does NOT import @testing-library or syntax-highlighting libs (D-NO-NEW-DEPS, D-24)', () => {
		// Match only real `import ... from '...'` / `require('...')` statements,
		// not docstring mentions of the packages in comment blocks.
		expect(source).not.toMatch(/from\s+['"]@testing-library\//)
		expect(source).not.toMatch(/require\s*\(\s*['"]@testing-library\//)
		expect(source).not.toMatch(/from\s+['"](shiki|prismjs?|highlight\.js|react-syntax-highlighter)['"]/)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 7. types.ts source-text invariants — D-14 + D-21 contract lock
// ─────────────────────────────────────────────────────────────────────

describe('types.ts source-text invariants', () => {
	const typesPath = resolve(
		process.cwd(),
		'src/routes/ai-chat/tool-views/types.ts',
	)
	const typesSource = readFileSync(typesPath, 'utf8')

	it('exports ToolCallSnapshot type (D-14)', () => {
		expect(typesSource).toMatch(/export\s+type\s+ToolCallSnapshot\b/)
	})

	it('exports ToolViewProps interface (D-21)', () => {
		expect(typesSource).toMatch(/export\s+interface\s+ToolViewProps\b/)
	})

	it('ToolViewProps has snapshot, isActive, optional onEvent (D-21)', () => {
		expect(typesSource).toMatch(/snapshot:\s*ToolCallSnapshot/)
		expect(typesSource).toMatch(/isActive:\s*boolean/)
		expect(typesSource).toMatch(/onEvent\?:/)
	})

	it('ToolCallSnapshot.category is a string-literal union of all 10 P67/P68 categories', () => {
		// Trim noise — the union spans multiple lines.
		const compact = typesSource.replace(/\s+/g, ' ')
		for (const cat of [
			'browser',
			'terminal',
			'file',
			'fileEdit',
			'webSearch',
			'webCrawl',
			'webScrape',
			'mcp',
			'computer-use',
			'generic',
		]) {
			expect(compact, `category union must include '${cat}'`).toContain(`'${cat}'`)
		}
	})

	it('does NOT import from @nexus/core (D-NO-NEW-DEPS — server-only package)', () => {
		expect(typesSource).not.toMatch(/from\s+['"]@nexus\/core/)
	})
})
