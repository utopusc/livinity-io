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
import type {
  ShellApi,
  DevSpikeApi,
  AuthApi,
  CfApi,
  WslApi,
  FlowApi,
  Status,
  DeviceLoginUpdate,
  CfProvisionUpdate,
  WslDownloadUpdate,
  WslInstallUpdate,
} from '../../shared/ipc-contract';

// Mirrors shared/ipc-contract.ts CHANNELS exactly — duplicated here because a
// sandboxed preload cannot require() that (or any) local project file. Kept
// in sync by tests/shell-preload.test.ts.
//
// Phase 2 (auth): 9 auth:* channels + 3 device-flow channels (device-flow
// pivot, D-16/D-18). `authSignInWithGoogle` is deliberately NOT present —
// that channel was removed from the canonical CHANNELS export; the 3 device-
// flow channels below replace it.
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
  authStartDeviceLogin: 'auth:startDeviceLogin',
  authCancelDeviceLogin: 'auth:cancelDeviceLogin',
  authDeviceLoginUpdate: 'auth:deviceLoginUpdate',
  // Phase 3 (Cloudflare / Free-BYOD): 6 cf:* invoke channels + the
  // cf:provisionUpdate progress push (mirrors authDeviceLoginUpdate). Duplicated
  // here as literals for the same sandbox reason as the auth block above; the
  // token crosses IN once on cf:verifyToken and NEVER returns. Kept in sync with
  // the canonical CHANNELS.cf* export by tests/shell-preload.test.ts (drift guard).
  cfVerifyToken: 'cf:verifyToken',
  cfGetZones: 'cf:getZones',
  cfSelectDomain: 'cf:selectDomain',
  cfRecheckZone: 'cf:recheckZone',
  cfProvision: 'cf:provision',
  cfOpenExternal: 'cf:openExternal',
  cfProvisionUpdate: 'cf:provisionUpdate',
  // Phase 4 (WSL2 provisioning engine): 9 wsl:* invoke channels + the 2
  // wsl:downloadUpdate/wsl:installUpdate progress pushes (mirror
  // cfProvisionUpdate). Duplicated here as literals for the same sandbox
  // reason as the auth/cf blocks above. Kept in sync with the canonical
  // CHANNELS.wsl* export by tests/shell-preload.test.ts (drift guard).
  wslDetect: 'wsl:detect',
  wslEnable: 'wsl:enable',
  wslCheckBios: 'wsl:checkBios',
  wslRestartNow: 'wsl:restartNow',
  wslDistroInstall: 'wsl:distroInstall',
  wslInstallInvoke: 'wsl:installInvoke',
  wslConfigGet: 'wsl:configGet',
  wslConfigApply: 'wsl:configApply',
  wslOpenExternal: 'wsl:openExternal',
  wslDownloadUpdate: 'wsl:downloadUpdate',
  wslInstallUpdate: 'wsl:installUpdate',
  // Phase 5 (install orchestration): 5 flow:* invoke channels, no progress
  // push (flow:connectedCheck's bounded retry resolves entirely inside
  // runConnectedProbe main-side). Duplicated here as literals for the same
  // sandbox reason as the auth/cf/wsl blocks above. Kept in sync with the
  // canonical CHANNELS.flow* export by tests/shell-preload.test.ts (drift guard).
  flowEnter: 'flow:enter',
  flowResume: 'flow:resume',
  flowConnectedCheck: 'flow:connectedCheck',
  flowOpenBox: 'flow:openBox',
  flowOpenExternal: 'flow:openExternal',
} as const;

// DEV-ONLY spike channels (Plan 04) — local literals for the same sandbox
// reason as CHANNELS above; asserted against the registered handlers in
// shell.ipc.ts by tests/shell-preload.test.ts (drift guard).
const DEV_CHANNELS = {
  devSpawnHolderA: 'dev:spawnHolderA',
  devUpdateSim: 'dev:updateSim',
} as const;

