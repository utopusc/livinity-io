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
 */

import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type ShellApi, type Status } from '../../shared/ipc-contract';

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
