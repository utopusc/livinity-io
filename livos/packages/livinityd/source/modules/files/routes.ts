import z from 'zod'

import {router, adminProcedure, privateProcedure, publicProcedureWhenNoUserExists} from '../server/trpc/trpc.js'
import {fileUserContext, type FileUserInfo, type SearchResultFile} from './files.js'

// Helper to run file operations within the user's file context
function withFileUser<T>(ctx: {currentUser?: {username: string; role: string}}, fn: () => Promise<T>): Promise<T> {
	const userInfo: FileUserInfo | undefined = ctx.currentUser
		? {username: ctx.currentUser.username, role: ctx.currentUser.role as FileUserInfo['role']}
		: undefined
	return fileUserContext.run(userInfo, fn)
}

// Phase 339 STORD-01 — the quota'd folder's VIRTUAL path. Absolute (leading `/`),
// restricted charset (allows spaces in folder names), and NO `..` segment (mirrors
// cryptoPathSchema, system/routes.ts:721, for defense-in-depth). An unresolvable path
// is harmless — the scan/gate simply no-op it — so no virtualToSystemPath check here.
const folderQuotaPathSchema = z
	.string()
	.min(1)
	.max(1024)
	.regex(/^\/[A-Za-z0-9 ._/-]+$/, 'must be an absolute virtual path (restricted charset)')
	.refine((p) => !p.split('/').includes('..'), 'path traversal (..) is not allowed')

