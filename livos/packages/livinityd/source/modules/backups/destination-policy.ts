import nodePath from 'node:path'

/**
 * Phase 368.6 BKPANYDEST (D1/D2) — which places on this box may hold a backup
 * repository.
 *
 * Until now the answer was hardcoded in addRepository(): a path had to resolve
 * under /External or /Network, or it was refused. That kept the box safe but it
 * also meant an operator with no USB drive and no NAS had nowhere to back up to.
 * This module widens the set to the storage pool and a named folder on the
 * system disk, WITHOUT widening it to "anywhere", and states every refusal as a
 * typed reason so a field diagnosis needs no second round-trip.
 *
 * Two bounds are non-negotiable, both independently verified:
 *
 *   1. A repository may never live inside — or be an ancestor of —
 *      `dataDirectory`. dataDirectory is not merely the snapshot SOURCE: a
 *      restore MOVES the imported tree over it with `{overwrite: true}`
 *      (startup-migrations/index.ts). A repo under /Home, /Apps or /Trash is
 *      therefore destroyed by the very restore it was serving. This is a
 *      predicate, never a warning.
 *
 *   2. livinityd runs as the unprivileged desktop user with no mount/chown sudo
 *      grant, so root-owned targets (/mnt/*, /srv) are EPERM. Free-text host
 *      paths need a privileged wrapper and are deliberately a later phase.
 *
 * The module is pure in the safety-snapshots.ts idiom: no fs, no process, all
 * I/O injected, unit-testable with plain fakes. Everything here operates on the
 * POST-JOIN path — addRepository has already appended the repository directory
 * name — and matches on path SEGMENTS. Never `startsWith` on the raw string:
 * `/HomeX` starts with `/Home` and `/Home/../Apps/x` does not, and both answers
 * would be wrong.
 */

export type DestinationKind = 'external' | 'network' | 'pool' | 'internal'

/**
 * Internal repositories live under $LIVOS_DIR, beside the 368.5 safety repo.
 *
 * ⚠ 368.8 REVERSED 368.6's sibling location (/opt/livos-backups) — do not "restore" it.
 * That path sits directly under root-owned /opt, so ONLY the installer could create
 * it. And an installer cannot reach an existing box in the same update: update.sh
 * replaces itself with an atomic mv (update.sh:1884-1904, "Next invocation will read
 * the new version") and never re-execs the fresh clone, a hazard named in-tree at
 * update.sh:4429-4435. A root only root can create was therefore undeliverable
 * without shipping a second, no-op release. Under $LIVOS_DIR livinityd creates the
 * root itself (see Backups#ensureInternalBackupRoot), exactly as it already creates
 * SAFETY_REPO_PATH, and the fix lands on the FIRST update.
 *
 * The cost 368.6 was avoiding is real and is handled separately: update.sh runs
 * `chown -R` over /opt/livos twice per update (update.sh:2601, :4568), so 368.8-02
 * prunes both backup roots out of those walks. That pruning is a PERFORMANCE
 * optimisation, not a correctness requirement — see 368.8-02.
 *
 * Name: NOT `/opt/livos/backups` — that is taken by scripts/pre-v42-cutover-backup.sh:75.
 * NOT `/opt/livos/backups-local` — that is the safety repo. `isAtOrUnder` is
 * segment-wise, so `backups-internal` is not "under" either of them.
 */
export const INTERNAL_BACKUP_ROOT = '/opt/livos/backups-internal'

/**
 * Display-only pseudo-root for internal destinations. It is deliberately NOT a
 * files.ts base directory — internal destinations are not browsable, the
 * operator names a folder rather than picking a path. It exists so a repository
 * row keeps a stable identity (the row id is sha256 of this path), so the UI can
 * infer a destination's kind from its path like it does for the other three, and
 * so nothing has to special-case a missing `path`.
 */
export const INTERNAL_VIRTUAL_ROOT = '/ThisDevice'

/** Filesystems that can never hold a durable repository. */
export const REFUSED_FSTYPES = new Set(['tmpfs', 'devtmpfs', 'ramfs', 'overlay', 'squashfs', 'proc', 'sysfs'])

