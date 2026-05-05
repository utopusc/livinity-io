/**
 * Phase 72-native — barrel for the native X11 computer-use primitives.
 *
 * Sibling plans 72-native-02 (input.ts) and 72-native-03 (window.ts) will
 * append their own exports below as they ship. The 72-native-05 MCP server
 * imports from this barrel so per-tool wiring stays in one grep target.
 */
export {captureScreenshot} from './screenshot.js'
export type {ScreenshotResult} from './screenshot.js'

// 72-native-02 input.ts barrel append here
export * from './window.js'
