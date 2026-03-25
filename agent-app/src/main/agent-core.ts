import { EventEmitter } from 'events';
import WebSocket from 'ws';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

const PLATFORM_URL = 'https://livinity.io';
const AGENT_VERSION = '1.0.0';
const HEARTBEAT_INTERVAL = 30_000;
const CONFIG_DIR = path.join(os.homedir(), '.livinity');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
const AUDIT_FILE = path.join(CONFIG_DIR, 'audit.log');

export interface AgentState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  setupStatus: 'none' | 'awaiting_code' | 'polling' | 'success' | 'error';
  deviceName: string;
  deviceId: string | null;
  userCode: string | null;
  verificationUri: string | null;
  errorMessage: string | null;
  relayUrl: string | null;
  sessionId: string | null;
  platform: string;
  osUser: string;
}

interface Credentials {
  deviceToken: string;
  deviceId: string;
  deviceName: string;
  relayUrl: string;
  platform: string;
}

interface AuditEntry {
  timestamp: string;
  tool: string;
  params: string;
  success: boolean;
  duration: number;
  error?: string;
}

// Dangerous command blocklist
const BLOCKLIST = [
  /rm\s+-rf\s+\//i, /del\s+\/s\s+\/q\s+c:\\/i, /format\s+[a-z]:/i,
  /mkfs\./i, /dd\s+if=/i, /shutdown/i, /reboot/i, /halt\b/i, /poweroff/i,
  /:\(\)\{\s*:\|:&\s*\};:/,
  /reg\s+delete.*hklm/i, /reg\s+delete.*hkcr/i,
];

export class AgentCore extends EventEmitter {
  private state: AgentState;
  private credentials: Credentials | null = null;
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private auditLog: AuditEntry[] = [];

  constructor() {
    super();
    this.state = {
      connectionStatus: 'disconnected',
      setupStatus: 'none',
      deviceName: os.hostname(),
      deviceId: null,
      userCode: null,
      verificationUri: null,
      errorMessage: null,
      relayUrl: null,
      sessionId: null,
      platform: process.platform,
      osUser: os.userInfo().username,
    };
    this.loadCredentials();
    this.loadAuditLog();
  }

  getState(): AgentState {
    return { ...this.state };
  }

  hasCredentials(): boolean {
    return this.credentials !== null;
  }

