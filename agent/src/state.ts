import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CREDENTIALS_DIR, CREDENTIALS_FILE, PID_FILE, STATE_FILE } from './config.js';

// ---- Types ----

export interface CredentialsData {
  deviceToken: string;
  deviceId: string;
  deviceName: string;
  relayUrl: string;
  platform: string;
}

export interface AgentState {
  status: string;
  connectedAt?: string;
  relayUrl?: string;
  deviceName?: string;
}

// ---- Directory ----

export function getCredentialsDir(): string {
  const dir = path.join(os.homedir(), CREDENTIALS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ---- Credentials ----

export function readCredentials(): CredentialsData | null {
  try {
    const filePath = path.join(getCredentialsDir(), CREDENTIALS_FILE);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as CredentialsData;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: CredentialsData): void {
  const dir = getCredentialsDir();
  const filePath = path.join(dir, CREDENTIALS_FILE);
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2), 'utf-8');
}

// ---- State ----

export function readState(): AgentState | null {
  try {
    const filePath = path.join(getCredentialsDir(), STATE_FILE);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as AgentState;
  } catch {
    return null;
  }
}

export function writeState(state: AgentState): void {
  const dir = getCredentialsDir();
  const filePath = path.join(dir, STATE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

// ---- PID ----

export function readPid(): number | null {
  try {
    const filePath = path.join(getCredentialsDir(), PID_FILE);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    const pid = parseInt(raw, 10);
    if (Number.isNaN(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

export function writePid(pid: number): void {
  const dir = getCredentialsDir();
  const filePath = path.join(dir, PID_FILE);
  fs.writeFileSync(filePath, String(pid), 'utf-8');
}

export function removePid(): void {
  try {
    const filePath = path.join(getCredentialsDir(), PID_FILE);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore errors during cleanup
  }
}
