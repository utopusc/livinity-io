import { describe, it, expect } from 'vitest';
import {
  provisionResultToOutcome,
  provisionPhaseCopy,
  provisionStepPhrase,
  apexHostFrom,
} from '../src/renderer/screens/cloudflare/cf-flow';
import type { CfProvisionResult } from '../shared/ipc-contract';

describe('provisionResultToOutcome (App CF sub-router routing)', () => {
  it('ready -> cf-ready and carries the summary through verbatim', () => {
    const summary = { address: 'liv.bruceoz.com', tunnelName: 'livos-drampa', recordsLabel: '1 record' };
    const r: CfProvisionResult = { kind: 'ready', summary };
    const outcome = provisionResultToOutcome(r);
    expect(outcome).toEqual({ step: 'cf-ready', summary });
  });

  it('collision -> cf-collision (bare signal, no hostname)', () => {
    const outcome = provisionResultToOutcome({ kind: 'collision' });
    expect(outcome).toEqual({ step: 'cf-collision' });
  });

  it('scope-missing (WRITE-403) -> cf-token with the per-scope rows + write step, NEVER a generic failure', () => {
    const rows = [
      { scope: 'dns' as const, ok: false, missingLabel: 'Zone · DNS · Edit' },
      { scope: 'tunnel' as const, ok: true },
      { scope: 'zone' as const, ok: true },
    ];
    const outcome = provisionResultToOutcome({ kind: 'scope-missing', step: 'dns', rows });
    expect(outcome).toEqual({ step: 'cf-token', rows, writeStep: 'dns' });
  });

  it('network -> stays on the provisioning card with a network error', () => {
    expect(provisionResultToOutcome({ kind: 'network' })).toEqual({
      step: 'cf-provisioning',
      error: 'network',
    });
  });

  it('error -> stays on the provisioning card with a generic error', () => {
    expect(provisionResultToOutcome({ kind: 'error', reason: 'internal_error' })).toEqual({
      step: 'cf-provisioning',
      error: 'error',
    });
  });
});

describe('provisionPhaseCopy (UI-SPEC provisioning progress copy)', () => {
  it('maps each provisioning phase to its UI-SPEC line', () => {
    expect(provisionPhaseCopy('tunnel')).toBe('Setting up your secure tunnel…');
    expect(provisionPhaseCopy('ingress')).toBe('Connecting your address…');
    expect(provisionPhaseCopy('dns')).toBe('Creating your address…');
  });

  it('defaults to the tunnel copy before the first push arrives (null)', () => {
    expect(provisionPhaseCopy(null)).toBe('Setting up your secure tunnel…');
  });
});

describe('provisionStepPhrase (provisioning-403 template phrase)', () => {
  it('fills the "Livinity couldn\'t {phrase}" template per failing write step', () => {
    expect(provisionStepPhrase('tunnel')).toBe('create the tunnel');
    expect(provisionStepPhrase('ingress')).toBe('connect your address');
    expect(provisionStepPhrase('dns')).toBe('update your DNS');
  });
});

describe('apexHostFrom (Collision screen apexHost)', () => {
  it('joins sub-label and zone into the apex host', () => {
    expect(apexHostFrom('liv', 'bruceoz.com')).toBe('liv.bruceoz.com');
  });

  it('is empty-safe when a fact is still missing (no ".undefined" leak)', () => {
    expect(apexHostFrom('', 'bruceoz.com')).toBe('');
    expect(apexHostFrom('liv', '')).toBe('');
  });
});
