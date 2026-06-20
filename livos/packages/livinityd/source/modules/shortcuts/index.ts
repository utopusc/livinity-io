// Phase 290 — shortcuts module barrel.
//
// Re-exports the public surface consumed by server/trpc/index.ts (which mounts
// the `shortcut` namespace) and any forward-compat callers.

export {default as shortcutRouter, type Shortcut, type UserTemplate} from './trpc-router.js'
export {probeFrameable, openModeForWeb, decideFrameable, type FrameProbeResult} from './frame-probe.js'
export {TERMINAL_TEMPLATES, type TerminalTemplate} from './terminal-templates.js'
export {
	computeDedupKey,
	type ShortcutKind,
	type ShortcutOpenMode,
	type ShortcutPayload,
} from './shortcut-schema.js'
