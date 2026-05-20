// Phase 174-01 — sidebar-tree barrel.
//
// Re-exports the public surface so downstream plans (174-02/03/04/05)
// and Phase 175 consumers import via:
//   import {SidebarTree} from '@/features/sidebar-tree'
//
// ItemContextMenu (Plan 174-05) will be added to this barrel by that plan.

export {SidebarTree, type SidebarTreeProps} from './SidebarTree'
export {ItemTreeRow, type ItemTreeRowProps} from './ItemTreeRow'
