// @vitest-environment jsdom
//
// Phase 101-07 Task 1 — useLaunchNativeApp source-text invariants.
//
// Phase 157 round 5 rewrite: the hook no longer fires `apps.native.spawn`
// directly. Spawn now happens inside NativeAppStreamWindow which mounts
// when WindowManager opens the `NATIVE_<id>` window. The hook's only
// job is to call windowManager.openWindow + surface a toast if the
// manager is unavailable. The old assertions (mutation call + return
// shape) no longer apply — the new contract is locked here.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — same precedent as 95-04 / 67-04). Per that
// precedent, this file ships source-text invariants that match the
// new openWindow contract.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-launch-native-app.ts')
const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')

describe('useLaunchNativeApp — source-text invariants', () => {
	it('uses WindowManager.openWindow with a NATIVE_ prefix', () => {
		expect(HOOK_SRC).toMatch(/useWindowManagerOptional/)
		expect(HOOK_SRC).toMatch(/NATIVE_/)
		expect(HOOK_SRC).toMatch(/openWindow/)
	})

	it('surfaces a sonner toast when WindowManager is unavailable', () => {
		expect(HOOK_SRC).toMatch(/from\s+['"]sonner['"]/)
		expect(HOOK_SRC).toMatch(/toast\.error/)
	})

	it('exports useLaunchNativeApp as a named export', () => {
		expect(HOOK_SRC).toMatch(/export\s+function\s+useLaunchNativeApp\b/)
	})

	it('accepts {id, name, iconUrl} launch arguments', () => {
		expect(HOOK_SRC).toMatch(/id\s*[:,}]/)
		expect(HOOK_SRC).toMatch(/name\s*[:,}]/)
		expect(HOOK_SRC).toMatch(/iconUrl/)
	})
})

describe('useLaunchNativeApp — smoke import', () => {
	it('loads without throwing', async () => {
		// Dynamic import — we are not invoking React hooks here, just verifying
		// the module compiles and resolves all its imports.
		await expect(import('./use-launch-native-app')).resolves.toBeTruthy()
	})
})
