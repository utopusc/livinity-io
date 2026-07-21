// System appIds the window manager can host — mirrors the
// window-content.tsx switch arms (LIVINITY_* cases). Shared by the
// Launchpad grid and the data-driven dock so the two surfaces can't
// drift. Anything NOT in this map launches via navigate(systemAppTo).
export const WINDOWED_SYSTEM_ROUTES: Record<string, string> = {
	'LIVINITY_files': '/files/Home',
	'LIVINITY_settings': '/settings',
	'LIVINITY_app-store': '/app-store',
	'LIVINITY_docker': '/docker',
	'LIVINITY_server-control': '/server-control',
	'LIVINITY_my-devices': '/my-devices',
	'LIVINITY_terminal': '/terminal',
	'LIVINITY_liv-assistant': '/liv-assistant',
	// Phase 352-01 (VMAPP-01) — windowed route so the VM tile opens a window
	// instead of navigating to a dead route.
	'LIVINITY_vm': '/vm',
}
