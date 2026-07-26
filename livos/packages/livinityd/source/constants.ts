// Marker file indicating first start after a backup restore
export const BACKUP_RESTORE_FIRST_START_FLAG = '.is-backups-restore-first-start'

// The mergerfs union mountpoint for the storage pool. It lives in this leaf
// module rather than in files.ts because Phase 368.6 needs it in the backups
// destination policy, and importing files.ts there would drag the whole Files
// subsystem — including the native `drivelist` binding — into the backups module
// graph. Both sides must read the SAME constant; a second copy would drift.
export const POOL_MOUNTPOINT = '/mnt/pool'
