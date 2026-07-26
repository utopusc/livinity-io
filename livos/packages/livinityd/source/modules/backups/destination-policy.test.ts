/**
 * Phase 368.6 BKPANYDEST (D1/D2) — destination policy.
 *
 * Widening backup destinations is the kind of change where a single sloppy
 * `startsWith` costs an operator their data, so every refusal in the locked
 * decision list gets an explicit negative test here, and the two structural
 * bounds (restore-wipe containment, mount proof) get their own.
 *
 * Pure + fakes, the safety-snapshots.test.ts idiom: no filesystem, no mocks.
 */
import {describe, expect, test} from 'vitest'

import {
	classifyDestination,
	probeDestination,
	isAtOrUnder,
	isValidInternalFolderName,
	isRealDestination,
	repositoryIgnorePatterns,
	resolveOffSystemDisk,
	normalizePath,
	INTERNAL_BACKUP_ROOT,
	INTERNAL_VIRTUAL_ROOT,
	MIN_FREE_PERCENT,
	type DestinationProbeDeps,
	type OffSystemDiskDeps,
	type ProbeInput,
} from './destination-policy.js'
import {SAFETY_REPO_PATH} from './safety-snapshots.js'

const REPO_DIR = 'Livinity Backup.backup'
const DATA_DIR = '/opt/livos/data'
const POOL = '/mnt/pool'

const classifyOptions = {poolRegistered: true, poolMountpoint: POOL, repositoryDirectoryName: REPO_DIR}

/** A destination path as addRepository sees it — repo dir already appended. */
const withRepoDir = (base: string) => `${base}/${REPO_DIR}`

// ── stage 1 — classification ────────────────────────────────────────────────

describe('classifyDestination — accepted kinds', () => {
	test('external and network keep resolving through files.ts (no systemPath here)', () => {
		expect(classifyDestination(withRepoDir('/External/MyDrive'), classifyOptions)).toEqual({ok: true, kind: 'external'})
		expect(classifyDestination(withRepoDir('/Network/nas'), classifyOptions)).toEqual({ok: true, kind: 'network'})
	})

	test('a pool folder resolves onto the union mountpoint', () => {
		expect(classifyDestination(withRepoDir('/Pool/backups'), classifyOptions)).toEqual({
			ok: true,
			kind: 'pool',
			systemPath: `${POOL}/backups/${REPO_DIR}`,
		})
	})

	test('an internal destination lands under the root we own, outside $LIVOS_DIR', () => {
		const decision = classifyDestination(withRepoDir(`${INTERNAL_VIRTUAL_ROOT}/Nightly`), classifyOptions)
		expect(decision).toEqual({ok: true, kind: 'internal', systemPath: `${INTERNAL_BACKUP_ROOT}/Nightly/${REPO_DIR}`})
		// The point of /opt/livos-backups: update.sh chown -R's /opt/livos every update.
		expect((decision as {systemPath: string}).systemPath.startsWith('/opt/livos/')).toBe(false)
	})

	test('the pool is not offered on a box without one', () => {
		const decision = classifyDestination(withRepoDir('/Pool/backups'), {...classifyOptions, poolRegistered: false})
		expect(decision).toMatchObject({ok: false, code: 'unsupported-root'})
	})
})

describe('classifyDestination — D2 refusals', () => {
	// Everything inside dataDirectory: a restore MOVES over that tree, so a repo
	// there is destroyed by the very restore it was serving.
	test.each(['/Home', '/Apps', '/Trash', '/Backups', '/Cloud', '/Shared'])('refuses %s', (root) => {
		expect(classifyDestination(withRepoDir(`${root}/anything`), classifyOptions)).toMatchObject({
			ok: false,
			code: 'unsupported-root',
		})
	})

	test('refuses the filesystem root — and by EXACT equality, so /External survives', () => {
		expect(classifyDestination('/', classifyOptions)).toMatchObject({ok: false, code: 'unsupported-root'})
		// The regression this guards: a `startsWith('/')`-shaped containment check
		// would reject every absolute path on the box.
		expect(classifyDestination(withRepoDir('/External/MyDrive'), classifyOptions)).toMatchObject({ok: true})
	})

	test.each([
		['/HomeX/backup', 'a sibling of /Home is not /Home'],
		['/Home/../Apps/x', 'normalisation cannot be used to sneak into /Apps'],
		['/home/backups', 'the lowercase host path is not a virtual root'],
	])('refuses %s (%s)', (path) => {
		expect(classifyDestination(withRepoDir(path), classifyOptions)).toMatchObject({ok: false})
	})

	test('doubled slashes normalise before matching, so //Home//x is still /Home/x', () => {
		expect(classifyDestination(`//Home//x/${REPO_DIR}`, classifyOptions)).toMatchObject({
			ok: false,
			code: 'unsupported-root',
		})
	})

	test.each(['/mnt/disk1', '/mnt/disk12', '/mnt/parity1', '/kopia', '/srv/backups', '/mnt/mydisk'])(
		'refuses the free-text host path %s',
		(path) => {
			expect(classifyDestination(withRepoDir(path), classifyOptions)).toMatchObject({ok: false, code: 'unsupported-root'})
		},
	)

	test('refuses an internal folder name that could climb out of the root', () => {
		for (const name of ['..', '.', '../../etc', 'a/b', '.hidden', '-rf', '']) {
			expect(classifyDestination(withRepoDir(`${INTERNAL_VIRTUAL_ROOT}/${name}`), classifyOptions)).toMatchObject({
				ok: false,
			})
		}
	})

	test('accepts ordinary folder names including non-ASCII', () => {
		for (const name of ['Nightly', 'my backups', 'Yedekler', 'Ünite_2', 'a-b_c']) {
			expect(isValidInternalFolderName(name)).toBe(true)
		}
	})
})

