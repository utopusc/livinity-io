import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let currentStateDir = '';

vi.mock('electron', () => ({
  app: { getPath: () => currentStateDir },
}));

import { writeState, readState } from '../src/main/storage/state-store';
import { StateSchema } from '../shared/ipc-contract';

describe('state-store', () => {
  beforeEach(async () => {
    currentStateDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'liv-state-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsPromises.rm(currentStateDir, { recursive: true, force: true });
  });

  it('round-trips a state object through writeState then readState', async () => {
    await writeState({ version: 1, currentStep: 'wsl-enable' });
    expect(await readState()).toEqual({ version: 1, currentStep: 'wsl-enable' });
  });

  it('returns null when state.json does not exist yet (first run)', async () => {
    expect(await readState()).toBe(null);
  });

  it('returns null when state.json contains malformed JSON (corrupt file)', async () => {
    await fsPromises.writeFile(path.join(currentStateDir, 'state.json'), '{not json', 'utf8');
    expect(await readState()).toBe(null);
  });

  it('returns null when state.json is valid JSON but fails schema validation (tampered)', async () => {
    await fsPromises.writeFile(
      path.join(currentStateDir, 'state.json'),
      JSON.stringify({ version: 2, currentStep: 'x' }),
      'utf8'
    );
    expect(await readState()).toBe(null);
  });

  it('retries fs.rename once on a transient EPERM then succeeds (atomic rename survives a transient lock)', async () => {
    const realRename = fsPromises.rename.bind(fsPromises);
    let calls = 0;
    const renameSpy = vi
      .spyOn(fsPromises, 'rename')
      .mockImplementation(async (from: any, to: any) => {
        calls++;
        if (calls === 1) {
          const err: any = new Error('EPERM: operation not permitted, rename');
          err.code = 'EPERM';
          throw err;
        }
        return realRename(from, to);
      });

    await writeState({ version: 1, currentStep: 'after-retry' });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(await readState()).toEqual({ version: 1, currentStep: 'after-retry' });

    renameSpy.mockRestore();
  });

  it('the shared StateSchema has no secret-shaped fields (session/apiKey/token)', () => {
    const fieldNames = Object.keys(StateSchema.shape);
    expect(fieldNames).not.toContain('session');
    expect(fieldNames).not.toContain('apiKey');
    expect(fieldNames).not.toContain('token');
  });
});
