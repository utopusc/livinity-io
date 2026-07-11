import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * flow.ipc.test.ts mocks the two orchestrator modules registerFlowIpc
 * composes (orchestrator/flow.ts's enterFlow/resumeFlow, orchestrator/
 * connected-probe.ts's runConnectedProbe/deriveAddress) plus electron's
 * ipcMain/shell and the repo's log module, and captures each ipcMain.handle
 * registration by channel string — the same captured-handler-callback
 * technique wsl.ipc.test.ts/cf.ipc.test.ts use, mirrored here for the flow
 * IPC boundary.
 */

const { handleMock, getHandler } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handleMock: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener);
    }),
    getHandler: (channel: string) => handlers.get(channel),
  };
});

const openExternalMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { openExternal: (...args: unknown[]) => openExternalMock(...args) },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

vi.mock('../../src/main/orchestrator/flow', () => ({
  enterFlow: vi.fn(),
  resumeFlow: vi.fn(),
}));

vi.mock('../../src/main/orchestrator/connected-probe', () => ({
  runConnectedProbe: vi.fn(),
  deriveAddress: vi.fn(),
}));

import { CHANNELS } from '../../shared/ipc-contract';
import { enterFlow, resumeFlow } from '../../src/main/orchestrator/flow';
import { runConnectedProbe, deriveAddress } from '../../src/main/orchestrator/connected-probe';
import { registerFlowIpc } from '../../src/main/ipc/flow.ipc';

const enterFlowMock = vi.mocked(enterFlow);
const resumeFlowMock = vi.mocked(resumeFlow);
const runConnectedProbeMock = vi.mocked(runConnectedProbe);
const deriveAddressMock = vi.mocked(deriveAddress);

/**
 * Recursively scans a handler return value for any KEY that looks like a
 * secret (token/secret/apiKey). No Flow* result schema carries a secret
 * field, so no handler return may ever carry one (T-05-01, mirrors
 * cf.ipc.test.ts's/wsl.ipc.test.ts's hasSecretKey).
 */
function hasSecretKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value)) {
    if (/token|secret|apiKey/i.test(k)) return true;
    if (hasSecretKey(v)) return true;
  }
  return false;
}

const SAFE_DEFAULT_ROUTE = { kind: 'wsl-detect', resume: false };
const SAFE_DEFAULT_PROBE = { kind: 'still-confirming', address: null };

