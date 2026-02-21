import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface CheckResult {
  name: string;
  ok: boolean;
  version?: string;
  message: string;
}

function runCmd(cmd: string): string {
  return execSync(cmd, {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: 10_000,
  }).trim();
}

function checkNodeVersion(): CheckResult {
  try {
    const raw = runCmd('node --version'); // e.g. "v22.5.1"
    const major = parseInt(raw.replace('v', '').split('.')[0], 10);
    if (major >= 22) {
      return { name: 'Node.js', ok: true, version: raw, message: `Node.js ${raw} installed` };
    }
    return { name: 'Node.js', ok: false, version: raw, message: `Node.js ${raw} found — v22+ required` };
  } catch {
    return { name: 'Node.js', ok: false, message: 'Node.js not found' };
  }
}

function checkDocker(): CheckResult {
  try {
    const raw = runCmd('docker --version'); // e.g. "Docker version 24.0.7, build afdd53b"
    const match = raw.match(/Docker version ([^\s,]+)/);
    const version = match ? match[1] : raw;
    return { name: 'Docker', ok: true, version, message: `Docker ${version} installed` };
  } catch {
    return { name: 'Docker', ok: false, message: 'Docker not found — install from https://docs.docker.com/get-docker/' };
  }
}

function checkRedis(): CheckResult {
  try {
    const raw = runCmd('redis-cli ping');
    if (raw === 'PONG') {
      return { name: 'Redis', ok: true, message: 'Redis is reachable (PONG)' };
    }
    return { name: 'Redis', ok: false, message: `Redis ping returned: ${raw}` };
  } catch {
    return { name: 'Redis', ok: false, message: 'Redis not reachable — ensure redis-server is running' };
  }
}

function checkPM2(): CheckResult {
  try {
    const raw = runCmd('pm2 --version'); // e.g. "5.3.0"
    return { name: 'PM2', ok: true, version: raw, message: `PM2 ${raw} installed` };
  } catch {
    return { name: 'PM2', ok: false, message: 'PM2 not found — install with: npm i -g pm2' };
  }
}

function checkDiskSpace(): CheckResult {
  try {
    const raw = runCmd('df -BG /');
    // Output format:
    // Filesystem     1G-blocks  Used Available Use% Mounted on
    // /dev/sda1          50G    20G       28G  42% /
    const lines = raw.split('\n');
    if (lines.length < 2) {
      return { name: 'Disk Space', ok: false, message: 'Could not parse df output' };
    }
    const cols = lines[1].split(/\s+/);
    const availStr = cols[3]; // e.g. "28G"
    const availGB = parseInt(availStr.replace('G', ''), 10);
    if (isNaN(availGB)) {
      return { name: 'Disk Space', ok: false, message: `Could not parse available space: ${availStr}` };
    }
    if (availGB >= 10) {
      return { name: 'Disk Space', ok: true, message: `${availGB} GB available` };
    }
    return { name: 'Disk Space', ok: false, message: `Only ${availGB} GB available — 10 GB minimum required` };
  } catch {
    return { name: 'Disk Space', ok: false, message: 'Could not check disk space' };
  }
}

function checkRAM(): CheckResult {
  try {
    // Try /proc/meminfo first (Linux)
    const meminfo = readFileSync('/proc/meminfo', 'utf-8');
    const match = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
    if (match) {
      const totalGB = Math.round(parseInt(match[1], 10) / 1024 / 1024);
      if (totalGB >= 4) {
        return { name: 'RAM', ok: true, message: `${totalGB} GB total memory` };
      }
      return { name: 'RAM', ok: false, message: `${totalGB} GB RAM — 4 GB minimum required` };
    }
  } catch {
    // /proc/meminfo not available, try free -g
  }

  try {
    const raw = runCmd('free -g');
    // Output format:
    //               total        used        free ...
    // Mem:             7           3           2 ...
    const lines = raw.split('\n');
    const memLine = lines.find(l => l.startsWith('Mem:'));
    if (memLine) {
      const cols = memLine.split(/\s+/);
      const totalGB = parseInt(cols[1], 10);
      if (totalGB >= 4) {
        return { name: 'RAM', ok: true, message: `${totalGB} GB total memory` };
      }
      return { name: 'RAM', ok: false, message: `${totalGB} GB RAM — 4 GB minimum required` };
    }
  } catch {
    // free not available
  }

  return { name: 'RAM', ok: false, message: 'Could not determine available RAM' };
}

export async function checkPrerequisites(): Promise<CheckResult[]> {
  return [
    checkNodeVersion(),
    checkDocker(),
    checkRedis(),
    checkPM2(),
    checkDiskSpace(),
    checkRAM(),
  ];
}
