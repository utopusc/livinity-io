import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('agent:getState'),
  setup: (deviceName: string) => ipcRenderer.invoke('agent:setup', deviceName),
  connect: () => ipcRenderer.invoke('agent:connect'),
  disconnect: () => ipcRenderer.invoke('agent:disconnect'),
  getAuditLog: () => ipcRenderer.invoke('agent:getAuditLog'),
  openExternal: (url: string) => ipcRenderer.invoke('agent:openExternal', url),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  onStateChanged: (callback: (state: any) => void) => {
    ipcRenderer.on('agent:stateChanged', (_e, state) => callback(state));
  },
  onAuditEntry: (callback: (entry: any) => void) => {
    ipcRenderer.on('agent:auditEntry', (_e, entry) => callback(entry));
  },
});
