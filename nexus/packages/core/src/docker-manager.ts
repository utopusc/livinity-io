import Docker from 'dockerode';
import { logger } from './logger.js';

export class DockerManager {
  private docker: Docker;

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
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      stream.on('end', () => resolve(output));
      stream.on('error', reject);
    });
  }
}
