import { describe, it, expect } from 'vitest';
import {
  VaultKeySchema,
  StatusSchema,
  VaultSetResultSchema,
  VaultGetResultSchema,
  StateSchema,
  CHANNELS,
  RouteResultSchema,
  KeyActionSchema,
  AccountSchema,
  DeviceLoginUpdateSchema,
  AuthStartDeviceLoginResultSchema,
  WslDetectResultSchema,
  WslDistroInstallResultSchema,
  WslInstallInvokeResultSchema,
  WslConfigApplyResultSchema,
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

  it('accepts a patch carrying the Phase-4 WSL wizard-resume fields', () => {
    expect(
      StateSchema.safeParse({
        version: 1,
        currentStep: 'welcome',
        wslStep: 'resource-allocation',
        wslResourceMemoryGb: 8,
        wslResourceProcessors: 4,
        wslResourceDiskGb: 64,
      }).success
    ).toBe(true);
  });

  it('still accepts the minimal state object without any wsl* fields', () => {
    expect(StateSchema.safeParse({ version: 1, currentStep: 'x' }).success).toBe(true);
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

  it('defines the 9 Phase-2 auth channels (authSignInWithGoogle removed — device-flow pivot, D-16/D-18)', () => {
    expect(CHANNELS.authLogin).toBe('auth:login');
    expect((CHANNELS as Record<string, string>).authSignInWithGoogle).toBeUndefined();
    expect(CHANNELS.authSignOut).toBe('auth:signOut');
    expect(CHANNELS.authGetRoute).toBe('auth:getRoute');
    expect(CHANNELS.authChooseFree).toBe('auth:chooseFree');
    expect(CHANNELS.authGetKeyAction).toBe('auth:getKeyAction');
    expect(CHANNELS.authProbeKey).toBe('auth:probeKey');
    expect(CHANNELS.authRegenerateKey).toBe('auth:regenerateKey');
    expect(CHANNELS.authGetAccount).toBe('auth:getAccount');
    expect(CHANNELS.authOpenExternal).toBe('auth:openExternal');
  });

  it('defines the 3 device-flow channels (device-flow pivot, D-16/D-18)', () => {
    expect(CHANNELS.authStartDeviceLogin).toBe('auth:startDeviceLogin');
    expect(CHANNELS.authCancelDeviceLogin).toBe('auth:cancelDeviceLogin');
    expect(CHANNELS.authDeviceLoginUpdate).toBe('auth:deviceLoginUpdate');
  });

  it('defines the 11 Phase-4 wsl:* channels, each keyed wsl* and valued wsl:*', () => {
    const wslKeys = [
      'wslDetect',
      'wslEnable',
      'wslCheckBios',
      'wslRestartNow',
      'wslDistroInstall',
      'wslInstallInvoke',
      'wslConfigGet',
      'wslConfigApply',
      'wslOpenExternal',
      'wslDownloadUpdate',
      'wslInstallUpdate',
    ] as const;
    const channels = CHANNELS as Record<string, string>;
    for (const key of wslKeys) {
      expect(channels[key]).toBeDefined();
      expect(channels[key].startsWith('wsl:')).toBe(true);
    }
    // Naming-convention guard the 04-09 drift-guard test depends on.
    expect(CHANNELS.wslDetect).toBe('wsl:detect');
    expect(CHANNELS.wslEnable).toBe('wsl:enable');
    expect(CHANNELS.wslDistroInstall).toBe('wsl:distroInstall');
    expect(CHANNELS.wslInstallInvoke).toBe('wsl:installInvoke');
    expect(CHANNELS.wslConfigApply).toBe('wsl:configApply');
  });
});

describe('RouteResultSchema (discriminated union)', () => {
  it('accepts every routing kind', () => {
    expect(RouteResultSchema.safeParse({ kind: 'login' }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'login', expired: true }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'byod-wizard' }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'pro-wizard' }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'legacy-free-wizard' }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'no-entitlement' }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'error', reason: 'network' }).success).toBe(true);
    expect(RouteResultSchema.safeParse({ kind: 'error', reason: 'server' }).success).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(RouteResultSchema.safeParse({ kind: 'bogus' }).success).toBe(false);
  });

  it('rejects an error kind with an unrecognized reason', () => {
    expect(RouteResultSchema.safeParse({ kind: 'error', reason: 'bogus' }).success).toBe(false);
  });
});

describe('KeyActionSchema', () => {
  it('accepts the 4 vault-vs-platform key-state values', () => {
    expect(KeyActionSchema.safeParse('mint').success).toBe(true);
    expect(KeyActionSchema.safeParse('choice-screen').success).toBe(true);
    expect(KeyActionSchema.safeParse('use-cached').success).toBe(true);
    expect(KeyActionSchema.safeParse('stale-reprompt').success).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(KeyActionSchema.safeParse('regenerate').success).toBe(false);
    expect(KeyActionSchema.safeParse('').success).toBe(false);
  });
});

describe('AccountSchema (.strict() leak guard)', () => {
  it('accepts safe account fields', () => {
    expect(AccountSchema.safeParse({ email: 'a@b.com', username: null }).success).toBe(true);
    expect(AccountSchema.safeParse({ email: 'a@b.com', username: 'bruce' }).success).toBe(true);
  });

  it('REJECTS an object carrying an extra apiKey field (strict leak guard)', () => {
    const result = AccountSchema.safeParse({
      email: 'a@b.com',
      username: null,
      apiKey: 'liv_k_leaked',
    });
    expect(result.success).toBe(false);
  });
});

