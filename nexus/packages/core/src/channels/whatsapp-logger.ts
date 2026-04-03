import { logger as winstonLogger } from '../logger.js';

/**
 * Pino-compatible logger adapter for Baileys.
 * Bridges to the existing winston logger without adding pino as a dependency.
 * Baileys requires a pino-compatible logger object with specific method signatures.
 */
export const baileysLogger = {
  level: 'warn',
  child: () => baileysLogger,
  trace: (..._args: any[]) => {},
  debug: (msg: any) => winstonLogger.debug(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  info: (msg: any) => winstonLogger.info(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  warn: (msg: any) => winstonLogger.warn(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  error: (msg: any) => winstonLogger.error(typeof msg === 'string' ? msg : JSON.stringify(msg)),
  fatal: (msg: any) => winstonLogger.error(typeof msg === 'string' ? msg : JSON.stringify(msg)),
};
