import { describe, it, expect } from 'vitest';
import {
  mapWslDetectResult,
  mapWslEnableResult,
  mapInstallInvokeResult,
  mapDistroInstallResult,
  formatDownloadReadout,
  installStepCaptions,
} from '../../src/renderer/screens/wsl/wsl-flow';
import type {
  WslDetectResult,
  WslDistroInstallResult,
} from '../../shared/ipc-contract';

describe('mapWslDetectResult (WSL2 sub-router SOLE result->step router)', () => {
  it('ready -> wsl-handoff (WSL usable + distro present -> proceed to install handoff)', () => {
    expect(mapWslDetectResult({ kind: 'ready' })).toEqual({ step: 'wsl-handoff' });
  });

  it('distro-missing -> resource (WSL ready, need to allocate + install)', () => {
    expect(mapWslDetectResult({ kind: 'distro-missing' })).toEqual({ step: 'resource' });
  });

  it('needs-enable -> wsl-enable', () => {
    expect(mapWslDetectResult({ kind: 'needs-enable' })).toEqual({ step: 'wsl-enable' });
  });

  it('needs-reboot -> wsl-restart', () => {
    expect(mapWslDetectResult({ kind: 'needs-reboot' })).toEqual({ step: 'wsl-restart' });
  });

  it('bios-blocked -> bios-deadend', () => {
    expect(mapWslDetectResult({ kind: 'bios-blocked' })).toEqual({ step: 'bios-deadend' });
  });

  it('wsl-missing -> wsl-enable (wsl.exe absent -- the elevated enable self-bootstraps the feature)', () => {
    expect(mapWslDetectResult({ kind: 'wsl-missing' })).toEqual({ step: 'wsl-enable' });
  });

  it('is total over all six WslDetectResult kinds', () => {
    const kinds: WslDetectResult['kind'][] = [
      'ready',
      'needs-enable',
      'needs-reboot',
      'bios-blocked',
      'distro-missing',
      'wsl-missing',
    ];
    for (const kind of kinds) {
      expect(() => mapWslDetectResult({ kind } as WslDetectResult)).not.toThrow();
    }
  });
});

describe('mapWslEnableResult (WslEnable.tsx screen-safe outcome rename)', () => {
  it('needs-reboot -> restart-required', () => {
    expect(mapWslEnableResult({ kind: 'needs-reboot' })).toEqual({ outcome: 'restart-required' });
  });

  it('bios-blocked -> bios-deadend', () => {
    expect(mapWslEnableResult({ kind: 'bios-blocked' })).toEqual({ outcome: 'bios-deadend' });
  });

  it('declined -> declined', () => {
    expect(mapWslEnableResult({ kind: 'declined' })).toEqual({ outcome: 'declined' });
  });

  it('error -> error', () => {
    expect(mapWslEnableResult({ kind: 'error' })).toEqual({ outcome: 'error' });
  });
});

describe('mapInstallInvokeResult (Screen 6 outcome mapping)', () => {
  it('ok -> done', () => {
    expect(mapInstallInvokeResult({ kind: 'ok' })).toEqual({ outcome: 'done' });
  });

  it('systemd-retry -> systemd-retry', () => {
    expect(mapInstallInvokeResult({ kind: 'systemd-retry' })).toEqual({ outcome: 'systemd-retry' });
  });

  it('disk-too-small -> disk', () => {
    expect(mapInstallInvokeResult({ kind: 'disk-too-small' })).toEqual({ outcome: 'disk' });
  });

  it('our-bug -> our-bug', () => {
    expect(mapInstallInvokeResult({ kind: 'our-bug' })).toEqual({ outcome: 'our-bug' });
  });

  it('generic-failure -> generic', () => {
    expect(mapInstallInvokeResult({ kind: 'generic-failure' })).toEqual({ outcome: 'generic' });
  });
});

describe('mapDistroInstallResult (Screen 4 outcome mapping)', () => {
  it('disk-too-small surfaces freeGb + driveLetter for the disk-too-small screen', () => {
    const r: WslDistroInstallResult = { kind: 'disk-too-small', freeGb: 8, driveLetter: 'C' };
    expect(mapDistroInstallResult(r)).toEqual({ kind: 'disk-too-small', freeGb: 8, driveLetter: 'C' });
  });

  it('installed carries no extra fields', () => {
    expect(mapDistroInstallResult({ kind: 'installed' })).toEqual({ kind: 'installed' });
  });
});

describe('formatDownloadReadout (Screen 4 mono readout)', () => {
  it('formats bytes as decimal MB with a rounded percent', () => {
    expect(formatDownloadReadout(3_000_000, 200_000_000)).toBe('3 MB of 200 MB · 2%');
  });

  it('is 0-safe when total is 0', () => {
    expect(formatDownloadReadout(0, 0)).toBe('0 MB of 0 MB · 0%');
  });
});

describe('installStepCaptions (Screen 5 coarse step-list labels)', () => {
  it('returns the 3 coarse Phase-4 labels', () => {
    expect(installStepCaptions()).toEqual([
      'Preparing your system',
      'Installing components',
      'Starting Livinity',
    ]);
  });
});
