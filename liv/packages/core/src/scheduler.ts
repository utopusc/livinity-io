import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { Router, Intent } from './router.js';
import { logger } from './logger.js';

export class Scheduler {
  private queue!: Queue;
  private worker!: Worker;
  private connection!: Redis;
  private router: Router;

  constructor(router: Router) {
    this.router = router;
  }

  async start() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

    this.queue = new Queue('nexus-tasks', { connection: this.connection });

    this.worker = new Worker('nexus-tasks', async (job: Job) => {
      logger.info(`Processing job: ${job.name}`, { data: job.data });

      const intent: Intent = {
        type: job.data.intentType || 'direct_execute',
        action: job.data.action,
        params: job.data.params || {},
        source: 'cron',
        raw: job.data.raw || job.name,
      };

      const result = await this.router.route(intent);
      logger.info(`Job completed: ${job.name}`, { success: result.success });
      return result;
    }, { connection: this.connection, concurrency: 3 });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job failed: ${job?.name}`, { error: err.message });
    });

    logger.info('Scheduler started');
  }

  async addJob(name: string, data: Record<string, any>, options?: { delay?: number; repeat?: { every: number } }) {
    await this.queue.add(name, data, {
      delay: options?.delay,
      repeat: options?.repeat,
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    logger.info(`Job added: ${name}`, { delay: options?.delay, repeat: options?.repeat });
  }

  async stop() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
    logger.info('Scheduler stopped');
  }
}
