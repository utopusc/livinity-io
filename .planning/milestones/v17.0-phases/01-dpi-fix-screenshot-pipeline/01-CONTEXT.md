# Phase 1: DPI Fix & Screenshot Pipeline - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the screenshot-to-click coordinate pipeline in agent-core.ts so that AI coordinates map correctly to screen coordinates on HiDPI displays. Add sharp for actual image resize (replacing the current no-op crop), fix coordinate metadata to report logical dimensions, and update the AI system prompt.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key technical decisions already established by research:
- Use sharp ^0.34.5 for screenshot resize
- Resize from physical pixels to Anthropic-recommended resolution (WXGA 1280x800 preferred)
- toScreenX/toScreenY should map AI coordinates (in resized image space) back to logical screen space
- node-screenshots width()/height() semantics need empirical verification
- AI system prompt must state coordinate space explicitly with dimensions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agent-app/src/main/agent-core.ts` lines 454-525: screenshot tool with SCALE_TARGETS array, captureImageSync, scaleFactor
- `agent-app/src/main/agent-core.ts` lines 557-569: toScreenX/toScreenY coordinate mapping
- `nexus/packages/core/src/agent.ts` lines 256-282: AI system prompt for computer use (Coordinate System section)
- node-screenshots already a dependency (^0.2.8), robotjs already a dependency (^0.6.21)

### Established Patterns
- Native modules loaded via `require()` with lazy loading pattern (robotjs uses ensureRobot())
- SEA build copies prebuilds via asarUnpack: `node_modules/@jitsi/robotjs/**`, `node_modules/node-screenshots/**`
- Screenshot returns `{ images: [{ base64, mimeType }], data: { width, height, displayWidth, displayHeight, scaleFactor, scaleX, scaleY } }`
- Mouse tools use `this.toScreenX(params.x)` to convert AI coords → screen coords

### Integration Points
- `toolScreenshot()` — where resize happens (or should happen)
- `toScreenX/toScreenY` — coordinate back-mapping
- `SCALE_TARGETS` — target resolutions for downscale
- AI system prompt in `nexus/packages/core/src/agent.ts` — coordinate space documentation
- package.json — add sharp dependency, update asarUnpack

</code_context>

<specifics>
## Specific Ideas

**The Bug:** line 502-505 admits "crop doesn't resize" — screenshots are sent at full physical resolution while telling the AI they're at a smaller target resolution. The AI sees the image at whatever the API auto-resizes it to (unknown dimensions), but coordinates are mapped based on the SCALE_TARGETS assumption. This creates a triple mismatch:
1. Physical capture size (e.g., 2560x1440)
2. Claimed target size (e.g., 1366x768)
3. Actual size AI sees (unknown API-resized)

**The Fix:** Use sharp to actually resize to target dimensions before encoding. Then coordinate mapping is simple: AI coordinates are in target space, screen is in logical space, and the ratio is known.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
