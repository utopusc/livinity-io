/**
 * src/main/wsl/decide-resource-defaults.ts
 *
 * Pure, zero-IO auto-detected resource recommendation (WSL-05 / D-15). Takes
 * ALREADY-GATHERED system facts as plain numbers -- the 04-09 handler reads
 * total memory, logical core count, and free disk space via Node's built-in
 * platform APIs and a disk-free probe, then passes the resulting numbers in
 * here -- so this module stays fully deterministic/testable with plain
 * fixtures, mirroring src/main/platform/backoff.ts's pure numeric-calculator
 * shape.
 *
 * D-15's sensible-defaults policy: recommend roughly half of total RAM
 * (floored to an integer GB), logical cores minus one (never below 1 -- a
 * 0-core recommendation would be nonsensical), and a disk budget with
 * headroom that never drops below the D-10 15GB install floor.
 *
 * D-17 (honesty): this module only computes numbers -- it is the caller's job
 * to disclose that memory/processors are VM-global (affect every WSL distro,
 * not just Livinity) while disk is Livinity-only.
 *
 * Zero runtime imports -- no built-in platform module, no Electron surface;
 * inputs are plain numbers, output is a plain integer-valued object.
 */

export interface SystemResources {
  totalRamBytes: number;
  totalCores: number;
  freeDiskGb: number;
}

export interface ResourceDefaults {
  memoryGb: number;
  processors: number;
  diskGb: number;
}

const BYTES_PER_GB = 1024 ** 3;
const MEMORY_SHARE = 0.5; // ~50% of total RAM
const DISK_FLOOR_GB = 15; // D-10's hard install-floor -- never recommend below this
const DISK_BUFFER_GB = 10; // headroom left free on the host drive
const DISK_CAP_GB = 40; // cap the default budget so "use recommended" isn't greedy

/**
 * Deterministic: the same input always produces the same output, and every
 * returned value is an integer. Guarded at the low end -- processors is
 * always >= 1 and diskGb is always >= the 15GB floor, regardless of how
 * little RAM/cores/disk the fixture reports.
 */
export function decideResourceDefaults(sys: SystemResources): ResourceDefaults {
  const memoryGb = Math.max(1, Math.floor((sys.totalRamBytes / BYTES_PER_GB) * MEMORY_SHARE));
  const processors = Math.max(1, sys.totalCores - 1);
  const diskGb = Math.max(DISK_FLOOR_GB, Math.min(sys.freeDiskGb - DISK_BUFFER_GB, DISK_CAP_GB));

  return { memoryGb, processors, diskGb };
}
