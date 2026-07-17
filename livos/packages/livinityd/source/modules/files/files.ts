/**
 * Note: ext4 Filesystem Directory Entry Limit
 * ------------------------------------------
 * The current ext4 filesystem in LivOS is created with the `dir_index` feature
 * enabled (for faster name lookups in large directories), but *without* the `large_dir`
 * feature enabled (which would increase the limit on the number of files per directory).
 * See https://man7.org/linux/man-pages/man5/ext4.5.html
 *
 * Without `large_dir`, the `dir_index` hash tree has a limited depth, restricting the number of entries
 * in a single directory. In testing, the limit is on the order of a few hundreds of thousands, but not millions, of files.
 *
 * Exceeding this limit will cause file creation/write errors, visible in `dmesg` as:
 *   `EXT4-fs warning ... ext4_dx_add_entry: Directory ... index full, reach max htree level`
 *   `EXT4-fs warning ... ext4_dx_add_entry: Large directory feature is not enabled...`
 * It stems from the `dir_index` htree reaching its maximum depth without `large_dir`.
 */

import nodePath from 'node:path'
import {AsyncLocalStorage} from 'node:async_hooks'

import mime from 'mime-types'
import fse from 'fs-extra'
import {minimatch} from 'minimatch'
import isValidFilename from 'valid-filename'
import pRetry from 'p-retry'

import {copyWithProgress} from '../utilities/copy-with-progress.js'

import {getDiskUsageByPath} from '../system/system.js'
import {getUserQuotaBytes, findUserByUsername} from '../database/index.js'
import {
	getEffectiveLevel as aclGetEffectiveLevel,
	listGrantedPathsForUser,
	nearestAncestorAclLevel,
	type AclLevel,
} from './file-acls.js'

import Watcher from './watcher.js'
import Recents from './recents.js'
import Favorites from './favorites.js'
import Archive from './archive.js'
import Thumbnails from './thumbnails.js'
import Samba from './samba.js'
import WebDav from './webdav.js'
import ExternalStorage from './external-storage.js'
import NetworkStorage from './network-storage.js'
import CloudStorage from './cloud-storage.js'
import Search from './search.js'
import ContentSearch, {
	normalizeQuery,
	CONTENT_SEARCH_CAPS,
	type ContentMatch,
} from './content-search.js'

import type Livinityd from '../../index.js'

const ALL_OPERATIONS = [
	'copy',
	'move',
	'rename',
	'trash',
	'restore',
	'delete',
	'favorite',
	'unarchive',
	'share',
	'writable',
] as const

type FileOperation = (typeof ALL_OPERATIONS)[number]

// Phase 324-02 FILES-02 (D-08) — translate an ACL union level into the operation
// set it ADDS onto getAllowedOperations for a cross-user granted path. `read` is
// strictly read-only (view + copy-out, NEVER the mutate op); `write` adds
// mutation. `none` / no-grant deny (empty set) — the ACL layer only ever ADDS
// visibility, never removes an ownership-governed capability on the caller's own
// tree (own-tree paths never reach here).
const ACL_READ_OPERATIONS: readonly FileOperation[] = ['copy']
const ACL_WRITE_OPERATIONS: readonly FileOperation[] = ['copy', 'writable', 'move', 'rename', 'trash', 'delete']

function aclLevelToOperations(level: AclLevel | null): FileOperation[] {
	if (level === 'write') return [...ACL_WRITE_OPERATIONS]
	if (level === 'read') return [...ACL_READ_OPERATIONS]
	return [] // 'none' | null → deny
}

// Phase 337-02 (FTS-01) — the per-hit ACL post-filter DECISION, extracted pure so it
// is unit-testable offline without a daemon (content-search-shared.test.ts). Keep a
// shared /Shared content hit IFF its nearest-ancestor effective level is read|write —
// an explicit `none` on the file OR on any ancestor between the grant and the file
// (D-337-3) resolves to `none` here → hit dropped → its content never surfaces.
// #searchSharedContent applies this EXACT gate inline (it also needs the level for the
// entry's operations), so this function and the production path share one primitive.
export async function sharedHitAllowed(innerPath: string, getLevel: (path: string) => Promise<AclLevel | null>): Promise<boolean> {
	const level = await nearestAncestorAclLevel(innerPath, getLevel)
	return level === 'read' || level === 'write'
}

// Phase 336 (ACLUI-01) — the synthetic web nav root under which a user reaches
// the cross-user paths granted to them (file_acls). NOT a real base directory
// (that would bypass ACL gating): every `/Shared/*` path is intercepted in
// virtualToSystemPath + list + getAllowedOperations and resolved through the
// ACL layer against the GLOBAL grant namespace. Own-tree paths never start with
// this prefix, so they skip every ACL branch — zero regression (D-336-1/5).
const SHARED_ROOT = '/Shared'

// The result of the cross-user ACL resolution layer. `source: 'ownership'` means
// the path is inside the caller's own per-user tree and is governed by the
// existing ownership rules (the ACL DAO is NOT consulted; operations === null).
// `source: 'acl'` means the path is OUTSIDE the caller's tree and the level/
// operations are the ONLY thing that grants any cross-user visibility.
export type EffectivePermission = {
	source: 'ownership' | 'acl'
	level: AclLevel | null
	operations: FileOperation[] | null
}

type File = {
	name: string
	path: string
	type: string
	size: number
	modified: number
	operations: FileOperation[]
	thumbnail?: string
}

// Phase 337-01 (FTS-01) — a content-search result: the same File shape the two UI
// consumers already expect, augmented with the per-file content matches. Exported so
// the search route's return type carries these optional fields to the client (the
// filename branch simply never sets them).
export type SearchResultFile = File & {contentMatches?: ContentMatch[]; matchCount?: number}

type DirectoryListing = File & {
	files: File[]
	truncatedAt?: number
}

type Trashmeta = {
	path: string
}

// Phase 324-05 FILES-03 (D-12) — `/Cloud` is the WRITABLE base dir under which the
// rclone wrapper FUSE-mounts cloud drives (Google Drive / Dropbox / OneDrive). It is
// deliberately NOT the hardcoded-readonly `/Network`: rclone's `--vfs-cache-mode
// writes` makes the mount read/write, so `/Cloud` is left out of the isReadonly rule.
//
// Phase 318 (D-12) — `/Pool` is the WRITABLE pool mountpoint base dir, present ONLY
// when a storage pool exists (registered/unregistered at runtime by pool.ts via the
// registerPoolBaseDir/unregisterPoolBaseDir hooks + boot-time init from the
// storagePool store state). Like `/Cloud` it is left OUT of the isReadonly rule
// (writable) and covered by the existing `'/*'` isProtected rule. It maps ONLY to the
// mergerfs union mountpoint /mnt/pool — never a raw /mnt/diskN branch or /mnt/parity1.
type BaseDirectory = '/Home' | '/Trash' | '/Apps' | '/External' | '/Backups' | '/Network' | '/Cloud' | '/Pool'

// Phase 318 (D-12) — the pool base dir maps DIRECTLY to the D-05 fstab mountpoint
// /mnt/pool (the mergerfs union), NOT a {dataDir} subdir (the mounted pool IS the
// directory). NEVER a /mnt/diskN data branch or the /mnt/parity1 parity disk — only
// the union mountpoint is ever exposed through the Files base-dir surface (T-318-21).
const POOL_MOUNTPOINT = '/mnt/pool'

type ViewPreferences = {
	view: 'icons' | 'list'
	sortBy: 'name' | 'type' | 'modified' | 'size'
	sortOrder: 'ascending' | 'descending'
}

const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
	view: 'list',
	sortBy: 'name',
	sortOrder: 'ascending',
}

type OperationProgress = {
	type: 'copy' | 'move'
	file: File
	destinationPath: string
	percent: number
	bytesPerSecond: number
	secondsRemaining?: number
}

export type OperationsInProgress = OperationProgress[]

// Per-request user context for multi-user file isolation.
// Admin users (or legacy single-user) get global base directories.
// Non-admin users get per-user directories under {dataDir}/users/{username}/.
export interface FileUserInfo {
	username: string
	role: 'admin' | 'member' | 'guest'
}

export const fileUserContext = new AsyncLocalStorage<FileUserInfo | undefined>()

// Phase 325 STOR-02 — soft-warn threshold, kept in sync with the scheduler's
// QUOTA_SOFT_RATIO (scheduler/jobs.ts). Duplicated as a local const rather than
// imported to avoid pulling the whole scheduler module graph into files.ts.
const QUOTA_SOFT_RATIO = 0.9

export default class Files {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	baseDirectories: Map<string, string>
	trashMetaDirectory: string
	// Phase 257-04 WS-A (LIVOS-006): cached multi-user flag (livos:system:multi_user).
	// getActiveBaseDirectories() is synchronous and called on every file op, so we
	// cache the redis flag here (refreshed by a lightweight poller) rather than
	// reading redis per call. Directly settable in unit tests.
	multiUserMode = false
	#multiUserPoll?: ReturnType<typeof setInterval>
	// Phase 318 (D-12): true when a storage pool exists and the `/Pool` base dir is
	// live. Flipped by registerPoolBaseDir/unregisterPoolBaseDir (pool.ts hooks) and
	// re-evaluated at boot from the storagePool store state. Consulted by
	// getUserBaseDirectories to conditionally include the shared `/Pool` member entry.
	// Directly settable in unit tests.
	poolBaseDirRegistered = false
	fileOwner = {userId: 1000, groupId: 1000}
	maxDirectoryListing = 10000
	// Prevent loads of .DS_Store (macOS) and .directory (KDE Dolphin) results, and
	// Phase 338 (RECYCLE-01, D-338-3) the SMB soft-delete bin — hidden from web
	// listing + basename search/recents via the shared isHidden() chokepoint (v1 =
	// SMB-only recycle browsing; no web restore UI). content-search (337) already
	// skips dot-directories, so this only closes the listing/search gap.
	hiddenFiles = ['.DS_Store', '.directory', '.Recycle.Bin']
	hiddenExtensions = ['.livinity-upload']
	operationsInProgress: OperationsInProgress = []
	watcher: Watcher
	recents: Recents
	favorites: Favorites
	archive: Archive
	thumbnails: Thumbnails
	samba: Samba
	webdav: WebDav
	externalStorage: ExternalStorage
	networkStorage: NetworkStorage
	cloudStorage: CloudStorage
	search: Search
	contentSearch: ContentSearch