describe('isAtOrUnder — segment matching, not string prefixes', () => {
	test('a longer sibling segment is not a child', () => {
		expect(isAtOrUnder('/HomeX', '/Home')).toBe(false)
		expect(isAtOrUnder('/Home', '/Home')).toBe(true)
		expect(isAtOrUnder('/Home/a/b', '/Home')).toBe(true)
		expect(isAtOrUnder('/Hom', '/Home')).toBe(false)
	})

	test('normalisation is applied to both sides', () => {
		expect(isAtOrUnder('//Home//a', '/Home')).toBe(true)
		expect(isAtOrUnder('/Home/../Apps', '/Home')).toBe(false)
	})

	test('everything is under the root', () => {
		expect(isAtOrUnder('/External/x', '/')).toBe(true)
	})
})

test('normalizePath strips trailing slashes but keeps the root', () => {
	expect(normalizePath('/Pool/backups/')).toBe('/Pool/backups')
	expect(normalizePath('//')).toBe('/')
})

// ── stage 2 — the probe gauntlet ────────────────────────────────────────────

function makeDeps(overrides: Partial<DestinationProbeDeps> = {}): DestinationProbeDeps {
	return {
		realpath: async (path) => path,
		mountpointFor: async (path) => path, // by default: the path IS a mountpoint
		fstypeOf: async () => 'ext4',
		canWrite: async () => true,
		freePercent: async () => 50,
		existingRepositoryPaths: async () => [],
		...overrides,
	}
}

const externalInput: ProbeInput = {
	kind: 'external',
	systemPath: `${DATA_DIR}/external/MyDrive/${REPO_DIR}`,
	dataDirectory: DATA_DIR,
}

const internalInput: ProbeInput = {
	kind: 'internal',
	systemPath: `${INTERNAL_BACKUP_ROOT}/Nightly/${REPO_DIR}`,
	dataDirectory: DATA_DIR,
}

const poolInput: ProbeInput = {
	kind: 'pool',
	systemPath: `${POOL}/backups/${REPO_DIR}`,
	dataDirectory: DATA_DIR,
	poolMountpoint: POOL,
}

describe('probeDestination — the shipped /External hole', () => {
	test('refuses an External path when nothing is actually mounted there', async () => {
		// This is the bug in production today: with no USB plugged in,
		// /External/<name> is a plain directory inside dataDirectory. A repo created
		// there sits on the OS disk, inside the snapshot source, counts as a genuine
		// destination (silencing the nag), and is deleted by the restore it serves.
		const deps = makeDeps({mountpointFor: async () => '/'})
		await expect(probeDestination(externalInput, deps)).resolves.toMatchObject({
			ok: false,
			code: 'destination-not-mounted',
		})
	})

	test('accepts it once the drive is really mounted there', async () => {
		const deps = makeDeps({mountpointFor: async (path) => path})
		await expect(probeDestination(externalInput, deps)).resolves.toMatchObject({ok: true, kind: 'external'})
	})

	test('a pool folder is proven by the pool mount above it, not by being one itself', async () => {
		await expect(probeDestination(poolInput, makeDeps({mountpointFor: async () => POOL}))).resolves.toMatchObject({
			ok: true,
			kind: 'pool',
		})
		// mergerfs not mounted → findmnt --target answers `/`
		await expect(probeDestination(poolInput, makeDeps({mountpointFor: async () => '/'}))).resolves.toMatchObject({
			ok: false,
			code: 'destination-not-mounted',
		})
	})

	test('an internal destination needs no mount proof — it is knowingly the system disk', async () => {
		const deps = makeDeps({mountpointFor: async () => '/'})
		await expect(probeDestination(internalInput, deps)).resolves.toMatchObject({ok: true, kind: 'internal'})
	})
})

