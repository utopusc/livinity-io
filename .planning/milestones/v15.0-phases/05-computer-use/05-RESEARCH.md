# Phase 5: Agent Mouse & Keyboard Tools - Research

**Researched:** 2026-03-24
**Domain:** Cross-platform desktop automation (mouse/keyboard control) via Node.js native addons
**Confidence:** HIGH

## Summary

This phase adds 8 new tools to the existing Livinity Agent: `mouse_click`, `mouse_double_click`, `mouse_right_click`, `mouse_move`, `mouse_drag`, `mouse_scroll`, `keyboard_type`, and `keyboard_press`. The agent already has 9 tools following a clean dispatcher pattern (`TOOL_NAMES` constant + `executeTool()` switch-case in `agent/src/tools.ts`), with individual tool implementations in `agent/src/tools/*.ts`. The DeviceBridge on the server side has a `DEVICE_TOOL_SCHEMAS` map that defines parameter schemas for each tool and registers them as proxy tools in Nexus. New tools need entries in both places.

The recommended library is `@jitsi/robotjs` (v0.6.21, published 2026-01-05, MIT license). This is a maintained fork of the original robotjs with prebuilt N-API binaries for all target platforms (Windows x64/arm64/ia32, macOS universal, Linux x64/arm64). It uses `node-gyp-build` to load native `.node` files from a `prebuilds/` directory -- the exact same loading pattern as the already-bundled `node-screenshots` package. This means the SEA build pipeline already knows how to handle this type of native addon: mark it as external in esbuild, copy prebuilds alongside the binary. The API is synchronous, simple, and well-typed (`mouseClick()`, `keyTap()`, `scrollMouse()`, etc.).

**Primary recommendation:** Use `@jitsi/robotjs@0.6.21` -- free, MIT-licensed, prebuilt binaries for all platforms, N-API stable ABI (no recompilation across Node versions), same native addon pattern as existing `node-screenshots`. Do NOT use `@nut-tree/nut-js` (requires $75/mo subscription for prebuilt binaries).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
The CONTEXT.md (05-CONTEXT.md) is the v15.0 vision document. Key locked decisions:
- 8 mouse/keyboard tools to implement: mouse_click, mouse_double_click, mouse_right_click, keyboard_type, keyboard_press, mouse_move, mouse_drag, mouse_scroll (with get_screen_size deferred to Phase 6)
- Tools execute in the agent process (not Electron renderer)
- Activity log records every click/type action
- Tool dispatcher pattern: add to TOOL_NAMES + switch case in agent/src/tools.ts

### Claude's Discretion
- Library choice between nut.js and robotjs (CONTEXT.md says "robotjs or nutjs") -- research recommends @jitsi/robotjs (see detailed comparison below)
- Internal tool implementation structure (single file vs. multiple files)
- Error handling strategy for native addon failures

