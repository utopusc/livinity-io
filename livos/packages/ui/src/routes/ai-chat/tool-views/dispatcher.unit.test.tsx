// Phase 68-04 — getToolView + useToolView routing tests (CONTEXT D-20).
//
// All P68 cases currently return GenericToolView (the day-1 fallback);
// P69 plans replace TODO(P69-NN) cases one-by-one with specific views.
// The reference-equality assertions below lock that contract: as P69
// lands BrowserToolView/CommandToolView/etc., the matching `toBe(
// GenericToolView)` check will flip to `toBe(BrowserToolView)` etc. and
// flag any forgotten case.
//
// D-NO-NEW-DEPS: pure-function dispatcher, no React rendering required.
// useToolView is intentionally NOT exercised here — testing a hook
// requires @testing-library/react which P68 forbids. The hook is a thin
// useMemo wrapper around getToolView; covering getToolView covers the
// useful behavior.

import {describe, expect, it} from 'vitest'

import {getToolView} from './dispatcher'
import {GenericToolView} from './generic-tool-view'

describe('getToolView (CONTEXT D-20)', () => {
	it('returns GenericToolView for browser-* tools (P68 fallback)', () => {
		expect(getToolView('browser-navigate')).toBe(GenericToolView)
		expect(getToolView('browser-click')).toBe(GenericToolView)
	})

	it('returns GenericToolView for computer-use-* tools', () => {
		expect(getToolView('computer-use-screenshot')).toBe(GenericToolView)
	})

	it('returns GenericToolView for terminal tools', () => {
		expect(getToolView('execute-command')).toBe(GenericToolView)
	})

	it('returns GenericToolView for MCP tools', () => {
		expect(getToolView('mcp_brave_search')).toBe(GenericToolView)
		expect(getToolView('mcp-anthropic-search')).toBe(GenericToolView)
	})

	it('returns GenericToolView for unknown tool names (default fallback)', () => {
		expect(getToolView('completely-unknown-tool')).toBe(GenericToolView)
		expect(getToolView('')).toBe(GenericToolView)
	})

	it('returns the same component reference on repeated calls', () => {
		const a = getToolView('browser-navigate')
		const b = getToolView('browser-navigate')
		expect(a).toBe(b)
	})
})
