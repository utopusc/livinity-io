// Phase 174-01 — SidebarTree scaffold (skeleton only).
//
// This file is a STUB shipped by Plan 174-01 to unblock Wave-2 parallel
// execution of Plans 174-02 (tRPC rendering), 174-03 (per-type styling),
// and 174-05 (context menu + footer). The full implementation lands in
// 174-02 (tree data + Main Liv pin + empty state) and is extended by
// 174-04 (drag-drop with cycle/depth check) + 174-05 (footer gear slot).
//
// Do NOT add behaviour here — Plan 174-02 owns the body.

export interface SidebarTreeProps {
	/**
	 * Optional callback fired when a tree row is selected. Phase 174-02 wires the
	 * actual selection state; Phase 175 consumes it to open detail views.
	 */
	onSelect?: (itemId: string | null) => void
}

export function SidebarTree(_props: SidebarTreeProps) {
	// Stub body — Plan 174-02 replaces with full tRPC-backed tree.
	return null
}
