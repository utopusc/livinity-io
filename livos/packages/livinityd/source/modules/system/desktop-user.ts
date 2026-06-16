import os from 'node:os'

/**
 * WS1 (2026-06-11) — single source of truth for the local Linux "desktop user"
 * that LivOS runs as (the account that owns the X session, ~/.config, the
 * per-app Chrome profiles, and the sudo+docker group membership).
 *
 * Historically every spawner / chown / `sudo -u` literal hardcoded `bruce`.
 * That is wrong on any box whose platform username (and therefore the Linux
 * login created at install — see scripts/install/parse-cli.sh
 * LIVOS_DESKTOP_USER) is not "bruce".
 *
 * Ground truth: livinityd's systemd unit runs as `User=${desktop_user}`
 * (deploy-livinityd.sh), so the process's OWN identity IS the desktop user.
 * `os.userInfo().username` / `process.getuid()` therefore return exactly the
 * right values with zero configuration — they work on the Mini PC (bruce), a
 * fresh jack box (jack), AND a developer's localhost (their own login, where
 * the old `bruce` literal was always wrong).
 *
 * Memoized — the process identity never changes within a run.
 */
let _cachedUser: string | undefined

/**
 * Phase 278: neutral last-resort desktop user. The real desktop user almost
 * always comes from `os.userInfo().username` (livinityd runs AS that account);
 * this fallback only fires if the process is somehow running as root (legacy
 * box mid-migration) or `os.userInfo()` throws. It is NOT operator-specific —
 * `'livos'` mirrors the shell-side neutral default in scripts/install/parse-cli.sh
 * (LIVOS_DESKTOP_USER) so a misconfigured box never silently chowns to `bruce`.
 */
const NEUTRAL_DESKTOP_USER = 'livos'

export function getDesktopUser(): string {
	if (_cachedUser !== undefined) return _cachedUser
	try {
		const name = os.userInfo().username
		// Never resolve to root — livinityd should not be running as root post
		// Phase 192-02, but if it somehow is (legacy box mid-migration), fall
		// back to the neutral default rather than chowning things to root.
		_cachedUser = name && name !== 'root' ? name : NEUTRAL_DESKTOP_USER
	} catch {
		_cachedUser = NEUTRAL_DESKTOP_USER
	}
	return _cachedUser
}

/**
 * The desktop user's home directory. `os.userInfo().homedir` is the home of the
 * process's own user — correct because livinityd runs AS the desktop user.
 */
export function getDesktopHome(): string {
	try {
		return os.userInfo().homedir || os.homedir() || `/home/${getDesktopUser()}`
	} catch {
		return `/home/${getDesktopUser()}`
	}
}

/**
 * The desktop user's numeric uid (for /run/user/<uid> XDG_RUNTIME_DIR,
 * Xauthority paths, etc.). `process.getuid()` is the uid livinityd runs as —
 * the desktop uid, which on a real desktop Ubuntu may be 1001+ (the human owner
 * already holds 1000), NOT a hardcoded 1000.
 */
export function getDesktopUid(): number {
	try {
		return process.getuid?.() ?? 1000
	} catch {
		return 1000
	}
}
