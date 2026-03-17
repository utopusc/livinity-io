/**
 * Health Endpoint
 *
 * Returns JSON with connection count, memory usage, and uptime.
 * Used by monitoring and load balancers.
 */

import type http from 'node:http';
import type { TunnelRegistry } from './tunnel-registry.js';

export function handleHealthRequest(
  res: http.ServerResponse,
  registry: TunnelRegistry,
): void {
  const body = JSON.stringify({
    status: 'ok',
    connections: registry.size,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    version: '0.1.0',
  });

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}
