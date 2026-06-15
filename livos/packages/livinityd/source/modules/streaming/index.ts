/**
 * Phase 101-02 — streaming module barrel.
 *
 * Re-exports the per-app port allocator (and its error type) so external
 * wire-up sites (livinityd boot, native-app-binder in 101-05, etc.) can pull
 * a single import root for the streaming subsystem's public surface.
 *
 * StreamManager itself is intentionally NOT re-exported here yet — the legacy
 * import sites still import from `./stream-manager.js` directly; this barrel
 * is additive (does not change the existing public surface of stream-manager).
 */

export {PortAllocator, PortRangeExhaustedError} from './port-allocator.js'
export type {PortAllocatorOpts} from './port-allocator.js'

// Phase 102-01 — DisplayAllocator (number-returning, [10, 100), 90 slots) +
// XvfbSpawner (xdpyinfo readiness-polled spawn). Wave 2 plans 102-04
// (window-manager rewrite) and 102-05 (native-app-binder) compose these for
// per-app X display orchestration. Replaces the legacy string-returning
// webapps/display-allocator.ts (deleted in 102-01-04).
export {DisplayAllocator, DisplayRangeExhaustedError} from './display-allocator.js'
export type {DisplayAllocatorOpts} from './display-allocator.js'
// Phase 255-03 — disjoint webapp ↔ MCP-create allocator range constants.
export {WEBAPP_DISPLAY_ALLOCATOR_RANGE, MCP_CREATE_ALLOCATOR_START} from './display-allocator.js'
// Cross-pool fix — the single shared allocator instance for webapp + native
// spawns (one in-use Set so they can never hand out the same `:N`).
export {appDisplayAllocator} from './display-allocator.js'
export {spawnXvfb, XvfbReadyTimeoutError} from './xvfb-spawner.js'
export type {XvfbSpawnOpts, XvfbHandle, XvfbSpawnFn, XvfbExecFileFn, XvfbLogger} from './xvfb-spawner.js'
