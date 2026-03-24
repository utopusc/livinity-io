/**
 * Screen info tool -- returns display geometry, scaling factor, and active window info.
 *
 * Uses node-screenshots for rich multi-monitor data: resolution, scale factor, rotation,
 * primary/builtin flags, and focused window title/position. This metadata is critical for
 * the AI to map screenshot pixel coordinates to physical screen positions.
 *
 * Lazy-loads the native addon so the agent does not crash on headless systems.
 */

let Monitor: any = null;
let WindowClass: any = null;
let loadError: string | null = null;
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const mod = await import('node-screenshots');
    Monitor = mod.Monitor;
    WindowClass = mod.Window;
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : String(err);
  }
}

export async function executeScreenInfo(
  _params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown }> {
  await ensureLoaded();

  if (loadError) {
    return { success: false, output: '', error: 'Screen info unavailable: ' + loadError };
  }

  try {
    const monitors = Monitor.all();
    if (!monitors || monitors.length === 0) {
      return { success: false, output: '', error: 'No monitors detected' };
    }

    // Build display info array
    const displays = monitors.map((m: any) => ({
      id: m.id(),
      name: m.name(),
      x: m.x(),
      y: m.y(),
      width: m.width(),
      height: m.height(),
      scaleFactor: m.scaleFactor(),
      rotation: m.rotation(),
      frequency: m.frequency(),
      isPrimary: m.isPrimary(),
      isBuiltin: m.isBuiltin(),
    }));

    const primaryDisplay = displays.find((d: any) => d.isPrimary) || displays[0];

    // Get active (focused) window info
    let activeWindow: { title: string; appName: string; x: number; y: number; width: number; height: number; pid: number } | null = null;
    try {
      const windows = WindowClass.all();
      const focused = windows.find((w: any) => w.isFocused());
      if (focused) {
        activeWindow = {
          title: focused.title(),
          appName: focused.appName(),
          x: focused.x(),
          y: focused.y(),
          width: focused.width(),
          height: focused.height(),
          pid: focused.pid(),
        };
      }
    } catch {
      // Window enumeration may fail on some platforms -- ignore and return null
    }

    // Build human-readable output
    const displaySummaries = displays.map((d: any) =>
      `${d.isPrimary ? 'Primary' : 'Secondary'} ${d.width}x${d.height} @${d.scaleFactor}x`,
    );
    const windowSummary = activeWindow
      ? ` | Active window: '${activeWindow.title}' (${activeWindow.width}x${activeWindow.height} at ${activeWindow.x},${activeWindow.y})`
      : '';
    const output = `${displays.length} display${displays.length !== 1 ? 's' : ''}: ${displaySummaries.join(', ')}${windowSummary}`;

    return {
      success: true,
      output,
      data: {
        displays,
        displayCount: displays.length,
        primaryDisplay,
        activeWindow,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: 'Screen info failed: ' + message };
  }
}
