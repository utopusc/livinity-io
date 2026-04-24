import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {
	listContainers,
	manageContainer,
	bulkManageContainers,
	createContainer,
	recreateContainer,
	renameContainer,
	inspectContainer,
	getContainerLogs,
	getContainerStats,
	listImages,
	removeImage,
	pruneImages,
	pullImage,
	tagImage,
	imageHistory,
	listVolumes,
	removeVolume,
	createVolume,
	volumeUsage,
	listNetworks,
	inspectNetwork,
	createNetwork,
	removeNetwork,
	disconnectNetwork,
	getDockerEvents,
	getEngineInfo,
} from './docker.js'
import {
	listStacks,
	deployStack,
	editStack,
	controlStack,
	removeStack,
	getStackCompose,
	getStackEnv,
} from './stacks.js'

export default router({
	listContainers: adminProcedure
		.input(z.object({all: z.boolean().optional().default(true)}).optional())
		.query(async ({input}) => {
			return listContainers()
		}),

	manageContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				operation: z.enum(['start', 'stop', 'restart', 'remove', 'kill', 'pause', 'unpause']),
				force: z.boolean().optional().default(false),
				confirmName: z.string().optional(),
			}),
		)
		.mutation(async ({input}) => {
			// For remove, require confirmName to match container name (SEC-03 backend validation)
			if (input.operation === 'remove') {
				if (!input.confirmName || input.confirmName !== input.name) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Container name confirmation required for removal. confirmName must match name.',
					})
				}
			}

			try {
				return await manageContainer(input.name, input.operation, input.force)
			} catch (err: any) {
				if (err.message?.includes('[protected-container]')) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: err.message.replace('[protected-container] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to ${input.operation} container ${input.name}`,
				})
			}
		}),

	bulkManageContainers: adminProcedure
		.input(
			z.object({
				names: z.array(z.string().min(1).max(255)).min(1).max(50),
				operation: z.enum(['start', 'stop', 'restart', 'remove', 'kill', 'pause', 'unpause']),
				force: z.boolean().optional().default(false),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await bulkManageContainers(input.names, input.operation, input.force)
			} catch (err: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to bulk ${input.operation} containers`,
				})
			}
		}),

	createContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				image: z.string().min(1).max(500),
				command: z.array(z.string()).optional(),
				entrypoint: z.array(z.string()).optional(),
				workingDir: z.string().max(500).optional(),
				user: z.string().max(100).optional(),
				hostname: z.string().max(255).optional(),
				domainname: z.string().max(255).optional(),
				tty: z.boolean().optional(),
				openStdin: z.boolean().optional(),
				ports: z
					.array(
						z.object({
							hostPort: z.number().int().min(1).max(65535),
							containerPort: z.number().int().min(1).max(65535),
							protocol: z.enum(['tcp', 'udp']),
						}),
					)
					.optional(),
				volumes: z
					.array(
						z.object({
							hostPath: z.string().optional(),
							containerPath: z.string().min(1),
							readOnly: z.boolean().optional(),
							type: z.enum(['bind', 'volume', 'tmpfs']),
							volumeName: z.string().optional(),
						}),
					)
					.optional(),
				env: z
					.array(
						z.object({
							key: z.string().min(1),
							value: z.string(),
						}),
					)
					.optional(),
				labels: z
					.array(
						z.object({
							key: z.string().min(1),
							value: z.string(),
						}),
					)
					.optional(),
				restartPolicy: z
					.object({
						name: z.enum(['no', 'always', 'on-failure', 'unless-stopped']),
						maximumRetryCount: z.number().int().min(0).optional(),
					})
					.optional(),
				resources: z
					.object({
						memoryLimit: z.number().int().min(0).optional(),
						cpuLimit: z.number().int().min(0).optional(),
						cpuShares: z.number().int().min(0).optional(),
					})
					.optional(),
				healthCheck: z
					.object({
						test: z.array(z.string()).optional(),
						interval: z.number().int().min(0).optional(),
						timeout: z.number().int().min(0).optional(),
						retries: z.number().int().min(0).optional(),
						startPeriod: z.number().int().min(0).optional(),
					})
					.optional(),
				networkMode: z.string().max(255).optional(),
				dns: z.array(z.string()).optional(),
				extraHosts: z.array(z.string()).optional(),
				pullImage: z.boolean().optional(),
				autoStart: z.boolean().optional(),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await createContainer(input)
			} catch (err: any) {
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[image-not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to create container ${input.name}`,
				})
			}
		}),

	recreateContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				config: z.object({
					name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
					image: z.string().min(1).max(500),
					command: z.array(z.string()).optional(),
					entrypoint: z.array(z.string()).optional(),
					workingDir: z.string().max(500).optional(),
					user: z.string().max(100).optional(),
					hostname: z.string().max(255).optional(),
					domainname: z.string().max(255).optional(),
					tty: z.boolean().optional(),
					openStdin: z.boolean().optional(),
					ports: z
						.array(
							z.object({
								hostPort: z.number().int().min(1).max(65535),
								containerPort: z.number().int().min(1).max(65535),
								protocol: z.enum(['tcp', 'udp']),
							}),
						)
						.optional(),
					volumes: z
						.array(
							z.object({
								hostPath: z.string().optional(),
								containerPath: z.string().min(1),
								readOnly: z.boolean().optional(),
								type: z.enum(['bind', 'volume', 'tmpfs']),
								volumeName: z.string().optional(),
							}),
						)
						.optional(),
					env: z
						.array(
							z.object({
								key: z.string().min(1),
								value: z.string(),
							}),
						)
						.optional(),
					labels: z
						.array(
							z.object({
								key: z.string().min(1),
								value: z.string(),
							}),
						)
						.optional(),
					restartPolicy: z
						.object({
							name: z.enum(['no', 'always', 'on-failure', 'unless-stopped']),
							maximumRetryCount: z.number().int().min(0).optional(),
						})
						.optional(),
					resources: z
						.object({
							memoryLimit: z.number().int().min(0).optional(),
							cpuLimit: z.number().int().min(0).optional(),
							cpuShares: z.number().int().min(0).optional(),
						})
						.optional(),
					healthCheck: z
						.object({
							test: z.array(z.string()).optional(),
							interval: z.number().int().min(0).optional(),
							timeout: z.number().int().min(0).optional(),
							retries: z.number().int().min(0).optional(),
							startPeriod: z.number().int().min(0).optional(),
						})
						.optional(),
					networkMode: z.string().max(255).optional(),
					dns: z.array(z.string()).optional(),
					extraHosts: z.array(z.string()).optional(),
					pullImage: z.boolean().optional(),
					autoStart: z.boolean().optional(),
				}),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await recreateContainer(input.name, input.config)
			} catch (err: any) {
				if (err.message?.includes('[protected-container]')) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: err.message.replace('[protected-container] ', ''),
					})
				}
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[image-not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to recreate container ${input.name}`,
				})
			}
		}),

	renameContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				newName: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await renameContainer(input.name, input.newName)
			} catch (err: any) {
				if (err.message?.includes('[protected-container]')) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: err.message.replace('[protected-container] ', ''),
					})
				}
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[conflict]')) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: err.message.replace('[conflict] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to rename container ${input.name}`,
				})
			}
		}),

	inspectContainer: adminProcedure
		.input(z.object({name: z.string().min(1).max(255)}))
		.query(async ({input}) => {
			try {
				return await inspectContainer(input.name)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to inspect container ${input.name}`,
				})
			}
		}),

	containerLogs: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				tail: z.number().min(10).max(5000).optional().default(500),
				timestamps: z.boolean().optional().default(true),
			}),
		)
		.query(async ({input}) => {
			try {
				return await getContainerLogs(input.name, input.tail, input.timestamps)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get logs for container ${input.name}`,
				})
			}
		}),

	containerStats: adminProcedure
		.input(z.object({name: z.string().min(1).max(255)}))
		.query(async ({input}) => {
			try {
				return await getContainerStats(input.name)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get stats for container ${input.name}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Image management
	// -----------------------------------------------------------------------

	listImages: adminProcedure.query(async () => {
		return listImages()
	}),

	removeImage: adminProcedure
		.input(
			z.object({
				id: z.string().min(1),
				force: z.boolean().optional().default(false),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await removeImage(input.id, input.force)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[in-use]')) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: err.message.replace('[in-use] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to remove image ${input.id}`,
				})
			}
		}),

	pruneImages: adminProcedure.mutation(async () => {
		try {
			return await pruneImages()
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err.message || 'Failed to prune images',
			})
		}
	}),

	pullImage: adminProcedure
		.input(z.object({
			image: z.string().min(1).max(500),
		}))
		.mutation(async ({input}) => {
			try {
				return await pullImage(input.image)
			} catch (err: any) {
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[image-not-found] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to pull image ${input.image}`,
				})
			}
		}),

	tagImage: adminProcedure
		.input(z.object({
			id: z.string().min(1),
			repo: z.string().min(1).max(500),
			tag: z.string().min(1).max(200),
		}))
		.mutation(async ({input}) => {
			try {
				return await tagImage(input.id, input.repo, input.tag)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to tag image ${input.id}`,
				})
			}
		}),

	imageHistory: adminProcedure
		.input(z.object({id: z.string().min(1)}))
		.query(async ({input}) => {
			try {
				return await imageHistory(input.id)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get history for image ${input.id}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Volume management
	// -----------------------------------------------------------------------

	listVolumes: adminProcedure.query(async () => {
		return listVolumes()
	}),

	removeVolume: adminProcedure
		.input(
			z.object({
				name: z.string().min(1),
				confirmName: z.string(),
			}),
		)
		.mutation(async ({input}) => {
			if (input.confirmName !== input.name) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Volume name confirmation required for removal. confirmName must match name.',
				})
			}

			try {
				return await removeVolume(input.name)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[in-use]')) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: err.message.replace('[in-use] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to remove volume ${input.name}`,
				})
			}
		}),

	createVolume: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				driver: z.string().default('local'),
				driverOpts: z.record(z.string()).optional(),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await createVolume(input)
			} catch (err: any) {
				if (err.message?.includes('[conflict]')) {
					throw new TRPCError({code: 'CONFLICT', message: err.message.replace('[conflict] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create volume',
				})
			}
		}),

	volumeUsage: adminProcedure
		.input(z.object({name: z.string().min(1)}))
		.query(async ({input}) => {
			return await volumeUsage(input.name)
		}),

	// -----------------------------------------------------------------------
	// Network management
	// -----------------------------------------------------------------------

	listNetworks: adminProcedure.query(async () => {
		return listNetworks()
	}),

	inspectNetwork: adminProcedure
		.input(z.object({id: z.string().min(1)}))
		.query(async ({input}) => {
			try {
				return await inspectNetwork(input.id)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to inspect network ${input.id}`,
				})
			}
		}),

	createNetwork: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				driver: z.string().default('bridge'),
				subnet: z.string().max(50).optional(),
				gateway: z.string().max(50).optional(),
				internal: z.boolean().optional(),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await createNetwork(input)
			} catch (err: any) {
				if (err.message?.includes('[conflict]')) {
					throw new TRPCError({code: 'CONFLICT', message: err.message.replace('[conflict] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create network',
				})
			}
		}),

	removeNetwork: adminProcedure
		.input(z.object({id: z.string().min(1)}))
		.mutation(async ({input}) => {
			try {
				return await removeNetwork(input.id)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[forbidden]')) {
					throw new TRPCError({code: 'FORBIDDEN', message: err.message.replace('[forbidden] ', '')})
				}
				if (err.message?.includes('[in-use]')) {
					throw new TRPCError({code: 'CONFLICT', message: err.message.replace('[in-use] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to remove network',
				})
			}
		}),

	disconnectNetwork: adminProcedure
		.input(
			z.object({
				networkId: z.string().min(1),
				containerId: z.string().min(1),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await disconnectNetwork(input.networkId, input.containerId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to disconnect container',
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Stack management
	// -----------------------------------------------------------------------

	listStacks: adminProcedure.query(async () => {
		return listStacks()
	}),

	deployStack: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				composeYaml: z.string().min(1).max(1_000_000),
				envVars: z
					.array(
						z.object({
							key: z.string().min(1),
							value: z.string(),
							secret: z.boolean().optional().default(false),
						}),
					)
					.optional(),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await deployStack(input)
			} catch (err: any) {
				if (err.message?.includes('[validation-error]')) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: err.message.replace('[validation-error] ', ''),
					})
				}
				if (err.message?.includes('[compose-error]')) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message.replace('[compose-error] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to deploy stack ${input.name}`,
				})
			}
		}),

	editStack: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				composeYaml: z.string().min(1).max(1_000_000),
				envVars: z
					.array(
						z.object({
							key: z.string().min(1),
							value: z.string(),
							secret: z.boolean().optional().default(false),
						}),
					)
					.optional(),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await editStack(input)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[compose-error]')) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message.replace('[compose-error] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to edit stack ${input.name}`,
				})
			}
		}),

	controlStack: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				operation: z.enum(['up', 'down', 'stop', 'start', 'restart', 'pull-and-up']),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await controlStack(input.name, input.operation)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[compose-error]')) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message.replace('[compose-error] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to ${input.operation} stack ${input.name}`,
				})
			}
		}),

	removeStack: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				removeVolumes: z.boolean().optional().default(false),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await removeStack(input.name, input.removeVolumes)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[compose-error]')) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message.replace('[compose-error] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to remove stack ${input.name}`,
				})
			}
		}),

	getStackCompose: adminProcedure
		.input(z.object({name: z.string().min(1).max(255)}))
		.query(async ({input}) => {
			try {
				const yaml = await getStackCompose(input.name)
				return {yaml}
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get compose for stack ${input.name}`,
				})
			}
		}),

	getStackEnv: adminProcedure
		.input(z.object({name: z.string().min(1).max(255)}))
		.query(async ({input}) => {
			try {
				const envVars = await getStackEnv(input.name)
				return {envVars}
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get env for stack ${input.name}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Docker Events (Phase 46)
	// -----------------------------------------------------------------------

	dockerEvents: adminProcedure
		.input(
			z
				.object({
					since: z.number().optional(),
					until: z.number().optional(),
					filters: z
						.object({
							type: z.array(z.string()).optional(),
						})
						.optional(),
				})
				.optional(),
		)
		.query(async ({input}) => {
			try {
				return await getDockerEvents({
					since: input?.since,
					until: input?.until,
					filters: input?.filters,
				})
			} catch (err: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to get Docker events',
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Docker Engine Info (Phase 46)
	// -----------------------------------------------------------------------

	engineInfo: adminProcedure.query(async () => {
		try {
			return await getEngineInfo()
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err.message || 'Failed to get Docker engine info',
			})
		}
	}),
})