	constructor(livinityd: Livinityd) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())

		this.baseDirectories = new Map<BaseDirectory, string>([
			['/Home', `${livinityd.dataDirectory}/home`],
			['/Trash', `${livinityd.dataDirectory}/trash`],
			['/Apps', `${livinityd.dataDirectory}/app-data`],
			['/External', `${livinityd.dataDirectory}/external`],
			['/Backups', `${livinityd.dataDirectory}/backups`],
			['/Network', `${livinityd.dataDirectory}/network`],
			['/Cloud', `${livinityd.dataDirectory}/cloud`],
		])

		this.watcher = new Watcher(livinityd, {paths: ['/Home', '/Trash', '/Apps']})
		this.recents = new Recents(livinityd, {paths: ['/Home']})
		this.favorites = new Favorites(livinityd)
		this.archive = new Archive(livinityd)
		this.thumbnails = new Thumbnails(livinityd)
		this.samba = new Samba(livinityd)
		this.webdav = new WebDav(livinityd)
		this.externalStorage = new ExternalStorage(livinityd)
		this.networkStorage = new NetworkStorage(livinityd)
		this.cloudStorage = new CloudStorage(livinityd)
		this.search = new Search(livinityd)
		this.contentSearch = new ContentSearch(livinityd)

		// TODO: This should really be in a proper DB, refactor this once we've moved to SQLite
		this.trashMetaDirectory = `${livinityd.dataDirectory}/trash-meta`

		// Phase 257-04 WS-A (LIVOS-006): keep the cached multi-user flag fresh.
		// Read once at construction, then poll. Failures (e.g. redis not yet up)
		// leave the safe default (false → single-user behavior), and a later poll
		// picks up the real value once redis is available.
		void this.refreshMultiUserMode()
		this.#multiUserPoll = setInterval(() => void this.refreshMultiUserMode(), 30_000)
		// Don't keep the event loop alive just for this poll.
		this.#multiUserPoll.unref?.()
	}

	// Refresh the cached multi-user flag from redis (livos:system:multi_user).
	async refreshMultiUserMode(): Promise<void> {
		try {
			const val = await this.#livinityd.ai.redis.get('livos:system:multi_user')
			this.multiUserMode = val === 'true'
		} catch {
			// Leave the previous (or default) value; a later poll retries.
		}
	}

	// Get base directories for a non-admin user (per-user isolation).
	getUserBaseDirectories(username: string): Map<string, string> {
		const userDir = `${this.#livinityd.dataDirectory}/users/${username}`
		const dirs = new Map<BaseDirectory, string>([
			['/Home', `${userDir}/home`],
			['/Trash', `${userDir}/trash`],
			['/Apps', `${userDir}/app-data`],
			// External, Network and Cloud are shared (hardware-/host-level mounts)
			['/External', `${this.#livinityd.dataDirectory}/external`],
			['/Backups', `${userDir}/backups`],
			['/Network', `${this.#livinityd.dataDirectory}/network`],
			['/Cloud', `${this.#livinityd.dataDirectory}/cloud`],
		])
		// Phase 318 (D-12): /Pool is a shared host-level mount (like External/Network/
		// Cloud) — members see the SAME union mountpoint, present only when a pool
		// exists. Gated on the same poolBaseDirRegistered flag as the admin map.
		this.applyPoolBaseDir(dirs)
		return dirs
	}

	// Phase 318 (D-12): add the shared `/Pool` → /mnt/pool entry to a base-dir map
	// when a pool is registered. Extracted so the conditional member-map inclusion is
	// unit-testable without the private #livinityd handle. Only ever maps the mergerfs
	// union mountpoint — never a /mnt/diskN branch or /mnt/parity1 (T-318-21).
	applyPoolBaseDir(dirs: Map<string, string>): void {
		if (this.poolBaseDirRegistered) dirs.set('/Pool', POOL_MOUNTPOINT)
	}

	// Phase 318 (D-12): flip the conditional `/Pool` base dir ON — called by pool.ts
	// after a successful createPool (via the FilesHook seam) and at boot from the
	// storagePool store state. Mirrors the /Cloud shared-mount precedent: adds the
	// entry to the admin map + enables the shared member-map entry. No daemon restart
	// needed. Idempotent.
	registerPoolBaseDir(): void {
		this.poolBaseDirRegistered = true
		this.baseDirectories.set('/Pool', POOL_MOUNTPOINT)
	}

	// Phase 318 (D-12): flip the conditional `/Pool` base dir OFF — for a pool
	// teardown (and re-evaluated at boot when the store reports no pool). Removes the
	// admin-map entry + disables the shared member-map entry. Idempotent — the
	// graceful no-pool state has NO `/Pool` in any map (no sidebar entry, no
	// ensure-dir against /mnt/pool). No daemon restart needed.
	unregisterPoolBaseDir(): void {
		this.poolBaseDirRegistered = false
		this.baseDirectories.delete('/Pool')
	}

	// Phase 318 (D-12): evaluate the persisted storagePool state and (un)register the
	// `/Pool` base dir accordingly. A pool "exists" when it has ≥1 configured member.
	// Pure w.r.t. the passed state so it is unit-testable; start() feeds it the store
	// read (before the ensure-dirs loop, so no /mnt/pool mkdir runs when no pool).
	evaluatePoolBaseDir(state: {members?: unknown[]} | undefined): void {
		if (state?.members?.length) this.registerPoolBaseDir()
		else this.unregisterPoolBaseDir()
	}

	// Returns the active base directories based on the current request's user context.
	//
	// Phase 257-04 WS-A (LIVOS-006): FAIL CLOSED. The legacy "absent userInfo →
	// global admin tree" fallback is a privilege-escalation hole in multi-user
	// mode — a member can omit LIVINITY_SESSION (presenting only the user-agnostic
	// proxy token, which resolves NO per-user identity) and reach the admin/shared
	// tree. We now gate that fallback on multi-user mode:
	//   - MULTI-user mode + absent userInfo  → EMPTY scope (never the admin tree).
	//   - MULTI-user mode + admin userInfo   → admin/global tree (unchanged).
	//   - MULTI-user mode + member userInfo  → users/<username> subtree (unchanged).
	//   - SINGLE-user (legacy) mode          → absent userInfo still gets the global
	//                                          tree (the single-operator Mini PC is
	//                                          unaffected — no regression).
	//
	// `userInfo` / `multiUser` default to the per-request AsyncLocalStorage store
	// and the redis-backed `multiUserMode` flag, but are overridable for unit tests.
	getActiveBaseDirectories(
		userInfo: FileUserInfo | undefined = fileUserContext.getStore(),
		opts?: {multiUser?: boolean},
	): Map<string, string> {
		const multiUser = opts?.multiUser ?? this.multiUserMode

		if (userInfo?.role === 'admin') {
			return this.baseDirectories
		}
		if (userInfo) {
			// member / guest → per-user isolated subtree
			return this.getUserBaseDirectories(userInfo.username)
		}

		// No resolved per-user identity (proxy/legacy token).
		if (multiUser) {
			// FAIL CLOSED: never expose the global admin tree to an unidentified
			// caller in multi-user mode.
			return new Map<string, string>()
		}
		// Single-user (legacy) mode: the global tree is the only tree.
		return this.baseDirectories
	}

	// Phase 324-02 FILES-02 (D-08) — cross-user ACL resolution layer, composed ON
	// TOP of getActiveBaseDirectories. It NEVER replaces base-dir isolation: it is
	// consulted ONLY for a path OUTSIDE the caller's own per-user tree, and a grant
	// only ADDS visibility/operations. The actual system path is still resolved
	// through virtualToSystemPath (escapes-base containment) elsewhere — a grant
	// can never reach outside the data root.
	//
	// ⚠️ v1 SCOPE (324-review IN-02) — NOT YET WIRED INTO THE WEB AUTHORIZATION PATH.
	// `getAllowedOperations()` / `virtualToSystemPath()` do NOT consult this method,
	// so file_acls grants take effect over SAMBA ONLY (per-user smb.conf render), not
	// the in-browser Files app. This is deliberate and fails SAFE: because
	// getActiveBaseDirectories() exposes only the caller's OWN per-user tree, any
	// out-of-tree virtual path is rejected as `[invalid-base]` before an op runs, so a
	// grant could never ADD web access even if this were wired. Real web-side
	// cross-user enforcement is a FOLLOW-UP: it needs a cross-user path namespace +
	// a resolver that can express another user's tree in getActiveBaseDirectories
	// (touching the hot virtualToSystemPath path) + Files-app navigation UI — out of
	// v1 scope. Do NOT assume web ACL enforcement is live from this method's presence.
	//
	//   - A path whose base segment is one of the caller's OWN base dirs (/Home,
	//     /Trash, …) stays ownership-governed: source 'ownership', operations null,
	//     and the ACL DAO is NOT consulted.
	//   - Any other (out-of-tree) path is the ACL layer's domain: it resolves the
	//     most-permissive union level (getEffectiveLevel) and maps it to the added
	//     operation set. Fail CLOSED: no resolved identity or no applicable grant →
	//     empty operations (no extra access), unchanged from today.
	//
	// `deps` is injectable so the resolution is unit-testable offline (defaults to
	// the real file-acls DAO + findUserByUsername).
	async getEffectivePermission(
		virtualPath: string,
		userInfo: FileUserInfo | undefined = fileUserContext.getStore(),
		deps: {
			getEffectiveLevel?: (path: string, userId: string) => Promise<AclLevel | null>
			resolveUserId?: (username: string) => Promise<string | null>
		} = {},
	): Promise<EffectivePermission> {
		// Own per-user tree → ownership-governed; the ACL layer is NEVER consulted.
		const segments = virtualPath.split('/').filter(Boolean)
		const baseSegment = `/${segments[0] ?? ''}`
		const ownBaseDirs = this.getActiveBaseDirectories(userInfo)
		if (ownBaseDirs.has(baseSegment)) {
			return {source: 'ownership', level: null, operations: null}
		}

		// Out-of-tree path: the ACL grant is the ONLY thing that can ADD visibility.
		// Fail closed on an unidentified caller (no per-user identity → nothing extra).
		if (!userInfo) return {source: 'acl', level: null, operations: []}

		const resolveUserId =
			deps.resolveUserId ?? (async (username: string) => (await findUserByUsername(username))?.id ?? null)
		const userId = await resolveUserId(userInfo.username)
		if (!userId) return {source: 'acl', level: null, operations: []}

		const getLevel = deps.getEffectiveLevel ?? aclGetEffectiveLevel
		const level = await getLevel(virtualPath, userId)
		return {source: 'acl', level: level ?? null, operations: aclLevelToOperations(level)}
	}

	// Ensure per-user directories exist. Called on first access.
	async ensureUserDirectories(username: string) {
		const userDir = `${this.#livinityd.dataDirectory}/users/${username}`
		const dirs = ['home', 'trash', 'app-data', 'backups']
		for (const dir of dirs) {
			await fse.ensureDir(`${userDir}/${dir}`).catch((error) => {
				this.logger.error(`Failed to create user directory ${userDir}/${dir}`, error)
			})
		}
		// Create default folders in Home
		const defaultFolders = ['Downloads', 'Documents', 'Photos', 'Videos']
		for (const folder of defaultFolders) {
			await fse.ensureDir(`${userDir}/home/${folder}`).catch(() => {})
		}
	}

	async start() {
		this.logger.log('Starting files')

		// Phase 318 (D-12): evaluate the persisted storagePool state and (un)register
		// the `/Pool` base dir BEFORE the ensure-dirs loop — so a booted pool is
		// browseable without a restart, and when NO pool exists `/Pool` stays absent so
		// the loop below never runs an ensure-dir (mkdir) against /mnt/pool. Fail-soft:
		// a store read error leaves the safe default (no `/Pool`), like the other
		// start() submodule .catch guards.
		await this.#livinityd.store
			.get('storagePool')
			.then((state) => this.evaluatePoolBaseDir(state))
			.catch((error) => this.logger.error('Failed to evaluate storagePool base-dir state', error))

		// Ensure all base directories exist
		await Promise.all(
			[...this.baseDirectories.keys()].map((baseDirectory) =>
				this.createDirectory(baseDirectory).catch((error) => {
					this.logger.error(`Failed to ensure directory '${baseDirectory}' exists`, error)
				}),
			),
		)

		// Ensure the trash meta directory exists
		await fse.ensureDir(this.trashMetaDirectory).catch((error) => {
			this.logger.error(`Failed to ensure directory ${this.trashMetaDirectory} exists`, error)
		})
		await this.chownSystemPath(this.trashMetaDirectory)

		// Do any required one time setup tasks.
		await this.firstRun()

		// Start submodules
		await this.watcher.start().catch((error) => this.logger.error(`Failed to start watcher`, error))
		await this.samba.start().catch((error) => this.logger.error(`Failed to start samba`, error))
		// Phase 329 FILES-05 (329-05) — reconcile per-user WebDAV homes on boot. Its
		// own start()/apply() is fail-soft (D-08), and this .catch is a second belt:
		// a WebDAV error must NEVER take down the files module or block a LivOS user.
		await this.webdav.start().catch((error) => this.logger.error(`Failed to start webdav`, error))
		await this.externalStorage.start().catch((error) => this.logger.error(`Failed to start external storage`, error))
		await this.networkStorage.start().catch((error) => this.logger.error(`Failed to start network storage`, error))
		// Phase 324-05 FILES-03 — the cloud-drive re-mount watch. Its start()/watch is
		// fail-soft (a wrapper/rclone error only skips a mount tick), and this .catch is
		// a second belt: a cloud-drive error must NEVER take down the files module.
		await this.cloudStorage.start().catch((error) => this.logger.error(`Failed to start cloud storage`, error))
		await this.recents.start().catch((error) => this.logger.error(`Failed to start recents`, error))
		await this.favorites.start().catch((error) => this.logger.error(`Failed to start favorites`, error))
		await this.thumbnails.start().catch((error) => this.logger.error(`Failed to start thumbnails`, error))
	}

	async firstRun() {
		// Check if we've already setup favorites
		const isFavoritesInitialized = (await this.#livinityd.store.get('files.favorites')) === undefined
		if (!isFavoritesInitialized) return

		// Initialize default favorites
		const defaultFavourites = ['/Home/Downloads', '/Home/Documents', '/Home/Photos', '/Home/Videos']
		for (const favorite of defaultFavourites) {
			await this.createDirectory(favorite).catch((error) =>
				this.logger.error(`Failed to ensure directory '${favorite}' exists`, error),
			)
			await this.favorites
				.addFavorite(favorite)
				.catch((error) => this.logger.error(`Failed to initialize favorite '${favorite}'`, error))
		}
	}

	async stop() {
		this.logger.log('Stopping files')

		// Stop submodules
		await this.recents.stop().catch((error) => this.logger.error(`Failed to stop recents`, error))
		await this.favorites.stop().catch((error) => this.logger.error(`Failed to stop favorites`, error))
		await this.thumbnails.stop().catch((error) => this.logger.error(`Failed to stop thumbnails`, error))
		await this.externalStorage.stop().catch((error) => this.logger.error(`Failed to stop external storage`, error))
		await this.networkStorage.stop().catch((error) => this.logger.error(`Failed to stop network storage`, error))
		await this.cloudStorage.stop().catch((error) => this.logger.error(`Failed to stop cloud storage`, error))
		await this.samba.stop().catch((error) => this.logger.error(`Failed to stop samba`, error))
		await this.watcher.stop().catch((error) => this.logger.error(`Failed to stop watcher`, error))
	}

	// Typesafe wrapper to get the system path of a base directory
	// Respects per-user context from AsyncLocalStorage.
	getBaseDirectory(virtualPath: BaseDirectory) {
		const baseDirs = this.getActiveBaseDirectories()
		const path = baseDirs.get(virtualPath)
		if (!path) throw new Error(`[base-directory-not-found] ${virtualPath}`)
		return path
	}

	// Creates a new directory at the given virtual path.
	// Returns true if the directory already exists.
	async createDirectory(virtualPath: string) {
		// Check if operation is allowed
		const containingDirectory = nodePath.dirname(virtualPath)
		const containingDirectoryAllowedOperations = await this.getAllowedOperations(containingDirectory)
		if (!containingDirectoryAllowedOperations.includes('writable')) throw new Error('[operation-not-allowed]')

		// Get system path
		const path = await this.virtualToSystemPath(virtualPath)

		// Check if the directory already exists
		if (await fse.pathExists(path)) return true

		// Create the directory
		await fse.mkdir(path).catch((error) => {
			if (error?.message?.includes('ENOENT')) throw new Error('[parent-not-exist]')
			if (error?.message?.includes('ENOTDIR')) throw new Error('[parent-not-directory]')
			throw new Error(`[mkdir-failed] ${error?.message}`)
		})

		// Set owner to the livinity user
		// We do nothing on fail because this isn't supported on all filesystems.
		// e.g this is expected to throw on external exFAT drives.
		await this.chownSystemPath(path).catch(() => {})

		return true
	}

	// Set owner of system path to livinity user
	async chownSystemPath(systemPath: string) {
		await fse.chown(systemPath, this.fileOwner.userId, this.fileOwner.groupId)
	}

	// Gets file status given a system path.
	// We use a system path here because everywhere we call this
	// we already have a system path so we know it's safe. Also
	// converting a system path back into a virtual path for the
	// return value is cheap but converting a virtual path into a
	// system path is expensive and we call this on every file in
	// a directory.
	async status(systemPath: string): Promise<File> {
		// Get the path and filename
		const path = this.systemToVirtualPath(systemPath)
		const name = nodePath.basename(path)

		// Get stats, operations, and thumbnail concurrently
		// This will ensure that we complete these as fast as the slowest operation
		const [stats, operations, thumbnail] = await Promise.all([
			// We use lstat to ensure we don't follow symlinks
			fse.lstat(systemPath),

			// Get the allowed operations
			this.getAllowedOperations(path),

			// Get the thumbnail for supported file types only if the thumbnail already exists (does not generate a missing thumbnail)
			this.thumbnails.getExistingThumbnail(systemPath).catch(() => undefined),
		])

		// Get the type
		let type
		if (stats.isDirectory()) type = 'directory'
		else if (stats.isSymbolicLink()) type = 'symbolic-link'
		else if (stats.isSocket()) type = 'socket'
		else if (stats.isBlockDevice()) type = 'block-device'
		else if (stats.isCharacterDevice()) type = 'character-device'
		else if (stats.isFIFO()) type = 'fifo'
		else type = mime.lookup(name) || 'application/octet-stream'

		// Get the size in bytes
		let size = stats.size
		// Set dir size to zero for now
		// TODO: Implement directory size index for efficient lookups
		if (type === 'directory') size = 0

		// Get the modified time
		const modified = stats.mtime.getTime()

		return {
			name,
			path,
			type,
			size,
			modified,
			operations,
			thumbnail,
		}
	}

	// Phase 337-01 (FTS-01) — content (full-text) search across the caller's OWN /Home
	// tree. /Shared roots are ADDED in 337-02. Returns File objects (the same shape the
	// two UI consumers already expect) each augmented with contentMatches + matchCount.
	// Bounded by the engine's hard caps + a single box-wide in-flight slot.
	async searchFileContent(query: string, maxResults = 250): Promise<SearchResultFile[]> {
		const q = normalizeQuery(query)
		if (!q) return [] // < min length → no scan, empty result
		const cap = Math.min(maxResults, CONTENT_SEARCH_CAPS.maxResultFiles)
		const userInfo = fileUserContext.getStore()
		const userKey = userInfo?.username ?? '__legacy_single_user__' // stable per-caller slot key

		return this.contentSearch.withSlot(userKey, async (signal) => {
			// Own /Home root — resolve through the ONE sanctioned resolver (escapes-base
			// checked), so the engine only ever sees an already-validated absolute path
			// under the caller's tree; no parallel path-safety code in the engine.
			const homeRoot = await this.virtualToSystemPath('/Home').catch(() => null)
			const hits = homeRoot ? await this.contentSearch.scanRoot(homeRoot, q, {signal, remaining: cap}) : []

			// Map each hit's systemPath back to a File via the existing per-user status()
			// (own-tree → identical to how basename search builds its results).
			const results: SearchResultFile[] = []
			for (const hit of hits.slice(0, cap)) {
				const file = await this.status(hit.systemPath).catch(() => undefined)
				if (file) results.push({...file, contentMatches: hit.contentMatches, matchCount: hit.matchCount})
			}

			// Phase 337-02 — then scan the caller's granted /Shared roots within the SAME
			// slot + shared result budget (roots share one cap ⇒ one bounded operation).
			if (results.length >= cap) return results.slice(0, cap)
			const sharedResults = await this.#searchSharedContent(q, cap - results.length, signal)
			return [...results, ...sharedResults].slice(0, cap)
		})
	}

	// Phase 337-02 (FTS-01) — content search across the caller's granted /Shared roots.
	// Mirrors #listSharedRoot's resolution (listGrantedPathsForUser → #toGlobalSystemPath)
	// and #listShared's per-child override (an explicit `none` hides). Never calls
	// systemToVirtualPath (own-tree-scoped — would mis-map a global system path); tags
	// each hit with its /Shared virtual path. NO parallel path-safety / ACL code — every
	// root resolves via #toGlobalSystemPath (escapes-base) and every hit re-checks
	// nearest-ancestor via the same 336 primitives. W1: userId resolved ONCE and the
	// per-path ACL level lookups are memoized so hits sharing ancestors avoid N+1 DB reads.
	async #searchSharedContent(query: string, remaining: number, signal: AbortSignal): Promise<SearchResultFile[]> {
		if (remaining <= 0) return []
		const userInfo = fileUserContext.getStore()
		if (!userInfo) return [] // fail-safe: no identity → nothing shared
		let userId: string | null
		try {
			userId = (await findUserByUsername(userInfo.username))?.id ?? null
		} catch {
			return []
		}
		if (!userId) return []
		const uid = userId

		// Memoized exact-path effective-level lookup, shared across every hit in this
		// call: a hit's nearest-ancestor walk reuses ancestor verdicts already resolved
		// by earlier hits in the same subtree (W1 — no per-hit findUserByUsername, no
		// re-querying the shared ancestors). Fail-safe null on any DB error.
		const levelCache = new Map<string, AclLevel | null>()
		const getLevel = async (p: string): Promise<AclLevel | null> => {
			const cached = levelCache.get(p)
			if (cached !== undefined) return cached
			const level = await aclGetEffectiveLevel(p, uid).catch(() => null)
			levelCache.set(p, level)
			return level
		}

		const granted = await listGrantedPathsForUser(uid).catch(() => []) // ≥read, sole-none excluded
		const out: SearchResultFile[] = []

		for (const g of granted) {
			if (out.length >= remaining || signal.aborted) break
			let rootSystemPath: string
			try {
				rootSystemPath = await this.#toGlobalSystemPath(g.virtualPath) // global namespace + escapes-base
			} catch {
				continue // grant target gone / unresolvable → skip
			}

			const hits = await this.contentSearch.scanRoot(rootSystemPath, query, {signal, remaining: remaining - out.length})

			for (const hit of hits) {
				if (out.length >= remaining) break
				// Map the SYSTEM hit path back to its grant-namespace INNER path, then the
				// /Shared virtual path. rootSystemPath === #toGlobalSystemPath(g.virtualPath),
				// so innerPath = g.virtualPath + hit.systemPath.slice(rootSystemPath.length).
				const suffix = hit.systemPath.slice(rootSystemPath.length) // '' or '/sub/file.txt'
				const innerPath = normalizePath(`${g.virtualPath}${suffix}`)
				const sharedVirtual = `${SHARED_ROOT}${innerPath}` // /Shared/Home/foo/file.txt

				// PER-HIT ACL POST-FILTER (D-337-3). Nearest-ancestor governs; an explicit
				// `none` on this file or an ancestor between the grant and the file HIDES it.
				// This is exactly the sharedHitAllowed() gate (read|write kept) — inlined so
				// the resolved level also drives the entry's ACL-derived operation set.
				const level = await nearestAncestorAclLevel(innerPath, getLevel).catch(() => null)
				if (level !== 'read' && level !== 'write') continue // dropped → no content leaks

				// Build the File via the 336 self-contained entry (NOT status()/systemToVirtualPath).
				const entry = await this.#sharedFileEntry(hit.systemPath, sharedVirtual, aclLevelToOperations(level)).catch(() => undefined)
				if (entry) out.push({...entry, contentMatches: hit.contentMatches, matchCount: hit.matchCount})
			}
		}
		return out
	}

	// Checks if a filename is hidden
	isHidden(filename: string) {
		return (
			this.hiddenFiles.includes(filename) || this.hiddenExtensions.some((extension) => filename.endsWith(extension))
		)
	}

	// Lists the contents of the root directory.
	// This is a special case since the root directory doesn't map to a system path.
	async #listRoot() {
		const baseDirs = this.getActiveBaseDirectories()
		const files = await Promise.all([...baseDirs.values()].map((systemPath) => this.status(systemPath)))
		return {
			name: '',
			path: '/',
			type: 'directory',
			size: 0,
			modified: 0,
			operations: [],
			files,
		}
	}

	// Lists the contents of a directory given a virtual path.
	// Will return all files in the directory up to this.maxDirectoryListing
	// We safely stream the directory to avoid blowing up Node.js if the directory is large.
	async list(virtualPath: string): Promise<DirectoryListing> {
		virtualPath = normalizePath(virtualPath)

		// Special handling for the root directory since it doesn't map to a system parth
		if (virtualPath === '/') return this.#listRoot()

		// Phase 336 — the web /Shared cross-user namespace (root = the user's
		// granted paths; a child = the ACL-gated contents of a granted folder).
		if (this.#isSharedPath(virtualPath)) return this.#listShared(virtualPath)

		// Get the system path and directory details
		const systemPath = await this.virtualToSystemPath(virtualPath)
		const directoryDetails = await this.status(systemPath).catch((error) => {
			if (error?.message?.includes('ENOENT')) throw new Error('[does-not-exist]')
			throw error
		})

		// List the contents of the directory
		const fileJobs = []
		let truncatedAt: number | undefined = undefined
		// We open an async iterator to the directory so we can safely stream a large directory
		// and exit if it gets too big.
		// Iterate over the directory contents
		let count = 0
		for await (const fileSystemPath of getDirectoryStream(systemPath)) {
			// Skip hidden files
			if (this.isHidden(nodePath.basename(fileSystemPath))) continue

			// Push the file details job to the queue to limit concurrency
			fileJobs.push(
				this.status(fileSystemPath).catch((error) => {
					this.logger.error(`Failed to get status for '${fileSystemPath}'`, error)
					return undefined
				}),
			)
			count++
			// If we've reached the maximum number of files, set the truncatedAt property
			// and break out of the loop.
			if (count >= this.maxDirectoryListing) {
				truncatedAt = this.maxDirectoryListing
				break
			}
		}

		// Filter out any files that failed to get status
		const files = (await Promise.all(fileJobs)).filter((file) => file !== undefined) as File[]

		return {
			...directoryDetails,
			files,
			truncatedAt,
		}
	}

	// Recursively stream the contents of a virtual directory
	async *streamContents(virtualPath: string) {
		const systemPath = await this.virtualToSystemPath(virtualPath)
		const directoryStream = getDirectoryStream(systemPath, {recursive: true})
		for await (const systemPath of directoryStream) yield systemPath
	}

	// Internal utility to copy (or copy and delete (psuedo-move)) a file or directory using rsync and report progress
	async #copyWithProgress(sourceSystemPath: string, destinationSystemPath: string, {move = false} = {}) {
		// Error handling consistent with fse.copy and move
		const destinationExists = await fse.exists(destinationSystemPath)
		if (destinationExists) throw new Error('[destination-already-exists]')
		if (destinationSystemPath.startsWith(sourceSystemPath)) throw new Error('[subdir-of-self]')

		// Create initial progress tracker and emit operation progress event
		const operationProgress: OperationProgress = {
			type: move ? 'move' : 'copy',
			file: await this.status(sourceSystemPath),
			destinationPath: this.systemToVirtualPath(destinationSystemPath),
			percent: 0,
			bytesPerSecond: 0,
		}
		this.operationsInProgress.push(operationProgress)
		this.#livinityd.eventBus.emit('files:operation-progress', this.operationsInProgress)

		try {
			// Wait for copy to finish and throw if copy fails
			await copyWithProgress(sourceSystemPath, destinationSystemPath, (progress) => {
				operationProgress.percent = progress.progress
				operationProgress.bytesPerSecond = progress.bytesPerSecond
				operationProgress.secondsRemaining = progress.secondsRemaining
				this.#livinityd.eventBus.emit('files:operation-progress', this.operationsInProgress)
			})

			// If we're moving, delete the source file or directory on completion
			if (move) await fse.remove(sourceSystemPath)
		} finally {
			// Remove the progress tracker and emit operation progress event
			this.operationsInProgress = this.operationsInProgress.filter((operation) => operation !== operationProgress)
			this.#livinityd.eventBus.emit('files:operation-progress', this.operationsInProgress)
		}
	}
	// Copies a file or directory from one virtual path to another.
	// Phase 325 STOR-02 — soft per-user quota pre-check (D-05/D-06). Reads the
	// user's quota_bytes (PG) + the cached used_bytes map written by the
	// `user-quota-scan` scheduler job, and:
	//   - HARD: rejects the write if used + addBytes would exceed quota_bytes.
	//   - SOFT: past QUOTA_SOFT_RATIO of quota (but still under it), fires a
	//     fire-and-forget 'quota-exceeded' warning bell (does NOT block).
	// Residual gap (D-05): enforcement is APPROXIMATE — it trusts the last scan
	// tick's cached used_bytes and only covers writes routed through the files
	// module. Between-tick growth + non-files-module writes (docker app writes,
	// SMB) are NOT hard-blocked here; kernel/project quotas are DEFERRED.
	// quota_bytes NULL or <= 0 = unlimited (matches usersOverSoftQuota); an
	// undefined username (admin / global tree) is exempt.
	async assertWithinQuota(username: string | undefined, addBytes: number): Promise<void> {
		if (!username) return
		let quotaBytes: number | null = null
		try {
			quotaBytes = await getUserQuotaBytes(username)
		} catch {
			// Fail-open on a quota-lookup error — never block a write on infra failure.
			return
		}
		if (quotaBytes == null || quotaBytes <= 0) return // unlimited
		let used = 0
		try {
			const sq = await this.#livinityd.store.get('storageQuota')
			if (sq && typeof sq === 'object' && 'usedBytes' in sq) {
				used = (sq as {usedBytes?: Record<string, number>}).usedBytes?.[username] ?? 0
			}
		} catch {
			// No cache yet (scan hasn't run) → treat used as 0; the next scan catches up.
		}
		const projected = used + Math.max(0, addBytes)
		if (projected > quotaBytes) {
			throw new Error('[quota-exceeded]')
		}
		if (projected >= quotaBytes * QUOTA_SOFT_RATIO) {
			await this.#livinityd.notifications.add('quota-exceeded', {severity: 'warning', external: false}).catch(() => {})
		}
	}

	async copy(sourceVirtualPath: string, destinationVirtualDirectory: string, {collision = 'error'} = {}) {
		// Check if operation is allowed
		const allowedOperations = await this.getAllowedOperations(destinationVirtualDirectory)
		if (!allowedOperations.includes('writable')) throw new Error('[operation-not-allowed]')

		// Get the system paths
		let sourceSystemPath = await this.virtualToSystemPath(sourceVirtualPath)
		const destinationSystemDirectory = await this.virtualToSystemPath(destinationVirtualDirectory)

		// Error if the source doesn't exist
		const sourceExists = await fse.exists(sourceSystemPath)
		if (!sourceExists) throw new Error('[source-not-exists]')

		// Error if the destination directory doesn't exist
		const targetExists = await fse.exists(destinationSystemDirectory)
		if (!targetExists) throw new Error(`[destination-not-exist]`)

		// Check we have enough free space on the destination
		const sourceStats = await fse.stat(sourceSystemPath)
		const diskUsage = await getDiskUsageByPath(destinationSystemDirectory)
		const buffer = 1024 * 1024 * 1024 * 1 // 1GB
		const neededSpace = sourceStats.size + buffer
		if (diskUsage.available < neededSpace) throw new Error('[not-enough-space]')

		// Phase 325 STOR-02 — soft per-user quota gate BEFORE writing. Admins use
		// the global tree (no per-user quota) so they are exempt; members/guests are
		// checked against their cached usage + quota_bytes.
		const quotaUser = fileUserContext.getStore()
		await this.assertWithinQuota(quotaUser && quotaUser.role !== 'admin' ? quotaUser.username : undefined, sourceStats.size)

		// Add trailing slash to source path if it's a directoryso we only copy the contents
		if (sourceStats.isDirectory()) sourceSystemPath = `${sourceSystemPath}/`

		// Build absolute destination path
		let destinationSystemPath = nodePath.join(destinationSystemDirectory, nodePath.basename(sourceSystemPath))

		// Always use 'keep-both' collision handling for same directory copies
		const isSameDirectory = nodePath.dirname(sourceVirtualPath) === destinationVirtualDirectory
		if (isSameDirectory) collision = 'keep-both'

		// Handle name collisions
		if (collision === 'error') {
			const destinationExists = await fse.pathExists(destinationSystemPath)
			if (destinationExists) throw new Error('[destination-already-exists]')
		} else if (collision === 'keep-both') {
			destinationSystemPath = await this.getUniqueName(destinationSystemPath)
		} else if (collision === 'replace') {
			// Remove the destination file/directory so that in the case of a directory, the contents are fully replaced
			// This entire fse.remove and subsequent fse.copy action is not atomic. If the copy fails, the original destination content will not be restored.
			await fse.remove(destinationSystemPath)
		}

		// Perform the copy operation
		await this.#copyWithProgress(sourceSystemPath, destinationSystemPath)

		// Return the virtual path of the new copy
		return this.systemToVirtualPath(destinationSystemPath)
	}

	// Phase 329-07 FILES-04 (D-05) — Save UTF-8 text content to a file with the
	// SAME writable + per-user quota gate copy()/move() use, plus an atomic
	// temp+rename write. This is deliberately NOT the /api/files/upload path,
	// which bypasses the 325 quota gate (fixing that bypass is out of scope for
	// this phase). `virtualPath` is the target FILE path (existing or new).
	async saveTextFile(virtualPath: string, content: string): Promise<string> {
		// (1) Writable gate — clone copy() (:582-583; also rename :707, delete
		// :843). getAllowedOperations resolves writability through the same
		// base-directory + readonly/protected rules as the rest of the module, so
		// a caller path can never write into a readonly/protected location.
		const allowedOperations = await this.getAllowedOperations(virtualPath)
		if (!allowedOperations.includes('writable')) throw new Error('[operation-not-allowed]')

		// Resolve the target through the traversal-hardened resolver (the same one
		// copy()/rename()/delete() use) — no raw caller path reaches the fs.
		const systemPath = await this.virtualToSystemPath(virtualPath)

		// (2) Quota-delta gate — clone copy()'s gate (:604-608) but only on the
		// GROWTH delta: a rewrite that shrinks or stays the same adds 0 bytes, a
		// brand-new file adds its full size. Admins use the global tree (no
		// per-user quota) so they are exempt; members/guests are checked.
		const newSize = Buffer.byteLength(content, 'utf8')
		const oldSize = (await fse.stat(systemPath).catch(() => null))?.size ?? 0
		const quotaUser = fileUserContext.getStore()
		await this.assertWithinQuota(
			quotaUser && quotaUser.role !== 'admin' ? quotaUser.username : undefined,
			Math.max(0, newSize - oldSize),
		)

		// (3) Atomic write — mirror the /upload route's temp+rename structure
		// (api.ts:152-172) so the file is never left half-written on a crash, and
		// clean up the temp file if either step fails.
		const fileName = nodePath.basename(systemPath)
		const directory = nodePath.dirname(systemPath)
		const temporarySystemPath = nodePath.join(directory, `.${fileName}.livinity-upload`)
		await fse.ensureDir(directory)
		try {
			await fse.writeFile(temporarySystemPath, content, 'utf8')
			await fse.rename(temporarySystemPath, systemPath)
		} catch (error) {
			await fse.remove(temporarySystemPath).catch(() => {})
			throw error
		}

		// Set owner to the livinity user (best-effort; unsupported on some
		// filesystems, e.g. external exFAT — mirror createDirectory()).
		await this.chownSystemPath(systemPath).catch(() => {})

		return this.systemToVirtualPath(systemPath)
	}

	// Moves a file or directory from one virtual path to another.
	async move(sourceVirtualPath: string, destinationVirtualDirectory: string, {collision = 'error'} = {}) {
		// If the destination is the current containing folder then the file is already in the correct location
		// so we don't need to do anything.
		if (nodePath.dirname(sourceVirtualPath) === destinationVirtualDirectory) return sourceVirtualPath

		// Check if operation is allowed on source
		const allowedSourceOperations = await this.getAllowedOperations(sourceVirtualPath)
		if (!allowedSourceOperations.includes('move')) throw new Error('[operation-not-allowed]')

		// Check if operation is allowed on destination
		const allowedDestinationOperations = await this.getAllowedOperations(destinationVirtualDirectory)
		if (!allowedDestinationOperations.includes('writable')) throw new Error('[operation-not-allowed]')

		// Get the system paths
		let sourceSystemPath = await this.virtualToSystemPath(sourceVirtualPath)
		const destinationSystemDirectory = await this.virtualToSystemPath(destinationVirtualDirectory)

		// Error if the source doesn't exist
		const sourceStats = await fse.stat(sourceSystemPath).catch(() => {
			throw new Error('[source-not-exists]')
		})

		// Error if the destination directory doesn't exist
		const targetDirectoryStats = await fse.stat(destinationSystemDirectory).catch(() => {
			throw new Error('[destination-not-exist]')
		})

		// Add trailing slash to source path if it's a directoryso we only copy the contents
		if ((await fse.lstat(sourceSystemPath)).isDirectory()) sourceSystemPath = `${sourceSystemPath}/`

		// Build absolute destination path
		let destinationSystemPath = nodePath.join(destinationSystemDirectory, nodePath.basename(sourceSystemPath))

		// Handle name collisions
		if (collision === 'keep-both') destinationSystemPath = await this.getUniqueName(destinationSystemPath)
		if (collision === 'replace') await fse.remove(destinationSystemPath)

		// Toggle move operation based on for cross fs moves.
		// Also allow overriding this so we can test both variants in the test suite.
		const forceSlowMoveWithProgress = process.env.LIVINITYD_FORCE_SLOW_MOVE_WITH_PROGRESS === 'true'
		const isMovingAcrossFilesystems = sourceStats.dev !== targetDirectoryStats.dev
		if (isMovingAcrossFilesystems || forceSlowMoveWithProgress) {
			// Phase 325 STOR-02 (WR-04) — a cross-filesystem move is a copy+delete that
			// ADDS bytes to the destination filesystem, so gate it against the user's
			// soft quota exactly like copy() does. Same-filesystem moves take the atomic
			// `move()` branch below (net-zero for the user tree → no quota gate). Admins
			// use the global tree (no per-user quota) so they are exempt.
			const quotaUser = fileUserContext.getStore()
			await this.assertWithinQuota(
				quotaUser && quotaUser.role !== 'admin' ? quotaUser.username : undefined,
				sourceStats.size,
			)
			// If we're moving across filesystems there will be a slow copy and delete so
			// we'll use our own implementation that reports progress.
			await this.#copyWithProgress(sourceSystemPath, destinationSystemPath, {move: true})
		} else {
			// Otherwise we can use native system move for instant atomic move on the same filesystem.
			await move(sourceSystemPath, destinationSystemPath)
		}

		// Return the virtual path of the new location
		return this.systemToVirtualPath(destinationSystemPath)
	}

	// Rename a file or directory
	async rename(sourceVirtualPath: string, newName: string): Promise<string> {
		// Check if operation is allowed.
		const allowedOperations = await this.getAllowedOperations(sourceVirtualPath)
		if (!allowedOperations.includes('rename')) throw new Error(`[operation-not-allowed]`)

		// Ensure that a new name is valid.
		if (!isValidFilename(newName)) throw new Error(`[invalid-filename] Invalid filename: '${newName}'`)

		// Convert the source virtual path into a system path.
		const sourceSystemPath = await this.virtualToSystemPath(sourceVirtualPath)

		// If the new name is identical to the current base name, do nothing.
		const currentName = nodePath.basename(sourceSystemPath)
		if (currentName === newName) return sourceVirtualPath

		// Determine the parent directory (system path) and compute the new candidate system path.
		const parentDirectory = nodePath.dirname(sourceSystemPath)
		const targetSystemPath = nodePath.join(parentDirectory, newName)

		// Perform the renaming operation by moving the file/directory.
		await move(sourceSystemPath, targetSystemPath)

		// Convert the target system path back into a virtual path and return it.
		return this.systemToVirtualPath(targetSystemPath)
	}

	// Trash a file or directory
	async trash(virtualPath: string) {
		// Check if operation is allowed
		const allowedOperations = await this.getAllowedOperations(virtualPath)
		if (!allowedOperations.includes('trash')) throw new Error('[operation-not-allowed]')

		// Get the system path
		// This is important to piggy back on for validation logic
		const systemPath = await this.virtualToSystemPath(virtualPath)

		// Calculate the target trash system path
		const trashSystemRoot = await this.virtualToSystemPath('/Trash')
		const trashSystemPath = await nodePath.join(trashSystemRoot, nodePath.basename(systemPath))

		// Retry on error to work around collision race condition
		// TODO: Add better handling in getUniqueName() for this.
		let uniqueTrashSystemPath = ''
		await pRetry(
			async () => {
				// Get a unique trash system path
				uniqueTrashSystemPath = await this.getUniqueName(trashSystemPath, {maxIndex: 1000})

				// Move the file or directory to the trash
				await move(systemPath, uniqueTrashSystemPath)
			},
			{
				retries: 10,
				minTimeout: 100,
				maxTimeout: 100,
				shouldRetry: (error) => error.message === '[destination-already-exists]',
			},
		)

		// Write the meta data for the trashed file or directory
		// TODO: Migrate this to SQLite
		const trashMetaSystemPath = nodePath.join(
			this.trashMetaDirectory,
			`${nodePath.basename(uniqueTrashSystemPath)}.json`,
		)
		await fse.writeFile(trashMetaSystemPath, JSON.stringify({path: virtualPath} satisfies Trashmeta))

		// Return the virtual path of the trashed file or directory
		return this.systemToVirtualPath(uniqueTrashSystemPath)
	}

	// Restore a file or directory from the trash
	async restore(trashVirtualPath: string, {collision = 'error'} = {}) {
		// Check if operation is allowed
		const allowedOperations = await this.getAllowedOperations(trashVirtualPath)
		if (!allowedOperations.includes('restore')) throw new Error('[operation-not-allowed]')

		// Get the system path
		const trashSystemPath = await this.virtualToSystemPath(trashVirtualPath)
		if (!(await fse.pathExists(trashSystemPath))) throw new Error('[source-not-exists]')

		// Read the meta data for the trashed file or directory
		const pathSegments = trashVirtualPath.split('/').filter(Boolean)
		const isChild = pathSegments.length > 2
		// Always use the second path segment so we can recover child files and directories
		const trashMetaSystemPath = nodePath.join(this.trashMetaDirectory, `${pathSegments[1]}.json`)
		let targetSystemPath: string
		try {
			const trashMeta = (await fse.readJson(trashMetaSystemPath)) as Trashmeta
			// Phase 336 (review W1) — restoring back INTO a /Shared target is a WRITE;
			// require a live write grant (a downgraded read grant must not restore).
			// No-op for own-tree restore targets.
			await this.assertSharedWritable(trashMeta.path)
			targetSystemPath = await this.virtualToSystemPath(trashMeta.path)
			// Calculate full path if we're recovering a child file or directory
			if (isChild) targetSystemPath = nodePath.join(targetSystemPath, pathSegments.slice(2).join('/'))
		} catch (error) {
			if ((error as Error)?.message?.includes('ENOENT')) throw new Error('[trash-meta-not-exists]')
			throw error
		}

		// Handle name conflicts
		if (collision === 'keep-both') targetSystemPath = await this.getUniqueName(targetSystemPath)
		const moveOptions = collision === 'replace' ? {overwrite: true} : {}

		// Move the file or directory to the new location
		await move(trashSystemPath, targetSystemPath, moveOptions)

		// Delete the meta data if we're recovering a root file or directory
		if (!isChild) await fse.remove(trashMetaSystemPath)

		// Return the virtual path of the restored file or directory
		return this.systemToVirtualPath(targetSystemPath)
	}

	// Empty the trash
	async emptyTrash() {
		let success = true

		// Get the system path for the trash directory
		const trashDirectory = await this.virtualToSystemPath('/Trash')

		// Stream the trash directory contents
		for await (const systemPath of getDirectoryStream(trashDirectory)) {
			await fse.remove(systemPath).catch((error) => {
				this.logger.error(`Failed to remove '${nodePath.basename(systemPath)}' from trash`, error)
				success = false
			})
		}
		for await (const systemPath of getDirectoryStream(this.trashMetaDirectory)) {
			await fse.remove(systemPath).catch((error) => {
				this.logger.error(`Failed to remove '${nodePath.basename(systemPath)}' from trash meta`, error)
				success = false
			})
		}

		return success
	}

	// Permanently delete a file or directory
	async delete(virtualPath: string) {
		// Check if operation is allowed
		const allowedOperations = await this.getAllowedOperations(virtualPath)
		if (!allowedOperations.includes('delete')) throw new Error('[operation-not-allowed]')

		// Get the system path
		const systemPath = await this.virtualToSystemPath(virtualPath)

		// Delete the file or directory
		try {
			await fse.remove(systemPath)
			return true
		} catch (error) {
			this.logger.error(`Failed to delete '${systemPath}'`, error)
			return false
		}
	}

	// Get allowed operations for a given path
	async getAllowedOperations(virtualPath: string): Promise<FileOperation[]> {
		// Phase 336 — a /Shared cross-user path's operations are DERIVED from the
		// nearest-ancestor ACL level (read → copy-out only; write → + mutation),
		// never the own-tree structural rules. Fail-safe []: no grant → no ops.
		if (this.#isSharedPath(virtualPath)) {
			return aclLevelToOperations(await this.#sharedLevel(this.#sharedInnerPath(virtualPath)))
		}

		// Get file status
		let isFile = false
		let isDirectory = false
		try {
			const file = await fse.lstat(await this.virtualToSystemPath(virtualPath))
			isFile = file.isFile()
			isDirectory = file.isDirectory()
		} catch {}

		// Start with all operations
		const operations = new Set(ALL_OPERATIONS)

		// Remove non-default operations
		operations.delete('restore')
		operations.delete('delete')
		operations.delete('favorite')
		operations.delete('unarchive')
		operations.delete('share')

		// Add file specific operations
		if (isFile) {
			if (this.archive.isUnarchiveable(virtualPath)) operations.add('unarchive')
		}

		// Add directory specific operations
		if (isDirectory) {
			operations.add('favorite')
			operations.add('share')
		}

		// Disable creating files in readonly directories
		const isReadonly =
			virtualPath === '/External' ||
			match(virtualPath, ['/Network', '/Network/*']) ||
			virtualPath === '/Backups' ||
			virtualPath.startsWith('/Backups/')
		if (isReadonly) operations.delete('writable')

		// Remove destructive operations if the path is protected
		// Note only the exact paths are protected, not necessarily the children.
		// e.g /Home/Downloads is protected but /Home/Downloads/file.txt is not.
		// Children could be protected with /Home/Downloads/**
		let isProtected = match(virtualPath, [
			'/*',
			'/Home/Downloads',
			'/External/*',
			'/Network/*',
			'/Network/*/*',
			// Phase 324-05: the per-remote cloud mount root (/Cloud/<remote>) is a
			// systemd-managed FUSE mount point — never rename/move/delete it (contents
			// stay writable). /Cloud itself is already covered by the '/*' rule above.
			'/Cloud/*',
			'/Backups',
			'/Backups/**',
		])

		// For /Apps/* paths, only protect if the app id is installed
		if (match(virtualPath, ['/Apps/*'])) {
			const appId = nodePath.basename(virtualPath)
			isProtected = await this.#livinityd.apps.isInstalled(appId)
		}

		if (isProtected) {
			operations.delete('move')
			operations.delete('rename')
			operations.delete('trash')
			operations.delete('delete')
		}

		// Unshareable paths
		const isUnshareable = match(virtualPath, [
			'/Apps',
			'/Apps/*',
			'/External',
			'/External/**',
			'/Network',
			'/Network/**',
			// Phase 324-05: cloud drives are per-user OAuth-scoped external mounts — the
			// LAN Samba share export is meaningless for them, same as /Network.
			'/Cloud',
			'/Cloud/**',
			'/Backups',
			'/Backups/**',
		])
		if (isUnshareable) operations.delete('share')

		// External files (not external root or top level mount points)
		const isExternal = match(virtualPath, ['/External/*/**'])
		const isNetwork = match(virtualPath, ['/Network/*/*/**'])
		// Phase 324-05: files INSIDE a cloud mount (/Cloud/<remote>/…) — hard-delete
		// only, never trash-to-internal across the FUSE boundary (same rule as
		// /External + /Network above).
		const isCloud = match(virtualPath, ['/Cloud/*/**'])
		if (isExternal || isNetwork || isCloud) {
			// Only allow hard delete so we don't copy to internal storage
			operations.delete('trash')
			operations.add('delete')
		}

		// Add trash specific operations
		const isTrash = match(virtualPath, ['/Trash/**'])
		if (isTrash) {
			operations.delete('unarchive')
			operations.delete('share')
			operations.delete('favorite')
			operations.delete('trash')
			operations.add('restore')
			operations.add('delete')
		}

		return Array.from(operations)
	}

	// Split the extension from the file name
	// Handles complex extensions like archive.tar.gz and file.txt.gz
	splitExtension(path: string) {
		// TODO: Handle complex extensions like .tar.gz
		let extension = nodePath.extname(path)
		let name = nodePath.basename(path)
		if (extension) name = name.slice(0, -extension.length)

		// Handle tar.* extensions
		const tar = '.tar'
		if (name.endsWith(tar)) {
			name = name.slice(0, -tar.length)
			extension = `${tar}${extension}`
		}

		return {name, extension}
	}

	// Get unique name for a file or directory
	// If the path doesn't exist we return the original path.
	// If the path exists we will append a number to the end of the file name
	// until we find a unique name.
	// Note that if two operations call this soon after each other with the
	// the same path before the first one has created the file at the unique path
	// it's possible that we will return the same "unique" name for both calls.
	// We could implement some kind of cache to avoid this but it's unlikely to be an issue.
	async getUniqueName(systemPath: string, {maxIndex = 100} = {}) {
		// TODO: Handle complex extensions like .tar.gz
		const {name, extension} = this.splitExtension(systemPath)
		const path = nodePath.dirname(systemPath)

		let index = 2
		let uniquePath = systemPath
		while (await fse.pathExists(uniquePath)) {
			if (index > maxIndex) throw new Error(`[unique-name-index-exceeded]`)
			uniquePath = nodePath.join(path, `${name} (${index})${extension ? extension : ''}`)
			index++
		}

		return uniquePath
	}

	// We expose an unsafe conversion method that's only suitable to be used on trusted paths.
	// This method is sync and doesn't touch the fs for validation which is important for some use cases
	// for internal code where we just need to convert between path types but don't want to validate anything.
	virtualToSystemPathUnsafe(virtualPath: string) {
		// Normalize virtual path before lookup so directory traversal attacks cannot be resolved.
		// e.g: /Home/../../../../etc/passwd normalizes to /etc/passwd which won't get a match in the base directories lookup.
		virtualPath = normalizePath(virtualPath)

		// Ensure the path is absolute, we can't resolve relative paths.
		// e.g /Home/file.pdf can be resolved but Home/file.pdf can't.
		if (!nodePath.posix.isAbsolute(virtualPath)) throw new Error(`[path-not-absolute]`)

		// Split the path into segments and lookup the system path for the base directory
		// Uses per-user directories for non-admin users via AsyncLocalStorage context.
		const segments = virtualPath.split('/').filter(Boolean)
		const baseDirs = this.getActiveBaseDirectories()
		const basePath = baseDirs.get(`/${segments[0]}`)

		// Error if we don't find a matching base directory
		if (!basePath) throw new Error(`[invalid-base] No valid base directory found for path: ${virtualPath}`)

		// Swap out the base directory with it's system path and resolve any symlinks
		// or directory traversals to get the real path.
		segments[0] = basePath
		const systemPath = segments.join('/')

		return systemPath
	}

	// ─── Phase 336 (ACLUI-01) — web /Shared cross-user ACL enforcement ──────────
	// A `/Shared/*` path is resolved through the ACL layer: a nearest-ancestor
	// grant (≥read) gates access, and the inner path resolves against the GLOBAL
	// base-dir namespace (the grants live there, Samba-consistent) with the SAME
	// realpath escapes-base containment. Own-tree paths never match #isSharedPath
	// so they skip all of this — the containment seam for the caller's own tree is
	// byte-unchanged (D-336-5, SC2).

	// True IFF this is a web /Shared nav path (exact root or a child). Normalizes
	// first so `/Shared/../Home` cannot masquerade as a shared path.
	#isSharedPath(virtualPath: string): boolean {
		const norm = normalizePath(virtualPath)
		return norm === SHARED_ROOT || norm.startsWith(`${SHARED_ROOT}/`)
	}

	// Strip the /Shared prefix → the grant-namespace inner path ('' for the root).
	#sharedInnerPath(virtualPath: string): string {
		const norm = normalizePath(virtualPath)
		if (norm === SHARED_ROOT) return ''
		return norm.slice(SHARED_ROOT.length) // e.g. /Shared/Home/foo → /Home/foo
	}

	// Nearest-ancestor effective ACL level for a /Shared inner path for the CURRENT
	// user. FAIL-SAFE null on no identity / unresolved userId / DB error.
	async #sharedLevel(
		innerPath: string,
		userInfo: FileUserInfo | undefined = fileUserContext.getStore(),
	): Promise<AclLevel | null> {
		if (!userInfo || !innerPath) return null
		let userId: string | null
		try {
			userId = (await findUserByUsername(userInfo.username))?.id ?? null
		} catch {
			return null
		}
		if (!userId) return null
		const uid = userId
		try {
			return await nearestAncestorAclLevel(innerPath, (p) => aclGetEffectiveLevel(p, uid))
		} catch {
			return null
		}
	}

	// Resolve a grant-namespace inner path against the GLOBAL base dirs, with the
	// realpath escapes-base containment. NO ACL check here (callers gate first).
	async #toGlobalSystemPath(innerPath: string): Promise<string> {
		const normalized = normalizePath(innerPath)
		if (!nodePath.posix.isAbsolute(normalized)) throw new Error('[path-not-absolute]')
		const segments = normalized.split('/').filter(Boolean)
		const basePath = this.baseDirectories.get(`/${segments[0]}`)
		if (!basePath) throw new Error(`[invalid-base] No valid base directory found for path: ${innerPath}`)
		segments[0] = basePath
		const systemPath = segments.join('/')
		const deepestExistingPath = await getDeepestExistingPath(systemPath)
		const deepestExistingRealPath = String(await fse.realpath(deepestExistingPath))
		const realPath = systemPath.replace(deepestExistingPath, deepestExistingRealPath)
		// Review INFO — exact-or-child-prefix (not a bare startsWith) so a sibling
		// base whose path is a string-prefix (e.g. /data/home vs /data/home-x)
		// can never be escaped into. Hardened here since this resolver is new.
		if (realPath !== basePath && !realPath.startsWith(`${basePath}/`)) {
			throw new Error(`[escapes-base] '${innerPath}' escapes '${basePath}'`)
		}
		return systemPath
	}

	// Full /Shared resolution: nearest-ancestor ≥read gate, then global-tree
	// resolution. Throws [acl-denied] on the root, no grant, none, or no identity.
	async #resolveSharedSystemPath(virtualPath: string): Promise<string> {
		const inner = this.#sharedInnerPath(virtualPath)
		if (inner === '' || inner === '/') throw new Error('[acl-denied] /Shared root has no system path')
		const level = await this.#sharedLevel(inner)
		if (level !== 'read' && level !== 'write') throw new Error(`[acl-denied] no grant for '${virtualPath}'`)
		return this.#toGlobalSystemPath(inner)
	}

	// Write-gate: a MUTATION on a /Shared path requires a nearest-ancestor WRITE
	// grant. No-op for own-tree paths (own-tree writes governed by the existing
	// ownership rules — zero regression). Called at the top of every mutating
	// Files method + the upload/save-text API routes (defense-in-depth alongside
	// the getAllowedOperations 'writable' gate).
	async assertSharedWritable(virtualPath: string): Promise<void> {
		if (!this.#isSharedPath(virtualPath)) return
		const level = await this.#sharedLevel(this.#sharedInnerPath(virtualPath))
		if (level !== 'write') throw new Error(`[acl-denied] read-only shared path '${virtualPath}'`)
	}

	// Build a File entry for a /Shared item — a self-contained status() that tags
	// the entry with its /Shared virtual path + the ACL-derived operation set
	// (NOT the own-tree structural rules). Never calls systemToVirtualPath (which
	// is own-tree-scoped and would mis-map a global system path).
	async #sharedFileEntry(systemPath: string, virtualPath: string, operations: FileOperation[]): Promise<File> {
		const stats = await fse.lstat(systemPath)
		const name = nodePath.basename(virtualPath)
		let type: string
		if (stats.isDirectory()) type = 'directory'
		else if (stats.isSymbolicLink()) type = 'symbolic-link'
		else type = mime.lookup(name) || 'application/octet-stream'
		const thumbnail = await this.thumbnails.getExistingThumbnail(systemPath).catch(() => undefined)
		return {
			name,
			path: virtualPath,
			type,
			size: type === 'directory' ? 0 : stats.size,
			modified: stats.mtime.getTime(),
			operations,
			thumbnail,
		}
	}

	// The /Shared root listing: one entry per DISTINCT granted path (SC3 — only
	// the exact grants, never their ungranted siblings). FAIL-SAFE empty on no
	// identity / no DB.
	async #listSharedRoot(userInfo: FileUserInfo | undefined): Promise<DirectoryListing> {
		const empty: DirectoryListing = {
			name: 'Shared',
			path: SHARED_ROOT,
			type: 'directory',
			size: 0,
			modified: 0,
			operations: [],
			files: [],
		}
		if (!userInfo) return empty
		let userId: string | null
		try {
			userId = (await findUserByUsername(userInfo.username))?.id ?? null
		} catch {
			return empty
		}
		if (!userId) return empty
		const granted = await listGrantedPathsForUser(userId).catch(() => [])
		const files: File[] = []
		for (const g of granted) {
			const sharedVirtual = `${SHARED_ROOT}${g.virtualPath}` // /Shared/Home/foo
			try {
				const systemPath = await this.#toGlobalSystemPath(g.virtualPath)
				files.push(await this.#sharedFileEntry(systemPath, sharedVirtual, aclLevelToOperations(g.level)))
			} catch {
				// A grant whose target no longer exists / can't resolve is skipped.
			}
		}
		return {...empty, files}
	}

	// List a /Shared path: the synthetic root, or a directory inside a granted
	// folder (children tagged with /Shared paths + the folder's effective-level
	// ops). Throws [acl-denied] when the caller lacks a live grant.
	async #listShared(virtualPath: string): Promise<DirectoryListing> {
		const userInfo = fileUserContext.getStore()
		if (this.#sharedInnerPath(virtualPath) === '') return this.#listSharedRoot(userInfo)

		const inner = this.#sharedInnerPath(virtualPath)
		// Resolve the acting userId ONCE (avoid a per-child findUserByUsername).
		let userId: string | null = null
		if (userInfo) {
			try {
				userId = (await findUserByUsername(userInfo.username))?.id ?? null
			} catch {
				userId = null
			}
		}
		if (!userId) throw new Error(`[acl-denied] no grant for '${virtualPath}'`)
		const uid = userId

		const level = await nearestAncestorAclLevel(inner, (p) => aclGetEffectiveLevel(p, uid)).catch(() => null)
		if (level !== 'read' && level !== 'write') throw new Error(`[acl-denied] no grant for '${virtualPath}'`)
		const systemPath = await this.#toGlobalSystemPath(inner)
		const folderOperations = aclLevelToOperations(level)
		const base = normalizePath(virtualPath).replace(/\/$/, '')

		const files: File[] = []
		let truncatedAt: number | undefined
		let count = 0
		for await (const childSystemPath of getDirectoryStream(systemPath)) {
			const name = nodePath.basename(childSystemPath)
			if (this.isHidden(name)) continue
			// Review W2 — a child MAY carry its OWN explicit grant. Check the child's
			// EXACT level (one indexed query): an explicit `none` HIDES it (honor the
			// deny-override intent — no name disclosure); an explicit read/write tags
			// the child with its OWN ops; no own grant → inherit the folder's ops.
			const childInner = `${inner.replace(/\/$/, '')}/${name}`
			const exact = await aclGetEffectiveLevel(childInner, uid).catch(() => null)
			if (exact === 'none') continue // explicitly denied → do not surface
			const operations = exact ? aclLevelToOperations(exact) : folderOperations
			const entry = await this.#sharedFileEntry(childSystemPath, `${base}/${name}`, operations).catch(() => undefined)
			if (entry) files.push(entry)
			if (++count >= this.maxDirectoryListing) {
				truncatedAt = this.maxDirectoryListing
				break
			}
		}
		const self = await this.#sharedFileEntry(systemPath, base, folderOperations)
		return {...self, files, truncatedAt}
	}

	// Converts a virtual path to a system path.
	// Ensures that the path is safe and does not escape the expected base directory.
	// If the full path doesn't exist it validates symlinks up to the deepest existing path.
	async virtualToSystemPath(virtualPath: string) {
		// Phase 336 — a web /Shared cross-user path resolves through the ACL layer.
		// Own-tree paths (never starting with /Shared) fall through unchanged.
		if (this.#isSharedPath(virtualPath)) return this.#resolveSharedSystemPath(virtualPath)

		// Split the path into segments and lookup the system path for the base directory
		// Uses per-user directories for non-admin users via AsyncLocalStorage context.
		const segments = virtualPath.split('/').filter(Boolean)
		const baseDirs = this.getActiveBaseDirectories()
		const basePath = baseDirs.get(`/${segments[0]}`)!

		const systemPath = this.virtualToSystemPathUnsafe(virtualPath)

		// Ensure the deepest existing real path doesn't resolve to a directory outside
		// of the expected base path. We use realpath to resolve symlinks. This prevents
		// escaping the base directory if a symlink is in the path.
		// e.g:
		// /Home/symlink-to-root/etc/passwd
		const deepestExistingPath = await getDeepestExistingPath(systemPath)
		const deepestExistingRealPath = await fse.realpath(deepestExistingPath)
		const realPath = systemPath.replace(deepestExistingPath, deepestExistingRealPath)
		if (!realPath.startsWith(basePath)) throw new Error(`[escapes-base] '${virtualPath}' escapes '${basePath}'`)

		// We return the system path not the real path because at this point we know
		// the path is safe and we want to return the path as it was passed in.
		// Otherwise we'd resolve symlinks in the path and weird stuff would happen
		// like copying a symlink to a file resulting in copying the file instead of the symlink.
		// e.g:
		// /Home/symlink-to-documents
		// would resolve to system path for /Home/Documents not the actual symlink path.
		return systemPath
	}

	// Converts a system path to a virtual path.
	// Ensures that the path is safe and does not escape the expected base directory.
	systemToVirtualPath(systemPath: string) {
		// Normalize the system path to handle any directory traversals
		systemPath = normalizePath(systemPath)

		// Find the base directory this path belongs to by checking if it starts with any of the base paths
		// Uses per-user directories for non-admin users via AsyncLocalStorage context.
		const baseDirs = this.getActiveBaseDirectories()
		for (const [baseDirectory, basePath] of baseDirs) {
			if (systemPath.startsWith(basePath)) {
				// Replace the system base path with the virtual base directory name
				const virtualPath = systemPath.replace(basePath, baseDirectory)
				// Normalize to handle any remaining path oddities
				return normalizePath(virtualPath)
			}
		}

		throw new Error(`[invalid-path] Path '${systemPath}' is not within any base directory`)
	}

	// Get view preferences
	async getViewPreferences(): Promise<ViewPreferences> {
		const viewPreferences = await this.#livinityd.store.get('files.preferences')
		return viewPreferences || DEFAULT_VIEW_PREFERENCES
	}

	// Update view preferences
	async updateViewPreferences(newViewPreferences: Partial<ViewPreferences>): Promise<ViewPreferences> {
		let updatedViewPreferences: ViewPreferences

		// Save the new preferences to the store
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const currentViewPreferences = await this.getViewPreferences()
			updatedViewPreferences = {...currentViewPreferences, ...newViewPreferences}
			await set('files.preferences', updatedViewPreferences)
		})

		return updatedViewPreferences!
	}
}

