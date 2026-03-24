export const AGENT_VERSION = '0.1.0';
export const RELAY_URL_DEFAULT = 'wss://relay.livinity.io';
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const AUTH_TIMEOUT_MS = 5_000;
export const CREDENTIALS_DIR = '.livinity';
export const CREDENTIALS_FILE = 'credentials.json';
export const PID_FILE = 'agent.pid';
export const STATE_FILE = 'state.json';

// Reconnection constants (matching TunnelClient pattern)
export const RECONNECT_BASE_DELAY = 1000;
export const RECONNECT_MAX_DELAY = 60_000;
export const RECONNECT_MAX_JITTER = 1000;
