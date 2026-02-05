import winston from 'winston';
import path from 'node:path';

const NEXUS_LOGS_DIR = process.env.NEXUS_LOGS_DIR || '/opt/nexus/logs';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [WORKER:${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(NEXUS_LOGS_DIR, 'worker.log'), maxsize: 10_000_000, maxFiles: 3 }),
  ],
});
