import {z} from 'zod'
import {router, privateProcedure} from '../server/trpc/trpc.js'

const REDIS_PREFIX = 'livos:platform:'

const platform = router({
	getStatus: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [status, url, apiKey] = await Promise.all([
			redis.get(`${REDIS_PREFIX}status`),
			redis.get(`${REDIS_PREFIX}url`),
			redis.get(`${REDIS_PREFIX}api_key`),
		])
		return {
			status: status ?? 'idle',
			url: url ?? null,
			hasApiKey: !!apiKey,
			apiKeyPrefix: apiKey ? apiKey.substring(0, 14) : null,
		}
	}),

	setApiKey: privateProcedure
		.input(z.object({apiKey: z.string().min(10)}))
		.mutation(async ({ctx, input}) => {
			const redis = ctx.livinityd.ai.redis
			await redis.set(`${REDIS_PREFIX}api_key`, input.apiKey)
			await redis.set(`${REDIS_PREFIX}enabled`, '1')
			await ctx.livinityd.tunnelClient.connect()
			return {success: true, status: 'connecting'}
		}),

	disconnect: privateProcedure.mutation(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		await ctx.livinityd.tunnelClient.disconnect()
		await redis.del(`${REDIS_PREFIX}api_key`)
		await redis.del(`${REDIS_PREFIX}enabled`)
		await redis.del(`${REDIS_PREFIX}status`)
		await redis.del(`${REDIS_PREFIX}url`)
		await redis.del(`${REDIS_PREFIX}session_id`)
		return {success: true}
	}),

	getConnectionInfo: privateProcedure.query(async ({ctx}) => {
		const redis = ctx.livinityd.ai.redis
		const [status, url, sessionId] = await Promise.all([
			redis.get(`${REDIS_PREFIX}status`),
			redis.get(`${REDIS_PREFIX}url`),
			redis.get(`${REDIS_PREFIX}session_id`),
		])
		return {status: status ?? 'idle', url: url ?? null, sessionId: sessionId ?? null}
	}),
})

export default platform