/** Matches SAFETY_MIN_FREE_PERCENT — a destination below this is refused. */
export const MIN_FREE_PERCENT = 15

/**
 * Virtual roots that are inside dataDirectory (bound 1) or otherwise off limits.
 * Refused by SEGMENT match, so /HomeX and /Homework are unaffected.
 */
const REFUSED_VIRTUAL_ROOTS = ['/Home', '/Apps', '/Trash', '/Backups', '/Cloud', '/Shared']

/**
 * Resolved system paths that may never host a repository, matched as segment
 * prefixes. /mnt/disk<N> and /mnt/parity1 are the pool's RAW branches — the
 * union mountpoint /mnt/pool is the only supported pool entry point, because
 * writing straight to a branch bypasses mergerfs' allocation and lands beside
 * the parity set.
 */
const REFUSED_SYSTEM_PREFIXES = [
	'/proc',
	'/sys',
	'/dev',
	'/run',
	'/boot',
	'/etc',
	'/var/lib/docker',
	'/snap',
	'/kopia',
	'/mnt/parity1',
]

/** `/mnt/disk1`, `/mnt/disk12`, … — raw pool branches. */
const RAW_POOL_BRANCH = /^\/mnt\/disk\d+$/

export type DestinationRefusalCode =
	| 'unsupported-root'
	| 'invalid-folder-name'
	| 'unresolvable-path'
	| 'inside-data-directory'
	| 'destination-not-mounted'
	| 'unsupported-filesystem'
	| 'permission-denied'
	| 'destination-too-full'
	| 'nested-repository'

export type DestinationRefusal = {
	ok: false
	code: DestinationRefusalCode
	/** Operator-facing detail. Logged WITH the resolved realpath by the caller. */
	reason: string
}

export type ClassifiedDestination = {
	ok: true
	kind: DestinationKind
	/**
	 * Where the repository will live on disk. For external/network this is left
	 * undefined — those resolve through files.ts' per-user base-directory map,
	 * which the caller owns.
	 */
	systemPath?: string
}

export type DestinationDecision = ClassifiedDestination | DestinationRefusal

const refuse = (code: DestinationRefusalCode, reason: string): DestinationRefusal => ({ok: false, code, reason})

// ── path helpers ────────────────────────────────────────────────────────────

