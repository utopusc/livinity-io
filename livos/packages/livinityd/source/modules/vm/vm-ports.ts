/**
 * Phase 350 (VMLIFE-01) — VM host-port allocators.
 *
 * Reuses the streaming PortAllocator CLASS (no modification, no duplication)
 * with two fresh, DELIBERATELY DISJOINT ranges that never collide with the
 * streaming subsystem's live `[15900, 16000)` instance (CONTEXT.md sanctions a
 * separate VM range) nor with each other:
 *   - vmPortAllocator       [16100, 16200) — noVNC 8006 loopback host binds
 *   - vmRdpPortAllocator    [16200, 16300) — windows RDP 3389 loopback host binds
 *   - vmVncRawPortAllocator [16300, 16400) — raw RFB (container VNC_PORT) loopback binds
 *
 * IN-MEMORY only (not persisted). 350-02's reconcileOnBoot reads the persisted
 * `novncPort`/`rdpPort` off the registry record for an EXISTING VM — it never
 * re-allocates. The allocators are consulted ONLY at create() time for a
 * brand-new VM.
 */

import {PortAllocator} from '../streaming/port-allocator.js'

/** noVNC (container 8006) host-port pool — disjoint from streaming + RDP. */
export const vmPortAllocator = new PortAllocator({min: 16100, max: 16200})

/** Windows RDP (container 3389) host-port pool — disjoint from streaming + noVNC. */
export const vmRdpPortAllocator = new PortAllocator({min: 16200, max: 16300})

/** Raw RFB (container VNC_PORT) host-port pool — disjoint from streaming + noVNC + RDP.
 *  VMENC-01 (364): the loopback source the host-side RFB frame source (VmVncFrameSource)
 *  connects to. UNIVERSAL — allocated for every VM (windows + linux), same as novncPort,
 *  because every dockur/qemus guest exposes a raw QEMU VNC server on its container VNC_PORT. */
export const vmVncRawPortAllocator = new PortAllocator({min: 16300, max: 16400})
