import SysTray from 'systray2';
import { deflateSync } from 'node:zlib';

// ---- Types ----

interface TrayCallbacks {
  onDisconnect: () => void;
  onQuit: () => void;
  onOpenSetup: () => void;
}

// ---- PNG Icon Generation ----

/**
 * Generate a minimal 16x16 RGBA PNG with a colored circle on transparent background.
 * Returns a base64-encoded PNG string suitable for systray2.
 */
function generateColoredIcon(r: number, g: number, b: number): string {
  const width = 16;
  const height = 16;
  const centerX = 7.5;
  const centerY = 7.5;
  const radius = 6;

  // Build raw RGBA pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4;
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        // Inside circle: solid color with slight anti-aliasing at edges
        const alpha = dist > radius - 1 ? Math.round(255 * (radius - dist)) : 255;
        rawData[px] = r;
        rawData[px + 1] = g;
        rawData[px + 2] = b;
        rawData[px + 3] = Math.max(0, alpha);
      } else {
        // Outside circle: transparent
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      }
    }
  }

  // Compress pixel data
  const compressed = deflateSync(rawData);

  // Build PNG file
  const chunks: Buffer[] = [];

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // Helper: create a PNG chunk
  function makeChunk(type: string, data: Buffer): Buffer {
    const typeBytes = Buffer.from(type, 'ascii');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length, 0);

    const crcInput = Buffer.concat([typeBytes, data]);
    const crc = crc32(crcInput);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([lengthBuf, typeBytes, data, crcBuf]);
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);  // width
  ihdr.writeUInt32BE(height, 4); // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(makeChunk('IHDR', ihdr));

  // IDAT chunk
  chunks.push(makeChunk('IDAT', compressed));

  // IEND chunk
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks).toString('base64');
}

/**
 * CRC-32 for PNG chunk checksums (ISO 3309 / ITU-T V.42).
 */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---- Pre-generated Icons ----

const ICON_CONNECTED = generateColoredIcon(0x22, 0xc5, 0x5e);    // Green #22c55e
const ICON_CONNECTING = generateColoredIcon(0xea, 0xb3, 0x08);   // Yellow #eab308
const ICON_DISCONNECTED = generateColoredIcon(0xef, 0x44, 0x44); // Red #ef4444

// ---- Module State ----

let systrayInstance: SysTray | null = null;
let statusItem: { title: string; tooltip: string; enabled: boolean; checked: boolean; hidden?: boolean } | null = null;
let currentMenu: Record<string, unknown> | null = null;

// ---- Status Mapping ----

type TrayStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

function getIconForStatus(status: TrayStatus): string {
  switch (status) {
    case 'connected': return ICON_CONNECTED;
    case 'connecting': return ICON_CONNECTING;
    case 'disconnected': return ICON_DISCONNECTED;
    case 'error': return ICON_DISCONNECTED;
  }
}

function getLabelForStatus(status: TrayStatus): string {
  switch (status) {
    case 'connected': return 'Status: Connected';
    case 'connecting': return 'Status: Connecting...';
    case 'disconnected': return 'Status: Disconnected';
    case 'error': return 'Status: Error';
  }
}

function getTooltipForStatus(status: TrayStatus): string {
  switch (status) {
    case 'connected': return 'Livinity Agent \u2014 Connected';
    case 'connecting': return 'Livinity Agent \u2014 Connecting...';
    case 'disconnected': return 'Livinity Agent \u2014 Disconnected';
    case 'error': return 'Livinity Agent \u2014 Error';
  }
}

// ---- Exported Functions ----

/**
 * Initialize the system tray icon with a context menu.
 * Resolves when the tray is ready.
 */
export async function startTray(callbacks: TrayCallbacks): Promise<void> {
  statusItem = {
    title: 'Status: Connected',
    tooltip: 'Connection status',
    enabled: false,
    checked: false,
  };

  const openSetupItem = {
    title: 'Open Setup',
    tooltip: 'Open setup wizard in browser',
    enabled: true,
    checked: false,
  };

  const disconnectItem = {
    title: 'Disconnect',
    tooltip: 'Disconnect from relay',
    enabled: true,
    checked: false,
  };

  const quitItem = {
    title: 'Quit',
    tooltip: 'Stop the agent',
    enabled: true,
    checked: false,
  };

  const menu = {
    icon: ICON_CONNECTED,
    title: '',
    tooltip: 'Livinity Agent \u2014 Connected',
    items: [
      statusItem,
      SysTray.separator,
      openSetupItem,
      disconnectItem,
      SysTray.separator,
      quitItem,
    ],
  };

  currentMenu = menu as unknown as Record<string, unknown>;

  systrayInstance = new SysTray({ menu, debug: false, copyDir: false });

  systrayInstance.onClick((action) => {
    if (action.item === openSetupItem) {
      callbacks.onOpenSetup();
    } else if (action.item === disconnectItem) {
      callbacks.onDisconnect();
    } else if (action.item === quitItem) {
      callbacks.onQuit();
    }
  });

  await systrayInstance.ready();
}

/**
 * Update the tray icon and status text to reflect the current connection status.
 * Silently returns if the tray has not been started yet.
 */
export function updateTrayStatus(status: TrayStatus): void {
  if (!systrayInstance || !statusItem || !currentMenu) {
    return;
  }

  const newIcon = getIconForStatus(status);
  const newLabel = getLabelForStatus(status);
  const newTooltip = getTooltipForStatus(status);

  // Update status menu item text
  statusItem.title = newLabel;
  systrayInstance.sendAction({
    type: 'update-item',
    item: statusItem,
  });

  // Update tray icon and tooltip
  (currentMenu as Record<string, unknown>).icon = newIcon;
  (currentMenu as Record<string, unknown>).tooltip = newTooltip;
  systrayInstance.sendAction({
    type: 'update-menu',
    item: currentMenu,
  });
}

/**
 * Destroy the system tray icon for clean shutdown.
 */
export function killTray(): void {
  if (systrayInstance) {
    systrayInstance.kill(false);
    systrayInstance = null;
  }
}
