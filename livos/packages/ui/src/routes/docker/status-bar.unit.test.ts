// Phase 24-02 — StatusBar smoke chain test.
//
// Renders-level testing the full StatusBar requires a render-test setup
// (jsdom + tRPC mocking + WS mocking) that adds friction for negligible
// signal — the layout file itself is mostly markup. We instead lock down
// the formatter chain the StatusBar depends on, so a refactor of format.ts
// can't silently break the StatusBar's display strings.

import {expect, test} from 'vitest'

import {formatDiskFree, formatRamGb, formatSocketType, formatUptime} from './format'

test('StatusBar formatter smoke chain', () => {
	// The exact strings rendered by the StatusBar pills.
	expect(formatUptime(86400 * 3 + 3600 * 14)).toBe('Up 3d 14h')
	expect(formatRamGb(16 * 1024 ** 3)).toBe('16.0 GB RAM')
	expect(formatDiskFree(500 * 1024 ** 3)).toBe('500.0 GB free')
	expect(formatSocketType('agent')).toBe('Agent')
})
