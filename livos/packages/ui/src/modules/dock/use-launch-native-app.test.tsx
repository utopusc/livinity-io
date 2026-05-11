// @vitest-environment jsdom
//
// Phase 101-07 Task 1 — useLaunchNativeApp source-text invariants.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — same precedent as 95-04 / 67-04 — see
// livos/packages/ui/src/lib/use-liv-agent-stream.unit.test.tsx and
// hooks/use-webapp-agent.unit.test.tsx).
//
// Per that precedent, this file ships **source-text invariants** that lock
// the contract with the launch-mutation path (`apps.native.spawn`), the
// toast-on-failure surface (sonner), and the {streamId, wsUrl} return
// shape coming back from native-routes.ts:265-272.
//
// Smoke import at the end checks the hook module loads without throwing.

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {describe, expect, it} from 'vitest'

const HOOK_PATH = resolve(__dirname, 'use-launch-native-app.ts')
const HOOK_SRC = readFileSync(HOOK_PATH, 'utf8')

describe('useLaunchNativeApp — source-text invariants', () => {
	it('calls trpcReact.apps.native.spawn.useMutation (Plan 101-07 step 1)', () => {
		expect(HOOK_SRC).toMatch(/trpcReact\.apps\.native\.spawn\.useMutation/)
	})

	it('passes {id} to mutateAsync (matches native-routes.ts spawnInput schema)', () => {
		// The route schema is z.object({id: z.string().uuid()}) — the hook
		// must forward exactly that shape.
		expect(HOOK_SRC).toMatch(/mutateAsync\s*\(\s*\{\s*id\s*[:,}]/)
	})

	it('returns the {streamId, wsUrl} payload from the spawn mutation', () => {
		// native-routes.ts:265-272 returns {id, pid, wid, port, streamId, wsUrl}.
		// The hook surfaces streamId + wsUrl to the caller for stream window mount.
		expect(HOOK_SRC).toMatch(/streamId/)
		expect(HOOK_SRC).toMatch(/wsUrl/)
	})

	it('shows a toast on mutation error via sonner (does not throw)', () => {
		expect(HOOK_SRC).toMatch(/from\s+['"]sonner['"]/)
		expect(HOOK_SRC).toMatch(/toast\.error/)
	})

	it('exports useLaunchNativeApp as a named export', () => {
		expect(HOOK_SRC).toMatch(/export\s+function\s+useLaunchNativeApp\b/)
	})

	it('returns null on failure (caller treats as no-op)', () => {
		expect(HOOK_SRC).toMatch(/return\s+null/)
	})
})

describe('useLaunchNativeApp — smoke import', () => {
	it('loads without throwing', async () => {
		// Dynamic import — we are not invoking React hooks here, just verifying
		// the module compiles and resolves all its imports.
		await expect(import('./use-launch-native-app')).resolves.toBeTruthy()
	})
})
