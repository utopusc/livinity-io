/**
---
name: server-health
description: Comprehensive server health check — CPU, RAM, disk, Docker containers, PM2 processes
tools:
  - sysinfo
  - docker_list
  - pm2
triggers:
  - ^(health|server health|full health)
  - full (health|status|check)
model_tier: flash
---
*/

export async function handler(ctx) {
  const results = [];

  // 1. System info
  const sysResult = await ctx.executeTool('sysinfo', { topic: 'all' });
  if (sysResult.success) {
    results.push('## System Info\n' + sysResult.output);
  } else {
    results.push('## System Info\nFailed: ' + (sysResult.error || 'unknown'));
  }

  // 2. Docker containers
  const dockerResult = await ctx.executeTool('docker_list', {});
  if (dockerResult.success) {
    results.push('## Docker Containers\n' + dockerResult.output);
  } else {
    results.push('## Docker Containers\nFailed: ' + (dockerResult.error || 'unknown'));
  }

  // 3. PM2 processes
  const pm2Result = await ctx.executeTool('pm2', { operation: 'list' });
  if (pm2Result.success) {
    results.push('## PM2 Processes\n' + pm2Result.output);
  } else {
    results.push('## PM2 Processes\nFailed: ' + (pm2Result.error || 'unknown'));
  }

  return {
    success: true,
    message: results.join('\n\n'),
  };
}
