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
  WslInstallUpdateSchema,
  INSTALL_CAPTIONS,
  FailureVerdictSchema,
  FlowRouteSchema,
  ConnectedProbeResultSchema,
  EngineStatusResultSchema,
  EngineNavigateSchema,
  ENGINE_TRANSITION_LABELS,
  type EngineApi,
  UpdateUiStateSchema,
  DiagnosticsExportResultSchema,
  RemoveOfferSchema,
  RemoveChoicesSchema,
  RemoveStepIdSchema,
  RemoveProgressSchema,
  RemoveExecuteAckSchema,
  REMOVE_STEP_LABELS,
  type UpdateApi,
  type SupportApi,
  type RemoveApi,
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

describe('Phase 5 flow contract', () => {
  // (f) T-05-01 leak-guard — same recursive-key scan cf.ipc.test.ts/wsl.ipc.test.ts
  // use, applied here to representative parsed instances of every new Phase-5
  // schema (mirrors the CF/WSL no-secret-across-IPC invariant).
  function hasSecretKey(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|apiKey/i.test(k)) return true;
      if (hasSecretKey(v)) return true;
    }
    return false;
  }

  it('(a) StateSchema still parses with NO flowStep (backward compat), and with flowStep set', () => {
    expect(StateSchema.safeParse({ version: 1, currentStep: 'welcome' }).success).toBe(true);
    expect(
      StateSchema.safeParse({ version: 1, currentStep: 'welcome', flowStep: 'installing' }).success
    ).toBe(true);
  });

  it('(b) WslInstallUpdateSchema accepts a bare phase (no caption) and the full enriched shape', () => {
    expect(WslInstallUpdateSchema.safeParse({ phase: 'installing' }).success).toBe(true);
    expect(
      WslInstallUpdateSchema.safeParse({
        phase: 'installing',
        caption: 'x',
        stepIndex: 3,
        stepTotal: 6,
      }).success
    ).toBe(true);
  });

  it('(c) INSTALL_CAPTIONS has exactly 6 entries', () => {
    expect(INSTALL_CAPTIONS.length).toBe(6);
  });

  it('(d) every flow: CHANNELS value matches its key (drift sanity)', () => {
    const channels = CHANNELS as Record<string, string>;
    const flowKeys = Object.keys(channels).filter((k) => channels[k].startsWith('flow:'));
    expect(flowKeys.length).toBe(5);
    for (const key of flowKeys) {
      const action = channels[key].slice('flow:'.length);
      // key is "flow" + Capitalized action, e.g. flowEnter -> 'flow:enter'
      expect(key.toLowerCase()).toBe(`flow${action}`.toLowerCase());
    }
    expect(CHANNELS.flowEnter).toBe('flow:enter');
    expect(CHANNELS.flowResume).toBe('flow:resume');
    expect(CHANNELS.flowConnectedCheck).toBe('flow:connectedCheck');
    expect(CHANNELS.flowOpenBox).toBe('flow:openBox');
    expect(CHANNELS.flowOpenExternal).toBe('flow:openExternal');
  });

  it('(e) FlowRouteSchema parses live-success with a nullable address and rejects an unknown kind', () => {
    expect(FlowRouteSchema.safeParse({ kind: 'live-success', address: null }).success).toBe(true);
    expect(FlowRouteSchema.safeParse({ kind: 'bogus' }).success).toBe(false);
  });

  it('(f) no Phase-5 schema shape carries a token/secret/apiKey key', () => {
    expect(hasSecretKey(FailureVerdictSchema.parse({ screen: 'generic', retryStep: 'installing' }))).toBe(
      false
    );
    for (const route of [
      { kind: 'cf-wizard' },
      { kind: 'wsl-detect', resume: true },
      { kind: 'installing' },
      { kind: 'connected-check' },
      { kind: 'live-success', address: null },
      { kind: 'cf-reconnect' },
    ]) {
      expect(hasSecretKey(FlowRouteSchema.parse(route))).toBe(false);
    }
    for (const probe of [
      { kind: 'connected', address: null },
      { kind: 'still-confirming', address: null },
    ]) {
      expect(hasSecretKey(ConnectedProbeResultSchema.parse(probe))).toBe(false);
    }
  });

  it('(g) FailureVerdictSchema accepts the D-07 carrier shapes and rejects a bad screen value', () => {
    expect(
      FailureVerdictSchema.safeParse({ screen: 'no-tunnel-410', retryStep: 'installing' }).success
    ).toBe(true);
    expect(FailureVerdictSchema.safeParse({ screen: 'disk', retryStep: 'installing' }).success).toBe(
      true
    );
    expect(FailureVerdictSchema.safeParse({ screen: 'bogus', retryStep: 'installing' }).success).toBe(
      false
    );
  });
});

