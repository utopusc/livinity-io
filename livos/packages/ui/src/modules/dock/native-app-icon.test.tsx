// @vitest-environment jsdom
//
// Phase 101-07 Task 3 — NativeAppIcon source-text invariants.
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS). Tests are
// source-text invariants per ui-package convention.
//
// NativeAppIcon is the dock icon for a persisted NativeAppConfig. Visually
// identical to WebAppIcon (94-04): wraps <AppIcon> + <ContextMenu> +
// <AlertDialog> for Remove confirmation. The click handler routes through
// useLaunchNativeApp (Task 1) which fires apps.native.spawn (101-05).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const ICON_PATH = resolve(__dirname, 'native-app-icon.tsx')
const ICON_SRC = readFileSync(ICON_PATH, 'utf8')

const DESKTOP_DIR = resolve(__dirname, '..', 'desktop')
const DOCK_ITEM_PATH = resolve(DESKTOP_DIR, 'dock-item.tsx')
const DOCK_ITEM_SRC = readFileSync(DOCK_ITEM_PATH, 'utf8')

describe('NativeAppIcon — wraps AppIcon + ContextMenu + AlertDialog (mirror of WebAppIcon)', () => {
	it('imports useLaunchNativeApp from the local hook (Task 1)', () => {
		expect(ICON_SRC).toMatch(/from\s+['"]\.\/use-launch-native-app['"]/)
	})

	it('wires AppIcon with label, src, onClick, state=ready', () => {
		expect(ICON_SRC).toMatch(/<AppIcon\b[^>]*label=/)
		expect(ICON_SRC).toMatch(/<AppIcon\b[^>]*src=/)
		expect(ICON_SRC).toMatch(/<AppIcon\b[^>]*onClick=/)
		expect(ICON_SRC).toMatch(/state=['"]ready['"]/)
	})

	it('uses ContextMenu primitive for right-click menu', () => {
		expect(ICON_SRC).toMatch(/<ContextMenu\b/)
		expect(ICON_SRC).toMatch(/<ContextMenuTrigger\b/)
		expect(ICON_SRC).toMatch(/<ContextMenuItem\b/)
	})

	it('Remove Native App menu item is destructive-styled', () => {
		expect(ICON_SRC).toMatch(/Remove Native App/)
		expect(ICON_SRC).toMatch(/rootDestructive/)
	})

	it('opens an AlertDialog on Remove click (confirm-before-destroy)', () => {
		expect(ICON_SRC).toMatch(/<AlertDialog\b/)
		expect(ICON_SRC).toMatch(/showRemoveConfirm/)
	})
})

describe('NativeAppIcon — tRPC wiring', () => {
	it('calls trpcReact.apps.native.delete.useMutation for removal', () => {
		expect(ICON_SRC).toMatch(/trpcReact\.apps\.native\.delete\.useMutation/)
	})

	it('invalidates apps.native.list after a successful delete', () => {
		expect(ICON_SRC).toMatch(/apps\.native\.list\.invalidate/)
	})

	it('passes {id} to delete mutateAsync (matches native-routes.ts deleteInput)', () => {
		expect(ICON_SRC).toMatch(/deleteMut\.mutateAsync\s*\(\s*\{\s*id\s*[:,}]/)
	})

	it('invokes useLaunchNativeApp().launch on icon click with id + name (+ iconUrl P157 round 5)', () => {
		// Phase 157 round 5 — launch now passes iconUrl alongside id +
		// name so the window chrome can show the right icon. Keep the
		// regex permissive about trailing args so future additions
		// (e.g. windowGeometry hints) don't break the contract test.
		expect(ICON_SRC).toMatch(/launch\s*\(\s*\{\s*id\s*,\s*name/)
	})
})

describe('NativeAppIcon — exports', () => {
	it('exports NativeAppIcon as a named export', () => {
		expect(ICON_SRC).toMatch(/export\s+function\s+NativeAppIcon\b/)
	})

	it('exports a NativeAppIconProps type with {id, name, iconUrl?}', () => {
		expect(ICON_SRC).toMatch(/(?:export\s+(?:interface|type)\s+NativeAppIconProps)/)
		expect(ICON_SRC).toMatch(/\bid\s*:\s*string\b/)
		expect(ICON_SRC).toMatch(/\bname\s*:\s*string\b/)
		expect(ICON_SRC).toMatch(/iconUrl\??\s*:/)
	})
})

describe('NativeAppIcon — smoke import', () => {
	it('loads without throwing', async () => {
		await expect(import('./native-app-icon')).resolves.toBeTruthy()
	})
})

describe('dock-item.tsx — discriminates webapp vs native (Plan 101-07 Task 3)', () => {
	it('imports NativeAppIcon for the native render path', () => {
		// Acceptance: grep -q "apps\.native\.list\.useQuery\|NativeAppIcon"
		// We satisfy with NativeAppIcon import (the cleaner choice — keeps the
		// data query close to the icon component).
		expect(DOCK_ITEM_SRC).toMatch(/NativeAppIcon/)
	})
})