describe('probeDestination — the restore-wipe bound', () => {
	test('refuses a non-mount-backed destination inside dataDirectory', async () => {
		const input: ProbeInput = {kind: 'internal', systemPath: `${DATA_DIR}/home/backup/${REPO_DIR}`, dataDirectory: DATA_DIR}
		await expect(probeDestination(input, makeDeps())).resolves.toMatchObject({
			ok: false,
			code: 'inside-data-directory',
		})
	})

	test('refuses a destination that CONTAINS dataDirectory', async () => {
		// Backing up into a parent of the data would make the repository snapshot
		// itself. Contrived placement, but the predicate must hold in both directions.
		const repositoryPath = `${INTERNAL_BACKUP_ROOT}/Nightly/${REPO_DIR}`
		const input: ProbeInput = {
			kind: 'internal',
			systemPath: repositoryPath,
			dataDirectory: `${repositoryPath}/inner-data`,
		}
		await expect(probeDestination(input, makeDeps())).resolves.toMatchObject({
			ok: false,
			code: 'inside-data-directory',
		})
	})

	test('catches a symlink that resolves into dataDirectory', async () => {
		// The check runs on the RESOLVED path precisely so this cannot be smuggled in.
		const deps = makeDeps({realpath: async () => `${DATA_DIR}/home/sneaky`})
		const input: ProbeInput = {kind: 'internal', systemPath: `${INTERNAL_BACKUP_ROOT}/x/${REPO_DIR}`, dataDirectory: DATA_DIR}
		await expect(probeDestination(input, deps)).resolves.toMatchObject({ok: false, code: 'inside-data-directory'})
	})

	test('refuses when the parent cannot be resolved at all (fail closed)', async () => {
		const deps = makeDeps({realpath: async () => null})
		await expect(probeDestination(internalInput, deps)).resolves.toMatchObject({ok: false, code: 'unresolvable-path'})
	})
})

describe('probeDestination — resolved-path denylist', () => {
	test.each(['/proc', '/sys', '/dev', '/run', '/boot', '/etc', '/var/lib/docker', '/snap', '/kopia', '/mnt/parity1'])(
		'refuses a repository resolving into %s',
		async (prefix) => {
			const deps = makeDeps({realpath: async () => `${prefix}/sub`})
			const input: ProbeInput = {kind: 'internal', systemPath: `${prefix}/sub/${REPO_DIR}`, dataDirectory: DATA_DIR}
			await expect(probeDestination(input, deps)).resolves.toMatchObject({ok: false, code: 'unsupported-root'})
		},
	)

	test('refuses anything under /opt/livos — update.sh re-chowns it every update', async () => {
		const deps = makeDeps({realpath: async () => '/opt/livos/somewhere'})
		const input: ProbeInput = {kind: 'internal', systemPath: `/opt/livos/somewhere/${REPO_DIR}`, dataDirectory: DATA_DIR}
		await expect(probeDestination(input, deps)).resolves.toMatchObject({ok: false, code: 'unsupported-root'})
	})

	test('refuses the 368.5 safety repo path', async () => {
		const deps = makeDeps({realpath: async () => SAFETY_REPO_PATH})
		const input: ProbeInput = {kind: 'internal', systemPath: `${SAFETY_REPO_PATH}/${REPO_DIR}`, dataDirectory: DATA_DIR}
		await expect(probeDestination(input, deps)).resolves.toMatchObject({ok: false})
	})

	test('but /opt/livos-backups is a SIBLING of /opt/livos, not a child', async () => {
		await expect(probeDestination(internalInput, makeDeps())).resolves.toMatchObject({ok: true})
	})

	test('refuses a raw pool branch even if it resolves', async () => {
		const deps = makeDeps({realpath: async () => '/mnt/disk3'})
		const input: ProbeInput = {kind: 'pool', systemPath: `/mnt/disk3/${REPO_DIR}`, dataDirectory: DATA_DIR, poolMountpoint: POOL}
		await expect(probeDestination(input, deps)).resolves.toMatchObject({ok: false, code: 'unsupported-root'})
	})
})

