import {router, privateProcedure, publicProcedureWhenNoUserExists} from '../server/trpc/trpc.js'

import {
	findExternalLivinityInstall,
	runPreMigrationChecks,
	migrateData,
	getMigrationStatus,
	unmountExternalDrives,
} from './migration.js'
import isLivinityHome from '../is-livinity-home.js'

export default router({
	isLivinityHome: privateProcedure.query(() => isLivinityHome()),
	// TODO: Implement
	isMigratingFromLivinityHome: privateProcedure.query(() => false),

	canMigrate: privateProcedure.query(async ({ctx}) => {
		const currentInstall = ctx.livinityd.dataDirectory
		const externalLivinityInstall = await findExternalLivinityInstall()
		await runPreMigrationChecks(currentInstall, externalLivinityInstall as string, ctx.livinityd)
		await unmountExternalDrives()

		return true
	}),

	// TODO: Refactor this into a subscription
	migrationStatus: publicProcedureWhenNoUserExists.query(() => getMigrationStatus()),

	migrate: privateProcedure.mutation(async ({ctx}) => {
		const currentInstall = ctx.livinityd.dataDirectory
		const externalLivinityInstall = await findExternalLivinityInstall()
		await runPreMigrationChecks(currentInstall, externalLivinityInstall as string, ctx.livinityd)

		void migrateData(currentInstall, externalLivinityInstall as string, ctx.livinityd)

		return true
	}),
})
