/**
 * Screenshot tool -- captures the primary display as JPEG via node-screenshots.
 *
 * Uses a lazy dynamic import for the native addon so that if the .node binary
 * fails to load (wrong arch, missing dependency, headless server) the agent
 * does not crash -- it simply returns an error result.
 */

let Monitor: any = null;
let loadError: string | null = null;
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const mod = await import('node-screenshots');
    Monitor = mod.Monitor;
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : String(err);
  }
}

export async function executeScreenshot(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown; images?: Array<{ base64: string; mimeType: string }> }> {
  await ensureLoaded();

  if (loadError) {
    return { success: false, output: '', error: 'Screenshot capture unavailable: ' + loadError };
  }

  try {
    const monitors = Monitor.all();
    if (!monitors || monitors.length === 0) {
      return { success: false, output: '', error: 'No monitors detected' };
    }

    // Select monitor: explicit display index, or primary, or first available
    const displayParam = params.display as number | undefined;
    let monitor;
    if (typeof displayParam === 'number' && displayParam >= 0 && displayParam < monitors.length) {
      monitor = monitors[displayParam];
    } else {
      monitor = monitors.find((m: any) => m.isPrimary) || monitors[0];
    }

    const image = monitor.captureImageSync();
    const jpegBuffer: Buffer = await image.toJpeg();
    const base64 = jpegBuffer.toString('base64');

    return {
      success: true,
      output: `Screenshot captured: ${image.width}x${image.height} (${jpegBuffer.length} bytes JPEG)`,
      data: { width: image.width, height: image.height, size: jpegBuffer.length },
      images: [{ base64, mimeType: 'image/jpeg' }],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: 'Screenshot failed: ' + message };
  }
}