describe('flow.ipc', () => {
  beforeAll(() => {
    registerFlowIpc();
  });

  beforeEach(() => {
    enterFlowMock.mockReset();
    resumeFlowMock.mockReset();
    runConnectedProbeMock.mockReset();
    deriveAddressMock.mockReset();
    openExternalMock.mockClear();
  });

  describe('registration', () => {
    it('registers a handler for each of the 5 flow:* invoke channels', () => {
      for (const channel of [
        CHANNELS.flowEnter,
        CHANNELS.flowResume,
        CHANNELS.flowConnectedCheck,
        CHANNELS.flowOpenBox,
        CHANNELS.flowOpenExternal,
      ]) {
        expect(getHandler(channel)).toBeInstanceOf(Function);
      }
    });
  });

  describe('flow:enter', () => {
    it('rejects a malformed payload WITHOUT calling enterFlow, returning the safe wsl-detect default', async () => {
      const handler = getHandler(CHANNELS.flowEnter)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(enterFlowMock).not.toHaveBeenCalled();
      expect(result).toEqual(SAFE_DEFAULT_ROUTE);
    });

    it('delegates to enterFlow and returns its resolved FlowRoute', async () => {
      const handler = getHandler(CHANNELS.flowEnter)!;
      enterFlowMock.mockResolvedValueOnce({ kind: 'live-success', address: 'home.example.com' });

      const result = await handler({}, undefined);

      expect(enterFlowMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ kind: 'live-success', address: 'home.example.com' });
    });

    it('a thrown enterFlow degrades to the safe wsl-detect default -- no exception crosses the boundary', async () => {
      const handler = getHandler(CHANNELS.flowEnter)!;
      enterFlowMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({}, undefined);

      expect(result).toEqual(SAFE_DEFAULT_ROUTE);
    });
  });

  describe('flow:resume', () => {
    it('rejects a malformed payload WITHOUT calling resumeFlow, returning the safe wsl-detect default (never null on a boundary fault)', async () => {
      const handler = getHandler(CHANNELS.flowResume)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(resumeFlowMock).not.toHaveBeenCalled();
      expect(result).toEqual(SAFE_DEFAULT_ROUTE);
    });

    it('delegates to resumeFlow and returns null when there is genuinely nothing to resume', async () => {
      const handler = getHandler(CHANNELS.flowResume)!;
      resumeFlowMock.mockResolvedValueOnce(null);

      const result = await handler({}, undefined);

      expect(resumeFlowMock).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it('delegates to resumeFlow and returns its resolved FlowRoute', async () => {
      const handler = getHandler(CHANNELS.flowResume)!;
      resumeFlowMock.mockResolvedValueOnce({ kind: 'cf-reconnect' });

      const result = await handler({}, undefined);

      expect(result).toEqual({ kind: 'cf-reconnect' });
    });

    it('a thrown resumeFlow degrades to the safe wsl-detect default (not null) -- no exception crosses the boundary', async () => {
      const handler = getHandler(CHANNELS.flowResume)!;
      resumeFlowMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({}, undefined);

      expect(result).toEqual(SAFE_DEFAULT_ROUTE);
    });
  });

  describe('flow:connectedCheck', () => {
    it('rejects a malformed payload WITHOUT calling runConnectedProbe, returning the honest still-confirming default', async () => {
      const handler = getHandler(CHANNELS.flowConnectedCheck)!;

      const result = await handler({}, { unexpected: 'payload' });

      expect(runConnectedProbeMock).not.toHaveBeenCalled();
      expect(result).toEqual(SAFE_DEFAULT_PROBE);
    });

    it('delegates to runConnectedProbe and returns its resolved verdict', async () => {
      const handler = getHandler(CHANNELS.flowConnectedCheck)!;
      runConnectedProbeMock.mockResolvedValueOnce({ kind: 'connected', address: 'home.example.com' });

      const result = await handler({}, undefined);

      expect(runConnectedProbeMock).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ kind: 'connected', address: 'home.example.com' });
    });

    it('a thrown runConnectedProbe degrades to the honest still-confirming default -- never a false connected', async () => {
      const handler = getHandler(CHANNELS.flowConnectedCheck)!;
      runConnectedProbeMock.mockRejectedValueOnce(new Error('boom'));

      const result = await handler({}, undefined);

      expect(result).toEqual(SAFE_DEFAULT_PROBE);
    });
  });

  describe('flow:openBox', () => {
    it('rejects a malformed payload WITHOUT calling deriveAddress or shell.openExternal', async () => {
      const handler = getHandler(CHANNELS.flowOpenBox)!;

      await handler({}, { unexpected: 'payload' });

      expect(deriveAddressMock).not.toHaveBeenCalled();
      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('derives the address MAIN-SIDE (never from a renderer payload) and opens https://<address>', async () => {
      const handler = getHandler(CHANNELS.flowOpenBox)!;
      deriveAddressMock.mockResolvedValueOnce('home.example.com');

      // This handler takes NoPayload (z.undefined()) -- there is no schema
      // shape through which a renderer-supplied URL/address could even be
      // parsed. The legitimate no-arg call (`raw === undefined`) is the only
      // path that reaches deriveAddress; the resolved URL is built
      // exclusively from that mocked collaborator, never from `raw` (T-05-06).
      await handler({}, undefined);

      expect(deriveAddressMock).toHaveBeenCalledTimes(1);
      expect(openExternalMock).toHaveBeenCalledWith('https://home.example.com');
    });

    it('a null resolved address never calls shell.openExternal', async () => {
      const handler = getHandler(CHANNELS.flowOpenBox)!;
      deriveAddressMock.mockResolvedValueOnce(null);

      await handler({}, undefined);

      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('a thrown deriveAddress never calls shell.openExternal and no exception crosses the boundary', async () => {
      const handler = getHandler(CHANNELS.flowOpenBox)!;
      deriveAddressMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, undefined)).resolves.toBeUndefined();
      expect(openExternalMock).not.toHaveBeenCalled();
    });
  });

  describe('flow:openExternal', () => {
    it('rejects any target !== "support" WITHOUT calling shell.openExternal (structurally unreachable URL)', async () => {
      const handler = getHandler(CHANNELS.flowOpenExternal)!;

      await handler({}, { target: 'not-a-real-target' });

      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('rejects a raw renderer-supplied URL string in place of the enum (T-05-06)', async () => {
      const handler = getHandler(CHANNELS.flowOpenExternal)!;

      await handler({}, { target: 'https://evil.example.com' });

      expect(openExternalMock).not.toHaveBeenCalled();
    });

    it('opens the fixed support URL for the "support" enum target', async () => {
      const handler = getHandler(CHANNELS.flowOpenExternal)!;

      await handler({}, { target: 'support' });

      expect(openExternalMock).toHaveBeenCalledWith('https://livinity.io/support');
    });

    it('a thrown shell.openExternal never crosses the boundary as a rejected promise', async () => {
      const handler = getHandler(CHANNELS.flowOpenExternal)!;
      openExternalMock.mockRejectedValueOnce(new Error('boom'));

      await expect(handler({}, { target: 'support' })).resolves.toBeUndefined();
    });
  });

  describe('T-05-01: no flow:* handler return ever carries a secret', () => {
    it('flow:enter/flow:resume/flow:connectedCheck results carry no token/secret/apiKey field', async () => {
      enterFlowMock.mockResolvedValueOnce({ kind: 'live-success', address: 'home.example.com' });
      resumeFlowMock.mockResolvedValueOnce({ kind: 'installing' });
      runConnectedProbeMock.mockResolvedValueOnce({ kind: 'connected', address: 'home.example.com' });

      const enterResult = await getHandler(CHANNELS.flowEnter)!({}, undefined);
      const resumeResult = await getHandler(CHANNELS.flowResume)!({}, undefined);
      const connectedResult = await getHandler(CHANNELS.flowConnectedCheck)!({}, undefined);

      expect(hasSecretKey(enterResult)).toBe(false);
      expect(hasSecretKey(resumeResult)).toBe(false);
      expect(hasSecretKey(connectedResult)).toBe(false);
      expect(hasSecretKey(SAFE_DEFAULT_ROUTE)).toBe(false);
      expect(hasSecretKey(SAFE_DEFAULT_PROBE)).toBe(false);
    });
  });
});