describe('probeDestination — usability proofs', () => {
	test.each(['tmpfs', 'devtmpfs', 'ramfs', 'overlay', 'squashfs'])('refuses %s', async (fstype) => {
		await expect(probeDestination(internalInput, makeDeps({fstypeOf: async () => fstype}))).resolves.toMatchObject({
			ok: false,
			code: 'unsupported-filesystem',
		})
	})

	test('an unreadable fstype is not fatal on its own', async () => {
		await expect(probeDestination(internalInput, makeDeps({fstypeOf: async () => null}))).resolves.toMatchObject({ok: true})
	})

	test('refuses when the folder cannot be written to', async () => {
		await expect(probeDestination(internalInput, makeDeps({canWrite: async () => false}))).resolves.toMatchObject({
			ok: false,
			code: 'permission-denied',
		})
	})

	test(`refuses below the ${MIN_FREE_PERCENT}% floor, and refuses a degenerate reading rather than rounding it down`, async () => {
		await expect(probeDestination(internalInput, makeDeps({freePercent: async () => 3}))).resolves.toMatchObject({
			ok: false,
			code: 'destination-too-full',
		})
		await expect(probeDestination(internalInput, makeDeps({freePercent: async () => null}))).resolves.toMatchObject({
			ok: false,
			code: 'destination-too-full',
		})
		await expect(probeDestination(internalInput, makeDeps({freePercent: async () => Number.NaN}))).resolves.toMatchObject({
			ok: false,
			code: 'destination-too-full',
		})
		await expect(
			probeDestination(internalInput, makeDeps({freePercent: async () => MIN_FREE_PERCENT})),
		).resolves.toMatchObject({ok: true})
	})

	test('refuses nesting with an existing repository in EITHER direction', async () => {
		const inside = makeDeps({existingRepositoryPaths: async () => [INTERNAL_BACKUP_ROOT]})
		await expect(probeDestination(internalInput, inside)).resolves.toMatchObject({ok: false, code: 'nested-repository'})

		const contains = makeDeps({
			existingRepositoryPaths: async () => [`${INTERNAL_BACKUP_ROOT}/Nightly/${REPO_DIR}/deeper`],
		})
		await expect(probeDestination(internalInput, contains)).resolves.toMatchObject({ok: false, code: 'nested-repository'})

		const unrelated = makeDeps({existingRepositoryPaths: async () => [`${INTERNAL_BACKUP_ROOT}/Other/${REPO_DIR}`]})
		await expect(probeDestination(internalInput, unrelated)).resolves.toMatchObject({ok: true})
	})
})

