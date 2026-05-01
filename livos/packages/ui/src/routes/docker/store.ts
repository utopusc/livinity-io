// Phase 24-01 — Docker app section + sidebar store.
//
// Drives the Sidebar (left) and DockerApp (right pane) via a zustand store.
// Persisted to localStorage so a user's last section + sidebar collapsed
// state survives reopening the Docker window or reloading the browser.
//
// Why a store instead of URL routing: section navigation INSIDE the docker
// app is a Phase 24-29 internal-state concern. Deep-linking
// (e.g. `/docker/containers/n8n` opens the container detail panel) is the
// explicit deliverable of Plan 26-01 (DOC-20) — building it here would
// pre-empt that planner's choice of route shape.
//
// Persistence key: `livos:docker:sidebar-collapsed` — the historical name
// from 24-CONTEXT.md. We store BOTH section and sidebarCollapsed under this
// single key (one localStorage entry, two fields).

import {create} from 'zustand'
import {createJSONStorage, persist} from 'zustand/middleware'

export type SectionId =
	| 'dashboard'
	| 'containers'
	| 'logs'
	| 'shell'
	| 'stacks'
	| 'images'
	| 'volumes'
	| 'networks'
	| 'registry'
	| 'activity'
	| 'security'
	| 'schedules'
	| 'settings'

/**
 * Display order matches the Dockhand reference: top → bottom of the sidebar.
 * `as const satisfies readonly SectionId[]` ties the runtime list to the
 * SectionId union — adding a new id to the union without extending the list
 * (or vice versa) becomes a compile error.
 */
export const SECTION_IDS = [
	'dashboard',
	'containers',
	'logs',
	'shell',
	'stacks',
	'images',
	'volumes',
	'networks',
	'registry',
	'activity',
	// Phase 46-04 — Security (fail2ban admin panel) sits next to Activity in the
	// operator-cluster ordering: both surface real-time host signal. Placed
	// BEFORE 'schedules' / 'settings' so it stays in the bottom-cluster.
	'security',
	'schedules',
	'settings',
] as const satisfies readonly SectionId[]

interface DockerStore {
	section: SectionId
	sidebarCollapsed: boolean
	setSection: (s: SectionId) => void
	setSidebarCollapsed: (b: boolean) => void
	toggleSidebar: () => void
}

export const useDockerStore = create<DockerStore>()(
	persist(
		(set) => ({
			section: 'dashboard',
			sidebarCollapsed: false,
			setSection: (section) => set({section}),
			setSidebarCollapsed: (sidebarCollapsed) => set({sidebarCollapsed}),
			toggleSidebar: () => set((s) => ({sidebarCollapsed: !s.sidebarCollapsed})),
		}),
		{
			name: 'livos:docker:sidebar-collapsed',
			storage: createJSONStorage(() => localStorage),
			// Persist only state, not actions.
			partialize: (s) => ({section: s.section, sidebarCollapsed: s.sidebarCollapsed}),
		},
	),
)

// Selector hooks — keep components subscribed only to the slice they consume.
export const useDockerSection = () => useDockerStore((s) => s.section)
export const useSidebarCollapsed = () => useDockerStore((s) => s.sidebarCollapsed)
export const useSetDockerSection = () => useDockerStore((s) => s.setSection)
export const useToggleSidebar = () => useDockerStore((s) => s.toggleSidebar)
