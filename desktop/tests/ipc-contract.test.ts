import { describe, it, expect } from 'vitest';
import {
  VaultKeySchema,
  StatusSchema,
  VaultSetResultSchema,
  VaultGetResultSchema,
  StateSchema,
  CHANNELS,
} from '../shared/ipc-contract';

describe('VaultKeySchema', () => {
  it('accepts every known vault key', () => {
    expect(VaultKeySchema.safeParse('session').success).toBe(true);
    expect(VaultKeySchema.safeParse('apiKey').success).toBe(true);
    expect(VaultKeySchema.safeParse('cfToken').success).toBe(true);
    expect(VaultKeySchema.safeParse('tunnelToken').success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(VaultKeySchema.safeParse('password').success).toBe(false);
    expect(VaultKeySchema.safeParse('').success).toBe(false);
    expect(VaultKeySchema.safeParse('SESSION').success).toBe(false);
  });
});

describe('StatusSchema', () => {
  it('accepts exactly the 4 Phase-1 simulated states', () => {
    for (const s of ['installing', 'running', 'stopped', 'error']) {
      expect(StatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects states outside the Phase-1 set (no connected/connecting/disconnected)', () => {
    for (const s of ['connected', 'connecting', 'disconnected', '']) {
      expect(StatusSchema.safeParse(s).success).toBe(false);
    }
  });
});

describe('VaultSetResultSchema (discriminated union)', () => {
  it('parses the ok:true variant', () => {
    const result = VaultSetResultSchema.safeParse({ ok: true });
    expect(result.success).toBe(true);
  });

  it('parses the ok:false variant with a valid error code', () => {
    expect(VaultSetResultSchema.safeParse({ ok: false, error: 'VAULT_UNAVAILABLE' }).success).toBe(true);
    expect(VaultSetResultSchema.safeParse({ ok: false, error: 'ENCRYPT_FAILED' }).success).toBe(true);
  });

  it('rejects an ok:false variant with an unrecognized error code', () => {
    expect(VaultSetResultSchema.safeParse({ ok: false, error: 'SOMETHING_ELSE' }).success).toBe(false);
  });

  it('rejects a payload missing the discriminant entirely', () => {
    expect(VaultSetResultSchema.safeParse({}).success).toBe(false);
  });
});

describe('VaultGetResultSchema', () => {
  it('accepts an { exists: boolean } shape only', () => {
    expect(VaultGetResultSchema.safeParse({ exists: true }).success).toBe(true);
    expect(VaultGetResultSchema.safeParse({ exists: false }).success).toBe(true);
  });

  it('never carries a decrypted secret value through parsing, even if present on input', () => {
    const parsed = VaultGetResultSchema.parse({ exists: true, value: 'leaked-secret' } as any);
    expect(parsed).toEqual({ exists: true });
    expect((parsed as any).value).toBeUndefined();
  });
});

describe('StateSchema', () => {
  it('accepts a valid versioned state object', () => {
    expect(StateSchema.safeParse({ version: 1, currentStep: 'welcome' }).success).toBe(true);
    expect(
      StateSchema.safeParse({ version: 1, currentStep: 'welcome', domainLabel: 'liv' }).success
    ).toBe(true);
  });

  it('rejects any version other than the literal 1', () => {
    expect(StateSchema.safeParse({ version: 2, currentStep: 'welcome' }).success).toBe(false);
  });

  it('rejects a state object missing currentStep', () => {
    expect(StateSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});

describe('CHANNELS', () => {
  it('defines the namespace:action IPC channel names', () => {
    expect(CHANNELS.vaultSet).toBe('vault:set');
    expect(CHANNELS.vaultHas).toBe('vault:has');
    expect(CHANNELS.stateGet).toBe('state:get');
    expect(CHANNELS.stateSet).toBe('state:set');
    expect(CHANNELS.statusSimulate).toBe('status:simulate');
    expect(CHANNELS.statusChanged).toBe('status:changed');
    expect(CHANNELS.windowMinimize).toBe('window:minimize');
    expect(CHANNELS.windowHide).toBe('window:hide');
    expect(CHANNELS.appQuit).toBe('app:quit');
  });
});