/** posix-normalize and strip any trailing slash, so `//Home//x` → `/Home/x`. */
export function normalizePath(path: string): string {
	const normalized = nodePath.posix.normalize(path.replace(/\/+/g, '/'))
	return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function segmentsOf(path: string): string[] {
	return normalizePath(path).split('/').filter(Boolean)
}

/**
 * True when `child` IS `ancestor` or lives under it, compared SEGMENT-wise.
 * `/HomeX` is not under `/Home`; `/Home/a` is.
 */
export function isAtOrUnder(child: string, ancestor: string): boolean {
	const childSegments = segmentsOf(child)
	const ancestorSegments = segmentsOf(ancestor)
	if (ancestorSegments.length === 0) return true // '/' contains everything
	if (childSegments.length < ancestorSegments.length) return false
	return ancestorSegments.every((segment, index) => childSegments[index] === segment)
}

/**
 * Folder names for internal destinations. The operator types this, and it is
 * appended to a root we control — so it must not be able to climb out of that
 * root, collide with the shell, or produce a hidden/awkward directory.
 */
export function isValidInternalFolderName(name: string): boolean {
	if (typeof name !== 'string') return false
	const trimmed = name.trim()
	if (trimmed.length === 0 || trimmed.length > 64) return false
	if (trimmed === '.' || trimmed === '..') return false
	if (trimmed.startsWith('.') || trimmed.startsWith('-')) return false
	// Letters (incl. accented), digits, space, dash, underscore. No slashes, no
	// separators, nothing that needs quoting.
	return /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(trimmed)
}

export function internalPathForFolderName(name: string): string {
	return `${INTERNAL_BACKUP_ROOT}/${name.trim()}`
}

export function internalVirtualPathForFolderName(name: string): string {
	return `${INTERNAL_VIRTUAL_ROOT}/${name.trim()}`
}

// ── stage 1: classify the virtual path (pure, synchronous) ──────────────────

export type ClassifyOptions = {
	/** /Pool only exists as a destination once a storage pool is registered. */
	poolRegistered: boolean
	/** The mergerfs union mountpoint (/mnt/pool). */
	poolMountpoint: string
	/** Repository directory name already appended by addRepository. */
	repositoryDirectoryName: string
}

/**
 * Decide which kind of destination a virtual path names, or refuse it.
 *
 * Runs BEFORE any I/O so an obviously-wrong path never reaches findmnt/df, and
 * so the refusal list is exhaustively unit-testable without a filesystem.
 */
export function classifyDestination(virtualPath: string, options: ClassifyOptions): DestinationDecision {
	const path = normalizePath(virtualPath)

	// EXACT equality only. A `startsWith('/')`-shaped containment check here would
	// reject every path on the box, /External included.
	if (path === '/') return refuse('unsupported-root', 'The filesystem root is not a backup destination')

	if (!path.startsWith('/')) return refuse('unsupported-root', `Not an absolute path: ${virtualPath}`)

	for (const root of REFUSED_VIRTUAL_ROOTS) {
		if (isAtOrUnder(path, root)) {
			return refuse(
				'unsupported-root',
				`${root} is inside the data that gets replaced by a restore, so a backup there would destroy itself`,
			)
		}
	}

	if (isAtOrUnder(path, INTERNAL_VIRTUAL_ROOT)) {
		const segments = segmentsOf(path)
		// /ThisDevice/<folder>/<repositoryDirectoryName>
		const folderName = segments[1]
		if (!folderName || !isValidInternalFolderName(folderName)) {
			return refuse('invalid-folder-name', `Not a usable folder name: ${folderName ?? '(empty)'}`)
		}
		if (segments.length !== 3 || segments[2] !== options.repositoryDirectoryName) {
			return refuse('unsupported-root', `Unexpected internal destination shape: ${path}`)
		}
		return {ok: true, kind: 'internal', systemPath: `${internalPathForFolderName(folderName)}/${options.repositoryDirectoryName}`}
	}

	if (isAtOrUnder(path, '/Pool')) {
		if (!options.poolRegistered) {
			return refuse('unsupported-root', 'This box has no storage pool')
		}
		const relative = segmentsOf(path).slice(1)
		if (relative.length === 0) return refuse('unsupported-root', 'A pool destination needs a folder inside the pool')
		return {ok: true, kind: 'pool', systemPath: normalizePath(`${options.poolMountpoint}/${relative.join('/')}`)}
	}

	// External/Network keep resolving through files.ts' base-directory map — the
	// caller supplies the resolved path, because that map is per-user.
	if (isAtOrUnder(path, '/External')) return {ok: true, kind: 'external'}
	if (isAtOrUnder(path, '/Network')) return {ok: true, kind: 'network'}

	return refuse('unsupported-root', `Not a supported backup destination: ${path}`)
}

// ── stage 2: prove the resolved path is actually usable (injected I/O) ──────

export type DestinationProbeDeps = {
	/** realpath of the PARENT — the repository directory does not exist yet. Null on failure. */
	realpath: (path: string) => Promise<string | null>
	/**
	 * `findmnt -no TARGET --target <path>` — the mountpoint GOVERNING this path,
	 * not a yes/no. A boolean would be useless here: `--target` resolves for every
	 * existing path and answers `/` when nothing is mounted, so "findmnt
	 * succeeded" is not proof of anything. Returning the mountpoint lets each kind
	 * ask the question it actually needs: external/network want the path to BE a
	 * mountpoint, pool wants it served BY the pool mount. Null when it cannot be read.
	 */
	mountpointFor: (path: string) => Promise<string | null>
	/** Filesystem type at the resolved path, or null when it cannot be read. */
	fstypeOf: (path: string) => Promise<string | null>
	/** ensureDir + write + fsync + stat + unlink on the parent. */
	canWrite: (path: string) => Promise<boolean>
	/** Percentage of the filesystem still free. Null/NaN ⇒ refuse (fail safe). */
	freePercent: (path: string) => Promise<number | null>
	/** Resolved system paths of every repository already registered. */
	existingRepositoryPaths: () => Promise<string[]>
	/**
	 * Phase 368.8 (PROBE-02) — create the per-repository LEAF directory for an
	 * `internal` destination so step 1 has a real path to resolve. The folder name
	 * is per-request operator input, so nothing can pre-create it. The ROOT itself
	 * is owned by Backups#ensureInternalBackupRoot, never by this call. Returns
	 * true when the directory exists after the call.
	 *
	 * OPTIONAL on purpose: a caller that does not inject it keeps the pre-368.8
	 * fail-closed behaviour, so no existing caller silently gains write behaviour.
	 */
	ensureLeafDirectory?: (path: string) => Promise<boolean>
}

export type ProbeInput = {
	kind: DestinationKind
	/** Resolved absolute path the repository will occupy. */
	systemPath: string
	/** Resolved realpath of dataDirectory. */
	dataDirectory: string
	/** The mergerfs union mountpoint — required to prove a `pool` destination. */
	poolMountpoint?: string
}

/**
 * The ordered gauntlet. Order matters: cheap structural refusals first, so a
 * path that can never be legal does not spend a findmnt or a df on the way to
 * being told no.
 */
export async function probeDestination(input: ProbeInput, deps: DestinationProbeDeps): Promise<DestinationDecision> {
	const parent = nodePath.posix.dirname(normalizePath(input.systemPath))

	// 1. Resolve the PARENT. Fail closed: an unresolvable path is refused, never
	//    assumed innocent (preserves addRepository's original `.catch(() => '')`).
	const resolvedParent = await deps.realpath(parent)
	if (!resolvedParent) {
		return refuse('unresolvable-path', `Could not resolve ${parent}`)
	}
	const resolvedPath = normalizePath(`${resolvedParent}/${nodePath.posix.basename(normalizePath(input.systemPath))}`)

	// 2. THE bound: never inside, never an ancestor of, dataDirectory. External
	//    and Network live under dataDirectory by design, but rule 3 proves a real
	//    filesystem is mounted over them, so the restore-wipe cannot reach them.
	const dataDirectory = normalizePath(input.dataDirectory)
	const mountBacked = input.kind === 'external' || input.kind === 'network'
	if (!mountBacked) {
		if (isAtOrUnder(resolvedPath, dataDirectory)) {
			return refuse(
				'inside-data-directory',
				`${resolvedPath} is inside ${dataDirectory}; a restore replaces that directory, which would delete this backup`,
			)
		}
		if (isAtOrUnder(dataDirectory, resolvedPath)) {
			return refuse(
				'inside-data-directory',
				`${resolvedPath} contains ${dataDirectory}; backing up into a parent of the data would recurse`,
			)
		}
	}

	// 3. System-path denylist, applied to the RESOLVED path so a symlink cannot
	//    smuggle one in.
	for (const prefix of REFUSED_SYSTEM_PREFIXES) {
		if (isAtOrUnder(resolvedPath, prefix)) {
			return refuse('unsupported-root', `${prefix} may not hold a backup repository`)
		}
	}
	if (segmentsOf(resolvedPath).length >= 3 && RAW_POOL_BRANCH.test(nodePath.posix.dirname(resolvedPath))) {
		return refuse('unsupported-root', 'Write to the pool through /Pool, not a raw disk branch')
	}
	// Anything under /opt/livos except the internal root we own. Scoped to the
	// kinds this phase newly allows: dataDirectory itself lives at /opt/livos/data
	// on a default box, so applying this to external/network would refuse every
	// legitimately-mounted drive and share. Those two are governed by the mount
	// proof below instead, exactly as they were before this phase.
	if (!mountBacked && isAtOrUnder(resolvedPath, '/opt/livos') && !isAtOrUnder(resolvedPath, INTERNAL_BACKUP_ROOT)) {
		return refuse('unsupported-root', 'LivOS re-owns /opt/livos on every update; a repository there would be re-chowned each time')
	}

	// 4. Mount proof for everything that claims to be on separate hardware. This
	//    also closes a shipped hole: with nothing plugged in, /External resolved
	//    to a plain directory inside dataDirectory, and a repo created there was
	//    on the OS disk, inside the snapshot source, counted as a real
	//    destination, and deleted by the restore it served.
	if (input.kind === 'external' || input.kind === 'network') {
		// The drive/share directory must ITSELF be a mountpoint. If it is not, the
		// path is a plain directory inside dataDirectory and everything above about
		// the restore-wipe applies to it.
		const mountpoint = await deps.mountpointFor(resolvedParent)
		if (mountpoint === null || normalizePath(mountpoint) !== resolvedParent) {
			return refuse(
				'destination-not-mounted',
				`Nothing is mounted at ${resolvedParent} (governed by ${mountpoint ?? 'unknown'})`,
			)
		}
	} else if (input.kind === 'pool') {
		// The pool folder is not itself a mountpoint — the union mount above it is.
		// Require the path to be SERVED by the pool mount, which is false (it answers
		// `/`) whenever mergerfs is not mounted.
		const poolMountpoint = input.poolMountpoint ? normalizePath(input.poolMountpoint) : ''
		const mountpoint = await deps.mountpointFor(resolvedParent)
		if (!poolMountpoint || mountpoint === null || !isAtOrUnder(normalizePath(mountpoint), poolMountpoint)) {
			return refuse(
				'destination-not-mounted',
				`${resolvedParent} is not served by the storage pool (governed by ${mountpoint ?? 'unknown'})`,
			)
		}
	}
	// `internal` gets no mount proof: it is knowingly on the system disk, which is
	// the whole reason it can never be GREEN.

	// 5. Filesystem type.
	const fstype = await deps.fstypeOf(resolvedParent)
	if (fstype && REFUSED_FSTYPES.has(fstype)) {
		return refuse('unsupported-filesystem', `${fstype} cannot hold a durable repository`)
	}

	// 6. Write proof.
	if (!(await deps.canWrite(resolvedParent))) {
		return refuse('permission-denied', `Cannot write to ${resolvedParent}`)
	}

	// 7. Capacity. A degenerate reading is refused, not rounded down to zero.
	const free = await deps.freePercent(resolvedParent)
	if (free === null || Number.isNaN(free)) {
		return refuse('destination-too-full', `Could not read free space on ${resolvedParent}`)
	}
	if (free < MIN_FREE_PERCENT) {
		return refuse('destination-too-full', `${resolvedParent} has ${free.toFixed(1)}% free, below the ${MIN_FREE_PERCENT}% floor`)
	}

	// 8. No nesting with an existing repository, in EITHER direction.
	for (const existing of await deps.existingRepositoryPaths()) {
		const other = normalizePath(existing)
		if (isAtOrUnder(resolvedPath, other) || isAtOrUnder(other, resolvedPath)) {
			return refuse('nested-repository', `${resolvedPath} overlaps the existing repository at ${other}`)
		}
	}

	return {ok: true, kind: input.kind, systemPath: resolvedPath}
}

// ── self-referential-snapshot belts (D6) ───────────────────────────────────

/**
 * kopia reads gitignore-flavoured patterns, so a folder literally named
 * `My [stuff]` is a character class that matches nothing. Escape before emitting.
 */
export function escapeIgnorePattern(value: string): string {
	return value.replace(/([\\*?[\]])/g, '\\$1')
}

export type IgnorableRepository = {
	id: string
	path: string
	kind?: DestinationKind
	systemPath?: string
	isSafety?: boolean
}

/**
 * D6 — the lines that stop a snapshot from walking into a backup repository.
 *
 * D1 rule 2 already makes a destination inside dataDirectory impossible, so these
 * are belts rather than trousers: they cover rows written before that predicate
 * existed, and a repository that ends up somewhere unexpected.
 *
 * THROWS when a pool/internal repository has no resolvable system path. The
 * caller awaits this un-caught during a backup, so the throw aborts the run —
 * which is the right trade: no backup at all beats one that might recurse into
 * its own repository and grow without bound.
 *
 * @param toBackupRootPath converts an absolute system path into the
 *   backup-root-relative form kopia expects (`/` means the snapshot root, not the
 *   filesystem root).
 */
export function repositoryIgnorePatterns(
	repositories: IgnorableRepository[],
	options: {toBackupRootPath: (path: string) => string; repositoryDirectoryName: string},
): string[] {
	const patterns: string[] = []

	for (const repository of repositories) {
		const repositoryPath = repository.systemPath ?? (repository.isSafety ? repository.path : undefined)
		if (!repositoryPath) {
			if (repository.kind === 'pool' || repository.kind === 'internal') {
				throw new Error(
					`Refusing to back up: repository ${repository.id} (${repository.kind}) has no resolvable system path, ` +
						'so it cannot be excluded from its own snapshot',
				)
			}
			continue
		}
		patterns.push(escapeIgnorePattern(options.toBackupRootPath(repositoryPath)))
	}

	// Depth-agnostic name match. Deliberately WITHOUT a leading slash — an anchored
	// `/Livinity Backup.backup/` would only match a repository sitting at the very
	// top of the snapshot, which is exactly the case we least need to catch.
	patterns.push(`${escapeIgnorePattern(options.repositoryDirectoryName)}/`)

	return patterns
}

// ── is this destination on a different physical disk than the data? ─────────

export type OffSystemDiskDeps = {
	/** Whole-disk names backing an arbitrary path (root-disk.ts `diskForPath`). */
	disksForPath: (path: string) => Promise<string[]>
	/** Whole-disk names backing /, /boot, /boot/efi. EMPTY = could not prove. */
	osDisks: () => Promise<Set<string>>
	/** Whole-disk names of the storage pool's member branches, from the pool store. */
	poolMemberDisks: () => Promise<string[]>
}

/**
 * D4 — the honesty gate behind every green health state.
 *
 * Deliberately NOT `st_dev`. st_dev is wrong exactly where it matters most:
 * /mnt/pool is a mergerfs FUSE mount and always reports a distinct device number
 * even when every branch it unions is a folder on the OS disk. A backup that
 * "looks like another disk" but shares the one that fails is the precise lie
 * this whole phase exists to avoid telling.
 *
 * Equally deliberately NOT `lsblk PKNAME`, which returns the immediate parent —
 * for a stacked root that is the backing PARTITION, not the whole disk. That is
 * the documented CR-01 bug that once left the OS disk eligible for formatting.
 *
 * FAILS CLOSED. Anything unproven — no disks resolved, OS disks unresolvable —
 * returns false, i.e. "treat it as the system disk". A destination has to EARN
 * its green.
 */
export async function resolveOffSystemDisk(
	input: {kind: DestinationKind; systemPath: string},
	deps: OffSystemDiskDeps,
): Promise<boolean> {
	// A remote share has no local disk ancestor at all — that is the entire point
	// of it, and losing this box's disk cannot take it with them.
	if (input.kind === 'network') return true
	// An internal destination is the system disk by construction. It is still a
	// useful destination (it protects against mistakes) — it just never pretends
	// to protect against that disk dying.
	if (input.kind === 'internal') return false

	const osDisks = await deps.osDisks().catch(() => new Set<string>())
	// Could not prove which disk is the OS ⇒ cannot prove this one differs.
	if (osDisks.size === 0) return false

	const disks =
		input.kind === 'pool'
			? // For the pool we ask the POOL, not findmnt: findmnt on /mnt/pool
				// resolves to the mergerfs FUSE source, which names no physical disk.
				await deps.poolMemberDisks().catch(() => [])
			: await deps.disksForPath(input.systemPath).catch(() => [])

	if (disks.length === 0) return false

	// EVERY backing disk must be off the OS disk. A pool with one branch on the
	// system disk can place a file there (mergerfs `category.create=mfs` picks by
	// free space), so "one of them is separate" is not good enough.
	return disks.every((disk) => !osDisks.has(disk))
}

/**
 * D5 — a destination only counts as REAL protection when it is neither the
 * system-managed safety repo nor on the same physical disk as the data.
 * `offSystemDisk` is tri-state on purpose: `undefined` (never resolved) is not
 * `true`, so an unproven destination never earns GREEN.
 */
export function isRealDestination(repository: {isSafety?: boolean; offSystemDisk?: boolean}): boolean {
	return !repository.isSafety && repository.offSystemDisk === true
}
