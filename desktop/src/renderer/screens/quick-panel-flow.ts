/**
 * src/renderer/screens/quick-panel-flow.ts
 *
 * Pure, React-free formatters for the tray quick-panel (tray-panel addendum,
 * post-Phase-7) -- the RAM/CPU/disk row text + bar-width percentage, and the
 * calm unavailable-usage copy. Mirrors src/renderer/screens/settings-flow.ts's
 * template exactly: nothing here reaches across the preload bridge, touches
 * window.api, or imports a UI library -- plain in / plain out, zero IO.
 *
 * `statusBadge`/`toggleLabel`/`restartLabel` are deliberately NOT
 * re-implemented here -- QuickPanel.tsx imports those straight from
 * settings-flow.ts (single source of truth, D-11 precedent).
 */

import type { UsageResult } from '../../../shared/ipc-contract';

/** 1024*1024 kB == 1 GB (binary GiB, matching every other kB->GB formatter in this codebase). */
const KB_PER_GB = 1024 * 1024;

/** "x.x / y.y GB" -- used first, total second (RAM row). */
export function formatMemRow(memUsedKb: number, memTotalKb: number): string {
  return `${(memUsedKb / KB_PER_GB).toFixed(1)} / ${(memTotalKb / KB_PER_GB).toFixed(1)} GB`;
}

/** "x.x / y.y GB" -- used first, total second (Disk row). Same shape as formatMemRow
 *  (both are used/total kB pairs) but kept as its own named export per the row's
 *  own semantic identity, mirroring the plan's three-distinct-row spec. */
export function formatDiskRow(diskUsedKb: number, diskTotalKb: number): string {
  return `${(diskUsedKb / KB_PER_GB).toFixed(1)} / ${(diskTotalKb / KB_PER_GB).toFixed(1)} GB`;
}

/** load1/cpuCount as a rounded, 0-100-clamped percentage string (CPU row). */
export function formatCpuRow(load1: number, cpuCount: number): string {
  if (!(cpuCount > 0)) return '0%';
  const pct = Math.round((load1 / cpuCount) * 100);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

/** The RAM row's progress-bar fill width -- a rounded, 0-100-clamped percentage. */
export function memPercent(memUsedKb: number, memTotalKb: number): number {
  if (!(memTotalKb > 0)) return 0;
  const pct = Math.round((memUsedKb / memTotalKb) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** Calm copy for the panel's usage section when engine:getUsage returns ok:false. */
export function usageUnavailableText(reason: Extract<UsageResult, { ok: false }>['reason']): string {
  if (reason === 'engine-stopped') return 'Start your engine to see usage.';
  return "Couldn't read usage right now.";
}