describe('Phase 6 engine contract', () => {
  // (f) T-05-01 leak-guard — same recursive-key scan reused verbatim from the
  // Phase-5 block above, applied to the new engine-surface schemas.
  function hasSecretKey(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|apiKey/i.test(k)) return true;
      if (hasSecretKey(v)) return true;
    }
    return false;
  }

  it('(a) StateSchema still parses with NEITHER new field (backward compat)', () => {
    expect(StateSchema.safeParse({ version: 1, currentStep: '' }).success).toBe(true);
  });

  it('(a) StateSchema round-trips engineDesiredState + startAtLogin together', () => {
    expect(
      StateSchema.safeParse({
        version: 1,
        currentStep: 'welcome',
        engineDesiredState: 'stopped',
        startAtLogin: false,
      }).success
    ).toBe(true);
  });

  it('(a) StateSchema rejects an out-of-enum engineDesiredState (Tampering mitigation, T-06-01)', () => {
    expect(
      StateSchema.safeParse({
        version: 1,
        currentStep: 'welcome',
        engineDesiredState: 'paused',
      }).success
    ).toBe(false);
  });

  it('(b) every engine: CHANNELS value matches its key (drift sanity), incl. engineOpenInBrowser', () => {
    const channels = CHANNELS as Record<string, string>;
    const engineKeys = Object.keys(channels).filter((k) => channels[k].startsWith('engine:'));
    expect(engineKeys.length).toBe(9);
    for (const key of engineKeys) {
      const action = channels[key].slice('engine:'.length);
      // key is "engine" + Capitalized action, e.g. engineOpenInBrowser -> 'engine:openInBrowser'
      expect(key.toLowerCase()).toBe(`engine${action}`.toLowerCase());
    }
    expect(CHANNELS.engineStart).toBe('engine:start');
    expect(CHANNELS.engineStop).toBe('engine:stop');
    expect(CHANNELS.engineRestart).toBe('engine:restart');
    expect(CHANNELS.engineGetStatus).toBe('engine:getStatus');
    expect(CHANNELS.engineSetStartAtLogin).toBe('engine:setStartAtLogin');
    expect(CHANNELS.engineOpenDashboard).toBe('engine:openDashboard');
    expect(CHANNELS.engineOpenInBrowser).toBe('engine:openInBrowser');
    expect(CHANNELS.engineOpenLogsFolder).toBe('engine:openLogsFolder');
    expect(CHANNELS.engineNavigate).toBe('engine:navigate');
  });

  it('(c) EngineApi surface has engineOpenInBrowser (compile-time fixture)', () => {
    const fixture = {
      engineStart: async () => ({ ok: true }),
      engineStop: async () => ({ ok: true }),
      engineRestart: async () => ({ ok: true }),
      engineGetStatus: async () => ({
        state: 'running' as const,
        address: null,
        lastCheckedAt: null,
        desiredState: 'running' as const,
      }),
      engineSetStartAtLogin: async (enabled: boolean) => ({ ok: true, startAtLogin: enabled }),
      engineOpenDashboard: async () => {},
      engineOpenInBrowser: async () => {},
      engineOpenLogsFolder: async () => {},
      onEngineNavigate: () => () => {},
    } satisfies EngineApi;
    expect(typeof fixture.engineOpenInBrowser).toBe('function');
  });

  it('(d) ENGINE_TRANSITION_LABELS carries the exact three literals', () => {
    expect(ENGINE_TRANSITION_LABELS.starting).toBe('Starting…');
    expect(ENGINE_TRANSITION_LABELS.stopping).toBe('Stopping…');
    expect(ENGINE_TRANSITION_LABELS.restarting).toBe('Restarting…');
  });

  it('(e) EngineStatusResultSchema parses both the running and stopped shapes', () => {
    expect(
      EngineStatusResultSchema.safeParse({
        state: 'running',
        address: 'liv.x.com',
        lastCheckedAt: 123,
        desiredState: 'running',
      }).success
    ).toBe(true);
    expect(
      EngineStatusResultSchema.safeParse({
        state: 'stopped',
        address: null,
        lastCheckedAt: null,
        desiredState: 'stopped',
      }).success
    ).toBe(true);
  });

  it('(e) EngineStatusResultSchema rejects an unknown state', () => {
    expect(
      EngineStatusResultSchema.safeParse({
        state: 'bogus',
        address: null,
        lastCheckedAt: null,
        desiredState: 'running',
      }).success
    ).toBe(false);
  });

  it('(f) no engine-surface schema shape carries a token/secret/apiKey key', () => {
    expect(
      hasSecretKey(
        EngineStatusResultSchema.parse({
          state: 'running',
          address: 'liv.x.com',
          lastCheckedAt: 123,
          desiredState: 'running',
        })
      )
    ).toBe(false);
    expect(hasSecretKey(EngineNavigateSchema.parse({ screen: 'settings' }))).toBe(false);
  });
});

