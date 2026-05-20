// Phase 174-01 / 174-05 — sidebar-tree barrel.
//
// Re-exports the public surface so downstream plans (Phase 175 AddItemModal
// wrapper, Phase 183 Settings dispatcher) import via:
//   import {SidebarTree, ItemContextMenu, SidebarFooter} from '@/features/sidebar-tree'

export {SidebarTree, type SidebarTreeProps} from './SidebarTree'
export {ItemTreeRow, type ItemTreeRowProps} from './ItemTreeRow'
export {ItemContextMenu, type ItemContextMenuProps} from './ItemContextMenu'
export {SidebarFooter, type SidebarFooterProps} from './SidebarFooter'
