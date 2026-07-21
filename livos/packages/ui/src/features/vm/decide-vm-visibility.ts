// Phase 352-01 (VMAPP-01, VMAPP-03) — whole-surface admin gate for the
// native Virtual Machine app. Pure helper extracted for unit-testability,
// mirroring decideDangerZoneVisibility (danger-zone.tsx). Unlike the
// danger-zone SECTION gate, this decides the ENTIRE window content: the VM
// API is adminProcedure, so a non-admin must see an honest note and never
// reach the VM surface (server-side adminProcedure is the real boundary;
// this UI gate is UX-only, T-352-01/02).
//
// Three states are exhaustive:
//   - `loading`         → current-user query unresolved; neutral placeholder
//   - `vm-app`          → admin user; render the VM app surface
//   - `non-admin-note`  → non-admin user; render an honest admin-only note
export type VmAppVisibility = 'vm-app' | 'non-admin-note' | 'loading'

export function decideVmVisibility(state: {isLoading: boolean; isAdmin: boolean}): VmAppVisibility {
	if (state.isLoading) return 'loading'
	return state.isAdmin ? 'vm-app' : 'non-admin-note'
}
