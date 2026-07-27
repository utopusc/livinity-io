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

/**
 * Phase 368.8-21 — the safety repo is the ONE repository whose path is a real
 * system path, not a virtual root: `SAFETY_REPO_PATH` in
 * livinityd/modules/backups/safety-snapshots.ts. Keep the two in step.
 *
 * Every helper below matches on virtual roots, so this path fell through every
 * branch and was treated as an external drive: `getDeviceType` returned 'DRIVE',
 * `isRepoConnected` then looked for a mountpoint under `/External/livos`, found
 * none, and reported it DISCONNECTED. Four call sites gate on that answer, so in
 * the restore wizard the safety repo rendered as "Unknown", greyed out and
 * non-interactive — i.e. **the one repository that was actually working on a box
 * with no USB drive could not be restored from.** Same shape as the 368.6 bug
 * where an unrecognised root made an internal destination non-restorable.
 */
export const SAFETY_REPO_PATH = '/opt/livos/backups-local'

export function isSafetyRepoPath(path: string): boolean {
	return path === SAFETY_REPO_PATH || path.startsWith(`${SAFETY_REPO_PATH}/`)
}

export function getDeviceType(path: string): DeviceKind {
	// The safety repo lives on this box's own disk — it is a DEVICE, and it is
	// the reason DEVICE must be decided before the external-drive fallback.
	if (isSafetyRepoPath(path)) return 'DEVICE'
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
	// 368.8-21: without this the safety repo fell through to `parts[0]` and showed
	// as "opt" — or, via getRepositoryDisplayName, as "Unknown".
	if (isSafetyRepoPath(path)) return t('backups-safety-repo-name')
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
