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
import { logSafe, redactSecretLike } from '../src/main/log';

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

describe('redactSecretLike (WR-03)', () => {
  it('leaves ordinary short console-message text untouched', () => {
    expect(redactSecretLike('Failed to load resource: 404')).toBe(
      'Failed to load resource: 404'
    );
  });

  it('redacts a long token-shaped run of characters', () => {
    const token = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6';
    const result = redactSecretLike(`leaked token: ${token}`);
    expect(result).not.toContain(token);
    expect(result).toContain('[redacted]');
  });

  it('redacts a base64-shaped secret with padding', () => {
    const token = 'QWxhZGRpbjpvcGVuIHNlc2FtZSBleHRyYVBhZGRpbmdIZXJl==';
    const result = redactSecretLike(`Authorization: Bearer ${token}`);
    expect(result).not.toContain(token);
  });

  it('truncates an overly long message instead of writing it to disk in full', () => {
    // Spaces break up any single run so this exercises the length cap, not
    // the secret-like-run redaction above.
    const huge = 'a normal log word. '.repeat(50);
    const result = redactSecretLike(huge);
    expect(result.length).toBeLessThan(600);
    expect(result.endsWith('…[truncated]')).toBe(true);
  });
});
