import Docker from 'dockerode';
import { exec as cpExec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';

const exec = promisify(cpExec);

export class DockerManager {
  private docker: Docker;

  // Must mirror livinityd's /opt/livos/data/stacks so stacks created via the AI
  // tool show up in the UI immediately. See nexus/packages/livinityd/source/modules/docker/stacks.ts.
  private static STACKS_DIR = '/opt/livos/data/stacks';

  // Refuse AI-initiated removal of stacks that host the platform itself.
  // Mirrors PROTECTED_CONTAINER_PATTERNS from livinityd docker/types.ts but at
  // the stack (compose project) level.
  private static PROTECTED_STACK_PREFIXES = ['livos', 'nexus-infrastructure', 'caddy'];

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async list(): Promise<Docker.ContainerInfo[]> {
    return this.docker.listContainers({ all: true });
  }

  async startTool(toolName: string): Promise<string> {
    const toolConfigs: Record<string, Docker.ContainerCreateOptions> = {
      playwright: {
        Image: 'mcr.microsoft.com/playwright:v1.49.1-noble',
        name: 'nexus-playwright',
        HostConfig: {
          Memory: 2 * 1024 * 1024 * 1024, // 2GB
          ShmSize: 1024 * 1024 * 1024,     // 1GB shared memory
          NetworkMode: 'host',
        },
        Cmd: ['sleep', 'infinity'],
      },
    };

    const config = toolConfigs[toolName];
    if (!config) throw new Error(`Unknown tool: ${toolName}`);

    // Check if already running
    const containers = await this.list();
    const existing = containers.find((c) => c.Names?.some((n) => n === `/${config.name}`));

    if (existing) {
      if (existing.State === 'running') {
        return existing.Id;
      }
      // Start stopped container
      const container = this.docker.getContainer(existing.Id);
      await container.start();
      logger.info(`Tool restarted: ${toolName}`);
      return existing.Id;
    }

    // Create and start new container
    const container = await this.docker.createContainer(config);
    await container.start();
    logger.info(`Tool started: ${toolName}`, { id: container.id });
    return container.id;
  }

  async stopTool(toolName: string): Promise<void> {
    const containers = await this.list();
    const target = containers.find((c) => c.Names?.some((n) => n.includes(`nexus-${toolName}`)));

    if (target && target.State === 'running') {
      const container = this.docker.getContainer(target.Id);
      await container.stop();
      logger.info(`Tool stopped: ${toolName}`);
    }
  }

  // Containers managed by docker-compose — never auto-cleanup
  private static PROTECTED = ['nexus-firecrawl', 'nexus-firecrawl-worker', 'nexus-puppeteer', 'nexus-redis-firecrawl', 'nexus-playwright'];

  async cleanup(): Promise<void> {
    // Stop idle containers (no activity for 30 min)
    // Skip infrastructure containers managed by docker-compose
    const containers = await this.list();
    for (const info of containers) {
      if (!info.Names?.some((n) => n.includes('nexus-'))) continue;
      if (info.State !== 'running') continue;
      if (info.Names?.some((n) => DockerManager.PROTECTED.includes(n.replace('/', '')))) continue;

      const container = this.docker.getContainer(info.Id);
      const stats = await container.stats({ stream: false });

      // Check CPU usage - if near zero, container is idle
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      if (cpuDelta < 1000000) { // Very low CPU
        logger.info(`Cleanup: stopping idle container ${info.Names?.[0]}`);
        await container.stop();
      }
    }
  }

  async startContainer(name: string): Promise<string> {
    const containers = await this.list();
    const target = containers.find((c) => c.Names?.some((n) => n === `/${name}` || n === name));
    if (!target) throw new Error(`Container not found: ${name}`);

    if (target.State === 'running') return `Container ${name} is already running.`;

    const container = this.docker.getContainer(target.Id);
    await container.start();
    logger.info(`Container started: ${name}`);
    return `Container ${name} started.`;
  }

  async stopContainer(name: string): Promise<string> {
    const containers = await this.list();
    const target = containers.find((c) => c.Names?.some((n) => n === `/${name}` || n === name));
    if (!target) throw new Error(`Container not found: ${name}`);

    if (target.State !== 'running') return `Container ${name} is not running (state: ${target.State}).`;

    const container = this.docker.getContainer(target.Id);
    await container.stop();
    logger.info(`Container stopped: ${name}`);
    return `Container ${name} stopped.`;
  }

  async restartContainer(name: string): Promise<string> {
    const containers = await this.list();
    const target = containers.find((c) => c.Names?.some((n) => n === `/${name}` || n === name));
    if (!target) throw new Error(`Container not found: ${name}`);

    const container = this.docker.getContainer(target.Id);
    await container.restart();
    logger.info(`Container restarted: ${name}`);
    return `Container ${name} restarted.`;
  }

  async inspectContainer(name: string): Promise<Record<string, any>> {
    const containers = await this.list();
    const target = containers.find((c) => c.Names?.some((n) => n === `/${name}` || n === name));
    if (!target) throw new Error(`Container not found: ${name}`);

    const container = this.docker.getContainer(target.Id);
    const info = await container.inspect();
    return {
      name: info.Name,
      state: info.State.Status,
      image: info.Config.Image,
      created: info.Created,
      ports: info.NetworkSettings.Ports,
      mounts: info.Mounts?.map((m: any) => `${m.Source} -> ${m.Destination}`),
      restartCount: info.RestartCount,
    };
  }

  async containerLogs(name: string, tail = 100): Promise<string> {
    const containers = await this.list();
    const target = containers.find((c) => c.Names?.some((n) => n === `/${name}` || n === name));
    if (!target) throw new Error(`Container not found: ${name}`);

    const container = this.docker.getContainer(target.Id);
    const logs = await container.logs({ stdout: true, stderr: true, tail, follow: false });
    return logs.toString().slice(0, 10_000);
  }

  async exec(containerId: string, cmd: string[]): Promise<string> {
    const container = this.docker.getContainer(containerId);
    const execInstance = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await execInstance.start({});
    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  }

  // =============================================================
  // Stack / image / container-creation operations (QW-04)
  // =============================================================
  //
  // Design: AI docker_manage tool calls these methods directly on the local
  // Docker socket + host `docker compose` CLI — NOT via livinityd tRPC. This
  // matches the existing per-container ops (startContainer/stopContainer/...)
  // and keeps the tool off the JWT plumbing. Compose files live under the
  // SAME directory livinityd uses (STACKS_DIR), so stacks created by AI are
  // visible in the Server Control UI immediately.

  async deployStack(input: {
    name: string;
    composeYaml: string;
    envVars?: Array<{ key: string; value: string }>;
  }): Promise<{ name: string; message: string }> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(input.name)) {
      throw new Error(`Invalid stack name '${input.name}'`);
    }
    const stackDir = join(DockerManager.STACKS_DIR, input.name);
    await mkdir(stackDir, { recursive: true });
    const composePath = join(stackDir, 'docker-compose.yml');
    await writeFile(composePath, input.composeYaml, 'utf-8');
    if (input.envVars?.length) {
      const envContent = input.envVars.map((e) => `${e.key}=${e.value}`).join('\n') + '\n';
      await writeFile(join(stackDir, '.env'), envContent, 'utf-8');
    }
    const { stdout, stderr } = await exec(
      `docker compose -p ${input.name} -f ${composePath} up -d`,
      { cwd: stackDir, maxBuffer: 10 * 1024 * 1024 },
    );
    logger.info(`Stack deployed: ${input.name}`);
    return { name: input.name, message: (stdout + stderr).slice(-4000) };
  }

  async controlStack(
    name: string,
    operation: 'up' | 'down' | 'stop' | 'start' | 'restart' | 'pull-and-up',
  ): Promise<string> {
    const stackDir = join(DockerManager.STACKS_DIR, name);
    if (!existsSync(stackDir)) throw new Error(`Stack not found: ${name}`);
    const composePath = join(stackDir, 'docker-compose.yml');
    const base = `docker compose -p ${name} -f ${composePath}`;
    let cmd: string;
    if (operation === 'pull-and-up') {
      await exec(`${base} pull`, { cwd: stackDir, maxBuffer: 10 * 1024 * 1024 });
      cmd = `${base} up -d`;
    } else if (operation === 'up') {
      cmd = `${base} up -d`;
    } else {
      cmd = `${base} ${operation}`;
    }
    const { stdout, stderr } = await exec(cmd, { cwd: stackDir, maxBuffer: 10 * 1024 * 1024 });
    logger.info(`Stack ${operation}: ${name}`);
    return (stdout + stderr).slice(-4000) || `Stack ${name} ${operation} completed`;
  }

  async removeStack(name: string, removeVolumes = false): Promise<string> {
    if (DockerManager.PROTECTED_STACK_PREFIXES.some((p) => name.toLowerCase().startsWith(p))) {
      throw new Error(`Refusing to remove protected stack: ${name}`);
    }
    const stackDir = join(DockerManager.STACKS_DIR, name);
    if (!existsSync(stackDir)) throw new Error(`Stack not found: ${name}`);
    const composePath = join(stackDir, 'docker-compose.yml');
    const flag = removeVolumes ? '--volumes' : '';
    const { stdout, stderr } = await exec(
      `docker compose -p ${name} -f ${composePath} down ${flag}`.trim(),
      { cwd: stackDir, maxBuffer: 10 * 1024 * 1024 },
    );
    await rm(stackDir, { recursive: true, force: true });
    logger.info(`Stack removed: ${name}`);
    return (stdout + stderr).slice(-4000) || `Stack ${name} removed`;
  }

  async pullImage(image: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.docker.pull(image, (err: any, stream: any) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (err2: any) => {
          if (err2) return reject(err2);
          logger.info(`Image pulled: ${image}`);
          resolve(`Image pulled: ${image}`);
        });
      });
    });
  }

  async createContainer(input: {
    image: string;
    name: string;
    ports?: Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }>;
    env?: Array<{ key: string; value: string }>;
    pullImage?: boolean;
    autoStart?: boolean;
  }): Promise<{ id: string; name: string }> {
    if (input.pullImage !== false) await this.pullImage(input.image);
    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    for (const p of input.ports ?? []) {
      const key = `${p.containerPort}/${p.protocol ?? 'tcp'}`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: String(p.hostPort) }];
    }
    const env = (input.env ?? []).map((e) => `${e.key}=${e.value}`);
    const container = await this.docker.createContainer({
      name: input.name,
      Image: input.image,
      Env: env.length ? env : undefined,
      ExposedPorts: Object.keys(exposedPorts).length ? exposedPorts : undefined,
      HostConfig: {
        PortBindings: Object.keys(portBindings).length ? portBindings : undefined,
      },
    });
    if (input.autoStart !== false) await container.start();
    logger.info(`Container created: ${input.name}`, { id: container.id.slice(0, 12) });
    return { id: container.id.slice(0, 12), name: input.name };
  }
}