### Deferred Ideas (OUT OF SCOPE)
- Emergency stop hotkey (Phase 9: Security)
- User consent dialog (Phase 9: Security)
- Computer use session loop (Phase 7)
- Live screenshot stream (Phase 8)
- Per-application permissions (v15.1+)
- get_screen_size tool (Phase 6: SCREEN-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOUSE-01 | AI can click at specific screen coordinates (left click) | `@jitsi/robotjs` `mouseClick('left')` after `moveMouse(x, y)` -- verified API with TypeScript types |
| MOUSE-02 | AI can double-click at specific screen coordinates | `mouseClick('left', true)` -- second param is `double: boolean` |
| MOUSE-03 | AI can right-click at specific screen coordinates | `mouseClick('right')` -- button param accepts 'left', 'right', 'middle' |
| MOUSE-04 | AI can move the mouse cursor to specific coordinates | `moveMouse(x, y)` -- instant move, or `moveMouseSmooth(x, y)` for human-like |
| MOUSE-05 | AI can drag from one coordinate to another | `moveMouse(x1, y1)` + `mouseToggle('down')` + `moveMouse(x2, y2)` + `mouseToggle('up')`, or `dragMouse(x, y)` for simpler case |
| MOUSE-06 | AI can scroll up/down at current position or specific coordinates | `scrollMouse(x, y)` -- positive y = up, negative y = down; move to position first if coordinates specified |
| KEY-01 | AI can type arbitrary text strings | `typeString(text)` -- types full string into focused application |
| KEY-02 | AI can press individual keys and key combinations | `keyTap(key, modifier)` -- modifier can be string or string[] for combos like `keyTap('c', 'control')` for Ctrl+C |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @jitsi/robotjs | 0.6.21 | Cross-platform mouse/keyboard automation | Prebuilt N-API binaries for all platforms, MIT license, actively maintained by Jitsi, same native addon pattern as existing node-screenshots |

### Why NOT @nut-tree/nut-js

| Factor | @jitsi/robotjs | @nut-tree/nut-js |
|--------|---------------|------------------|
| Cost | Free (MIT) | $75/month for prebuilt binaries |
| Prebuilt binaries | Included in npm package | Paid subscription only |
| Native addon pattern | `node-gyp-build` (same as node-screenshots) | Different loading mechanism |
| API style | Synchronous, simple functions | Async, promise-based with config objects |
| SEA compatibility | Proven pattern (prebuilds/ dir) | Unknown, would need custom work |
| TypeScript types | Built-in `.d.ts` | Native TypeScript (but needs subscription) |
| Image recognition | No (not needed for Phase 5) | Yes (via OpenCV, heavy dependency) |
| Last publish | 2026-01-05 | Needs subscription to install |

The fork `@nut-tree-fork/nut-js` (v4.2.6, last published 2025-03-13) is free but uses a different native addon (`@nut-tree-fork/libnut`) with heavier dependencies (jimp for image processing). It also requires Node >= 16 and has a more complex dependency tree. For simple mouse/keyboard automation without image recognition, `@jitsi/robotjs` is simpler, lighter, and uses the identical native addon loading pattern already proven in this project.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @jitsi/robotjs | @nut-tree-fork/nut-js | Heavier deps (jimp, libnut), different native loading pattern, async API adds complexity for simple operations |
| @jitsi/robotjs | @hurdlegroup/robotjs (v0.12.3) | Different fork, fewer prebuilt platforms, less actively maintained |
| @jitsi/robotjs | Original robotjs (v0.7.0) | Maintenance concerns, prebuilt binary availability unclear for Node 22 |

**Installation:**
```bash
cd agent && npm install @jitsi/robotjs@0.6.21
```

**Version verification:**
- `@jitsi/robotjs`: 0.6.21 (published 2026-01-05) -- verified via `npm view`
- Prebuilt binaries ship inside the npm package in `prebuilds/` directory

## Architecture Patterns

### Recommended Project Structure
```
agent/src/
├── tools/
│   ├── shell.ts           # existing
│   ├── files.ts           # existing
│   ├── processes.ts       # existing
│   ├── system-info.ts     # existing
│   ├── screenshot.ts      # existing
│   ├── mouse.ts           # NEW - mouse_click, mouse_double_click, mouse_right_click, mouse_move, mouse_drag, mouse_scroll
│   └── keyboard.ts        # NEW - keyboard_type, keyboard_press
├── tools.ts               # MODIFIED - add 8 new tool names + switch cases
├── types.ts               # no changes needed (generic DeviceToolCall)
└── connection-manager.ts  # no changes needed (TOOL_NAMES auto-propagated)
```

### Pattern 1: Lazy Native Addon Loading (Proven Pattern)
**What:** Load `@jitsi/robotjs` via lazy dynamic import, same as `node-screenshots` in `screenshot.ts`
**When to use:** Always -- native addons can fail to load (headless servers, missing display, wrong arch)
**Example:**
```typescript
// Source: agent/src/tools/screenshot.ts (existing pattern)
let robot: typeof import('@jitsi/robotjs') | null = null;
let loadError: string | null = null;
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    // node-gyp-build resolves prebuilds/ at runtime
    robot = require('@jitsi/robotjs');
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : String(err);
  }
}
```

**Note:** `@jitsi/robotjs` uses CJS `require()` via `node-gyp-build`. Since the agent is bundled as CJS by esbuild, this works naturally. Unlike `node-screenshots` which uses ESM dynamic `import()`, robotjs uses `require()` internally. Mark it external in esbuild and it will resolve from the `node_modules/` directory at runtime.

### Pattern 2: Tool Function Signature (Existing Pattern)
**What:** Each tool export follows the same return type signature
**When to use:** All tool implementations
**Example:**
```typescript
// Source: agent/src/tools.ts (existing pattern)
export async function executeMouseClick(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  ensureLoaded();
  if (loadError) {
    return { success: false, output: '', error: 'Mouse automation unavailable: ' + loadError };
  }

  const x = params.x as number;
  const y = params.y as number;

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('left');
    return { success: true, output: `Clicked at (${x}, ${y})`, data: { x, y, button: 'left' } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: 'Mouse click failed: ' + message };
  }
}
```

### Pattern 3: Tool Names Registration
**What:** New tools must be added to TOOL_NAMES array and the executeTool switch-case
**When to use:** Every new tool
**Example:**
```typescript
// agent/src/tools.ts
export const TOOL_NAMES = [
  'shell', 'files_list', 'files_read', 'files_write', 'files_delete', 'files_rename',
  'processes', 'system_info', 'screenshot',
  // Phase 5: Mouse & Keyboard tools
  'mouse_click', 'mouse_double_click', 'mouse_right_click',
  'mouse_move', 'mouse_drag', 'mouse_scroll',
  'keyboard_type', 'keyboard_press',
] as const;
```

### Pattern 4: DeviceBridge Schema Registration
**What:** Each tool needs a schema entry in `DEVICE_TOOL_SCHEMAS` on the server side
**When to use:** Every new tool (server-side, in livos/packages/livinityd/source/modules/devices/device-bridge.ts)
**Example:**
```typescript
// livos/packages/livinityd/source/modules/devices/device-bridge.ts
mouse_click: {
  description: 'Click the mouse at specific screen coordinates',
  parameters: [
    { name: 'x', type: 'number', description: 'X coordinate', required: true },
    { name: 'y', type: 'number', description: 'Y coordinate', required: true },
  ],
},
keyboard_press: {
  description: 'Press a key or key combination (e.g., enter, tab, ctrl+c)',
  parameters: [
    { name: 'key', type: 'string', description: 'Key name (enter, tab, escape, a-z, 0-9, f1-f12, etc.)', required: true },
    { name: 'modifier', type: 'string', description: 'Modifier key(s): control, alt, shift, command. Comma-separated for multiple.', required: false },
  ],
},
```

### Pattern 5: SEA Build Integration
**What:** Mark `@jitsi/robotjs` as external in esbuild and copy prebuilds in build-sea.mjs
**When to use:** Required for the agent binary to work
**Example for esbuild.config.mjs:**
```javascript
// Add alongside existing node-screenshots external
build.onResolve({ filter: /^@jitsi\/robotjs$/ }, () => ({
  path: '@jitsi/robotjs',
  external: true,
}));
```
**Example for build-sea.mjs:**
```javascript
// Copy @jitsi/robotjs (same pattern as node-screenshots)
const robotjsDest = join(distDir, 'node_modules', '@jitsi', 'robotjs');
copyFile(join(nodeModules, '@jitsi', 'robotjs', 'index.js'), join(robotjsDest, 'index.js'), '@jitsi/robotjs/index.js');
copyFile(join(nodeModules, '@jitsi', 'robotjs', 'package.json'), join(robotjsDest, 'package.json'), '@jitsi/robotjs/package.json');
// Copy prebuilt native binaries
copyDir(join(nodeModules, '@jitsi', 'robotjs', 'prebuilds'), join(robotjsDest, 'prebuilds'), '@jitsi/robotjs/prebuilds/');
// Also need node-gyp-build for runtime resolution
copyDir(join(nodeModules, 'node-gyp-build'), join(distDir, 'node_modules', 'node-gyp-build'), 'node-gyp-build/');
```

### Anti-Patterns to Avoid
- **Do NOT use moveMouseSmooth() by default:** It adds visible delay and is unnecessary for AI-driven automation. Use `moveMouse()` for instant positioning.
- **Do NOT hold modifier keys with keyToggle() for combos:** Use `keyTap(key, modifier)` instead -- it handles press+release atomically and avoids stuck keys on error.
- **Do NOT import robotjs at module top level:** Lazy-load to prevent crashes on headless systems or when the native addon fails to load.
- **Do NOT pass the mouse/keyboard tools to non-desktop devices:** The tool list is self-describing. If a device cannot load robotjs (e.g., a headless server), it should not advertise these tools. Handle this at tool registration time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mouse movement/click | Win32 API/CGEvent calls via ffi-napi | @jitsi/robotjs mouseClick/moveMouse | Cross-platform, handles DPI scaling, tested on all OS |
| Keyboard input | Custom sendkeys via child_process | @jitsi/robotjs typeString/keyTap | Unicode support, modifier handling, cross-platform |
| Key combination parsing | String parser for "ctrl+c" -> API calls | Simple map from string to robotjs params | robotjs already accepts modifier as second param to keyTap |
| Double-click timing | Two clicks with setTimeout | mouseClick('left', true) | OS-native double-click interval |
| Drag operation | mouseToggle down + moveMouse + up | Still need to compose, but use robotjs primitives | Edge cases: stuck mouse button on error needs try/finally |

**Key insight:** `@jitsi/robotjs` provides all the low-level primitives. The only "glue" needed is parameter parsing (converting the tool params from JSON into robotjs function calls) and error wrapping (converting exceptions into the standard tool result format).

## Common Pitfalls

### Pitfall 1: Stuck Mouse Button on Drag Failure
**What goes wrong:** If an error occurs between `mouseToggle('down')` and `mouseToggle('up')`, the OS thinks the mouse button is still held.
**Why it happens:** No cleanup on error in the drag sequence.
**How to avoid:** Always use try/finally: `mouseToggle('down'); try { moveMouse(x2, y2); } finally { mouseToggle('up'); }`
**Warning signs:** After a failed drag, all subsequent mouse movements behave like drag operations.

### Pitfall 2: Coordinate Validation
**What goes wrong:** Passing negative coordinates or coordinates outside screen bounds causes silent failures or crashes.
**Why it happens:** robotjs does not validate coordinates against screen dimensions.
**How to avoid:** Validate x >= 0 and y >= 0 in the tool handler. Optionally use `getScreenSize()` to bounds-check (but this adds a dependency on screen info which is Phase 6).
**Warning signs:** Tool returns success but nothing happens visually.

### Pitfall 3: Native Addon Load Failure on Headless Systems
**What goes wrong:** `@jitsi/robotjs` fails to load on Linux servers without a display (no X11/Wayland).
**Why it happens:** The native addon requires a display server to send input events.
**How to avoid:** Use lazy loading (like screenshot.ts). If the addon fails to load, the agent still works for non-mouse/keyboard tools. Do NOT advertise mouse/keyboard tools if the addon fails to load.
**Warning signs:** `Error: libX11.so: cannot open shared object file` on Linux, or display-related errors.

### Pitfall 4: Key Name Mapping for User-Facing API
**What goes wrong:** Users/AI send key names that don't match robotjs expectations (e.g., "Ctrl+C" vs "control" + "c").
**Why it happens:** robotjs uses specific key name strings (lowercase, no "ctrl" shorthand).
**How to avoid:** Build a normalization layer: `ctrl` -> `control`, `cmd` -> `command`, `win` -> `command`, `esc` -> `escape`, `return` -> `enter`. Parse "ctrl+c" into `keyTap('c', 'control')`.
**Warning signs:** "Invalid key" errors from robotjs.

### Pitfall 5: SEA Binary Missing node-gyp-build
**What goes wrong:** The SEA binary cannot find `@jitsi/robotjs` native addon at runtime.
**Why it happens:** `node-gyp-build` is a runtime dependency that resolves the prebuilt `.node` file. If it's not copied alongside the SEA binary, the require chain breaks.
**How to avoid:** Copy both `@jitsi/robotjs/` (including `prebuilds/`) AND `node-gyp-build/` to `dist/node_modules/` in build-sea.mjs.
**Warning signs:** `Cannot find module 'node-gyp-build'` error at runtime.

### Pitfall 6: Linux Wayland Incompatibility
**What goes wrong:** Mouse/keyboard tools fail on Linux systems using Wayland instead of X11.
**Why it happens:** robotjs (and most desktop automation libraries) depend on X11. Wayland has a stricter security model that prevents applications from injecting input events to other windows.
**How to avoid:** Document this limitation. On Wayland, the user may need to switch to X11 or use XWayland. For Phase 5, X11 support is sufficient.
**Warning signs:** Tools load successfully but input events have no effect, or X11-related errors appear.

### Pitfall 7: macOS Accessibility Permissions
**What goes wrong:** Mouse/keyboard automation silently fails on macOS.
**Why it happens:** macOS requires explicit accessibility permissions for apps that control mouse/keyboard.
**How to avoid:** Return a clear error message when robotjs operations fail on macOS, guiding the user to System Preferences > Privacy & Security > Accessibility.
**Warning signs:** `moveMouse()` succeeds but `mouseClick()` and `keyTap()` have no effect.

## Code Examples

### Complete mouse_click Tool Implementation
```typescript
// Source: Verified @jitsi/robotjs API (robotjs.dev/docs/syntax + npm index.d.ts)
import type * as RobotJS from '@jitsi/robotjs';

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

export async function executeMouseClick(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  ensureRobotLoaded();
  if (loadError) return { success: false, output: '', error: 'Mouse control unavailable: ' + loadError };

  const x = params.x as number;
  const y = params.y as number;
  if (typeof x !== 'number' || typeof y !== 'number') {
    return { success: false, output: '', error: 'Parameters x and y are required numbers' };
  }

  try {
    robot!.moveMouse(x, y);
    robot!.mouseClick('left');
    return { success: true, output: `Left-clicked at (${x}, ${y})`, data: { x, y, button: 'left' } };
  } catch (err: unknown) {
    return { success: false, output: '', error: 'Mouse click failed: ' + (err instanceof Error ? err.message : String(err)) };
  }
}
```

### Complete keyboard_press Tool with Key Normalization
```typescript
// Source: Verified @jitsi/robotjs API -- keyTap(key, modifier?) where modifier is string | string[]

// Normalize common key aliases to robotjs key names
const KEY_ALIASES: Record<string, string> = {
  ctrl: 'control', ctl: 'control',
  cmd: 'command', meta: 'command', win: 'command', super: 'command',
  esc: 'escape',
  return: 'enter', cr: 'enter',
  del: 'delete',
  ins: 'insert',
  pgup: 'pageup', pgdn: 'pagedown',
  bs: 'backspace',
};

const MODIFIER_KEYS = new Set(['control', 'alt', 'shift', 'command']);

function normalizeKey(key: string): string {
  const lower = key.toLowerCase().trim();
  return KEY_ALIASES[lower] || lower;
}

export async function executeKeyboardPress(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  ensureRobotLoaded();
  if (loadError) return { success: false, output: '', error: 'Keyboard control unavailable: ' + loadError };

  const keyParam = params.key as string;
  if (!keyParam || typeof keyParam !== 'string') {
    return { success: false, output: '', error: 'Parameter "key" is required' };
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

    if (!mainKey && modifiers.length > 0) {
      // e.g., just "shift" pressed alone
      mainKey = modifiers.pop()!;
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
```

### mouse_drag with Stuck-Button Safety
```typescript
// Source: Verified @jitsi/robotjs API -- mouseToggle(down?, button?), moveMouse(x, y)
export async function executeMouseDrag(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  ensureRobotLoaded();
  if (loadError) return { success: false, output: '', error: 'Mouse control unavailable: ' + loadError };

  const fromX = params.fromX as number;
  const fromY = params.fromY as number;
  const toX = params.toX as number;
  const toY = params.toY as number;

  if ([fromX, fromY, toX, toY].some(v => typeof v !== 'number')) {
    return { success: false, output: '', error: 'Parameters fromX, fromY, toX, toY are required numbers' };
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
```

### mouse_scroll Implementation
```typescript
// Source: Verified @jitsi/robotjs API -- scrollMouse(x, y) where y positive = up, negative = down
export async function executeMouseScroll(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  ensureRobotLoaded();
  if (loadError) return { success: false, output: '', error: 'Mouse control unavailable: ' + loadError };

  const x = params.x as number | undefined;
  const y = params.y as number | undefined;
  const amount = (params.amount as number) || 3;
  const direction = (params.direction as string) || 'down';

  // Move to position if coordinates given
  if (typeof x === 'number' && typeof y === 'number') {
    robot!.moveMouse(x, y);
  }

  try {
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
```

## Complete DeviceBridge Schema Definitions

```typescript
// All 8 new tool schemas for DEVICE_TOOL_SCHEMAS in device-bridge.ts
mouse_click: {
  description: 'Left-click the mouse at screen coordinates',
  parameters: [
    { name: 'x', type: 'number', description: 'X coordinate (pixels from left)', required: true },
    { name: 'y', type: 'number', description: 'Y coordinate (pixels from top)', required: true },
  ],
},
mouse_double_click: {
  description: 'Double-click the mouse at screen coordinates',
  parameters: [
    { name: 'x', type: 'number', description: 'X coordinate', required: true },
    { name: 'y', type: 'number', description: 'Y coordinate', required: true },
  ],
},
mouse_right_click: {
  description: 'Right-click the mouse at screen coordinates',
  parameters: [
    { name: 'x', type: 'number', description: 'X coordinate', required: true },
    { name: 'y', type: 'number', description: 'Y coordinate', required: true },
  ],
},
mouse_move: {
  description: 'Move the mouse cursor to screen coordinates without clicking',
  parameters: [
    { name: 'x', type: 'number', description: 'X coordinate', required: true },
    { name: 'y', type: 'number', description: 'Y coordinate', required: true },
  ],
},
mouse_drag: {
  description: 'Drag the mouse from one position to another (click-hold-move-release)',
  parameters: [
    { name: 'fromX', type: 'number', description: 'Start X coordinate', required: true },
    { name: 'fromY', type: 'number', description: 'Start Y coordinate', required: true },
    { name: 'toX', type: 'number', description: 'End X coordinate', required: true },
    { name: 'toY', type: 'number', description: 'End Y coordinate', required: true },
  ],
},
mouse_scroll: {
  description: 'Scroll the mouse wheel up or down, optionally at specific coordinates',
  parameters: [
    { name: 'direction', type: 'string', description: 'Scroll direction: "up" or "down" (default: down)', required: true },
    { name: 'amount', type: 'number', description: 'Scroll amount in clicks (default: 3)', required: false },
    { name: 'x', type: 'number', description: 'X coordinate to scroll at (optional, uses current position if omitted)', required: false },
    { name: 'y', type: 'number', description: 'Y coordinate to scroll at (optional)', required: false },
  ],
},
keyboard_type: {
  description: 'Type a text string using the keyboard (into the currently focused input)',
  parameters: [
    { name: 'text', type: 'string', description: 'Text to type', required: true },
  ],
},
keyboard_press: {
  description: 'Press a key or key combination (e.g., "enter", "ctrl+c", "alt+tab", "f5")',
  parameters: [
    { name: 'key', type: 'string', description: 'Key to press. Use "+" for combinations: "ctrl+c", "alt+f4", "shift+tab". Supported keys: a-z, 0-9, f1-f12, enter, tab, escape, space, backspace, delete, up, down, left, right, home, end, pageup, pagedown, insert, printscreen. Modifiers: ctrl/control, alt, shift, command/cmd.', required: true },
  ],
},
```

## Robotjs Supported Key Reference

For the AI key normalization layer and DeviceBridge schema descriptions:

**Letters:** a-z (lowercase)
**Numbers:** 0-9
**Function keys:** f1-f12
**Navigation:** up, down, left, right, home, end, pageup, pagedown
**Control:** enter, tab, escape, space, backspace, delete, insert, printscreen
**Modifiers:** control, alt, shift, command, right_shift
**Numpad:** numpad_0 through numpad_9
**Media:** audio_mute, audio_vol_down, audio_vol_up, audio_play, audio_stop, audio_pause, audio_prev, audio_next

**Modifier param for keyTap:** Accepts `string | string[]` -- e.g., `keyTap('c', 'control')` or `keyTap('c', ['control', 'shift'])` for Ctrl+Shift+C.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Original robotjs (unmaintained) | @jitsi/robotjs fork with N-API + prebuilds | 2024-2025 | Stable ABI across Node versions, no recompilation needed |
| nut.js open source | nut.js subscription model ($75/mo for prebuilts) | 2024 | Free version requires building from source; fork available |
| Electron app for desktop control | Standalone Node.js SEA binary with native addons | v14.0 (this project) | Lighter, no Electron dependency, same capabilities |

**Deprecated/outdated:**
- Original `robotjs` npm package (v0.7.0): unclear maintenance, use `@jitsi/robotjs` instead
- `@nut-tree/nut-js` free prebuilts: no longer available, now behind paywall

## Open Questions

1. **Conditional Tool Advertisement**
   - What we know: If robotjs fails to load (headless server), the agent should not advertise mouse/keyboard tools
   - What's unclear: Should this be a static check at startup, or dynamic per-connection? Currently TOOL_NAMES is a compile-time constant.
   - Recommendation: Make TOOL_NAMES dynamic -- check if robotjs loads successfully at startup, only include mouse/keyboard tools if it succeeds. This is a simple change: filter TOOL_NAMES based on a `robotjsAvailable` flag before sending the device_auth message.

2. **DPI Scaling on High-DPI Displays**
   - What we know: robotjs operates in physical pixels. On high-DPI displays (e.g., 200% scaling on Windows), logical coordinates differ from physical coordinates.
   - What's unclear: Whether the AI's coordinate targeting (from screenshot analysis) will match robotjs's coordinate space.
   - Recommendation: This is a Phase 6 concern (SCREEN-02: screenshot coordinate metadata). For Phase 5, implement raw pixel coordinates. Phase 6 will add scaling factor metadata to screenshots so the AI can compute correct physical coordinates.

3. **node-gyp-build as Runtime Dependency**
   - What we know: `@jitsi/robotjs` uses `require('node-gyp-build')(__dirname)` to locate the `.node` file
   - What's unclear: Whether node-gyp-build needs to be copied as a separate module in the SEA build, or if esbuild can inline it
   - Recommendation: Copy `node-gyp-build/` to `dist/node_modules/` alongside `@jitsi/robotjs/`. It's a pure-JS module (~5 files) that resolves `.node` files from `prebuilds/` based on platform/arch. Since robotjs is marked external, its `require('node-gyp-build')` will also resolve externally.

## Sources

### Primary (HIGH confidence)
- @jitsi/robotjs npm package inspection: v0.6.21, prebuilt binaries for 6 platform/arch combos verified via `npm pack --dry-run`
- @jitsi/robotjs TypeScript definitions: extracted from npm tarball, complete API verified
- robotjs.dev/docs/syntax: complete API reference with all methods and key names
- agent/src/tools.ts, agent/src/tools/screenshot.ts: existing patterns for tool registration and native addon loading
- agent/esbuild.config.mjs, agent/build-sea.mjs: existing SEA build pipeline with native addon handling
- livos/packages/livinityd/source/modules/devices/device-bridge.ts: DeviceBridge DEVICE_TOOL_SCHEMAS pattern

### Secondary (MEDIUM confidence)
- nutjs.dev/docs: nut.js API documentation (mouse, keyboard, installation) -- verified subscription requirement
- nutjs.dev/pricing: $75/mo Solo plan confirmed for prebuilt binaries
- GitHub jitsi/robotjs: fork maintenance status, last commit April 2025

### Tertiary (LOW confidence)
- Linux Wayland compatibility: based on general desktop automation community knowledge, not verified with robotjs specifically
- macOS accessibility permission behavior: based on nut.js documentation, likely applies to robotjs as well

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @jitsi/robotjs verified via npm inspection, API types extracted, prebuilds confirmed for all platforms, identical native addon pattern to existing node-screenshots
- Architecture: HIGH - follows exact same patterns as existing agent tools (lazy loading, return types, TOOL_NAMES, DeviceBridge schemas)
- Pitfalls: HIGH - stuck mouse buttons, lazy loading, SEA bundling are well-understood from robotjs docs and existing agent experience; Wayland/macOS permissions are MEDIUM confidence

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain -- robotjs API is mature and unlikely to change)
