import {APPS_PATH, EXTERNAL_STORAGE_PATH, NETWORK_STORAGE_PATH} from '@/features/files/constants'
import {isSafetyRepoPath, POOL_ROOT, THIS_DEVICE_ROOT} from '@/features/backups/utils/backup-location-helpers'
import {t} from '@/utils/i18n'

// File name used by Livinity backups within a repository directory
export const BACKUP_FILE_NAME = 'Livinity Backup.backup'

/**
 * Phase 368.6 — virtual roots whose SECOND segment names the destination rather
 * than being part of the path within it (`/Network/<host>`, `/External/<drive>`,
 * `/ThisDevice/<folder>`). Previously this was a two-way check written out at
 * three separate call sites; a destination missing from it silently formats with
 * its root segment showing, e.g. "ThisDevice/Nightly/" instead of "Nightly/".
 *
 * /Pool is deliberately NOT here: the pool is the device, and everything after
 * /Pool is genuinely a path inside it.
 */
const DEVICE_ROOTED_PREFIXES = [NETWORK_STORAGE_PATH, EXTERNAL_STORAGE_PATH, THIS_DEVICE_ROOT]

const isDeviceRooted = (path: string) => DEVICE_ROOTED_PREFIXES.some((prefix) => path.startsWith(prefix))

// Returns a display path starting from the device name up to the parent directory
// containing the Livinity backup file, always ending with a trailing slash.
// Examples:
//  - /Network/samba.orb.local/data/My Backups/Livinity Backup.backup -> samba.orb.local/data/My Backups/
//  - /External/USB-DISK/Livinity Backup.backup -> USB-DISK/
//  - /Network/samba.orb.local/data/My Backups -> samba.orb.local/data/My Backups/
export function getDisplayRepositoryPath(path: string): string {
	const segments = path.split('/').filter(Boolean)

	// For /Network/<device>/... or /External/<device>/..., the device starts at index 1
	let startIndex = 0
	if (isDeviceRooted(path) || path.startsWith(POOL_ROOT)) {
		startIndex = 1
	}

	// Cut off at the backup file if present
	const backupIdx = segments.findIndex((s) => s === BACKUP_FILE_NAME)
	const endIndexExclusive = backupIdx !== -1 ? backupIdx : segments.length

	const parts = segments.slice(startIndex, endIndexExclusive)
	if (parts.length === 0) return ''
	return parts.join('/') + '/'
}

// Convert '/app-data/<appId>/path...' to '/Apps/<appId>/path...'
export function formatAppPathForDisplay(path: string) {
	// Replace anything up to and including '/app-data/' with the UI's Apps prefix.
	// If '/app-data/' is not present, this is a no-op and returns the original path. But this should never happen.
	return path.replace(/^.*\/app-data\//, `${APPS_PATH}/`)
}

// Return the final segment of a path, trimming a trailing slash if present.
export function getLastPathSegment(p?: string) {
	if (!p) return ''
	const trimmed = p.endsWith('/') ? p.slice(0, -1) : p
	const idx = trimmed.lastIndexOf('/')
	return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

// Return a path relative to a given root, always starting with '/'.
// If path does not start with root, the original path is returned.
export function getRelativePathFromRoot(path: string, root: string): string {
	if (!path || !root) return path
	if (path.startsWith(root)) {
		let p = path.slice(root.length) || '/'
		if (!p.startsWith('/')) p = '/' + p
		return p
	}
	return path
}

// Extract the device/host name from a repository path, e.g.
//  - /Network/<host>/... -> <host>
//  - /External/<device>/... -> <device>
// Returns empty string if not applicable.
export function getRepositoryDisplayName(path: string): string {
	const segments = path.split('/').filter(Boolean)
	// 368.8-21: the safety repo is the one repository on a real system path. It
	// returned '' here, which the restore wizard rendered as "Unknown".
	if (isSafetyRepoPath(path)) return t('backups-safety-repo-name')
	if (isDeviceRooted(path)) {
		return segments[1] || ''
	}
	return ''
}

// Returns the path within the device (excluding the device name) and without the backup file name.
// Example:
//  - /Network/host/data/Livinity Backup.backup -> /
//  - /Network/host/data/My Backups/Livinity Backup.backup -> /data/My Backups
//  - /External/USB-DISK/Livinity Backup.backup -> /
export function getRepositoryRelativePath(path: string): string {
	// 368.8-21: the safety repo IS its own location — showing the operator
	// "/opt/livos/backups-local" beside every other row's "/" was noise, and a
	// host path at that.
	if (isSafetyRepoPath(path)) return '/'
	const segments = path.split('/').filter(Boolean)

	// Skip root and device segments when present
	let startIndex = 0
	if (isDeviceRooted(path)) {
		startIndex = 2 // skip the root segment and the device name
	} else if (path.startsWith(POOL_ROOT)) {
		startIndex = 1 // the pool IS the device; everything after /Pool is a real path
	}

	// Cut off the backup file if present at the end
	const backupIdx = segments.findIndex((s) => s === BACKUP_FILE_NAME)
	const endIndexExclusive = backupIdx !== -1 ? backupIdx : segments.length

	let inner = segments.slice(startIndex, endIndexExclusive).join('/')
	if (!inner) return '/'
	if (!inner.startsWith('/')) inner = '/' + inner
	return inner
}

// Extracts the repository path (parent directory) from a backup file path.
// e.g., /Network/host/data/Livinity Backup.backup -> /Network/host/data
export function getRepositoryPathFromBackupFile(backupFilePath: string): string {
	const path = backupFilePath.trim()
	return path.endsWith(BACKUP_FILE_NAME) ? path.slice(0, -BACKUP_FILE_NAME.length).replace(/\/$/, '') || '/' : path
}
