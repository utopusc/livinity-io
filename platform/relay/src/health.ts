/**
 * Health Endpoint + Memory Monitoring
 *
 * Returns JSON with connection count, memory usage, and uptime.
 * Tracks memory pressure and provides connection rejection signal.
 */

import os from 'node:os';
import type http from 'node:http';
import type { TunnelRegistry } from './tunnel-registry.js';
import type { DeviceRegistry } from './device-registry.js';

const TOTAL_MEMORY = os.totalmem();
const ALERT_THRESHOLD = 0.70;   // 70% — log warning
const REJECT_THRESHOLD = 0.80;  // 80% — reject new connections

/** Check if memory pressure is too high for new connections */
export function shouldRejectNewConnections(): boolean {
  const used = TOTAL_MEMORY - os.freemem();
  return used / TOTAL_MEMORY > REJECT_THRESHOLD;
}

/** Get memory status for health endpoint */
function getMemoryStatus() {
  const totalMB = Math.round(TOTAL_MEMORY / 1024 / 1024);
  const freeMB = Math.round(os.freemem() / 1024 / 1024);
  const usedMB = totalMB - freeMB;
  const usedPercent = Math.round((usedMB / totalMB) * 100);
  const pressure = usedPercent >= REJECT_THRESHOLD * 100 ? 'critical' :
                   usedPercent >= ALERT_THRESHOLD * 100 ? 'warning' : 'normal';
  return { totalMB, freeMB, usedMB, usedPercent, pressure };
}

export function handleHealthRequest(
  res: http.ServerResponse,
  registry: TunnelRegistry,
  deviceRegistry?: DeviceRegistry,
): void {
  const mem = getMemoryStatus();
  const body = JSON.stringify({
    status: mem.pressure === 'critical' ? 'degraded' : 'ok',
    connections: registry.size,
    devices: deviceRegistry?.totalDevices ?? 0,
    deviceUsers: deviceRegistry?.totalUsers ?? 0,
    memory: {
      process: process.memoryUsage(),
      system: mem,
    },
    uptime: process.uptime(),
    version: '0.1.0',
  });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}
