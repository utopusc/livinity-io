// Phase 22 MH-03 — Selected Docker environment store.
//
// Single source of truth for the env id that scopes every Docker view in
// Server Control. Persisted to localStorage so the selection survives a
// reload. Default is the auto-seeded LOCAL_ENV_ID — existing single-host
// installs see no behavioural change.
//
// Notes
//   - The id is NEVER null; we fall back to LOCAL_ENV_ID at every layer so
//     the docker hooks can always pass a string into trpc inputs.
//   - We don't validate the id against `useEnvironments()` here (that's a
//     hook concern). The Server Control header reads the env list and, if
//     the persisted id is missing from it, the EnvironmentSelector resets
//     the selection to LOCAL_ENV_ID — see useEnvironmentGuard().

import {create} from 'zustand'
import {persist} from 'zustand/middleware'

export const LOCAL_ENV_ID = '00000000-0000-0000-0000-000000000000'

interface EnvironmentStore {
	selectedEnvironmentId: string
	setEnvironment: (id: string) => void
}

export const useEnvironmentStore = create<EnvironmentStore>()(
	persist(
		(set) => ({
			selectedEnvironmentId: LOCAL_ENV_ID,
			setEnvironment: (id) => set({selectedEnvironmentId: id || LOCAL_ENV_ID}),
		}),
		{
			name: 'livos:selectedEnvironmentId',
			// Only persist the id — the setter is rebuilt on hydrate.
			partialize: (state) => ({selectedEnvironmentId: state.selectedEnvironmentId}),
		},
	),
)

// Convenience hook for the docker.* hooks that only need the id.
export const useSelectedEnvironmentId = () =>
	useEnvironmentStore((s) => s.selectedEnvironmentId)
