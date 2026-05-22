/**
 * Phase 195 Plan 02 Task 1 — auth-json-path.ts
 *
 * Resolve the OpenCode `auth.json` path cross-platform.
 *
 *   Linux/macOS (XDG): $XDG_DATA_HOME/opencode/auth.json
 *                      → fallback ~/.local/share/opencode/auth.json
 *   Windows:           %LOCALAPPDATA%/opencode/auth.json
 *                      → fallback %USERPROFILE%/AppData/Local/opencode/auth.json
 *
 * Test seam: explicit `override` arg (highest precedence) + OPENCODE_AUTH_JSON
 * env var (operator escape hatch).
 *
 * Phase 192 bruce-user hard rule: never hardcode the root-user home prefix.
 * Always use os.homedir() so the path resolves correctly under the
 * User=bruce systemd unit.
 */

import * as os from 'node:os'
import * as path from 'node:path'

export function getOpencodeAuthPath(override?: string): string {
	if (typeof override === 'string' && override.length > 0) {
		return override
	}

	const envOverride = process.env.OPENCODE_AUTH_JSON
	if (typeof envOverride === 'string' && envOverride.length > 0) {
		return envOverride
	}

	if (process.platform === 'win32') {
		const localAppData =
			process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
		return path.join(localAppData, 'opencode', 'auth.json')
	}

	// Linux / macOS / *BSD — honor XDG Base Directory Specification.
	const xdgDataHome =
		process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share')
	return path.join(xdgDataHome, 'opencode', 'auth.json')
}