// Match a path against a list of glob patterns
function match(path: string, patterns: string[]) {
	// TODO: Cache Regex creation if perf becomes an issue
	return patterns.some((pattern) => minimatch(path, pattern, {dot: true}))
}

// Resolve traversals and always trim trailing trash
function normalizePath(path: string) {
	// Reduce `.`, `..` and multiple slashes to their canonical form
	const normalized = nodePath.posix.normalize(path)

	// Trim trailing slash, except for the root directory
	if (normalized === '/') return normalized
	return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

// Given a file path will return the deepest existing path.
async function getDeepestExistingPath(path: string) {
	// Resolve the input to an absolute path
	let currentPath = nodePath.resolve(path)

	while (true) {
		// Check if the current path exists
		if (await fse.pathExists(currentPath)) return currentPath

		// Move up one level in the path hierarchy
		const parentPath = nodePath.dirname(currentPath)

		// If we're at the root and it doesn't exist, throw an error cos
		// something really bad has happened and we're gonna infinite loop.
		if (parentPath === currentPath) throw new Error(`[cant-find-root] Can't validate path if entire tree doesn't exist`)

		currentPath = parentPath
	}
}

// Wrap with our own method with nicer error handling
async function move(sourceSystemPath: string, targetSystemPath: string, {overwrite = false} = {}) {
	return fse.move(sourceSystemPath, targetSystemPath, {overwrite}).catch((error) => {
		const message = error?.message || ''
		if (message.includes('ENOENT')) throw new Error('[source-not-exists]')
		if (message.includes('dest already exists')) throw new Error('[destination-already-exists]')
		if (message.includes('subdirectory of itself')) throw new Error('[subdir-of-self]')
		throw new Error(`[move-failed] ${error?.message}`)
	})
}

// Stream the contents of a directory
// Optionally recurse into subdirectories
export async function* getDirectoryStream(directory: string, options?: {recursive?: boolean}) {
	// We have to use any here because @tsconfig/node22 types are incorrect and don't recognise options.recursive
	const directoryListing = await fse.opendir(directory, options as any)
	try {
		// Again we need any due to incorrect types
		for await (const file of directoryListing) yield nodePath.join((file as any).parentPath, file.name)
	} finally {
		// Ensure the directory is closed if we error
		directoryListing.close().catch(() => {})
	}
}
