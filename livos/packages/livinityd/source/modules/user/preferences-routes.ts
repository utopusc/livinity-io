import {z} from 'zod'

import {router, privateProcedure} from '../server/trpc/trpc.js'
import {
	setUserPreference,
	getUserPreferences,
	deleteUserPreference,
} from '../database/index.js'

export default router({
	// Get all preferences for the current user
	getAll: privateProcedure.query(async ({ctx}) => {
		if (!ctx.currentUser) return {}
		return getUserPreferences(ctx.currentUser.id)
	}),

	// Get specific preferences by key names
	get: privateProcedure
		.input(
			z.object({
				keys: z.array(z.string()),
			}),
		)
		.query(async ({ctx, input}) => {
			if (!ctx.currentUser) return {}
			return getUserPreferences(ctx.currentUser.id, input.keys)
		}),

	// Set a single preference
	set: privateProcedure
		.input(
			z.object({
				key: z.string(),
				value: z.any(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) return true
			await setUserPreference(ctx.currentUser.id, input.key, input.value)
			return true
		}),

	// Delete a single preference
	delete: privateProcedure
		.input(
			z.object({
				key: z.string(),
			}),
		)
		.mutation(async ({ctx, input}) => {
			if (!ctx.currentUser) return true
			await deleteUserPreference(ctx.currentUser.id, input.key)
			return true
		}),
})
