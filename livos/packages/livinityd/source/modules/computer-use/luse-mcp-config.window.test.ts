// Phase 97-05 — multi-instance Luse MCP config tests (renamed P100-10-02
// from bytebot per D-100-10-B).
//
// Coverage:
//   T1 — buildLuseConfig({}, path) returns the host-display shape (name=
//        'luse', no LUSE_TARGET_WINDOW_ID).
//   T2 — buildLuseConfig({}, path, descriptor) returns a per-WebApp
//        variant: name=`luse:webapp:<instanceKey>`, env carries the
//        windowId, instanceKey separates two simultaneous instances.
//   T3 — Two descriptors with different windowIds produce distinct configs.
//   T4 — PER_WEBAPP_LUSE_INSTANCE_CAP is exported and equals 3.
//   T5 — LUSE_TARGET_WINDOW_ID_ENV constant is exported.

import {describe, it, expect} from 'vitest'
import {
	buildLuseConfig,
	LUSE_TARGET_WINDOW_ID_ENV,
	PER_WEBAPP_LUSE_INSTANCE_CAP,
} from './luse-mcp-config.js'

const PATH = '/opt/livos/packages/livinityd/source/modules/computer-use/mcp/server.ts'

describe('buildLuseConfig multi-instance support (P97-05)', () => {
	it('T1: no descriptor → host-display name "luse", no windowId env', () => {
		const cfg = buildLuseConfig({DISPLAY: ':0'} as NodeJS.ProcessEnv, PATH)
		expect(cfg.name).toBe('luse')
		expect(cfg.env?.[LUSE_TARGET_WINDOW_ID_ENV]).toBeUndefined()
		expect(cfg.command).toBe('tsx')
	})

	it('T2: with descriptor → namespaced name + LUSE_TARGET_WINDOW_ID env', () => {
		const cfg = buildLuseConfig({DISPLAY: ':0'} as NodeJS.ProcessEnv, PATH, {
			instanceKey: 'webapp-abc',
			windowId: 41943042,
		})
		expect(cfg.name).toBe('luse:webapp:webapp-abc')
		expect(cfg.env?.[LUSE_TARGET_WINDOW_ID_ENV]).toBe('41943042')
		// Underlying transport unchanged.
		expect(cfg.transport).toBe('stdio')
		expect(cfg.command).toBe('tsx')
		expect(cfg.args).toEqual([PATH])
	})

	it('T3: two distinct descriptors produce different configs', () => {
		const a = buildLuseConfig({} as NodeJS.ProcessEnv, PATH, {
			instanceKey: 'a',
			windowId: 1,
		})
		const b = buildLuseConfig({} as NodeJS.ProcessEnv, PATH, {
			instanceKey: 'b',
			windowId: 2,
		})
		expect(a.name).not.toBe(b.name)
		expect(a.env?.[LUSE_TARGET_WINDOW_ID_ENV]).toBe('1')
		expect(b.env?.[LUSE_TARGET_WINDOW_ID_ENV]).toBe('2')
	})

	it('T4: PER_WEBAPP_LUSE_INSTANCE_CAP equals 3 (Q4 default)', () => {
		expect(PER_WEBAPP_LUSE_INSTANCE_CAP).toBe(3)
	})

	it('T5: LUSE_TARGET_WINDOW_ID_ENV constant exported', () => {
		expect(LUSE_TARGET_WINDOW_ID_ENV).toBe('LUSE_TARGET_WINDOW_ID')
	})
})
