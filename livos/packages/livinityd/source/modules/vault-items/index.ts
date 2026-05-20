// Phase 171-01 — vault-items barrel.
//
// Single import surface for the v38 vault Item module. Downstream plans
// 171-02 (item-store), 171-03 (tree-resolver), 171-04 (tRPC router),
// 171-05 (pub/sub) consume Item, BaseItem, ProjectItem, AgentItem,
// ChatItem, ItemType, resolveVaultRoot, newItemId from here verbatim.
// Each later plan extends this barrel additively — never edits this file.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + Phase 162-01 vault-scaffolder.ts
// + Phase 162-02 agent-session.ts
// + Phase 166 cc-pty backend
// + Phase 168 cc-pty-router.ts
// + Phase 169 vault-graph backend
// all UNCHANGED. This barrel exposes the NEW v38 surface.

export type {Item, BaseItem, ProjectItem, AgentItem, ChatItem, ItemType} from './types.js'
export {resolveVaultRoot, newItemId} from './vault-root-resolver.js'
export {ItemStore} from './item-store.js'
export type {ItemStoreOptions, CreateInput, ListOptions} from './item-store.js'
// Phase 171-03 — tree-resolver public surface (additive).
export {buildTree, validateMove, writeTreeCache, depthOf} from './tree-resolver.js'
export type {TreeNode, MoveValidation} from './tree-resolver.js'
// Phase 171-05 — PubSub wrapper public surface (additive).
export {createItemStorePubSub, TREE_UPDATED_CHANNEL} from './pubsub.js'
export type {TreeUpdateEvent, TreeUpdateEventType, PubSubLogger} from './pubsub.js'
