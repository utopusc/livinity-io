import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import path from 'path';
import { AgentCore } from './agent-core';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let agentCore: AgentCore;

const isDev = process.env.NODE_ENV === 'development';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 420,
    minHeight: 500,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f8f9fc',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    if (agentCore.isConnected()) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // Create a simple 16x16 icon programmatically
  const icon = nativeImage.createFromBuffer(createTrayIcon('#22c55e'), { width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Livinity Agent');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Livinity Agent', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Status: Disconnected', enabled: false, id: 'status' },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayIcon(status: 'connected' | 'connecting' | 'disconnected'): void {
  if (!tray) return;
  const colors = { connected: '#22c55e', connecting: '#eab308', disconnected: '#94a3b8' };
  const labels = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Disconnected' };
  const icon = nativeImage.createFromBuffer(createTrayIcon(colors[status]), { width: 16, height: 16 });
  tray.setImage(icon);
  tray.setToolTip(`Livinity Agent - ${labels[status]}`);

  const menu = Menu.buildFromTemplate([
    { label: 'Open Livinity Agent', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: `Status: ${labels[status]}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// Create a simple colored circle icon as raw PNG buffer
function createTrayIcon(color: string): Buffer {
  // Minimal 16x16 PNG with a colored circle
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // Raw RGBA pixel data (16x16)
  const pixels = Buffer.alloc(16 * 16 * 4, 0);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * 16 + x) * 4;
      if (dist < 6) {
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = dist < 5 ? 255 : Math.round(255 * (6 - dist));
      }
    }
  }
  return nativeImage.createFromBuffer(
    nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }).toPNG(),
    { width: 16, height: 16 }
  ).toPNG();
}

// --- IPC Handlers ---

function setupIPC(): void {
  ipcMain.handle('agent:getState', () => agentCore.getState());
  ipcMain.handle('agent:setup', (_e, deviceName: string) => agentCore.setup(deviceName));
  ipcMain.handle('agent:connect', () => agentCore.connect());
  ipcMain.handle('agent:disconnect', () => agentCore.disconnect());
  ipcMain.handle('agent:getAuditLog', () => agentCore.getAuditLog());
  ipcMain.handle('agent:openExternal', (_e, url: string) => shell.openExternal(url));
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:close', () => mainWindow?.hide());

  // Forward agent events to renderer
  agentCore.on('stateChanged', (state) => {
    mainWindow?.webContents.send('agent:stateChanged', state);
    if (state.connectionStatus) {
      updateTrayIcon(state.connectionStatus);
    }
  });

  agentCore.on('auditEntry', (entry) => {
    mainWindow?.webContents.send('agent:auditEntry', entry);
  });
}

// --- App Lifecycle ---

app.whenReady().then(() => {
  agentCore = new AgentCore();
  createWindow();
  createTray();
  setupIPC();

  // Auto-connect if credentials exist
  if (agentCore.hasCredentials()) {
    agentCore.connect();
  }
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  agentCore.disconnect();
});
