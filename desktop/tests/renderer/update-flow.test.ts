import { describe, it, expect } from 'vitest';
import { updateStatusLine, checkButton, restartCta } from '../../src/renderer/screens/update-flow';
import type { UpdateUiState } from '../../shared/ipc-contract';

/**
 * Flat table, one `it` per <behavior> row (mirrors tests/renderer/settings-flow.test.ts /
 * tests/wsl/wsl-flow.test.ts). Copy is asserted verbatim against 07-UI-SPEC §3 -- these
 * exact strings are what the About & updates card renders, no paraphrase.
 */
function state(partial: Partial<UpdateUiState>): UpdateUiState {
  return {
    state: 'idle',
    readyVersion: null,
    currentVersion: '0.2.0',
    installBlocked: false,
    ...partial,
  };
}

describe('updateStatusLine (7 exact UI-SPEC variants)', () => {
  it("'idle' => \"Livinity checks for updates automatically.\"", () => {
    expect(updateStatusLine(state({ state: 'idle' }))).toBe('Livinity checks for updates automatically.');
  });

  it("'checking' => \"Checking for updates…\"", () => {
    expect(updateStatusLine(state({ state: 'checking' }))).toBe('Checking for updates…');
  });

  it("'up-to-date' => \"You're up to date.\"", () => {
    expect(updateStatusLine(state({ state: 'up-to-date' }))).toBe("You're up to date.");
  });

  it("'downloading' => \"Downloading an update in the background. You can keep using Livinity.\"", () => {
    expect(updateStatusLine(state({ state: 'downloading' }))).toBe(
      'Downloading an update in the background. You can keep using Livinity.'
    );
  });

  it("'ready' interpolates readyVersion => \"Version {X.Y.Z} is ready. Restart Livinity Desktop when convenient — your server keeps running.\"", () => {
    expect(updateStatusLine(state({ state: 'ready', readyVersion: '0.3.0' }))).toBe(
      "Version 0.3.0 is ready. Restart Livinity Desktop when convenient — your server keeps running."
    );
  });

  it("'failed' => \"Couldn't check for updates — Livinity will try again automatically.\"", () => {
    expect(updateStatusLine(state({ state: 'failed' }))).toBe(
      "Couldn't check for updates — Livinity will try again automatically."
    );
  });

  it("'dev' => \"Automatic updates work in the installed app.\"", () => {
    expect(updateStatusLine(state({ state: 'dev' }))).toBe('Automatic updates work in the installed app.');
  });
});

describe('checkButton', () => {
  it("'dev' => visible:false (no check button in an unpackaged run)", () => {
    expect(checkButton(state({ state: 'dev' }))).toEqual({
      label: 'Check for updates',
      disabled: false,
      visible: false,
    });
  });

  it("'checking' => label 'Checking…', disabled:true, visible:true", () => {
    expect(checkButton(state({ state: 'checking' }))).toEqual({
      label: 'Checking…',
      disabled: true,
      visible: true,
    });
  });

  it("'downloading' => label 'Checking…', disabled:true, visible:true", () => {
    expect(checkButton(state({ state: 'downloading' }))).toEqual({
      label: 'Checking…',
      disabled: true,
      visible: true,
    });
  });

  it("'idle' => label 'Check for updates', disabled:false, visible:true", () => {
    expect(checkButton(state({ state: 'idle' }))).toEqual({
      label: 'Check for updates',
      disabled: false,
      visible: true,
    });
  });

  it("'up-to-date' => label 'Check for updates', disabled:false, visible:true", () => {
    expect(checkButton(state({ state: 'up-to-date' }))).toEqual({
      label: 'Check for updates',
      disabled: false,
      visible: true,
    });
  });

  it("'ready' => label 'Check for updates', disabled:false, visible:true", () => {
    expect(checkButton(state({ state: 'ready', readyVersion: '0.3.0' }))).toEqual({
      label: 'Check for updates',
      disabled: false,
      visible: true,
    });
  });

  it("'failed' => label 'Check for updates', disabled:false, visible:true", () => {
    expect(checkButton(state({ state: 'failed' }))).toEqual({
      label: 'Check for updates',
      disabled: false,
      visible: true,
    });
  });
});

describe('restartCta', () => {
  it("READY-ONLY TRAP: 'idle' => visible:false, regardless of installBlocked", () => {
    expect(restartCta(state({ state: 'idle', installBlocked: true }))).toEqual({
      visible: false,
      label: 'Restart to update',
      disabled: false,
      blockedNote: null,
    });
  });

  it("'checking'/'downloading'/'up-to-date'/'failed'/'dev' => visible:false", () => {
    for (const s of ['checking', 'downloading', 'up-to-date', 'failed', 'dev'] as const) {
      expect(restartCta(state({ state: s })).visible).toBe(false);
    }
  });

  it("'ready', installBlocked:false => visible:true, enabled, no blockedNote", () => {
    expect(restartCta(state({ state: 'ready', readyVersion: '0.3.0', installBlocked: false }))).toEqual({
      visible: true,
      label: 'Restart to update',
      disabled: false,
      blockedNote: null,
    });
  });

  it("'ready', installBlocked:true => visible:true, disabled, exact blockedNote (D-06)", () => {
    expect(restartCta(state({ state: 'ready', readyVersion: '0.3.0', installBlocked: true }))).toEqual({
      visible: true,
      label: 'Restart to update',
      disabled: true,
      blockedNote: 'Setup is in progress — you can restart to update once it finishes.',
    });
  });
});
