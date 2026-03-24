/**
 * Mouse automation tools -- click, double-click, right-click, move, drag, scroll.
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

  const x = params.x as number;
  const y = params.y as number;
  const coordErr = validateCoords(x, y);
  if (coordErr) return coordErr;

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('left');
    return { success: true, output: `Left-clicked at (${x}, ${y})`, data: { x, y, button: 'left' } };
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

  const x = params.x as number;
  const y = params.y as number;
  const coordErr = validateCoords(x, y);
  if (coordErr) return coordErr;

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('left', true);
    return { success: true, output: `Double-clicked at (${x}, ${y})`, data: { x, y, button: 'double' } };
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

  const x = params.x as number;
  const y = params.y as number;
  const coordErr = validateCoords(x, y);
  if (coordErr) return coordErr;

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('right');
    return { success: true, output: `Right-clicked at (${x}, ${y})`, data: { x, y, button: 'right' } };
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

  const x = params.x as number;
  const y = params.y as number;
  const coordErr = validateCoords(x, y);
  if (coordErr) return coordErr;

  try {
    robot!.moveMouse(x, y);
    return { success: true, output: `Moved mouse to (${x}, ${y})`, data: { x, y } };
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

  const fromX = params.fromX as number;
  const fromY = params.fromY as number;
  const toX = params.toX as number;
  const toY = params.toY as number;

  if (
    typeof fromX !== 'number' || typeof fromY !== 'number' ||
    typeof toX !== 'number' || typeof toY !== 'number' ||
    fromX < 0 || fromY < 0 || toX < 0 || toY < 0
  ) {
    return { success: false, output: '', error: 'Parameters fromX, fromY, toX, toY are required numbers >= 0' };
  }

  try {
    robot!.moveMouse(fromX, fromY);
    robot!.mouseToggle('down');
    try {
      robot!.moveMouse(toX, toY);
    } finally {
      robot!.mouseToggle('up'); // ALWAYS release, even on error
    }
    return {
      success: true,
      output: `Dragged from (${fromX}, ${fromY}) to (${toX}, ${toY})`,
      data: { fromX, fromY, toX, toY },
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
    // Move to position if coordinates given
    if (typeof x === 'number' && typeof y === 'number') {
      if (x < 0 || y < 0) {
        return { success: false, output: '', error: 'Coordinates x and y must be >= 0' };
      }
      robot!.moveMouse(x, y);
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
