// Phase 97-05 — multi-instance bytebot MCP config tests.
//
// Coverage:
//   T1 — buildBytebotConfig({}, path) returns the host-display shape (name=
//        'bytebot', no BYTEBOT_TARGET_WINDOW_ID).
//   T2 — buildBytebotConfig({}, path, descriptor) returns a per-WebApp
//        variant: name=`bytebot:webapp:<instanceKey>`, env carries the
//        windowId, instanceKey separates two simultaneous instances.
//   T3 — Two descriptors with different windowIds produce distinct configs.
//   T4 — PER_WEBAPP_BYTEBOT_INSTANCE_CAP is exported and equals 3.
//   T5 — BYTEBOT_TARGET_WINDOW_ID_ENV constant is exported.

import {describe, it, expect} from 'vitest'
import {
	buildBytebotConfig,
	BYTEBOT_TARGET_WINDOW_ID_ENV,
	PER_WEBAPP_BYTEBOT_INSTANCE_CAP,
} from './bytebot-mcp-config.js'

const PATH = '/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'

describe('buildBytebotConfig multi-instance support (P97-05)', () => {
	it('T1: no descriptor → host-display name "bytebot", no windowId env', () => {
		const cfg = buildBytebotConfig({DISPLAY: ':0'} as NodeJS.ProcessEnv, PATH)
		expect(cfg.name).toBe('bytebot')
		expect(cfg.env?.[BYTEBOT_TARGET_WINDOW_ID_ENV]).toBeUndefined()
		expect(cfg.command).toBe('tsx')
	})

	it('T2: with descriptor → namespaced name + BYTEBOT_TARGET_WINDOW_ID env', () => {
		const cfg = buildBytebotConfig({DISPLAY: ':0'} as NodeJS.ProcessEnv, PATH, {
			instanceKey: 'webapp-abc',
			windowId: 41943042,
		})
		expect(cfg.name).toBe('bytebot:webapp:webapp-abc')
		expect(cfg.env?.[BYTEBOT_TARGET_WINDOW_ID_ENV]).toBe('41943042')
		// Underlying transport unchanged.
		expect(cfg.transport).toBe('stdio')
		expect(cfg.command).toBe('tsx')
		expect(cfg.args).toEqual([PATH])
	})

	it('T3: two distinct descriptors produce different configs', () => {
		const a = buildBytebotConfig({} as NodeJS.ProcessEnv, PATH, {
			instanceKey: 'a',
			windowId: 1,
		})
		const b = buildBytebotConfig({} as NodeJS.ProcessEnv, PATH, {
			instanceKey: 'b',
			windowId: 2,
		})
		expect(a.name).not.toBe(b.name)
		expect(a.env?.[BYTEBOT_TARGET_WINDOW_ID_ENV]).toBe('1')
		expect(b.env?.[BYTEBOT_TARGET_WINDOW_ID_ENV]).toBe('2')
	})

	it('T4: PER_WEBAPP_BYTEBOT_INSTANCE_CAP equals 3 (Q4 default)', () => {
		expect(PER_WEBAPP_BYTEBOT_INSTANCE_CAP).toBe(3)
	})

	it('T5: BYTEBOT_TARGET_WINDOW_ID_ENV constant exported', () => {
		expect(BYTEBOT_TARGET_WINDOW_ID_ENV).toBe('BYTEBOT_TARGET_WINDOW_ID')
	})
})
