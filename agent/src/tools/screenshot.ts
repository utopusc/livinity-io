/**
 * Screenshot tool -- captures the primary display as JPEG via node-screenshots,
 * resizes to a target resolution via sharp, and returns DPI-aware metadata.
 *
 * Coordinate chain:
 *   physical pixels (capture) → sharp resize → target resolution (AI sees)
 *   AI coords (target space) × (logicalW / targetW) = logical coords (robotjs)
 *
 * Includes hash-based caching: if the accessibility tree hasn't changed since
 * the last screenshot, returns the cached image instead of re-capturing.
 */

import { createHash } from 'node:crypto';
import { queryUia, getLastElementHash, getScreenshotCache, setScreenshotCache } from './screen-elements.js';

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

let sharpFn: any = null;
let sharpLoaded = false;
let sharpError: string | null = null;

async function ensureSharp(): Promise<void> {
  if (sharpLoaded) return;
  sharpLoaded = true;
  try {
    const mod = require('sharp');
    sharpFn = mod;
  } catch (err: unknown) {
    sharpError = err instanceof Error ? err.message : String(err);
  }
}

// Anthropic recommended target resolutions
const SCALE_TARGETS = [
  { w: 1280, h: 800, ratio: 1280 / 800 },   // WXGA 16:10
  { w: 1366, h: 768, ratio: 1366 / 768 },   // FWXGA ~16:9
  { w: 1024, h: 768, ratio: 1024 / 768 },   // XGA 4:3
];

// Stored for coordinate mapping by mouse tools
export let logicalScreenW = 0;
export let logicalScreenH = 0;
export let aiTargetW = 0;
export let aiTargetH = 0;

export async function executeScreenshot(
  params: Record<string, unknown>,
): Promise<{ success: boolean; output: string; error?: string; data?: unknown; images?: Array<{ base64: string; mimeType: string }> }> {
  // AIP-03: Return cached screenshot if accessibility tree hasn't changed
  const cachedHash = getLastElementHash();
  const cache = getScreenshotCache();
  if (cachedHash && cache) {
    try {
      const result = await queryUia();
      if (result.elements && result.elements.length > 0) {
        const header = 'id|window|control_type|name|(cx,cy)';
        const body = (result.elements as string[]).join('\n');
        const text = `${header}\n${body}`;
        const currentHash = createHash('sha256').update(text).digest('hex');
        if (currentHash === cachedHash) {
          return {
            success: true,
            output: cache.output + ' [cached — accessibility tree unchanged]',
            data: { ...cache.data, cached: true },
            images: [{ base64: cache.base64, mimeType: 'image/jpeg' }],
          };
        }
      }
    } catch {
      // UIA query failed — fall through to fresh screenshot
    }
  }

  await ensureLoaded();
  await ensureSharp();

  if (loadError) {
    return { success: false, output: '', error: 'Screenshot capture unavailable: ' + loadError };
  }

  try {
    const monitors = Monitor.all();
    if (!monitors || monitors.length === 0) {
      return { success: false, output: '', error: 'No monitors detected' };
    }

    // Select monitor
    const displayParam = params.display as number | undefined;
    let monitor;
    if (typeof displayParam === 'number' && displayParam >= 0 && displayParam < monitors.length) {
      monitor = monitors[displayParam];
    } else {
      monitor = monitors.find((m: any) => m.isPrimary()) || monitors[0];
    }

    const physicalW = monitor.width();
    const physicalH = monitor.height();
    const scaleFactor = monitor.scaleFactor();

    // Logical dimensions = what robotjs uses for mouse coordinates
    const logW = Math.round(physicalW / scaleFactor);
    const logH = Math.round(physicalH / scaleFactor);

    // Find best target resolution by aspect ratio
    const ratio = logW / logH;
    let targetW = logW;
    let targetH = logH;
    for (const t of SCALE_TARGETS) {
      if (Math.abs(t.ratio - ratio) < 0.02 && t.w <= logW) {
        targetW = t.w;
        targetH = t.h;
        break;
      }
    }

    // Store for coordinate mapping (used by mouse tools)
    logicalScreenW = logW;
    logicalScreenH = logH;
    aiTargetW = targetW;
    aiTargetH = targetH;

    const image = monitor.captureImageSync();
    const jpegInput = Buffer.from(image.toJpegSync());

    // Resize via sharp if available, otherwise send original
    let finalJpeg: Buffer;
    if (sharpFn && (targetW !== physicalW || targetH !== physicalH)) {
      finalJpeg = await sharpFn(jpegInput)
        .resize(targetW, targetH, { fit: 'fill' })
        .jpeg({ quality: 80 })
        .toBuffer();
    } else {
      finalJpeg = jpegInput;
      if (sharpError) {
        // sharp not available, send original size but still report target dims
        // AI coordinates won't perfectly match but it's better than crashing
      }
    }

    const base64 = finalJpeg.toString('base64');

    // Get active window info
    let activeWindow: { title: string; appName: string; x: number; y: number; width: number; height: number } | null = null;
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
        };
      }
    } catch {}

    const outputStr = `Screenshot captured: ${physicalW}x${physicalH} physical, ${logW}x${logH} logical, resized to ${targetW}x${targetH} for AI. Coordinate space: 0,0 to ${targetW},${targetH}. Scale factor: ${scaleFactor}.`;
    const data = {
      width: logW,
      height: logH,
      displayWidth: targetW,
      displayHeight: targetH,
      physicalWidth: physicalW,
      physicalHeight: physicalH,
      scaleFactor,
      monitorX: monitor.x(),
      monitorY: monitor.y(),
      size: finalJpeg.length,
      activeWindow,
    };

    // Cache for AIP-03
    setScreenshotCache(base64, outputStr, data);

    return {
      success: true,
      output: outputStr,
      data,
      images: [{ base64, mimeType: 'image/jpeg' }],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, output: '', error: 'Screenshot failed: ' + message };
  }
}
