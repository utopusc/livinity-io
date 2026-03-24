/**
 * Emergency Stop Detection (SEC-02)
 *
 * Tracks rapid Escape key presses to trigger an emergency stop.
 * When 3 escape key presses are detected within a 1-second window,
 * the registered callback fires to send a kill signal through the WebSocket.
 *
 * The detection works by monitoring keyboard_press tool calls for "escape" key.
 * External callers (e.g., Electron tray app) can also invoke triggerEmergencyStop().
 */

// ---- State ----

const escapeTimestamps: number[] = [];
const ESCAPE_WINDOW_MS = 1000;
const ESCAPE_COUNT = 3;

let onEmergencyStopCallback: (() => void) | null = null;

// ---- Public API ----

/**
 * Register a callback that fires when emergency stop is triggered.
 * Typically wired in ConnectionManager to send device_emergency_stop.
 */
export function setEmergencyStopCallback(cb: () => void): void {
  onEmergencyStopCallback = cb;
}

/**
 * Record an Escape key press and check if the emergency stop threshold is met.
 * Returns true if emergency stop was triggered (3 presses within 1 second).
 */
export function recordEscapePress(): boolean {
  const now = Date.now();
  escapeTimestamps.push(now);

  // Prune timestamps outside the window
  while (escapeTimestamps.length > 0 && escapeTimestamps[0]! < now - ESCAPE_WINDOW_MS) {
    escapeTimestamps.shift();
  }

  if (escapeTimestamps.length >= ESCAPE_COUNT) {
    // Reset and fire
    escapeTimestamps.length = 0;
    onEmergencyStopCallback?.();
    return true;
  }

  return false;
}

/**
 * Programmatic emergency stop trigger (for external callers like Electron tray).
 * Fires the callback directly without requiring escape key presses.
 */
export function triggerEmergencyStop(): void {
  escapeTimestamps.length = 0;
  onEmergencyStopCallback?.();
}