  isConnected(): boolean {
    return this.state.connectionStatus === 'connected';
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog].reverse();
  }

  // --- Setup (OAuth Device Flow) ---

  async setup(deviceName: string): Promise<void> {
    this.state.deviceName = deviceName;
    this.state.setupStatus = 'awaiting_code';
    this.state.errorMessage = null;
    this.emitState();

    try {
      const res = await fetch(`${PLATFORM_URL}/api/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName, platform: process.platform, agentVersion: AGENT_VERSION }),
      });

      if (!res.ok) throw new Error(`Registration failed: ${res.status}`);
      const grant = await res.json() as any;

      this.state.userCode = grant.user_code;
      this.state.verificationUri = grant.verification_uri;
      this.state.setupStatus = 'polling';
      this.emitState();

      // Poll for approval
      const deadline = Date.now() + grant.expires_in * 1000;
      const interval = (grant.interval || 5) * 1000;

      while (Date.now() < deadline) {
        await this.sleep(interval);

        const tokenRes = await fetch(`${PLATFORM_URL}/api/device/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: grant.device_code }),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json() as any;
          const payload = this.decodeJwt(tokenData.access_token);

          this.credentials = {
            deviceToken: tokenData.access_token,
            deviceId: payload.deviceId as string,
            deviceName,
            relayUrl: tokenData.relay_url,
            platform: process.platform,
          };
          this.saveCredentials();

          this.state.deviceId = this.credentials.deviceId;
          this.state.setupStatus = 'success';
          this.emitState();

          // Auto-connect after successful setup
          setTimeout(() => this.connect(), 500);
          return;
        }

        const err = await tokenRes.json() as any;
        if (err.error === 'authorization_pending') continue;
        if (err.error === 'expired_token') throw new Error('Code expired. Try again.');
        throw new Error(err.error || 'Unknown error');
      }

      throw new Error('Code expired (timeout).');
    } catch (err: any) {
      this.state.setupStatus = 'error';
      this.state.errorMessage = err.message;
      this.emitState();
    }
  }

  // --- Connection ---

  async connect(): Promise<void> {
    if (!this.credentials) return;
    if (this.ws) this.disconnect();

    this.state.connectionStatus = 'connecting';
    this.state.deviceName = this.credentials.deviceName;
    this.state.deviceId = this.credentials.deviceId;
    this.state.relayUrl = this.credentials.relayUrl;
    this.emitState();

    try {
      const url = `${this.credentials.relayUrl}/device/connect`;
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        // Send auth message
        this.ws?.send(JSON.stringify({
          type: 'device_auth',
          deviceToken: this.credentials!.deviceToken,
          deviceId: this.credentials!.deviceId,
          deviceName: this.credentials!.deviceName,
          platform: this.credentials!.platform,
          tools: ['shell', 'files_list', 'files_read', 'files_write', 'files_delete', 'files_rename', 'processes', 'system_info', 'screenshot', 'screen_info', 'mouse_click', 'mouse_double_click', 'mouse_right_click', 'mouse_move', 'mouse_drag', 'mouse_scroll', 'keyboard_type', 'keyboard_press'],
        }));
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {}
      });

      this.ws.on('close', () => {
        this.state.connectionStatus = 'disconnected';
        this.state.sessionId = null;
        this.emitState();
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        // Error handler to prevent crash — close event will fire after
      });
    } catch {
      this.state.connectionStatus = 'disconnected';
      this.emitState();
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.state.connectionStatus = 'disconnected';
    this.state.sessionId = null;
    this.emitState();
    this.reconnectDelay = 1000;
  }

  // --- Message Handling ---

  private handleMessage(msg: any): void {
    switch (msg.type) {
      case 'device_connected':
        this.state.connectionStatus = 'connected';
        this.state.sessionId = msg.sessionId;
        this.emitState();
        this.reconnectDelay = 1000;
        this.startHeartbeat();
        break;

      case 'device_auth_error':
        this.state.connectionStatus = 'disconnected';
        this.state.errorMessage = msg.message || 'Authentication failed';
        this.emitState();
        break;

      case 'ping':
        this.ws?.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'device_tool_call':
        this.handleToolCall(msg);
        break;
    }
  }

  private async handleToolCall(msg: any): Promise<void> {
    const start = Date.now();
    let result: any;

    try {
      const raw = await this.executeTool(msg.tool, msg.params || {});
      // Normalize to { success, output, error?, data?, images? } format
      if (raw && raw.error) {
        result = { success: false, output: '', error: raw.error };
      } else if (raw && raw.success !== undefined && raw.output !== undefined) {
        // Already in standard format (screenshot, mouse, keyboard tools)
        result = raw;
      } else {
        // Raw data from legacy tools — wrap it
        const output = typeof raw === 'string' ? raw : JSON.stringify(raw);
        result = { success: true, output, data: raw };
      }
    } catch (err: any) {
      result = { success: false, output: '', error: err.message };
    }

    const duration = Date.now() - start;

    // Send result back (same format as standalone agent)
    this.ws?.send(JSON.stringify({
      type: 'device_tool_result',
      requestId: msg.requestId,
      result,
    }));

    // Audit log
    const toolSuccess = result?.success ?? false;
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      tool: msg.tool,
      params: JSON.stringify(msg.params || {}).slice(0, 200),
      success: toolSuccess,
      duration,
      error: toolSuccess ? undefined : result?.error,
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > 500) this.auditLog.shift();
    this.appendAuditFile(entry);
    this.emit('auditEntry', entry);

    // Forward audit event to relay
    this.ws?.send(JSON.stringify({
      type: 'device_audit_event',
      deviceId: this.credentials?.deviceId,
      timestamp: entry.timestamp,
      toolName: msg.tool,
      params: entry.params,
      success: toolSuccess,
      duration,
      error: entry.error,
    }));
  }

  // --- Tool Execution ---

  private async executeTool(tool: string, params: any): Promise<any> {
    switch (tool) {
      case 'shell': return this.toolShell(params);
      case 'files_list': return this.toolFilesList(params);
      case 'files_read': return this.toolFilesRead(params);
      case 'files_write': return this.toolFilesWrite(params);
      case 'files_delete': return this.toolFilesDelete(params);
      case 'files_rename': return this.toolFilesRename(params);
      case 'processes': return this.toolProcesses(params);
      case 'system_info': return this.toolSystemInfo();
      case 'screenshot': return this.toolScreenshot();
      case 'screen_info': return this.toolScreenInfo();
      case 'mouse_click': return this.toolMouseClick(params);
      case 'mouse_double_click': return this.toolMouseDoubleClick(params);
      case 'mouse_right_click': return this.toolMouseRightClick(params);
      case 'mouse_move': return this.toolMouseMove(params);
      case 'mouse_drag': return this.toolMouseDrag(params);
      case 'mouse_scroll': return this.toolMouseScroll(params);
      case 'keyboard_type': return this.toolKeyboardType(params);
      case 'keyboard_press': return this.toolKeyboardPress(params);
      default: return { error: `Unknown tool: ${tool}` };
    }
  }

  private toolShell(params: any): Promise<any> {
    return new Promise((resolve) => {
      const command = params.command as string;
      if (!command) { resolve({ error: 'command is required' }); return; }

      // Blocklist check
      for (const pattern of BLOCKLIST) {
        if (pattern.test(command)) {
          resolve({ success: false, error: `Command blocked by security policy` });
          return;
        }
      }

      const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
      const args = process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command];
      const timeout = (params.timeout || 30) * 1000;

      const child = spawn(shell, args, {
        cwd: params.cwd || os.homedir(),
        timeout,
        env: process.env,
      });

      let stdout = '', stderr = '';
      child.stdout?.on('data', (d) => { stdout += d.toString(); });
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      child.on('close', (code) => {
        // Truncate
        if (stdout.length > 100000) stdout = stdout.slice(0, 100000) + '\n[truncated]';
        if (stderr.length > 100000) stderr = stderr.slice(0, 100000) + '\n[truncated]';
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
      child.on('error', (err) => { resolve({ error: err.message }); });
    });
  }

  private async toolFilesList(params: any): Promise<any> {
    const dirPath = this.safePath(params.path || '~');
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const results = await Promise.all(entries.map(async (e) => {
      try {
        const stat = await fs.promises.stat(path.join(dirPath, e.name));
        return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', size: stat.size, modified: stat.mtime.toISOString() };
      } catch { return { name: e.name, type: 'unknown', size: 0, modified: '' }; }
    }));
    return results.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
  }

  private async toolFilesRead(params: any): Promise<any> {
    const filePath = this.safePath(params.path);
    const stat = await fs.promises.stat(filePath);
    if (stat.size > 1_000_000) return { error: 'File too large (max 1MB)' };
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { content, size: stat.size };
  }

  private async toolFilesWrite(params: any): Promise<any> {
    const filePath = this.safePath(params.path);
    await fs.promises.writeFile(filePath, params.content || '', 'utf-8');
    return { success: true, bytesWritten: Buffer.byteLength(params.content || '') };
  }

  private async toolFilesDelete(params: any): Promise<any> {
    const filePath = this.safePath(params.path);
    await fs.promises.unlink(filePath);
    return { success: true };
  }

  private async toolFilesRename(params: any): Promise<any> {
    await fs.promises.rename(this.safePath(params.oldPath), this.safePath(params.newPath));
    return { success: true };
  }

  private toolProcesses(params: any): any {
    try {
      const cmd = process.platform === 'win32'
        ? 'powershell -NoProfile -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json"'
        : 'ps aux --sort=-%cpu | head -21';
      const output = execSync(cmd, { timeout: 10000 }).toString();
      if (process.platform === 'win32') {
        const procs = JSON.parse(output);
        return (Array.isArray(procs) ? procs : [procs]).map((p: any) => ({
          pid: p.Id, name: p.ProcessName, cpu: Math.round((p.CPU || 0) * 100) / 100, memory: Math.round((p.WorkingSet64 || 0) / 1048576),
        }));
      }
      return { raw: output };
    } catch (e: any) { return { error: e.message }; }
  }

  private toolSystemInfo(): any {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
      totalMemory: Math.round(os.totalmem() / 1048576),
      freeMemory: Math.round(os.freemem() / 1048576),
      uptime: Math.round(os.uptime()),
      user: os.userInfo().username,
      homedir: os.homedir(),
    };
  }

  // Coordinate mapping: screenshots are resized from physical pixels to a target resolution via sharp.
  // AI returns coordinates in the resized image space → we map to logical screen space for robotjs.
  // Chain: AI coords (target space) * (logical / target) = logical coords (robotjs space).
  private screenWidth = 0;
  private screenHeight = 0;
  // Logical screen dimensions (physical / scaleFactor) — what robotjs uses
  private logicalScreenW = 0;
  private logicalScreenH = 0;
  // AI target dimensions (what the resized screenshot image actually is)
  private aiTargetW = 0;
  private aiTargetH = 0;

  // Target resolutions (Anthropic recommended — stays under API auto-resize limits)
  private static SCALE_TARGETS = [
    { w: 1280, h: 800, ratio: 1280 / 800 },   // WXGA 16:10
    { w: 1366, h: 768, ratio: 1366 / 768 },   // FWXGA ~16:9
    { w: 1024, h: 768, ratio: 1024 / 768 },   // XGA 4:3
  ];

  private async toolScreenshot(): Promise<any> {
    try {
      const ns = require('node-screenshots');
      const sharp = require('sharp');
      const monitors = ns.Monitor.all();
      const primary = monitors.find((m: any) => m.isPrimary()) || monitors[0];
      if (!primary) return { error: 'No display found' };

      const physicalW = primary.width();   // Physical pixels (e.g., 2560)
      const physicalH = primary.height();  // Physical pixels (e.g., 1440)
      const scaleFactor = primary.scaleFactor(); // e.g., 1.5

      // Logical dimensions = what robotjs uses for mouse coordinates
      const logicalW = Math.round(physicalW / scaleFactor);
      const logicalH = Math.round(physicalH / scaleFactor);

      // Find best Anthropic target by aspect ratio of logical dimensions
      const ratio = logicalW / logicalH;
      let targetW = logicalW;
      let targetH = logicalH;
      for (const t of AgentCore.SCALE_TARGETS) {
        if (Math.abs(t.ratio - ratio) < 0.02 && t.w <= logicalW) {
          targetW = t.w;
          targetH = t.h;
          break;
        }
      }

      // Store for coordinate mapping
      this.logicalScreenW = logicalW;
      this.logicalScreenH = logicalH;
      this.aiTargetW = targetW;
      this.aiTargetH = targetH;
      // Keep legacy fields for backward compat
      this.screenWidth = logicalW;
      this.screenHeight = logicalH;

      const image = primary.captureImageSync();

      // Use sharp to ACTUALLY resize the image from physical to target resolution
      // node-screenshots toJpegSync() returns a JPEG buffer — sharp can read JPEG directly
      const jpegInput = Buffer.from(image.toJpegSync());
      const resizedJpeg = await sharp(jpegInput)
        .resize(targetW, targetH, { fit: 'fill' })
        .jpeg({ quality: 80 })
        .toBuffer();

      const base64 = resizedJpeg.toString('base64');

      return {
        success: true,
        output: `Screenshot captured: ${physicalW}x${physicalH} physical, ${logicalW}x${logicalH} logical, resized to ${targetW}x${targetH} for AI. Coordinate space: 0,0 to ${targetW},${targetH}. Scale factor: ${scaleFactor}.`,
        data: {
          width: logicalW, height: logicalH,
          displayWidth: targetW, displayHeight: targetH,
          physicalWidth: physicalW, physicalHeight: physicalH,
          scaleFactor: scaleFactor,
          monitorX: primary.x(), monitorY: primary.y(),
          size: resizedJpeg.length,
        },
        images: [{ base64, mimeType: 'image/jpeg' }],
      };
    } catch (e: any) { return { error: `Screenshot failed: ${e.message}` }; }
  }

  private toolScreenInfo(): any {
    try {
      const ns = require('node-screenshots');
      const monitors = ns.Monitor.all();
      const displays = monitors.map((m: any) => ({
        id: m.id?.() ?? 0, x: m.x(), y: m.y(), width: m.width(), height: m.height(),
        scaleFactor: m.scaleFactor(), rotation: m.rotation?.() ?? 0, isPrimary: m.isPrimary(),
      }));
      const primary = displays.find((d: any) => d.isPrimary) || displays[0];
      return { success: true, output: `${displays.length} display(s)`, data: { displays, displayCount: displays.length, primaryDisplay: primary } };
    } catch (e: any) { return { error: `Screen info failed: ${e.message}` }; }
  }

  // --- Mouse & Keyboard Tools (robotjs) ---

  private robotjs: any = null;
  private robotjsLoaded = false;

  private ensureRobot(): any {
    if (this.robotjsLoaded) return this.robotjs;
    try {
      this.robotjs = require('@jitsi/robotjs');
      this.robotjsLoaded = true;
    } catch (e: any) {
      this.robotjsLoaded = true;
      this.robotjs = null;
    }
    return this.robotjs;
  }

  // Map AI coordinates (in resized screenshot space) to logical screen coordinates (for robotjs)
  // Chain: AI coord * (logicalScreen / aiTarget) = logical screen coord
  private toScreenX(x: number): number {
    if (this.aiTargetW > 0 && this.logicalScreenW > 0) {
      return Math.round(x * (this.logicalScreenW / this.aiTargetW));
    }
    return Math.round(x);
  }
  private toScreenY(y: number): number {
    if (this.aiTargetH > 0 && this.logicalScreenH > 0) {
      return Math.round(y * (this.logicalScreenH / this.aiTargetH));
    }
    return Math.round(y);
  }

  private toolMouseClick(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const x = this.toScreenX(params.x || 0);
    const y = this.toScreenY(params.y || 0);
    robot.moveMouse(x, y);
    robot.mouseClick('left');
    return { success: true, output: `Clicked at screen (${x}, ${y}) [AI coord: ${params.x}, ${params.y}]` };
  }

  private toolMouseDoubleClick(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const x = this.toScreenX(params.x || 0);
    const y = this.toScreenY(params.y || 0);
    robot.moveMouse(x, y);
    robot.mouseClick('left', true);
    return { success: true, output: `Double-clicked at screen (${x}, ${y})` };
  }

  private toolMouseRightClick(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const x = this.toScreenX(params.x || 0);
    const y = this.toScreenY(params.y || 0);
    robot.moveMouse(x, y);
    robot.mouseClick('right');
    return { success: true, output: `Right-clicked at screen (${x}, ${y})` };
  }

  private toolMouseMove(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const x = this.toScreenX(params.x || 0);
    const y = this.toScreenY(params.y || 0);
    robot.moveMouse(x, y);
    return { success: true, output: `Moved mouse to screen (${x}, ${y})` };
  }

  private toolMouseDrag(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const fromX = this.toScreenX(params.fromX || 0);
    const fromY = this.toScreenY(params.fromY || 0);
    const toX = this.toScreenX(params.toX || 0);
    const toY = this.toScreenY(params.toY || 0);
    robot.moveMouse(fromX, fromY);
    robot.mouseToggle('down');
    try { robot.moveMouse(toX, toY); } finally { robot.mouseToggle('up'); }
    return { success: true, output: `Dragged from screen (${fromX}, ${fromY}) to (${toX}, ${toY})` };
  }

  private toolMouseScroll(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const amount = params.amount || 3;
    const direction = (params.direction || 'down') === 'up' ? amount : -amount;
    if (params.x != null && params.y != null) {
      robot.moveMouse(this.toScreenX(params.x), this.toScreenY(params.y));
    }
    robot.scrollMouse(0, direction);
    return { success: true, output: `Scrolled ${params.direction || 'down'} by ${amount}` };
  }

  private static KEY_ALIASES: Record<string, string> = {
    ctrl: 'control', cmd: 'command', win: 'command', meta: 'command',
    esc: 'escape', del: 'delete', ins: 'insert', bs: 'backspace',
    ret: 'return', cr: 'return', pgup: 'pageup', pgdn: 'pagedown',
  };

  private toolKeyboardType(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const text = String(params.text || '');
    robot.typeString(text);
    return { success: true, output: `Typed ${text.length} characters` };
  }

  private toolKeyboardPress(params: any): any {
    const robot = this.ensureRobot();
    if (!robot) return { error: 'robotjs not available' };
    const raw = String(params.key || '');
    const parts = raw.toLowerCase().split('+').map((s: string) => s.trim());
    const key = AgentCore.KEY_ALIASES[parts[parts.length - 1]] || parts[parts.length - 1];
    const modifiers = parts.slice(0, -1).map((m: string) => AgentCore.KEY_ALIASES[m] || m);
    robot.keyTap(key, modifiers.length ? modifiers : undefined);
    return { success: true, output: `Pressed ${raw}` };
  }

  // --- Utilities ---

  private safePath(p: string): string {
    const home = os.homedir();
    const resolved = p.startsWith('~') ? path.join(home, p.slice(1)) : path.resolve(p);
    if (!resolved.startsWith(home) && !path.isAbsolute(p)) {
      throw new Error('Path must be within home directory');
    }
    return resolved;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'pong' }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.credentials) return;
    const delay = this.reconnectDelay + Math.random() * 1000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
  }

  private emitState(): void {
    this.emit('stateChanged', this.getState());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private decodeJwt(token: string): Record<string, unknown> {
    let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const rem = b64.length % 4;
    if (rem === 2) b64 += '=='; else if (rem === 3) b64 += '=';
    return JSON.parse(Buffer.from(b64, 'base64').toString());
  }

  private loadCredentials(): void {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        this.credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
        this.state.deviceId = this.credentials!.deviceId;
        this.state.deviceName = this.credentials!.deviceName;
        this.state.relayUrl = this.credentials!.relayUrl;
      }
    } catch {}
  }

  private saveCredentials(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(this.credentials, null, 2));
  }

  private loadAuditLog(): void {
    try {
      if (fs.existsSync(AUDIT_FILE)) {
        const lines = fs.readFileSync(AUDIT_FILE, 'utf-8').trim().split('\n').slice(-200);
        this.auditLog = lines.map((l) => JSON.parse(l)).filter(Boolean);
      }
    } catch {}
  }

  private appendAuditFile(entry: AuditEntry): void {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
    } catch {}
  }
}
