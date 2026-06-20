// Phase 290 R3 (REQ2) — apt input normalizer for the Add Shortcut → Native tab.
//
// The "Install via apt" field accepts EITHER a bare package name (`gimp`) OR a
// pasted full command (`sudo apt install gimp`, `apt-get install -y gimp`). The
// server mutation is `apps.native.installFromHost({pkg, name})` — a SINGLE `pkg`
// string validated against `APT_PACKAGE_RE = /^[a-z0-9][a-z0-9+._-]*$/` (no
// spaces, no splitting). So this normalizer strips the leading
// `sudo`/`apt(-get) install` wrapper + common flags, then returns the FIRST
// package token ONLY.
//
// ⛔ This is UX-only sugar — the server `APT_PACKAGE_RE` + `--` end-of-options +
// fixed argv spawn is the security boundary; cleaning the input here can never
// widen what the server accepts.

/**
 * Normalize a pasted apt command (or bare package name) to a single package
 * token suitable for `apps.native.installFromHost({pkg})`.
 *
 *   gimp                          → gimp
 *   sudo apt install gimp         → gimp
 *   apt-get install -y gimp       → gimp
 *   foo bar baz                   → foo   (first token only; server rejects spaces)
 *
 * Returns '' when there is no token (empty/whitespace-only input).
 */
export function normalizeAptInput(raw: string): string {
	let s = raw.trim().replace(/^\s*sudo\s+/i, '').replace(/^\s*apt(?:-get)?\s+install\s+/i, '')
	s = s.replace(/(^|\s)(-y|--yes|-q|--quiet|--no-install-recommends)(?=\s|$)/gi, ' ')
	return s.trim().split(/\s+/)[0] ?? '' // first token only (server rejects spaces)
}
