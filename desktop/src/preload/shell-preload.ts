/**
 * src/preload/shell-preload.ts
 *
 * Typed contextBridge boundary implementing ShellApi end-to-end — every
 * method's parameters and return type reference shared/ipc-contract.ts.
 * Zero `any` (corrected vs. agent-app's fully `any`-typed bridge).
 *
 * DEV-ONLY spike surface (Plan 04): `devSpawnHolderA`/`devUpdateSim` ARE
 * exposed below (typed via DevSpikeApi) because the sandboxed renderer has no
 * other reachable path to the main-process spike handlers — with
 * `sandbox: true` + contextIsolation the DevTools console has NO `require`,
 * so `require('electron').ipcRenderer.invoke(...)` is impossible from the
 * console. The main-side handlers are gated `!app.isPackaged`; in a packaged
 * build these two methods reject with "No handler registered" (inert).
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
import type { IpcRendererEvent } from 'electron';
import type { ShellApi, DevSpikeApi, AuthApi, Status } from '../../shared/ipc-contract';

// Mirrors shared/ipc-contract.ts CHANNELS exactly — duplicated here because a
// sandboxed preload cannot require() that (or any) local project file. Kept
// in sync by tests/shell-preload.test.ts.
//
// Phase 2 (auth): 9 auth:* channels. `authSignInWithGoogle` is deliberately
// NOT present — that channel was removed from the canonical CHANNELS export
// (device-flow pivot, D-16/D-18); the device-flow channels that replace it
// land in Plan 02-09.
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
  authLogin: 'auth:login',
  authSignOut: 'auth:signOut',
  authGetRoute: 'auth:getRoute',
  authChooseFree: 'auth:chooseFree',
  authGetKeyAction: 'auth:getKeyAction',
  authProbeKey: 'auth:probeKey',
  authRegenerateKey: 'auth:regenerateKey',
  authGetAccount: 'auth:getAccount',
  authOpenExternal: 'auth:openExternal',
} as const;

// DEV-ONLY spike channels (Plan 04) — local literals for the same sandbox
// reason as CHANNELS above; asserted against the registered handlers in
// shell.ipc.ts by tests/shell-preload.test.ts (drift guard).
const DEV_CHANNELS = {
  devSpawnHolderA: 'dev:spawnHolderA',
  devUpdateSim: 'dev:updateSim',
} as const;

const api: ShellApi & DevSpikeApi & AuthApi = {
  vaultSet: (key, value) => ipcRenderer.invoke(CHANNELS.vaultSet, { key, value }),
  vaultHas: (key) => ipcRenderer.invoke(CHANNELS.vaultHas, { key }),
  getState: () => ipcRenderer.invoke(CHANNELS.stateGet),
  setState: (patch) => ipcRenderer.invoke(CHANNELS.stateSet, patch),
  simulateStatus: (status) => ipcRenderer.invoke(CHANNELS.statusSimulate, status),
  onStatusChanged: (cb: (status: Status) => void) => {
    // IN-06: keep a reference to the exact listener so it can be removed —
    // returning an unsubscribe function lets callers (e.g. a React effect)
    // avoid accumulating duplicate listeners across remounts/HMR.
    const listener = (_event: IpcRendererEvent, status: Status) => cb(status);
    ipcRenderer.on(CHANNELS.statusChanged, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.statusChanged, listener);
    };
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
  // DEV-ONLY spike triggers (Plan 04) — main-side handlers gated !app.isPackaged.
  devSpawnHolderA: () => ipcRenderer.invoke(DEV_CHANNELS.devSpawnHolderA),
  devUpdateSim: () => ipcRenderer.invoke(DEV_CHANNELS.devUpdateSim),
  // Phase 2 (auth) — 9 one-line invoke wrappers. No embedded-Google-window
  // sign-in method: that channel no longer exists (device-flow pivot, D-16/D-18).
  authLogin: (email, password) => ipcRenderer.invoke(CHANNELS.authLogin, { email, password }),
  authSignOut: () => ipcRenderer.invoke(CHANNELS.authSignOut),
  authGetRoute: () => ipcRenderer.invoke(CHANNELS.authGetRoute),
  authChooseFree: () => ipcRenderer.invoke(CHANNELS.authChooseFree),
  authGetKeyAction: () => ipcRenderer.invoke(CHANNELS.authGetKeyAction),
  authProbeKey: (key) => ipcRenderer.invoke(CHANNELS.authProbeKey, { key }),
  authRegenerateKey: () => ipcRenderer.invoke(CHANNELS.authRegenerateKey),
  authGetAccount: () => ipcRenderer.invoke(CHANNELS.authGetAccount),
  authOpenExternal: (target) => ipcRenderer.invoke(CHANNELS.authOpenExternal, { target }),
};

contextBridge.exposeInMainWorld('api', api);
