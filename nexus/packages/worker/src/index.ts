import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { ScrapeJob } from './jobs/scrape.js';
import { TestJob } from './jobs/test.js';
import { ResearchJob } from './jobs/research.js';
import { LeadgenJob } from './jobs/leadgen.js';
import { logger } from './logger.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const jobHandlers: Record<string, (job: Job) => Promise<any>> = {
  scrape: ScrapeJob.process,
  test: TestJob.process,
  research: ResearchJob.process,
  leadgen: LeadgenJob.process,
};

const worker = new Worker(
  'nexus-jobs',
  async (job: Job) => {
    const handler = jobHandlers[job.name];
    if (!handler) {
      logger.warn(`No handler for job: ${job.name}`);
      return { success: false, message: `Unknown job type: ${job.name}` };
    }

    logger.info(`Processing job: ${job.name}`, { id: job.id, data: job.data });
    const result = await handler(job);
    logger.info(`Job completed: ${job.name}`, { id: job.id, success: result.success });

    // Store result in Redis for retrieval
    await connection.set(
      `nexus:result:${job.id}`,
      JSON.stringify(result),
      'EX',
      3600 // expire in 1 hour
    );

    return result;
  },
  { connection, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  logger.error(`Job failed: ${job?.name}`, { id: job?.id, error: err.message });
});

worker.on('completed', (job) => {
  logger.info(`Job done: ${job.name}`, { id: job.id });
});

logger.info('Nexus Worker started. Waiting for jobs...');

process.on('SIGINT', async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
});
