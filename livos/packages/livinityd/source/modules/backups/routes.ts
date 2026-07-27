import z from 'zod'

import {router, privateProcedure, adminProcedure, adminProcedureWhenNoUserExists, publicProcedureWhenNoUserExists} from '../server/trpc/trpc.js'
import {isRealDestination} from './destination-policy.js'
import {SAFETY_INTERVAL_OPTIONS, SAFETY_RETENTION_OPTIONS} from './safety-snapshots.js'

// Backups-v2 P0 (D10): management procedures are ADMIN-gated — previously
// every one of these was open to any authenticated user, including a full-box
// restore + reboot. The onboarding-restore set (listBackups,
// connectToExistingRepository, restoreBackup) stays usable on a fresh box via
// adminProcedureWhenNoUserExists (open ONLY while no user exists yet);
// restoreStatus stays fully public-when-no-user because the restore cover
// polls it before login. getRepositories and backupProgress stay
// authenticated-but-not-admin: the notifications dialog (all users) resolves
// repo names, and the floating island shows progress — both read-only,
// passwords never exposed.
export default router({
	// Get all backup repositories
	getRepositories: privateProcedure.query(async ({ctx}) => {
		const repositories = await ctx.livinityd.backups.getRepositories()

		// Only return properties we want to expose (passwords never leave the store).
		// Phase 368.5 BKP-16: isSafety is exposed so the UI can exclude the safety
		// repo from destination counts.
		// Phase 368.6 (D5): `kind` and `offSystemDisk` join it, plus a SERVER-DERIVED
		// `isRealDestination` so no UI surface re-implements the rule — twelve of them
		// count or render destinations, and a rule copied twelve times is a rule that
		// will disagree with itself. `systemPath` is deliberately NOT exposed: this is
		// privateProcedure (every authenticated user, not just admins), and it is the
		// only field that can now name a raw host path.
		return repositories.map(({id, path, lastBackup, isSafety, kind, offSystemDisk}) => ({
			id,
			path,
			lastBackup,
			isSafety,
			kind,
			offSystemDisk,
			isRealDestination: isRealDestination({isSafety, offSystemDisk}),
		}))
	}),

	// Phase 368.6 (D9) — the destination roots this box can actually accept.
	// adminProcedure: the widened set (storage pool, system-disk folder) is
	// admin-only, exactly like createRepository, so the wizard that offers them is
	// gated the same way as the call that consumes them.
	getDestinationRoots: adminProcedure.query(async ({ctx}) => ctx.livinityd!.backups.getDestinationRoots()),

	// Get size of a repository
	getRepositorySize: adminProcedure
		.input(z.object({repositoryId: z.string()}))
		.query(async ({ctx, input}) => ctx.livinityd.backups.getRepositorySize(input.repositoryId)),

	// Create a new backup repository
	createRepository: adminProcedure
		.input(z.object({path: z.string(), password: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.createRepository(input.path, input.password)),

	// Forget a repository
	forgetRepository: adminProcedure
		.input(z.object({repositoryId: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.forgetRepository(input.repositoryId)),

	// Do a backup right now
	backup: adminProcedure
		.input(z.object({repositoryId: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.backup(input.repositoryId)),

	// List backups for a repository
	listBackups: adminProcedureWhenNoUserExists
		.input(z.object({repositoryId: z.string()}))
		.query(async ({ctx, input}) => ctx.livinityd.backups.listBackups(input.repositoryId)),

	// List all backups for all repositories
	listAllBackups: adminProcedure.query(async ({ctx}) => ctx.livinityd.backups.listAllBackups()),

	// List files in a backup
	// Only really used for testing and debug
	listBackupFiles: adminProcedure
		.input(
			z.object({
				backupId: z.string(),
				path: z.string().optional(),
			}),
		)
		.query(async ({ctx, input}) => ctx.livinityd.backups.listBackupFiles(input.backupId, input.path)),

	// Mount a backup
	mountBackup: adminProcedure
		.input(z.object({backupId: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.mountBackup(input.backupId)),

	// Unmount a backup
	unmountBackup: adminProcedure
		.input(z.object({directoryName: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.unmountBackup(input.directoryName)),

	// Get progress of backup operations
	backupProgress: privateProcedure.query(async ({ctx}) => ctx.livinityd.backups.backupsInProgress),

	// Backups-v2 P0: live kopia engine preflight — the Settings card renders
	// engine-unavailable RED from this instead of the module failing silently.
	engineStatus: privateProcedure.query(async ({ctx}) => ctx.livinityd!.backups.checkEngine()),

	// Get the backup scope (which out-of-tree stores to include).
	// ctx.livinityd! — privateProcedure guarantees it at runtime; the `!` keeps
	// these two new handlers off the router's known ctx-partial tsc baseline.
	getBackupScope: adminProcedure.query(async ({ctx}) => ctx.livinityd!.backups.getBackupScope()),

	// Set the backup scope
	setBackupScope: adminProcedure
		.input(
			z.object({
				systemDatabase: z.boolean().optional(),
				livAssistantData: z.boolean().optional(),
			}),
		)
		.mutation(async ({ctx, input}) => ctx.livinityd!.backups.setBackupScope(input)),

	// Get ignored paths
	getIgnoredPaths: adminProcedure.query(async ({ctx}) => ctx.livinityd.backups.getIgnoredPaths()),

	// Add an ignored path
	addIgnoredPath: adminProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.addIgnoredPath(input.path)),

	// Remove an ignored path
	removeIgnoredPath: adminProcedure
		.input(z.object({path: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.removeIgnoredPath(input.path)),

	// Connect to an existing repository
	connectToExistingRepository: adminProcedureWhenNoUserExists
		.input(z.object({path: z.string(), password: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.connectToExistingRepository(input.path, input.password)),

	// Restore a backup
	restoreBackup: adminProcedureWhenNoUserExists
		.input(z.object({backupId: z.string()}))
		.mutation(async ({ctx, input}) => ctx.livinityd.backups.restoreBackup(input.backupId)),

	// Get status of restore operations
	restoreStatus: publicProcedureWhenNoUserExists.query(async ({ctx}) => ctx.livinityd.backups.restoreStatus),

	// Phase 368.5 BKP-16 — Safety Snapshots opt-out. adminProcedure (D10 posture:
	// management surface, audit-logged). Enabling re-runs the internal ensure path
	// so a re-enable takes effect without a reboot.
	// IN-05 note: `ctx.livinityd!` is INTENTIONAL here (same as engineStatus/
	// getBackupScope above) — the bare `ctx.livinityd` idiom used by the older
	// procedures produces a TS18048 per call site that sits in the accepted tsc
	// baseline; new handlers use `!` so they don't grow that baseline. Runtime is
	// guaranteed by the procedure middleware either way.
	getSafetySnapshotsEnabled: adminProcedure.query(async ({ctx}) => ctx.livinityd!.backups.getSafetySnapshotsEnabled()),

	setSafetySnapshotsEnabled: adminProcedure
		.input(z.object({enabled: z.boolean()}))
		.mutation(async ({ctx, input}) => ctx.livinityd!.backups.setSafetySnapshotsEnabled(input.enabled)),

	// Phase 368.8 SAFE-02 (OP-01) — safety-only cadence. z.enum over the exported
	// constant so the wire contract can never drift from the scheduler's own option
	// set. `ctx.livinityd!` per the IN-05 note above — new handlers must not grow the
	// 385-error tsc baseline.
	getSafetySnapshotInterval: adminProcedure.query(async ({ctx}) => ctx.livinityd!.backups.getSafetySnapshotInterval()),

	setSafetySnapshotInterval: adminProcedure
		.input(z.object({interval: z.enum(SAFETY_INTERVAL_OPTIONS)}))
		.mutation(async ({ctx, input}) => ctx.livinityd!.backups.setSafetySnapshotInterval(input.interval)),

	// Phase 368.8-22 — how many safety snapshots to keep. Same shape and the same
	// z.enum-over-the-exported-constant discipline as the interval pair above.
	getSafetySnapshotRetention: adminProcedure.query(async ({ctx}) =>
		ctx.livinityd!.backups.getSafetySnapshotRetention(),
	),

	setSafetySnapshotRetention: adminProcedure
		.input(z.object({retention: z.enum(SAFETY_RETENTION_OPTIONS)}))
		.mutation(async ({ctx, input}) => ctx.livinityd!.backups.setSafetySnapshotRetention(input.retention)),
})
