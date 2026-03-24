import si from 'systeminformation';

export interface SystemInfoResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

export async function executeSystemInfo(_params: Record<string, unknown>): Promise<SystemInfoResult> {
  try {
    const [osInfo, cpu, mem, fsSize, networkInterfaces, time] = await Promise.all([
      si.osInfo(),
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.networkInterfaces(),
      si.time(),
    ]);

    const networkArr = Array.isArray(networkInterfaces) ? networkInterfaces : [networkInterfaces];

    const info = {
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
      },
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        speed: cpu.speed,
      },
      memory: {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        percent: +((mem.used / mem.total) * 100).toFixed(1),
      },
      disks: fsSize.map((d) => ({
        fs: d.fs,
        size: d.size,
        used: d.used,
        available: d.available,
        mount: d.mount,
      })),
      network: networkArr
        .filter((n) => !n.internal)
        .map((n) => ({ iface: n.iface, ip4: n.ip4, mac: n.mac })),
      uptime: time.uptime,
    };

    // Build human-readable summary
    const lines: string[] = [
      `OS: ${info.os.distro} ${info.os.release} (${info.os.arch}) - ${info.os.hostname}`,
      `CPU: ${info.cpu.manufacturer} ${info.cpu.brand} (${info.cpu.cores} cores @ ${info.cpu.speed} GHz)`,
      `Memory: ${formatBytes(info.memory.used)} / ${formatBytes(info.memory.total)} (${info.memory.percent}%)`,
    ];

    for (const d of info.disks) {
      lines.push(`Disk [${d.mount}]: ${formatBytes(d.used)} / ${formatBytes(d.size)} (avail: ${formatBytes(d.available)})`);
    }

    for (const n of info.network) {
      lines.push(`Network [${n.iface}]: ${n.ip4} (${n.mac})`);
    }

    lines.push(`Uptime: ${formatUptime(info.uptime)}`);

    const output = lines.join('\n');

    return { success: true, output, data: info };
  } catch (err: unknown) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
