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
