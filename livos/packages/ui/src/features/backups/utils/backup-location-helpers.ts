import {EXTERNAL_STORAGE_PATH, NETWORK_STORAGE_PATH} from '@/features/files/constants'
import {t} from '@/utils/i18n'

/**
 * Phase 368.6: destinations are no longer only NAS-or-drive. `POOL` is the
 * storage pool; `DEVICE` is a folder on this box's own system disk.
 */
export type DeviceKind = 'NAS' | 'DRIVE' | 'POOL' | 'DEVICE'

/** Virtual roots for the two destination kinds added in 368.6. */
export const POOL_ROOT = '/Pool'
export const THIS_DEVICE_ROOT = '/ThisDevice'

export function getDeviceType(path: string): DeviceKind {
	if (path.startsWith(NETWORK_STORAGE_PATH)) return 'NAS'
	if (path.startsWith(`${THIS_DEVICE_ROOT}/`) || path === THIS_DEVICE_ROOT) return 'DEVICE'
	if (path.startsWith(`${POOL_ROOT}/`) || path === POOL_ROOT) return 'POOL'
	return 'DRIVE'
}

/**
 * Extracts a human-readable device name from a backup repository path.
 * Examples:
 * - "/Network/nas.local/Backups" -> "nas.local"
 * - "/External/MyDrive/Backups" -> "MyDrive"
 * - "/ThisDevice/Nightly/Backups" -> "Nightly"
 * - "/Unknown/path" -> fallback to translated backup location
 */
export function getDeviceNameFromPath(path: string): string {
	const parts = path.split('/').filter(Boolean)
	if (path.startsWith('/Network/')) return parts[1] || t('nas')
	if (path.startsWith('/External/')) return parts[1] || t('external-drive')
	// 368.6: the folder the operator named IS the device name here — there is no
	// drive or host to fall back to.
	if (path.startsWith(`${THIS_DEVICE_ROOT}/`)) return parts[1] || t('backups.internal-system-disk')
	if (path.startsWith(`${POOL_ROOT}/`) || path === POOL_ROOT) return t('backups.internal-pool')
	return parts[0] || t('backups.backup-location')
}

/**
 * Determines whether a repository path is currently connected/available.
 * - NAS: uses doesHostHaveMountedShares('/Network/<host>')
 * - External: presence of any mountpoint under /External/<device>
 * - Pool / this device (368.6): local, so always reachable from the UI's point of
 *   view. Without this branch they fell through to the external-drive check,
 *   which looks for a mountpoint under /External/<second-segment> and never finds
 *   one — leaving an internal repository permanently "disconnected" and therefore
 *   NON-RESTORABLE and NON-REWINDABLE, since four call sites gate on this.
 *   If the pool really is unmounted the backend refuses with a typed error at use
 *   time; being optimistic here only means the query runs and reports it.
 */
export function isRepoConnected(
	path: string,
	doesHostHaveMountedShares: (rootPath: string) => boolean,
	disks: Array<{partitions?: Array<{mountpoints?: string[]}>}> | undefined,
): boolean {
	if (path.startsWith(NETWORK_STORAGE_PATH)) {
		const host = path.split('/')[2]
		return !!host && doesHostHaveMountedShares(`${NETWORK_STORAGE_PATH}/${host}`)
	}

	const kind = getDeviceType(path)
	if (kind === 'DEVICE' || kind === 'POOL') return true

	// Otherwise treat as external drive
	const device = path.split('/')[2]
	if (!device) return false
	const prefix = `${EXTERNAL_STORAGE_PATH}/${device}`
	return (disks || []).some((disk) =>
		(disk.partitions || []).some((part) =>
			(part.mountpoints || []).some((m) => typeof m === 'string' && m.startsWith(prefix)),
		),
	)
}
