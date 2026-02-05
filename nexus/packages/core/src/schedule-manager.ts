import { Queue, Worker, Job } from 'bullmq';
import type Redis from 'ioredis';
import { logger } from './logger.js';

export interface ScheduleJob {
  /** Subagent ID */
  subagentId: string;
  /** Task to execute */
  task: string;
  /** Cron expression */
  cron: string;
  /** IANA timezone (e.g. 'Europe/Istanbul') */
  timezone?: string;
}

export interface ScheduleJobData {
  subagentId: string;
  task: string;
  triggeredAt: number;
}

type JobHandler = (data: ScheduleJobData) => Promise<void>;

export class ScheduleManager {
  private queue: Queue;
  private worker: Worker | null = null;
  private connection: { host: string; port: number; password?: string };
  private handler: JobHandler | null = null;

  constructor(redis: Redis) {
    const opts = redis.options as any;
    this.connection = {
      host: opts?.host || 'localhost',
      port: opts?.port || 6379,
      ...(opts?.password ? { password: opts.password } : {}),
    };

    this.queue = new Queue('nexus-schedules', {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      },
    });
  }

  /** Set the handler that processes scheduled jobs */
  onJob(handler: JobHandler): void {
    this.handler = handler;
  }

  /** Start the schedule worker */
  async start(): Promise<void> {
    this.worker = new Worker(
      'nexus-schedules',
      async (job: Job<ScheduleJobData>) => {
        logger.info('ScheduleManager: job fired', {
          subagentId: job.data.subagentId,
          task: job.data.task.slice(0, 80),
        });

        if (this.handler) {
          await this.handler(job.data);
        }
      },
      {
        connection: this.connection,
        concurrency: 3,
      },
    );

    this.worker.on('failed', (job, err) => {
      logger.error('ScheduleManager: job failed', {
        jobId: job?.id,
        error: err.message,
      });
    });

    logger.info('ScheduleManager: worker started');
  }

  /** Add or update a recurring schedule for a subagent */
  async addSchedule(schedule: ScheduleJob): Promise<string> {
    // Remove existing schedule for this subagent first
    await this.removeSchedule(schedule.subagentId);

    const jobName = `subagent:${schedule.subagentId}`;

    await this.queue.upsertJobScheduler(
      jobName,
      {
        pattern: schedule.cron,
        ...(schedule.timezone ? { tz: schedule.timezone } : {}),
      },
      {
        name: jobName,
        data: {
          subagentId: schedule.subagentId,
          task: schedule.task,
          triggeredAt: 0, // Will be set by template
        },
      },
    );

    logger.info('ScheduleManager: schedule added', {
      subagentId: schedule.subagentId,
      cron: schedule.cron,
      timezone: schedule.timezone,
    });

    return jobName;
  }

  /** Remove a subagent's schedule */
  async removeSchedule(subagentId: string): Promise<boolean> {
    const jobName = `subagent:${subagentId}`;
    try {
      await this.queue.removeJobScheduler(jobName);
      logger.info('ScheduleManager: schedule removed', { subagentId });
      return true;
    } catch {
      return false;
    }
  }

  /** Add a one-time delayed job */
  async addDelayedJob(subagentId: string, task: string, delayMs: number): Promise<string> {
    const job = await this.queue.add(
      `delayed:${subagentId}`,
      {
        subagentId,
        task,
        triggeredAt: Date.now() + delayMs,
      },
      { delay: delayMs },
    );

    logger.info('ScheduleManager: delayed job added', {
      subagentId,
      delayMs,
      jobId: job.id,
    });

    return job.id || '';
  }

  /** List all active job schedulers */
  async listSchedules(): Promise<Array<{ id: string; subagentId: string; cron: string; task?: string; timezone?: string; next?: string }>> {
    const schedulers = await this.queue.getJobSchedulers(0, 100);

    return schedulers.map((s: any) => ({
      id: s.key || s.id || '',
      subagentId: (s.key || s.id || '').replace('subagent:', ''),
      cron: s.pattern || '',
      task: s.template?.data?.task || undefined,
      timezone: s.tz || undefined,
      next: s.next ? new Date(s.next).toISOString() : undefined,
    }));
  }

  /** Stop the schedule worker */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
    logger.info('ScheduleManager: stopped');
  }
}