export default router({
	// List a directory
	list: publicProcedureWhenNoUserExists
		.input(
			z.object({
				path: z.string(),
				sortBy: z.enum(['name', 'type', 'modified', 'size']).default('name'),
				sortOrder: z.enum(['ascending', 'descending']).default('ascending'),
				lastFile: z.string().optional(),
				limit: z.number().positive().default(100),
			}),
		)
		.query(async ({ctx, input}) => {
			const directoryListing = await withFileUser(ctx, () => ctx.livinityd.files.list(input.path))
			const totalFiles = directoryListing.files.length

			// Sort the files
			// Ensure numeric sort falls back to text sort if the numeric values are equal.
			// This is to ensure deterministic ordering in the case where multiple files have
			// the same size/date. If ordering becomes non-deterministic then pagination can break.
			// We enable numeric sorting by name, e.g. 1.txt, 2.txt, 10.txt
			const textSort = new Intl.Collator('en-US', {numeric: true})
			directoryListing.files.sort((fileA, fileB) => {
				const a = fileA[input.sortBy]
				const b = fileB[input.sortBy]
				if (typeof a === 'string' && typeof b === 'string') return textSort.compare(a, b)
				if (typeof a === 'number' && typeof b === 'number') return a - b || textSort.compare(fileA.name, fileB.name)
				return 0
			})

			// Handle sort order
			if (input.sortOrder === 'descending') directoryListing.files.reverse()

			// Paginate using cursor-style pagination with `lastFile` as the cursor.
			// Unlike offset-based pagination, this ensures consistent results even if files are added, removed, or renamed, etc.
			// as it starts after the last seen file rather than relying on fixed indices.
			let startIndex = 0
			if (input.lastFile) {
				const lastFileIndex = directoryListing.files.findIndex((file) => file.name === input.lastFile)
				// If lastFile found, start after it; otherwise start from beginning
				startIndex = lastFileIndex !== -1 ? lastFileIndex + 1 : 0
			}

			// Get the paginated files
			const paginatedFiles = directoryListing.files.slice(startIndex, startIndex + input.limit)

			// Determine if there are more files after this batch
			const hasMore = startIndex + input.limit < totalFiles

			return {
				...directoryListing,
				// overwrite the files with the paginated files
				files: paginatedFiles,
				totalFiles,
				hasMore,
			}
		}),

	// Create a directory
	createDirectory: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.createDirectory(input.path))),

	// Copy a file or directory
	copy: privateProcedure
		.input(
			z.object({
				path: z.string(),
				toDirectory: z.string(),
				collision: z.enum(['error', 'keep-both', 'replace']).default('error'),
			}),
		)
		.mutation(async ({ctx, input}) =>
			withFileUser(ctx, () => ctx.livinityd.files.copy(input.path, input.toDirectory, {collision: input.collision})),
		),

	// Move a file or directory
	move: privateProcedure
		.input(
			z.object({
				path: z.string(),
				toDirectory: z.string(),
				collision: z.enum(['error', 'keep-both', 'replace']).default('error'),
			}),
		)
		.mutation(async ({ctx, input}) =>
			withFileUser(ctx, () => ctx.livinityd.files.move(input.path, input.toDirectory, {collision: input.collision})),
		),

	// Get progress of file operations
	operationProgress: privateProcedure.query(async ({ctx}) => ctx.livinityd.files.operationsInProgress),

	// Rename a file or directory
	rename: privateProcedure
		.input(z.object({path: z.string(), newName: z.string().nonempty()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.rename(input.path, input.newName))),

	// Trash a file or directory
	trash: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.trash(input.path))),

	// Restore a file or directory from the trash
	restore: privateProcedure
		.input(z.object({path: z.string(), collision: z.enum(['error', 'keep-both', 'replace']).default('error')}))
		.mutation(async ({ctx, input}) =>
			withFileUser(ctx, () => ctx.livinityd.files.restore(input.path, {collision: input.collision})),
		),

	// Empty the trash
	emptyTrash: privateProcedure.mutation(async ({ctx}) => withFileUser(ctx, () => ctx.livinityd.files.emptyTrash())),

	// Permanently delete a file or directory
	delete: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.delete(input.path))),

	// Get favorites
	favorites: privateProcedure.query(async ({ctx}) => withFileUser(ctx, () => ctx.livinityd.files.favorites.listFavorites())),

	// Add a favorite
	addFavorite: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.favorites.addFavorite(input.path))),

	// Remove a favorite
	removeFavorite: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.favorites.removeFavorite(input.path))),

	// Get recent files
	recents: privateProcedure.query(async ({ctx}) => withFileUser(ctx, () => ctx.livinityd.files.recents.get())),

	// Get view preferences
	// Public only when no user exists for onboarding restore flow (returns defaults); private once a user exists
	viewPreferences: publicProcedureWhenNoUserExists.query(async ({ctx}) => ctx.livinityd.files.getViewPreferences()),

	// Update view preferences
	updateViewPreferences: privateProcedure
		.input(
			z.object({
				view: z.enum(['icons', 'list']).optional(),
				sortBy: z.enum(['name', 'type', 'modified', 'size']).optional(),
				sortOrder: z.enum(['ascending', 'descending']).optional(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.livinityd.files.updateViewPreferences(input)),

	// Create a zip archive
	archive: privateProcedure
		.input(z.object({paths: z.array(z.string()).min(1)}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.archive.archive(input.paths))),

	// Unarchive a file
	unarchive: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.archive.unarchive(input.path))),

	// Get/generate a thumbnail for a file on demand
	getThumbnail: privateProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) =>
			withFileUser(ctx, () => ctx.livinityd.files.thumbnails.getThumbnailOnDemand(input.path)),
		),

	// Get the share password
	// LIVOS-056 (262-04): adminProcedure — leaks the 128-char Samba secret;
	// server-side gate required (reachable from the Files app, not just Settings).
	sharePassword: adminProcedure.query(async ({ctx}) => ctx.livinityd.files.samba.getSharePassword()),

	// Get shares
	shares: privateProcedure.query(async ({ctx}) => withFileUser(ctx, () => ctx.livinityd.files.samba.listShares())),

	// Share a directory
	// LIVOS-056 (262-04): adminProcedure — host storage management is admin-only
	// server-side (the existing getAllowedOperations check is a path check, not a role check).
	addShare: adminProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.samba.addShare(input.path))),

	// Remove a share
	removeShare: adminProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => withFileUser(ctx, () => ctx.livinityd.files.samba.removeShare(input.path))),

	// Format an external device
	// LIVOS-050 (262-04): adminProcedure + deviceId is re-validated server-side in
	// external-storage.ts (strict regex + USB-only external-set membership) before
	// any destructive sgdisk/wipefs/parted/mkfs command.
	formatExternalDevice: adminProcedure
		.input(
			z.object({
				deviceId: z.string(),
				filesystem: z.enum(['ext4', 'exfat']),
				label: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.livinityd.files.externalStorage.formatExternalDevice(input)),

	// Get external storage devices
	externalDevices: publicProcedureWhenNoUserExists.query(async ({ctx}) =>
		ctx.livinityd.files.externalStorage.getExternalDevicesWithVirtualMountPoints(),
	),

	// Unmount an external device
	// LIVOS-056 (262-04): adminProcedure — hard-ejects the kernel block device
	// (/sys/block/<id>/device/delete), mid-write data loss for other users.
	unmountExternalDevice: adminProcedure
		.input(z.object({deviceId: z.string()}))
		.mutation(async ({ctx, input}) =>
			ctx.livinityd.files.externalStorage.unmountExternalDevice(input.deviceId, {remove: true}),
		),

	// Check if an external drive is connected on non-Livinity Home hardware
	isExternalDeviceConnectedOnUnsupportedDevice: privateProcedure.query(({ctx}) =>
		ctx.livinityd.files.externalStorage.isExternalDeviceConnectedOnUnsupportedDevice(),
	),

	// Search for a file. `mode` is additive: omitted ⇒ 'filename' ⇒ byte-identical to the
	// original basename-fuzzy search. 'content' runs the 337-01 full-text engine over the
	// caller's own /Home tree (bounded + single-flight).
	search: privateProcedure
		.input(
			z.object({
				query: z.string(),
				maxResults: z.number().positive().max(1000).default(250).optional(),
				mode: z.enum(['filename', 'content']).default('filename'),
			}),
		)
		.query(async ({ctx, input}): Promise<SearchResultFile[]> =>
			withFileUser(ctx, () => {
				const {files} = ctx.livinityd
				return input.mode === 'content'
					? files.searchFileContent(input.query, input.maxResults)
					: files.search.search(input.query, input.maxResults)
			}),
		),

	// List network shares
	listNetworkShares: publicProcedureWhenNoUserExists.query(async ({ctx}) =>
		ctx.livinityd.files.networkStorage.getShareInfo(),
	),

	// Add a network share
	// LIVOS-051 (262-04): adminProcedure (was publicProcedureWhenNoUserExists —
	// unauthenticated during the pre-onboarding window). Inputs are additionally
	// charset/SSRF-validated in network-storage.ts before any mount side effect.
	addNetworkShare: adminProcedure
		.input(
			z.object({
				host: z.string(),
				share: z.string(),
				username: z.string(),
				password: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.livinityd.files.networkStorage.addShare(input)),

	// Remove a network share
	// LIVOS-056 (262-04): adminProcedure — host storage management is admin-only.
	removeNetworkShare: adminProcedure
		.input(z.object({mountPath: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.files.networkStorage.removeShare(input.mountPath)),

	// Discover available network share servers
	discoverNetworkShareServers: publicProcedureWhenNoUserExists.query(async ({ctx}) =>
		ctx.livinityd.files.networkStorage.discoverServers(),
	),

	// Discover shares for a given samba server
	// LIVOS-051 (262-04): adminProcedure — this is an SSRF probe primitive
	// (smbclient --list //<host>); was unauthenticated pre-onboarding.
	discoverNetworkSharesOnServer: adminProcedure
		.input(z.object({host: z.string(), username: z.string(), password: z.string()}))
		.query(async ({ctx, input}) =>
			ctx.livinityd.files.networkStorage.discoverSharesOnServer(input.host, input.username, input.password),
		),

	// Checks if the given network address is an Livinity device
	isServerAnLivinityDevice: privateProcedure
		.input(z.object({address: z.string()}))
		.query(async ({ctx, input}) => ctx.livinityd.files.networkStorage.isServerAnLivinityDevice(input.address)),

	// Phase 339 STORD-01 (D-339-1) — per-folder quota config + scan cache. adminProcedure
	// (host storage management is admin-only, same as addShare/formatExternalDevice); these
	// are non-destructive config writes so NO 334 step-up (no data loss).
	//
	// List the folder-quota rows (config + cached usage) for the Storage UI usage bars.
	folderQuotaList: adminProcedure.query(async ({ctx}) => (await ctx.livinityd!.store.get('folderQuotas').catch(() => [])) ?? []),

	// Upsert a folder cap by virtualPath, preserving any existing scan cache
	// (usageBytes/scannedAt) across a config edit (333-review F1 own-only pattern).
	// limitBytes 0 = clear the effective cap (matches the user-quota <=0 unlimited rule).
	folderQuotaSet: adminProcedure
		.input(
			z.object({
				virtualPath: folderQuotaPathSchema,
				limitBytes: z.number().int().nonnegative(),
				hardBlock: z.boolean(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd!.store.getWriteLock(async ({get, set}) => {
				const current = (await get('folderQuotas')) ?? []
				const existing = current.find((entry) => entry.virtualPath === input.virtualPath)
				const others = current.filter((entry) => entry.virtualPath !== input.virtualPath)
				await set('folderQuotas', [
					...others,
					{
						virtualPath: input.virtualPath,
						limitBytes: input.limitBytes,
						hardBlock: input.hardBlock,
						usageBytes: existing?.usageBytes,
						scannedAt: existing?.scannedAt,
					},
				])
			})
			return {success: true}
		}),

	// Remove a folder cap + clear any lingering target-qualified bell for it.
	folderQuotaRemove: adminProcedure
		.input(z.object({virtualPath: folderQuotaPathSchema}))
		.mutation(async ({ctx, input}) => {
			await ctx.livinityd!.store.getWriteLock(async ({get, set}) => {
				const current = (await get('folderQuotas')) ?? []
				await set(
					'folderQuotas',
					current.filter((entry) => entry.virtualPath !== input.virtualPath),
				)
			})
			await ctx.livinityd!.notifications.clear('folder-quota-exceeded:' + input.virtualPath).catch(() => {})
			return {success: true}
		}),
})
