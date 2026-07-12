import z from 'zod'

import {router, privateProcedure, adminProcedure, adminProcedureWhenNoUserExists, publicProcedureWhenNoUserExists} from '../server/trpc/trpc.js'

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

		// Only return properties we want to expose
		return repositories.map(({id, path, lastBackup}) => ({id, path, lastBackup}))
	}),

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
})
