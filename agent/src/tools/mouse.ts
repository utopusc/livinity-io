/**
 * Mouse automation tools -- click, double-click, right-click, move, drag, scroll.
 *
 * Uses @jitsi/robotjs for cross-platform desktop input automation.
 * Lazy-loads the native addon so the agent does not crash on headless systems.
 */

import type * as RobotJS from '@jitsi/robotjs';
import { logicalScreenW, aiTargetW, logicalScreenH, aiTargetH } from './screenshot.js';

type ToolResult = { success: boolean; output: string; error?: string; data?: unknown };

// Convert AI target coordinates to logical screen coordinates
// raw=true means coords are already in logical space (from screen_elements)
function toScreenX(x: number, raw: boolean): number {
  if (raw || !aiTargetW || !logicalScreenW) return Math.round(x);
  return Math.round(x * (logicalScreenW / aiTargetW));
}
function toScreenY(y: number, raw: boolean): number {
  if (raw || !aiTargetH || !logicalScreenH) return Math.round(y);
  return Math.round(y * (logicalScreenH / aiTargetH));
}

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
    return { success: false, output: '', error: 'Mouse control unavailable: ' + loadError };
  }
  return null;
}

function validateCoords(x: unknown, y: unknown, names = 'x and y'): ToolResult | null {
  if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0) {
    return { success: false, output: '', error: `Parameters ${names} are required numbers >= 0` };
  }
  return null;
}

// MOUSE-01: Left-click at coordinates
export async function executeMouseClick(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const rawX = params.x as number;
  const rawY = params.y as number;
  const coordErr = validateCoords(rawX, rawY);
  if (coordErr) return coordErr;
  const raw = !!params.raw;
  const x = toScreenX(rawX, raw);
  const y = toScreenY(rawY, raw);

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('left');
    return { success: true, output: `Left-clicked at (${x}, ${y})${raw ? ' [raw/element coords]' : ` [AI coord: ${rawX}, ${rawY}]`}`, data: { x, y, button: 'left', raw } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Mouse click failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

// MOUSE-02: Double-click at coordinates
export async function executeMouseDoubleClick(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const rawX = params.x as number;
  const rawY = params.y as number;
  const coordErr = validateCoords(rawX, rawY);
  if (coordErr) return coordErr;
  const raw = !!params.raw;
  const x = toScreenX(rawX, raw);
  const y = toScreenY(rawY, raw);

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('left', true);
    return { success: true, output: `Double-clicked at (${x}, ${y})${raw ? ' [raw/element coords]' : ''}`, data: { x, y, button: 'double', raw } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Mouse double-click failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

// MOUSE-03: Right-click at coordinates
export async function executeMouseRightClick(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const rawX = params.x as number;
  const rawY = params.y as number;
  const coordErr = validateCoords(rawX, rawY);
  if (coordErr) return coordErr;
  const raw = !!params.raw;
  const x = toScreenX(rawX, raw);
  const y = toScreenY(rawY, raw);

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('right');
    return { success: true, output: `Right-clicked at (${x}, ${y})${raw ? ' [raw/element coords]' : ''}`, data: { x, y, button: 'right', raw } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Mouse right-click failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

// MOUSE-04: Move mouse to coordinates (instant, NOT smooth)
export async function executeMouseMove(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const rawX = params.x as number;
  const rawY = params.y as number;
  const coordErr = validateCoords(rawX, rawY);
  if (coordErr) return coordErr;
  const raw = !!params.raw;
  const x = toScreenX(rawX, raw);
  const y = toScreenY(rawY, raw);

  try {
    robot!.moveMouse(x, y);
    return { success: true, output: `Moved mouse to (${x}, ${y})${raw ? ' [raw/element coords]' : ''}`, data: { x, y, raw } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Mouse move failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

// MOUSE-05: Drag from one position to another with try/finally safety
export async function executeMouseDrag(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const rawFromX = params.fromX as number;
  const rawFromY = params.fromY as number;
  const rawToX = params.toX as number;
  const rawToY = params.toY as number;

  if (
    typeof rawFromX !== 'number' || typeof rawFromY !== 'number' ||
    typeof rawToX !== 'number' || typeof rawToY !== 'number' ||
    rawFromX < 0 || rawFromY < 0 || rawToX < 0 || rawToY < 0
  ) {
    return { success: false, output: '', error: 'Parameters fromX, fromY, toX, toY are required numbers >= 0' };
  }

  const raw = !!params.raw;
  const fromX = toScreenX(rawFromX, raw);
  const fromY = toScreenY(rawFromY, raw);
  const toX = toScreenX(rawToX, raw);
  const toY = toScreenY(rawToY, raw);

  try {
    robot!.moveMouse(fromX, fromY);
    robot!.mouseToggle('down');
    try {
      robot!.moveMouse(toX, toY);
    } finally {
      robot!.mouseToggle('up');
    }
    return {
      success: true,
      output: `Dragged from (${fromX}, ${fromY}) to (${toX}, ${toY})${raw ? ' [raw/element coords]' : ''}`,
      data: { fromX, fromY, toX, toY, raw },
    };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Drag failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

// MOUSE-06: Scroll up/down, optionally at specific coordinates
export async function executeMouseScroll(
  params: Record<string, unknown>,
): Promise<ToolResult> {
  const robotErr = checkRobot();
  if (robotErr) return robotErr;

  const direction = params.direction as string;
  if (!direction || typeof direction !== 'string' || (direction !== 'up' && direction !== 'down')) {
    return { success: false, output: '', error: 'Parameter "direction" is required and must be "up" or "down"' };
  }

  const amount = typeof params.amount === 'number' && params.amount > 0 ? params.amount : 3;
  const x = params.x as number | undefined;
  const y = params.y as number | undefined;

  try {
    const raw = !!params.raw;
    // Move to position if coordinates given
    if (typeof x === 'number' && typeof y === 'number') {
      if (x < 0 || y < 0) {
        return { success: false, output: '', error: 'Coordinates x and y must be >= 0' };
      }
      robot!.moveMouse(toScreenX(x, raw), toScreenY(y, raw));
    }

    const scrollY = direction === 'up' ? amount : -amount;
    robot!.scrollMouse(0, scrollY);

    const posInfo = (typeof x === 'number' && typeof y === 'number') ? ` at (${x}, ${y})` : '';
    return {
      success: true,
      output: `Scrolled ${direction} by ${amount}${posInfo}`,
      data: { direction, amount, x, y },
    };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Scroll failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}
