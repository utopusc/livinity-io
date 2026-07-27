// @vitest-environment jsdom
//
// jsdom because these helpers, though pure themselves, sit downstream of modules
// that touch `localStorage` and `location` at import time. Same directive every
// other test in this package uses.

import {describe, expect, test, vi} from 'vitest'

// The helpers call t() for display names; the real i18n instance is not needed
// to assert routing behaviour, so return the key.
vi.mock('@/utils/i18n', () => ({t: (key: string) => key}))

const {getDeviceType, isRepoConnected, isSafetyRepoPath, getDeviceNameFromPath, SAFETY_REPO_PATH} = await import(
	'./backup-location-helpers.js'
)
const {getRepositoryDisplayName, getRepositoryRelativePath} = await import('./filepath-helpers.js')

// ─────────────────────────────────────────────────────────────────────────────
// Phase 368.8-21 — the safety repo could not be restored from.
//
// Reported from the field. In the restore wizard the safety repo rendered as
// "Unknown · /opt/livos/backups-local", greyed out and non-interactive, while
// every other destination was selectable.
//
// CAUSE: it is the ONE repository whose path is a real system path rather than a
// virtual root, so it fell through every prefix check. getDeviceType returned
// 'DRIVE', isRepoConnected then looked for a mountpoint under /External/livos,
// found none, and answered DISCONNECTED. Four call sites gate on that answer.
//
// On a box with no USB drive and no NAS, the safety repo is the only thing that
// is actually working — so this made the one usable backup unrestorable.
// ─────────────────────────────────────────────────────────────────────────────

const noShares = () => false
const noDisks: Array<{partitions?: Array<{mountpoints?: string[]}>}> = []

describe('the safety repo is a first-class destination', () => {
	test('its path is recognised, including snapshots addressed inside it', () => {
		expect(SAFETY_REPO_PATH).toBe('/opt/livos/backups-local')
		expect(isSafetyRepoPath(SAFETY_REPO_PATH)).toBe(true)
		expect(isSafetyRepoPath(`${SAFETY_REPO_PATH}/kopia.repository.f`)).toBe(true)
		// Must not swallow a merely similar path.
		expect(isSafetyRepoPath('/opt/livos/backups-internal')).toBe(false)
		expect(isSafetyRepoPath('/ThisDevice/Deneme')).toBe(false)
	})

	test('it is a DEVICE, not an external drive', () => {
		expect(getDeviceType(SAFETY_REPO_PATH)).toBe('DEVICE')
	})

	test('REGRESSION: it reports CONNECTED, so the restore wizard lets it be selected', () => {
		// This is the assertion the defect would have failed: false here is what
		// greyed the row out and made it non-interactive.
		expect(isRepoConnected(SAFETY_REPO_PATH, noShares, noDisks)).toBe(true)
	})

	test('it has a name instead of "Unknown"', () => {
		expect(getRepositoryDisplayName(SAFETY_REPO_PATH)).toBe('backups-safety-repo-name')
		expect(getDeviceNameFromPath(SAFETY_REPO_PATH)).toBe('backups-safety-repo-name')
	})

	test('its row shows "/" like every other destination, not a host path', () => {
		expect(getRepositoryRelativePath(SAFETY_REPO_PATH)).toBe('/')
	})
})

describe('the other destinations are unchanged', () => {
	test('a "This device" folder still resolves to its folder name', () => {
		expect(getDeviceType('/ThisDevice/Deneme')).toBe('DEVICE')
		expect(getRepositoryDisplayName('/ThisDevice/Deneme/Livinity Backup.backup')).toBe('Deneme')
		expect(getRepositoryRelativePath('/ThisDevice/Deneme/Livinity Backup.backup')).toBe('/')
		expect(isRepoConnected('/ThisDevice/Deneme', noShares, noDisks)).toBe(true)
	})

	test('an external drive is still gated on an actual mountpoint', () => {
		expect(getDeviceType('/External/USB-DISK')).toBe('DRIVE')
		expect(isRepoConnected('/External/USB-DISK', noShares, noDisks)).toBe(false)
		expect(
			isRepoConnected('/External/USB-DISK', noShares, [{partitions: [{mountpoints: ['/External/USB-DISK']}]}]),
		).toBe(true)
	})

	test('a NAS is still gated on a mounted share', () => {
		expect(getDeviceType('/Network/nas.local/data')).toBe('NAS')
		expect(isRepoConnected('/Network/nas.local/data', noShares, noDisks)).toBe(false)
		expect(isRepoConnected('/Network/nas.local/data', (root) => root === '/Network/nas.local', noDisks)).toBe(true)
	})

	test('the pool is still a device', () => {
		expect(getDeviceType('/Pool/Backups')).toBe('POOL')
		expect(isRepoConnected('/Pool/Backups', noShares, noDisks)).toBe(true)
	})
})