describe('repositoryIgnorePatterns — D6 belts', () => {
	// Mirrors backups.ts: absolute paths under dataDirectory become relative to it,
	// then everything gets a leading slash (kopia treats `/` as the SNAPSHOT root).
	const toBackupRootPath = (path: string) => {
		let next = path
		if (next.startsWith(DATA_DIR)) next = next.slice(DATA_DIR.length).replace(/^\//, '')
		if (!next.startsWith('/')) next = `/${next}`
		return next
	}
	const options = {toBackupRootPath, repositoryDirectoryName: REPO_DIR}

	test('the name pattern is depth-agnostic — NO leading slash', () => {
		const patterns = repositoryIgnorePatterns([], options)
		// An anchored `/Livinity Backup.backup/` would only match a repository at the
		// very top of the snapshot, which is the case we least need to catch.
		expect(patterns).toContain(`${REPO_DIR}/`)
		expect(patterns.some((pattern) => pattern.startsWith('/Livinity'))).toBe(false)
	})

	test('a legacy repository inside dataDirectory is anchored relative to the snapshot root', () => {
		const patterns = repositoryIgnorePatterns(
			[{id: 'a', path: '/External/Drive', systemPath: `${DATA_DIR}/external/Drive/${REPO_DIR}`}],
			options,
		)
		expect(patterns).toContain(`/external/Drive/${REPO_DIR}`)
	})

	test('gitignore metacharacters in a folder name are escaped', () => {
		// `My [stuff]` is a character class that matches nothing unless escaped.
		const patterns = repositoryIgnorePatterns(
			[{id: 'a', path: '/ThisDevice/x', kind: 'internal', systemPath: `${INTERNAL_BACKUP_ROOT}/My [stuff]/${REPO_DIR}`}],
			options,
		)
		expect(patterns.some((pattern) => pattern.includes('My \\[stuff\\]'))).toBe(true)
	})

	test('the safety repository falls back to its fixed path', () => {
		const patterns = repositoryIgnorePatterns([{id: 'local-safety', path: SAFETY_REPO_PATH, isSafety: true}], options)
		expect(patterns).toContain(SAFETY_REPO_PATH)
	})

	test('THROWS when a pool/internal repository has no resolvable path', () => {
		// Aborting the backup is the right trade — a run that might recurse into its
		// own repository is worse than no run at all.
		expect(() => repositoryIgnorePatterns([{id: 'a', path: '/Pool/x', kind: 'pool'}], options)).toThrow(
			/no resolvable system path/,
		)
		expect(() => repositoryIgnorePatterns([{id: 'b', path: '/ThisDevice/x', kind: 'internal'}], options)).toThrow()
	})

	test('a legacy row with no kind and no systemPath is skipped, not fatal', () => {
		// Rows written before this phase have neither field; they must not break a
		// box that is backing up happily today.
		expect(() => repositoryIgnorePatterns([{id: 'legacy', path: '/External/Drive'}], options)).not.toThrow()
	})
})

describe('resolveOffSystemDisk — the honesty gate', () => {
	const deps = (overrides: Partial<OffSystemDiskDeps> = {}): OffSystemDiskDeps => ({
		disksForPath: async () => ['sdb'],
		osDisks: async () => new Set(['sda']),
		poolMemberDisks: async () => ['sdb', 'sdc'],
		...overrides,
	})

	test('a USB drive on its own disk is off the system disk', async () => {
		await expect(resolveOffSystemDisk({kind: 'external', systemPath: '/x'}, deps())).resolves.toBe(true)
	})

	test('a network share is always off the system disk', async () => {
		// No local disk ancestor exists to resolve, so this must not fall through to
		// the fail-closed branch.
		const noDisks = deps({disksForPath: async () => [], osDisks: async () => new Set<string>()})
		await expect(resolveOffSystemDisk({kind: 'network', systemPath: '//nas/share'}, noDisks)).resolves.toBe(true)
	})

	test('an internal destination is never off the system disk, however it resolves', async () => {
		const lying = deps({disksForPath: async () => ['sdb']})
		await expect(resolveOffSystemDisk({kind: 'internal', systemPath: '/opt/livos-backups/x'}, lying)).resolves.toBe(false)
	})

	test('the pool is judged by its MEMBER disks, not by findmnt on the FUSE mount', async () => {
		// The st_dev / findmnt trap: /mnt/pool is mergerfs, so asking the path
		// directly would report a distinct device even for an all-on-OS-disk pool.
		const poolOnOsDisk = deps({poolMemberDisks: async () => ['sda'], disksForPath: async () => ['fuse-would-lie']})
		await expect(resolveOffSystemDisk({kind: 'pool', systemPath: '/mnt/pool/backups'}, poolOnOsDisk)).resolves.toBe(false)
	})

	test('a pool with ANY branch on the OS disk does not count — mergerfs can place a file there', async () => {
		const mixed = deps({poolMemberDisks: async () => ['sdb', 'sda']})
		await expect(resolveOffSystemDisk({kind: 'pool', systemPath: '/mnt/pool/backups'}, mixed)).resolves.toBe(false)
	})

	test('fails CLOSED when the OS disk cannot be proven', async () => {
		const unprovable = deps({osDisks: async () => new Set<string>()})
		await expect(resolveOffSystemDisk({kind: 'external', systemPath: '/x'}, unprovable)).resolves.toBe(false)
	})

	test('fails CLOSED when the destination resolves to no disk at all', async () => {
		await expect(
			resolveOffSystemDisk({kind: 'external', systemPath: '/x'}, deps({disksForPath: async () => []})),
		).resolves.toBe(false)
	})

	test('fails CLOSED when a resolver throws', async () => {
		const throwing = deps({
			disksForPath: async () => {
				throw new Error('lsblk exploded')
			},
		})
		await expect(resolveOffSystemDisk({kind: 'external', systemPath: '/x'}, throwing)).resolves.toBe(false)
	})
})

describe('isRealDestination — what may show GREEN', () => {
	test('only a non-safety repository proven to be off the system disk', () => {
		expect(isRealDestination({offSystemDisk: true})).toBe(true)
		expect(isRealDestination({offSystemDisk: false})).toBe(false)
		expect(isRealDestination({isSafety: true, offSystemDisk: true})).toBe(false)
	})

	test('unproven is NOT the same as proven-good — undefined never earns GREEN', () => {
		expect(isRealDestination({})).toBe(false)
	})
})
