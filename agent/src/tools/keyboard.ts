/**
 * Keyboard automation tools -- type text, press keys/combinations.
 *
 * Uses @jitsi/robotjs for cross-platform desktop input automation.
 * Lazy-loads the native addon so the agent does not crash on headless systems.
 */

import type * as RobotJS from '@jitsi/robotjs';

type ToolResult = { success: boolean; output: string; error?: string; data?: unknown };

let robot: typeof RobotJS | null = null;
let loadError: string | null = null;
let loaded = false;

function ensureRobotLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    robot = require('@jitsi/robotjs');
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : String(err);
  }
}

function checkRobot(): ToolResult | null {
  ensureRobotLoaded();
  if (loadError) {
    return { success: false, output: '', error: 'Keyboard control unavailable: ' + loadError };
  }
  return null;
}

// Normalize common key aliases to robotjs key names
const KEY_ALIASES: Record<string, string> = {
  ctrl: 'control',
  ctl: 'control',
  cmd: 'command',
  meta: 'command',
  win: 'command',
  super: 'command',
  esc: 'escape',
  return: 'enter',
  cr: 'enter',
  del: 'delete',
  ins: 'insert',
  pgup: 'pageup',
  pgdn: 'pagedown',
  bs: 'backspace',
};

const MODIFIER_KEYS = new Set(['control', 'alt', 'shift', 'command']);

function normalizeKey(key: string): string {
  const lower = key.toLowerCase().trim();
  return KEY_ALIASES[lower] || lower;
}

// KEY-01: Type arbitrary text string
export async function executeKeyboardType(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const text = params.text as string;
  if (!text || typeof text !== 'string') {
    return { success: false, output: '', error: 'Parameter "text" is required and must be a non-empty string' };
  }

  try {
    robot!.typeString(text);
    return { success: true, output: `Typed ${text.length} characters`, data: { length: text.length } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Type failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

// KEY-02: Press individual key or key combination (e.g., "ctrl+c", "enter", "alt+tab")
export async function executeKeyboardPress(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const keyParam = params.key as string;
  if (!keyParam || typeof keyParam !== 'string') {
    return { success: false, output: '', error: 'Parameter "key" is required and must be a non-empty string' };
  }

  try {
    // Parse "ctrl+c" style input
    const parts = keyParam.split('+').map(p => normalizeKey(p));
    const modifiers: string[] = [];
    let mainKey = '';

    for (const part of parts) {
      if (MODIFIER_KEYS.has(part)) {
        modifiers.push(part);
      } else {
        mainKey = part;
      }
    }

    // If only modifiers and no main key, pop the last modifier as the main key
    if (!mainKey && modifiers.length > 0) {
      mainKey = modifiers.pop()!;
    }

    if (!mainKey) {
      return { success: false, output: '', error: 'Could not parse key from: ' + keyParam };
    }

    if (modifiers.length > 0) {
      robot!.keyTap(mainKey, modifiers);
    } else {
      robot!.keyTap(mainKey);
    }

    const combo = modifiers.length > 0 ? `${modifiers.join('+')}+${mainKey}` : mainKey;
    return { success: true, output: `Pressed key: ${combo}`, data: { key: mainKey, modifiers } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Key press failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}
