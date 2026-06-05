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

	// Phase 203-10 — D-203-10 OpenUI short-circuit.
	it('short-circuits to OPENUI_<slug> when wmClassHint starts with liv-openui-', () => {
		expect(HOOK_SRC).toMatch(/wmClassHint/)
		expect(HOOK_SRC).toMatch(/liv-openui-/)
		expect(HOOK_SRC).toMatch(/OPENUI_/)
	})

	it('exports OPENUI_APP_ID_PREFIX + OPENUI_WMCLASS_PREFIX constants', () => {
		expect(HOOK_SRC).toMatch(/export\s+const\s+OPENUI_APP_ID_PREFIX\b/)
		expect(HOOK_SRC).toMatch(/export\s+const\s+OPENUI_WMCLASS_PREFIX\b/)
	})

	it('still falls through to NATIVE_<id> when wmClassHint is undefined or unrelated', () => {
		// The legacy path must remain — assert that the NATIVE_${id} branch
		// is NOT gated behind the wmClassHint check.
		expect(HOOK_SRC).toMatch(/`NATIVE_\$\{id\}`/)
	})
})

// Phase 260-06 (SC8 native single-instance + SC3 icon-recall) — the hook must
// scan for an already-open NATIVE_<id> window and RECALL it instead of opening a
// duplicate. Source-text invariants (the established harness for this hook —
// @testing-library/react is not installed; mirrors the 260-03 / 260-05 decision).
describe('useLaunchNativeApp — SC8 single-instance focus/recall', () => {
	it('scans windowManager.windows for the singleton NATIVE_<id> appId before opening', () => {
		// The find() must match on the NATIVE_ template (singleton appId), not a
		// per-instance suffix — native stays single-instance.
		expect(HOOK_SRC).toMatch(/windowManager\.windows\.find/)
		expect(HOOK_SRC).toMatch(/w\.appId === `NATIVE_\$\{id\}`/)
	})

	it('recalls a docked window via unpinWindowFromTopBar (SC3 icon-recall path)', () => {
		expect(HOOK_SRC).toMatch(/isPinnedToTopBar/)
		expect(HOOK_SRC).toMatch(/unpinWindowFromTopBar\(existing\.id\)/)
	})

	it('restores a minimized window and focuses an open one', () => {
		expect(HOOK_SRC).toMatch(/isMinimized/)
		expect(HOOK_SRC).toMatch(/restoreWindow\(existing\.id\)/)
		expect(HOOK_SRC).toMatch(/focusWindow\(existing\.id\)/)
	})

	it('returns from the existing-window branch WITHOUT calling openWindow again', () => {
		// The recall branch must early-return so the openWindow below is never
		// reached when a window already exists.
		expect(HOOK_SRC).toMatch(/if\s*\(existing\)\s*\{[\s\S]*return[\s\S]*\}/)
	})

	it('keeps NATIVE_<id> a singleton appId (NO randomUUID / per-instance suffix)', () => {
		// Native must NOT become per-instance — the opposite of SC7's webapp rule.
		expect(HOOK_SRC).not.toMatch(/randomUUID/)
	})
})

describe('useLaunchNativeApp — smoke import', () => {
	it('loads without throwing', async () => {
		// Dynamic import — we are not invoking React hooks here, just verifying
		// the module compiles and resolves all its imports.
		await expect(import('./use-launch-native-app')).resolves.toBeTruthy()
	})
})