describe('Phase 7 update/support/remove contract', () => {
  // Same recursive-key leak-guard scan as the Phase 5/6 blocks above, applied to the
  // new update/support/remove-surface schemas.
  function hasSecretKey(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|apiKey/i.test(k)) return true;
      if (hasSecretKey(v)) return true;
    }
    return false;
  }

  it('StateSchema still parses with NO lastUpdateNotifiedVersion (backward compat)', () => {
    expect(StateSchema.safeParse({ version: 1, currentStep: '' }).success).toBe(true);
  });

  it('StateSchema round-trips lastUpdateNotifiedVersion', () => {
    expect(
      StateSchema.safeParse({
        version: 1,
        currentStep: 'welcome',
        lastUpdateNotifiedVersion: '0.2.0',
      }).success
    ).toBe(true);
  });

  it('StateSchema rejects a non-string lastUpdateNotifiedVersion (type guard)', () => {
    expect(
      StateSchema.safeParse({
        version: 1,
        currentStep: 'welcome',
        lastUpdateNotifiedVersion: 123,
      }).success
    ).toBe(false);
  });

  it('defines the update:*/support:*/remove:* channel literals, each keyed correctly', () => {
    expect(CHANNELS.updateGetState).toBe('update:getState');
    expect(CHANNELS.updateCheck).toBe('update:check');
    expect(CHANNELS.updateRestartToInstall).toBe('update:restartToInstall');
    expect(CHANNELS.updateStatus).toBe('update:status');
    expect(CHANNELS.supportExportDiagnostics).toBe('support:exportDiagnostics');
    expect(CHANNELS.removeGetOffer).toBe('remove:getOffer');
    expect(CHANNELS.removeExecute).toBe('remove:execute');
    expect(CHANNELS.removeFinish).toBe('remove:finish');
    expect(CHANNELS.removeProgress).toBe('remove:progress');
    expect(CHANNELS.removeOpenCfDashboard).toBe('remove:openCfDashboard');
  });

  it('every update:/support:/remove: CHANNELS value matches its key (drift sanity)', () => {
    const channels = CHANNELS as Record<string, string>;
    const prefixes = ['update:', 'support:', 'remove:'];
    let total = 0;
    for (const prefix of prefixes) {
      const keys = Object.keys(channels).filter((k) => channels[k].startsWith(prefix));
      total += keys.length;
      for (const key of keys) {
        const action = channels[key].slice(prefix.length);
        const namespace = prefix.slice(0, -1); // 'update:' -> 'update'
        expect(key.toLowerCase()).toBe(`${namespace}${action}`.toLowerCase());
      }
    }
    expect(total).toBe(10); // 4 update + 1 support + 5 remove
  });

  it('UpdateUiStateSchema parses the ready and idle shapes', () => {
    expect(
      UpdateUiStateSchema.safeParse({
        state: 'ready',
        readyVersion: '0.2.1',
        currentVersion: '0.2.0',
        installBlocked: false,
      }).success
    ).toBe(true);
    expect(
      UpdateUiStateSchema.safeParse({
        state: 'idle',
        readyVersion: null,
        currentVersion: '0.2.0',
        installBlocked: false,
      }).success
    ).toBe(true);
  });

  it('UpdateUiStateSchema rejects a state outside the update enum', () => {
    expect(
      UpdateUiStateSchema.safeParse({
        state: 'installing',
        readyVersion: null,
        currentVersion: '0.2.0',
        installBlocked: false,
      }).success
    ).toBe(false);
  });

  it('DiagnosticsExportResultSchema parses every outcome', () => {
    for (const outcome of ['saved', 'folder-fallback', 'cancelled', 'failed']) {
      expect(DiagnosticsExportResultSchema.safeParse({ outcome }).success).toBe(true);
    }
    expect(DiagnosticsExportResultSchema.safeParse({ outcome: 'bogus' }).success).toBe(false);
  });

  it('RemoveOfferSchema and RemoveChoicesSchema parse their base shapes', () => {
    expect(RemoveOfferSchema.safeParse({ offerCfTeardown: false, apexHost: null }).success).toBe(
      true
    );
    expect(
      RemoveOfferSchema.safeParse({ offerCfTeardown: true, apexHost: 'liv.example.com' }).success
    ).toBe(true);
    expect(
      RemoveChoicesSchema.safeParse({ cf: false, distro: false, clear: false }).success
    ).toBe(true);
  });

  it('RemoveStepIdSchema accepts the 4 step ids and rejects an unknown one', () => {
    for (const id of ['stop-engine', 'cf-teardown', 'distro-remove', 'credential-clear']) {
      expect(RemoveStepIdSchema.safeParse(id).success).toBe(true);
    }
    expect(RemoveStepIdSchema.safeParse('nuke-everything').success).toBe(false);
  });

  it('RemoveProgressSchema parses a valid step/status pair', () => {
    expect(
      RemoveProgressSchema.safeParse({ stepId: 'cf-teardown', status: 'failed' }).success
    ).toBe(true);
  });

  it('RemoveExecuteAckSchema parses the blocked-empty and populated shapes, rejects a bad stepId', () => {
    expect(
      RemoveExecuteAckSchema.safeParse({ blockedByInstall: true, steps: [] }).success
    ).toBe(true);
    expect(
      RemoveExecuteAckSchema.safeParse({
        blockedByInstall: false,
        steps: ['stop-engine', 'cf-teardown'],
      }).success
    ).toBe(true);
    expect(
      RemoveExecuteAckSchema.safeParse({ blockedByInstall: false, steps: ['bogus'] }).success
    ).toBe(false);
  });

  it('REMOVE_STEP_LABELS has exactly the 4 RemoveStepId keys with the exact captions', () => {
    expect(REMOVE_STEP_LABELS['stop-engine']).toBe('Stopping your server');
    expect(Object.keys(REMOVE_STEP_LABELS).sort()).toEqual(
      ['cf-teardown', 'credential-clear', 'distro-remove', 'stop-engine'].sort()
    );
  });

  it('compile-time fixture: UpdateApi/SupportApi/RemoveApi surfaces exist', () => {
    const updateFixture = {
      updateGetState: async () => ({
        state: 'idle' as const,
        readyVersion: null,
        currentVersion: '0.2.0',
        installBlocked: false,
      }),
      updateCheck: async () => {},
      updateRestartToInstall: async () => ({ ok: true, blocked: false }),
      onUpdateStatus: () => () => {},
    } satisfies UpdateApi;
    const supportFixture = {
      supportExportDiagnostics: async () => ({ outcome: 'saved' as const }),
    } satisfies SupportApi;
    const removeFixture = {
      removeGetOffer: async () => ({ offerCfTeardown: false, apexHost: null }),
      removeExecute: async () => ({ blockedByInstall: false, steps: [] }),
      removeFinish: async () => {},
      removeOpenCfDashboard: async () => {},
      onRemoveProgress: () => () => {},
    } satisfies RemoveApi;
    expect(typeof updateFixture.updateRestartToInstall).toBe('function');
    expect(typeof supportFixture.supportExportDiagnostics).toBe('function');
    expect(typeof removeFixture.removeExecute).toBe('function');
  });

  it('no update/support/remove result schema shape carries a token/secret/apiKey key', () => {
    expect(
      hasSecretKey(
        UpdateUiStateSchema.parse({
          state: 'ready',
          readyVersion: '0.2.1',
          currentVersion: '0.2.0',
          installBlocked: false,
        })
      )
    ).toBe(false);
    expect(hasSecretKey(DiagnosticsExportResultSchema.parse({ outcome: 'saved' }))).toBe(false);
    expect(
      hasSecretKey(RemoveOfferSchema.parse({ offerCfTeardown: true, apexHost: 'liv.example.com' }))
    ).toBe(false);
    expect(
      hasSecretKey(RemoveProgressSchema.parse({ stepId: 'cf-teardown', status: 'active' }))
    ).toBe(false);
  });
});
