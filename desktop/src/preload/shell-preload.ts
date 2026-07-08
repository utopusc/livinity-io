/**
 * src/preload/shell-preload.ts
 *
 * Typed contextBridge boundary implementing ShellApi end-to-end — every
 * method's parameters and return type reference shared/ipc-contract.ts.
 * Zero `any` (corrected vs. agent-app's fully `any`-typed bridge).
 *
 * The dev-only spike-trigger IPC handler registered in shell.ipc.ts is
 * intentionally NOT exposed here: it is throwaway research surface, not part
 * of the production ShellApi contract.
 *
 * SELF-CONTAINED BY NECESSITY (root-caused a white-screen bug — read this
 * before "cleaning up" the duplication below): this file runs inside
 * Electron's SANDBOXED preload context (`sandbox: true` in src/main/index.ts).
 * Electron's own docs (Process Sandboxing > Preload scripts) state a
 * sandboxed preload's polyfilled `require` only resolves Electron + a fixed
 * allowlist of Node built-ins (events/timers/url, etc.) — "using a bundler is
 * recommended for splitting preload code into multiple files." This was
 * confirmed by direct testing: `require('../../shared/ipc-contract')` (and
 * even a zod-free sibling module) threw `Error: module not found` at preload
 * load time — sandboxed preload cannot require ANY local project file by
 * relative path, not just npm packages. A thrown preload aborts before
 * `contextBridge.exposeInMainWorld` runs, so `window.api` stays undefined and
 * the renderer throws on its first `window.api.*` call (blank white window,
 * see src/main/index.ts's `preload-error`/`console-message` diagnostics hook
 * that surfaced this).
 *
 * Since this project has no preload bundler step (tsc + vite only), the
 * CHANNELS values are duplicated as literals below instead. This is NOT
 * re-typed ad hoc: `tests/shell-preload.test.ts` asserts every invoked
 * channel string against the CANONICAL `CHANNELS` export from
 * shared/ipc-contract.ts, so any drift between the two fails a test
 * immediately rather than silently breaking IPC at runtime.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ShellApi, Status } from '../../shared/ipc-contract';

// Mirrors shared/ipc-contract.ts CHANNELS exactly — duplicated here because a
// sandboxed preload cannot require() that (or any) local project file. Kept
// in sync by tests/shell-preload.test.ts.
const CHANNELS = {
  vaultSet: 'vault:set',
  vaultHas: 'vault:has',
  stateGet: 'state:get',
  stateSet: 'state:set',
  statusSimulate: 'status:simulate',
  statusChanged: 'status:changed',
  windowMinimize: 'window:minimize',
  windowHide: 'window:hide',
  appQuit: 'app:quit',
} as const;

const api: ShellApi = {
  vaultSet: (key, value) => ipcRenderer.invoke(CHANNELS.vaultSet, { key, value }),
  vaultHas: (key) => ipcRenderer.invoke(CHANNELS.vaultHas, { key }),
  getState: () => ipcRenderer.invoke(CHANNELS.stateGet),
  setState: (patch) => ipcRenderer.invoke(CHANNELS.stateSet, patch),
  simulateStatus: (status) => ipcRenderer.invoke(CHANNELS.statusSimulate, status),
  onStatusChanged: (cb: (status: Status) => void) => {
    ipcRenderer.on(CHANNELS.statusChanged, (_event, status: Status) => cb(status));
  },
  minimize: () => {
    void ipcRenderer.invoke(CHANNELS.windowMinimize);
  },
  hide: () => {
    void ipcRenderer.invoke(CHANNELS.windowHide);
  },
  quit: () => {
    void ipcRenderer.invoke(CHANNELS.appQuit);
  },
};

contextBridge.exposeInMainWorld('api', api);