describe('DeviceLoginUpdateSchema (discriminated union, device-flow pivot)', () => {
  it('accepts every phase variant', () => {
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'waiting' }).success).toBe(true);
    expect(
      DeviceLoginUpdateSchema.safeParse({
        phase: 'approved',
        route: { kind: 'byod-wizard' },
        account: { email: 'a@b.co', username: null },
      }).success
    ).toBe(true);
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'expired' }).success).toBe(true);
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'error', reason: 'network' }).success).toBe(true);
    expect(
      DeviceLoginUpdateSchema.safeParse({ phase: 'error', reason: 'exchange_failed' }).success
    ).toBe(true);
    expect(
      DeviceLoginUpdateSchema.safeParse({ phase: 'error', reason: 'session_revoked' }).success
    ).toBe(true);
    expect(
      DeviceLoginUpdateSchema.safeParse({ phase: 'error', reason: 'already_exchanged' }).success
    ).toBe(true);
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'error', reason: 'unknown' }).success).toBe(true);
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'cancelled' }).success).toBe(true);
  });

  it('rejects an unknown phase', () => {
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'bogus' }).success).toBe(false);
  });

  it('rejects an error phase with an unrecognized reason', () => {
    expect(DeviceLoginUpdateSchema.safeParse({ phase: 'error', reason: 'bogus' }).success).toBe(false);
  });

  it('REJECTS an approved phase whose account carries an extra leaked field (strict guard via AccountSchema)', () => {
    const result = DeviceLoginUpdateSchema.safeParse({
      phase: 'approved',
      route: { kind: 'byod-wizard' },
      account: { email: 'a@b.co', username: null, apiKey: 'liv_k_leaked' },
    });
    expect(result.success).toBe(false);
  });
});

describe('AuthStartDeviceLoginResultSchema (discriminated union)', () => {
  it('accepts the ok:true variant', () => {
    expect(
      AuthStartDeviceLoginResultSchema.safeParse({ ok: true, userCode: 'ABCD-2345', expiresInMs: 900000 })
        .success
    ).toBe(true);
  });

  it('accepts the ok:false variants', () => {
    expect(AuthStartDeviceLoginResultSchema.safeParse({ ok: false, reason: 'network' }).success).toBe(true);
    expect(
      AuthStartDeviceLoginResultSchema.safeParse({ ok: false, reason: 'already_running' }).success
    ).toBe(true);
  });

  it('rejects an unrecognized ok:false reason', () => {
    expect(AuthStartDeviceLoginResultSchema.safeParse({ ok: false, reason: 'bogus' }).success).toBe(false);
  });
});

describe('WslDetectResultSchema (discriminated union)', () => {
  it('accepts every valid kind', () => {
    for (const kind of [
      'ready',
      'needs-enable',
      'needs-reboot',
      'bios-blocked',
      'distro-missing',
      'wsl-missing',
    ]) {
      expect(WslDetectResultSchema.safeParse({ kind }).success).toBe(true);
    }
  });

  it('rejects an unknown kind', () => {
    expect(WslDetectResultSchema.safeParse({ kind: 'bogus' }).success).toBe(false);
  });
});

describe('WslDistroInstallResultSchema (discriminated union)', () => {
  it('accepts disk-too-small with its required payload', () => {
    expect(
      WslDistroInstallResultSchema.safeParse({ kind: 'disk-too-small', freeGb: 8, driveLetter: 'C' })
        .success
    ).toBe(true);
  });

  it('rejects disk-too-small missing freeGb (proves the payload shape is enforced)', () => {
    expect(
      WslDistroInstallResultSchema.safeParse({ kind: 'disk-too-small', driveLetter: 'C' }).success
    ).toBe(false);
  });

  it('accepts the other bare-kind variants', () => {
    for (const kind of ['installed', 'arch-unsupported', 'download-failed', 'checksum-failed', 'error']) {
      expect(WslDistroInstallResultSchema.safeParse({ kind }).success).toBe(true);
    }
  });
});

describe('WslInstallInvokeResultSchema (discriminated union)', () => {
  it('accepts each of the 5 kinds', () => {
    expect(WslInstallInvokeResultSchema.safeParse({ kind: 'ok' }).success).toBe(true);
    expect(WslInstallInvokeResultSchema.safeParse({ kind: 'systemd-retry' }).success).toBe(true);
    expect(WslInstallInvokeResultSchema.safeParse({ kind: 'disk-too-small' }).success).toBe(true);
    expect(WslInstallInvokeResultSchema.safeParse({ kind: 'our-bug' }).success).toBe(true);
    expect(WslInstallInvokeResultSchema.safeParse({ kind: 'generic-failure' }).success).toBe(true);
  });

  it('accepts generic-failure with an optional reason string', () => {
    expect(
      WslInstallInvokeResultSchema.safeParse({ kind: 'generic-failure', reason: 'exit code 1' }).success
    ).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(WslInstallInvokeResultSchema.safeParse({ kind: 'bogus' }).success).toBe(false);
  });
});

describe('WslConfigApplyResultSchema (discriminated union)', () => {
  it('accepts ok:true', () => {
    expect(WslConfigApplyResultSchema.safeParse({ ok: true }).success).toBe(true);
  });

  it('accepts ok:false with a valid reason', () => {
    expect(
      WslConfigApplyResultSchema.safeParse({ ok: false, reason: 'invalid_values' }).success
    ).toBe(true);
  });

  it('rejects ok:false with an unrecognized reason', () => {
    expect(WslConfigApplyResultSchema.safeParse({ ok: false, reason: 'nope' }).success).toBe(false);
  });
});
