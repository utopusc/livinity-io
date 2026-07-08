import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/mock/userData') },
}));

vi.mock('electron-log/main', () => ({
  default: {
    info: vi.fn(),
    transports: { file: {} },
  },
}));

import log from 'electron-log/main';
import { logSafe } from '../src/main/log';

describe('logSafe', () => {
  beforeEach(() => {
    (log.info as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('logs the event name with its metadata object', () => {
    logSafe('vault.set', { key: 'session' });
    expect(log.info).toHaveBeenCalledWith('vault.set', { key: 'session' });
  });

  it('defaults to an empty metadata object when none is passed', () => {
    logSafe('app.start');
    expect(log.info).toHaveBeenCalledWith('app.start', {});
  });

  it('accepts scalar (string/number/boolean) metadata values', () => {
    logSafe('status.simulate', { status: 'running', attempt: 2, forced: false });
    expect(log.info).toHaveBeenCalledWith('status.simulate', {
      status: 'running',
      attempt: 2,
      forced: false,
    });
  });

  it('returns void', () => {
    const result = logSafe('event.name', { a: 1 });
    expect(result).toBeUndefined();
  });
});