const api: ShellApi & DevSpikeApi & AuthApi & CfApi & WslApi & FlowApi = {
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
  // Device-flow login (device-flow pivot, D-16/D-18) — replaces the retired
  // embedded-browser Google sign-in.
  startDeviceLogin: () => ipcRenderer.invoke(CHANNELS.authStartDeviceLogin),
  cancelDeviceLogin: () => ipcRenderer.invoke(CHANNELS.authCancelDeviceLogin),
  onDeviceLoginUpdate: (cb: (update: DeviceLoginUpdate) => void) => {
    const listener = (_event: IpcRendererEvent, update: DeviceLoginUpdate) => cb(update);
    ipcRenderer.on(CHANNELS.authDeviceLoginUpdate, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.authDeviceLoginUpdate, listener);
    };
  },
  // Phase 3 (Cloudflare / Free-BYOD) — the token crosses IN once on
  // cfVerifyToken (like authProbeKey) and never returns; cfOpenExternal sends an
  // enum target (never a URL); onProvisionUpdate uses the same subscribe-and-
  // return-unsubscribe pattern as onStatusChanged/onDeviceLoginUpdate.
  cfVerifyToken: (token) => ipcRenderer.invoke(CHANNELS.cfVerifyToken, { token }),
  cfGetZones: () => ipcRenderer.invoke(CHANNELS.cfGetZones),
  cfSelectDomain: (zoneId, subLabel) =>
    ipcRenderer.invoke(CHANNELS.cfSelectDomain, { zoneId, subLabel }),
  cfRecheckZone: (zoneId) => ipcRenderer.invoke(CHANNELS.cfRecheckZone, { zoneId }),
  cfProvision: (takeOver) => ipcRenderer.invoke(CHANNELS.cfProvision, { takeOver }),
  cfOpenExternal: (target) => ipcRenderer.invoke(CHANNELS.cfOpenExternal, { target }),
  onProvisionUpdate: (cb: (update: CfProvisionUpdate) => void) => {
    const listener = (_event: IpcRendererEvent, update: CfProvisionUpdate) => cb(update);
    ipcRenderer.on(CHANNELS.cfProvisionUpdate, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.cfProvisionUpdate, listener);
    };
  },
  // Phase 4 (WSL2 provisioning engine) — no method here ever returns a
  // secret (the install.sh env vars are read from the vault main-side inside
  // install-invoke.ts and never cross this boundary); wslOpenExternal sends
  // an enum target (never a URL); onDownloadUpdate/onInstallUpdate use the
  // same subscribe-and-return-unsubscribe pattern as onProvisionUpdate.
  wslDetect: () => ipcRenderer.invoke(CHANNELS.wslDetect),
  wslEnable: () => ipcRenderer.invoke(CHANNELS.wslEnable),
  wslCheckBios: () => ipcRenderer.invoke(CHANNELS.wslCheckBios),
  wslRestartNow: () => ipcRenderer.invoke(CHANNELS.wslRestartNow),
  wslDistroInstall: () => ipcRenderer.invoke(CHANNELS.wslDistroInstall),
  wslInstallInvoke: () => ipcRenderer.invoke(CHANNELS.wslInstallInvoke),
  wslConfigGet: () => ipcRenderer.invoke(CHANNELS.wslConfigGet),
  wslConfigApply: (limits) => ipcRenderer.invoke(CHANNELS.wslConfigApply, limits),
  wslOpenExternal: (target) => ipcRenderer.invoke(CHANNELS.wslOpenExternal, { target }),
  onDownloadUpdate: (cb: (u: WslDownloadUpdate) => void) => {
    const listener = (_event: IpcRendererEvent, u: WslDownloadUpdate) => cb(u);
    ipcRenderer.on(CHANNELS.wslDownloadUpdate, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.wslDownloadUpdate, listener);
    };
  },
  onInstallUpdate: (cb: (u: WslInstallUpdate) => void) => {
    const listener = (_event: IpcRendererEvent, u: WslInstallUpdate) => cb(u);
    ipcRenderer.on(CHANNELS.wslInstallUpdate, listener);
    return () => {
      ipcRenderer.removeListener(CHANNELS.wslInstallUpdate, listener);
    };
  },
  // Phase 5 (install orchestration) -- no method here ever returns a secret;
  // flowOpenBox/flowOpenExternal take no renderer-supplied URL (the address is
  // derived main-side / the enum maps to a fixed URL); all 5 are plain
  // request-response invokes, no progress push exists for this surface.
  flowEnter: () => ipcRenderer.invoke(CHANNELS.flowEnter),
  flowResume: () => ipcRenderer.invoke(CHANNELS.flowResume),
  flowConnectedCheck: () => ipcRenderer.invoke(CHANNELS.flowConnectedCheck),
  flowOpenBox: () => ipcRenderer.invoke(CHANNELS.flowOpenBox),
  flowOpenExternal: (target) => ipcRenderer.invoke(CHANNELS.flowOpenExternal, { target }),
};

contextBridge.exposeInMainWorld('api', api);
