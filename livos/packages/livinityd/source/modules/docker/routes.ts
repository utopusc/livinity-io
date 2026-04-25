import {TRPCError} from '@trpc/server'
import {z} from 'zod'

import {adminProcedure, router} from '../server/trpc/trpc.js'

// Phase 22 MH-02 — every existing docker.* route accepts an optional
// `environmentId` UUID. Missing/null/'local' resolves to the auto-seeded
// 'local' environment row (i.e. the local Unix socket), preserving the
// pre-Phase-22 single-host behaviour byte-for-byte.
const envIdField = z.string().uuid().nullable().optional()
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
import {
	listDir,
	readFile as readContainerFile,
	writeFile as writeContainerFile,
	deleteFile as deleteContainerFile,
} from './container-files.js'
import {scanImage, getCachedScan} from './vuln-scan.js'
// Phase 23 — AI diagnostics drivers (AID-01/03/04)
import {
	diagnoseContainer,
	generateComposeFromPrompt,
	explainVulnerabilities,
} from './ai-diagnostics.js'
// Phase 23 AID-02 — AI Alerts CRUD (used by listAiAlerts query + dismiss mutations).
// Inserts happen inside the ai-resource-watch scheduler handler — no insert tRPC route.
import {
	listAiAlerts,
	dismissAiAlert,
	dismissAllAiAlerts,
} from './ai-alerts.js'
import {
	listCredentials,
	createCredential,
	deleteCredential,
} from './git-credentials.js'
// Phase 29 DOC-16 — registry credentials + image search
import {
	listCredentials as listRegistryCreds,
	createCredential as createRegistryCred,
	deleteCredential as deleteRegistryCred,
} from './registry-credentials.js'
import {searchImages} from './registry-search.js'
import {
	listEnvironments,
	createEnvironment,
	updateEnvironment,
	deleteEnvironment,
	getEnvironment,
} from './environments.js'
import {invalidateClient} from './docker-clients.js'
// Phase 22 MH-04, MH-05 — docker_agents CRUD + revocation
import {createAgent, listAgents, revokeAgent} from './agents.js'
import {agentRegistry} from './agent-registry.js'

export default router({
	listContainers: adminProcedure
		.input(
			z
				.object({
					all: z.boolean().optional().default(true),
					environmentId: envIdField,
				})
				.optional(),
		)
		.query(async ({input}) => {
			try {
				return await listContainers(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				if (err.message?.includes('[env-misconfigured]')) {
					throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message.replace('[env-misconfigured] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list containers'})
			}
		}),

	manageContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				operation: z.enum(['start', 'stop', 'restart', 'remove', 'kill', 'pause', 'unpause']),
				force: z.boolean().optional().default(false),
				confirmName: z.string().optional(),
				environmentId: envIdField,
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
				return await manageContainer(input.name, input.operation, input.force, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[protected-container]')) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: err.message.replace('[protected-container] ', ''),
					})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await bulkManageContainers(input.names, input.operation, input.force, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				const {environmentId, ...containerInput} = input
				return await createContainer(containerInput, environmentId)
			} catch (err: any) {
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[image-not-found] ', ''),
					})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await recreateContainer(input.name, input.config, input.environmentId)
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
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await renameContainer(input.name, input.newName, input.environmentId)
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
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to rename container ${input.name}`,
				})
			}
		}),

	inspectContainer: adminProcedure
		.input(z.object({name: z.string().min(1).max(255), environmentId: envIdField}))
		.query(async ({input}) => {
			try {
				return await inspectContainer(input.name, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.query(async ({input}) => {
			try {
				return await getContainerLogs(input.name, input.tail, input.timestamps, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get logs for container ${input.name}`,
				})
			}
		}),

	containerStats: adminProcedure
		.input(z.object({name: z.string().min(1).max(255), environmentId: envIdField}))
		.query(async ({input}) => {
			try {
				return await getContainerStats(input.name, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get stats for container ${input.name}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Container file browser (Phase 18 — CFB-01/04/05)
	// tRPC handles JSON paths only; binary download + multipart upload live
	// at REST endpoints in server/index.ts (CFB-02/03).
	// -----------------------------------------------------------------------

	containerListDir: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				path: z.string().min(1).max(4096).startsWith('/'),
				environmentId: envIdField,
			}),
		)
		.query(async ({input}) => {
			try {
				return {entries: await listDir(input.name, input.path, input.environmentId)}
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[bad-path]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[bad-path] ', '')})
				}
				if (err.message?.includes('[ls-failed]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[ls-failed] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to list ${input.path}`,
				})
			}
		}),

	containerReadFile: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				path: z.string().min(1).max(4096).startsWith('/'),
				maxBytes: z.number().int().min(1).max(1_000_000).optional().default(1_000_000),
				environmentId: envIdField,
			}),
		)
		.query(async ({input}) => {
			try {
				return await readContainerFile(input.name, input.path, input.maxBytes, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[file-too-large]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[file-too-large] ', '')})
				}
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[bad-path]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[bad-path] ', '')})
				}
				if (err.message?.includes('[read-failed]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[read-failed] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to read ${input.path}`,
				})
			}
		}),

	containerWriteFile: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				path: z.string().min(1).max(4096).startsWith('/'),
				content: z.string().max(1_000_000),
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				await writeContainerFile(input.name, input.path, input.content, input.environmentId)
				return {success: true, message: `Wrote ${input.path}`}
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[dir-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[dir-not-found] ', '')})
				}
				if (err.message?.includes('[bad-path]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[bad-path] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to write ${input.path}`,
				})
			}
		}),

	containerDeleteFile: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				path: z.string().min(1).max(4096).startsWith('/'),
				recursive: z.boolean().optional().default(false),
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				await deleteContainerFile(input.name, input.path, input.recursive, input.environmentId)
				return {success: true, message: `Deleted ${input.path}`}
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[bad-path]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[bad-path] ', '')})
				}
				if (err.message?.includes('[delete-failed]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[delete-failed] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to delete ${input.path}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Image management
	// -----------------------------------------------------------------------

	listImages: adminProcedure
		.input(z.object({environmentId: envIdField}).optional())
		.query(async ({input}) => {
			try {
				return await listImages(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list images'})
			}
		}),

	removeImage: adminProcedure
		.input(
			z.object({
				id: z.string().min(1),
				force: z.boolean().optional().default(false),
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await removeImage(input.id, input.force, input.environmentId)
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
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to remove image ${input.id}`,
				})
			}
		}),

	pruneImages: adminProcedure
		.input(z.object({environmentId: envIdField}).optional())
		.mutation(async ({input}) => {
			try {
				return await pruneImages(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to prune images',
				})
			}
		}),

	pullImage: adminProcedure
		.input(z.object({
			image: z.string().min(1).max(500),
			environmentId: envIdField,
			// Phase 29 DOC-16 — optional registry credential for authenticated pulls.
			// null/undefined → anonymous pull (existing behaviour preserved).
			registryId: z.string().uuid().nullable().optional(),
		}))
		.mutation(async ({input}) => {
			try {
				return await pullImage(input.image, input.environmentId, input.registryId)
			} catch (err: any) {
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[image-not-found] ', '')})
				}
				if (err.message?.includes('[credential-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[credential-not-found] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
			environmentId: envIdField,
		}))
		.mutation(async ({input}) => {
			try {
				return await tagImage(input.id, input.repo, input.tag, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to tag image ${input.id}`,
				})
			}
		}),

	imageHistory: adminProcedure
		.input(z.object({id: z.string().min(1), environmentId: envIdField}))
		.query(async ({input}) => {
			try {
				return await imageHistory(input.id, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get history for image ${input.id}`,
				})
			}
		}),

	// Phase 19 — Vulnerability scanning (CGV-02/03/04)
	scanImage: adminProcedure
		.input(
			z.object({
				imageRef: z.string().min(1).max(500),
				force: z.boolean().optional().default(false),
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await scanImage(input.imageRef, input.force)
			} catch (err: any) {
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[image-not-found] ', '')})
				}
				if (err.message?.includes('[trivy-timeout]')) {
					throw new TRPCError({code: 'TIMEOUT', message: err.message.replace('[trivy-timeout] ', '')})
				}
				if (
					err.message?.includes('[trivy-failed]') ||
					err.message?.includes('[trivy-parse]') ||
					err.message?.includes('[trivy-unavailable]')
				) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message.replace(/^\[[^\]]+\] /, ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to scan image ${input.imageRef}`,
				})
			}
		}),

	getCachedScan: adminProcedure
		.input(z.object({imageRef: z.string().min(1).max(500)}))
		.query(async ({input}) => {
			try {
				return await getCachedScan(input.imageRef)
			} catch (err: any) {
				if (err.message?.includes('[image-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[image-not-found] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || `Failed to get cached scan for ${input.imageRef}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Phase 23 — AI diagnostics (AID-01/03/04). All three are long-running
	// (Kimi can take 30-60s) and registered in httpOnlyPaths to avoid the
	// documented WS-mutation hang on disconnected clients.
	// -----------------------------------------------------------------------

	diagnoseContainer: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255),
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await diagnoseContainer(input.name, input.environmentId)
			} catch (err: any) {
				const msg = err?.message ?? ''
				if (msg.includes('[ai-timeout]')) {
					throw new TRPCError({code: 'TIMEOUT', message: msg.replace('[ai-timeout] ', '')})
				}
				if (
					msg.includes('[ai-unavailable]') ||
					msg.includes('[ai-error]') ||
					msg.includes('[ai-bad-response]')
				) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: msg.replace(/^\[[^\]]+\] /, ''),
					})
				}
				if (msg.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: msg.replace('[not-found] ', '')})
				}
				if (msg.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: msg.replace('[env-not-found] ', '')})
				}
				if (msg.includes('[agent-not-implemented]')) {
					throw new TRPCError({
						code: 'NOT_IMPLEMENTED',
						message: msg.replace('[agent-not-implemented] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: msg || `Failed to diagnose ${input.name}`,
				})
			}
		}),

	generateComposeFromPrompt: adminProcedure
		.input(z.object({prompt: z.string().min(10).max(2000)}))
		.mutation(async ({input}) => {
			try {
				return await generateComposeFromPrompt(input.prompt)
			} catch (err: any) {
				const msg = err?.message ?? ''
				if (msg.includes('[ai-timeout]')) {
					throw new TRPCError({code: 'TIMEOUT', message: msg.replace('[ai-timeout] ', '')})
				}
				if (
					msg.includes('[ai-unavailable]') ||
					msg.includes('[ai-error]') ||
					msg.includes('[ai-bad-response]')
				) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: msg.replace(/^\[[^\]]+\] /, ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: msg || 'Failed to generate compose YAML',
				})
			}
		}),

	explainVulnerabilities: adminProcedure
		.input(z.object({imageRef: z.string().min(1).max(500)}))
		.mutation(async ({input}) => {
			try {
				return await explainVulnerabilities(input.imageRef)
			} catch (err: any) {
				const msg = err?.message ?? ''
				if (msg.includes('[no-scan-result]')) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message: 'No scan result for this image. Run a Trivy scan first.',
					})
				}
				if (msg.includes('[ai-timeout]')) {
					throw new TRPCError({code: 'TIMEOUT', message: msg.replace('[ai-timeout] ', '')})
				}
				if (
					msg.includes('[ai-unavailable]') ||
					msg.includes('[ai-error]') ||
					msg.includes('[ai-bad-response]')
				) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: msg.replace(/^\[[^\]]+\] /, ''),
					})
				}
				if (msg.includes('[image-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: msg.replace('[image-not-found] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: msg || `Failed to explain vulnerabilities for ${input.imageRef}`,
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Phase 23 AID-02 — AI Alerts (proactive resource-pressure alerts).
	// listAiAlerts is a polled query (30s refetch from the AlertsBell hook)
	// and stays on WebSocket. dismiss / dismissAll are mutations registered
	// in httpOnlyPaths so they don't silently hang on disconnected WS clients.
	// -----------------------------------------------------------------------

	listAiAlerts: adminProcedure
		.input(
			z
				.object({
					includeDismissed: z.boolean().optional(),
					limit: z.number().int().min(1).max(200).optional(),
				})
				.optional(),
		)
		.query(async ({input}) => {
			try {
				return await listAiAlerts({
					includeDismissed: input?.includeDismissed,
					limit: input?.limit,
				})
			} catch (err: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err?.message ?? 'Failed to list AI alerts',
				})
			}
		}),

	dismissAiAlert: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			try {
				const ok = await dismissAiAlert(input.id)
				if (!ok) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Alert not found or already dismissed',
					})
				}
				return {dismissed: true}
			} catch (err: any) {
				if (err instanceof TRPCError) throw err
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err?.message ?? 'Failed to dismiss alert',
				})
			}
		}),

	dismissAllAiAlerts: adminProcedure.mutation(async () => {
		try {
			const count = await dismissAllAiAlerts()
			return {dismissed: count}
		} catch (err: any) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: err?.message ?? 'Failed to dismiss alerts',
			})
		}
	}),

	// -----------------------------------------------------------------------
	// Volume management
	// -----------------------------------------------------------------------

	listVolumes: adminProcedure
		.input(z.object({environmentId: envIdField}).optional())
		.query(async ({input}) => {
			try {
				return await listVolumes(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list volumes'})
			}
		}),

	removeVolume: adminProcedure
		.input(
			z.object({
				name: z.string().min(1),
				confirmName: z.string(),
				environmentId: envIdField,
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
				return await removeVolume(input.name, input.environmentId)
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
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				const {environmentId, ...volumeInput} = input
				return await createVolume(volumeInput, environmentId)
			} catch (err: any) {
				if (err.message?.includes('[conflict]')) {
					throw new TRPCError({code: 'CONFLICT', message: err.message.replace('[conflict] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create volume',
				})
			}
		}),

	volumeUsage: adminProcedure
		.input(z.object({name: z.string().min(1), environmentId: envIdField}))
		.query(async ({input}) => {
			try {
				return await volumeUsage(input.name, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || `Failed to get volume usage for ${input.name}`})
			}
		}),

	// -----------------------------------------------------------------------
	// Network management
	// -----------------------------------------------------------------------

	listNetworks: adminProcedure
		.input(z.object({environmentId: envIdField}).optional())
		.query(async ({input}) => {
			try {
				return await listNetworks(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list networks'})
			}
		}),

	inspectNetwork: adminProcedure
		.input(z.object({id: z.string().min(1), environmentId: envIdField}))
		.query(async ({input}) => {
			try {
				return await inspectNetwork(input.id, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[not-found] ', ''),
					})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				const {environmentId, ...networkInput} = input
				return await createNetwork(networkInput, environmentId)
			} catch (err: any) {
				if (err.message?.includes('[conflict]')) {
					throw new TRPCError({code: 'CONFLICT', message: err.message.replace('[conflict] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create network',
				})
			}
		}),

	removeNetwork: adminProcedure
		.input(z.object({id: z.string().min(1), environmentId: envIdField}))
		.mutation(async ({input}) => {
			try {
				return await removeNetwork(input.id, input.environmentId)
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
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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
				environmentId: envIdField,
			}),
		)
		.mutation(async ({input}) => {
			try {
				return await disconnectNetwork(input.networkId, input.containerId, input.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
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

	listStacks: adminProcedure
		.input(z.object({environmentId: envIdField}).optional())
		.query(async ({input}) => {
			try {
				return await listStacks(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list stacks'})
			}
		}),

	deployStack: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				composeYaml: z.string().min(1).max(1_000_000).optional(),
				git: z
					.object({
						url: z.string().min(1).max(1000),
						branch: z.string().max(255).optional().default('main'),
						credentialId: z.string().uuid().nullable().optional(),
						composePath: z.string().max(500).optional().default('docker-compose.yml'),
					})
					.optional(),
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
				if (err.message?.includes('[credential-not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[credential-not-found] ', ''),
					})
				}
				if (err.message?.includes('[compose-not-found]')) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: err.message.replace('[compose-not-found] ', ''),
					})
				}
				if (err.message?.includes('[bad-compose-path]')) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: err.message.replace('[bad-compose-path] ', ''),
					})
				}
				if (err.message?.includes('[db-error]')) {
					throw new TRPCError({
						code: 'INTERNAL_SERVER_ERROR',
						message: err.message.replace('[db-error] ', ''),
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
	// Git Credentials (Phase 21 GIT-01) — admin-only
	// AES-256-GCM-encrypted-at-rest credentials for cloning private git repos.
	// encrypted_data is NEVER exposed via these routes; only metadata returned.
	// -----------------------------------------------------------------------

	listGitCredentials: adminProcedure.query(async ({ctx}) => {
		return await listCredentials(ctx.currentUser?.id ?? null)
	}),

	createGitCredential: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				type: z.enum(['ssh', 'https']),
				data: z.union([
					z.object({username: z.string().min(1), password: z.string().min(1)}),
					z.object({privateKey: z.string().min(50)}), // SSH PEM is always > 50 chars
				]),
			}),
		)
		.mutation(async ({input, ctx}) => {
			try {
				return await createCredential({
					userId: ctx.currentUser?.id ?? null,
					name: input.name,
					type: input.type,
					data: input.data,
				})
			} catch (err: any) {
				if (err.message?.includes('duplicate key')) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: `Credential '${input.name}' already exists`,
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create credential',
				})
			}
		}),

	deleteGitCredential: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			const ok = await deleteCredential(input.id)
			if (!ok) throw new TRPCError({code: 'NOT_FOUND', message: 'Credential not found'})
			return {success: true, message: 'Credential deleted'}
		}),

	// -----------------------------------------------------------------------
	// Registry Credentials + Image Search (Phase 29 DOC-16) — admin-only
	// AES-256-GCM-encrypted-at-rest credentials for Docker Hub / private registries.
	// Mirrors the git-credentials shape; payload is always {username, password}.
	// encrypted_data is NEVER exposed via these routes; only metadata returned.
	// -----------------------------------------------------------------------

	listRegistryCredentials: adminProcedure.query(async ({ctx}) => {
		return await listRegistryCreds(ctx.currentUser?.id ?? null)
	}),

	createRegistryCredential: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				registryUrl: z.string().url(),
				username: z.string().min(1),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({input, ctx}) => {
			try {
				return await createRegistryCred({
					userId: ctx.currentUser?.id ?? null,
					name: input.name,
					registryUrl: input.registryUrl,
					username: input.username,
					password: input.password,
				})
			} catch (err: any) {
				if (err.message?.includes('duplicate key')) {
					throw new TRPCError({
						code: 'CONFLICT',
						message: `Credential '${input.name}' already exists`,
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create credential',
				})
			}
		}),

	deleteRegistryCredential: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			const ok = await deleteRegistryCred(input.id)
			if (!ok) throw new TRPCError({code: 'NOT_FOUND', message: 'Credential not found'})
			return {success: true, message: 'Credential deleted'}
		}),

	searchImages: adminProcedure
		.input(
			z.object({
				query: z.string().min(1).max(200),
				registryId: z.string().uuid().nullable().optional(),
			}),
		)
		.query(async ({input}) => {
			try {
				return await searchImages({query: input.query, registryId: input.registryId})
			} catch (err: any) {
				if (err.message?.includes('[auth-failed]')) {
					throw new TRPCError({
						code: 'UNAUTHORIZED',
						message: err.message.replace('[auth-failed] ', ''),
					})
				}
				if (err.message?.includes('[credential-not-found]')) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: err.message.replace('[credential-not-found] ', ''),
					})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message?.replace('[search-failed] ', '') ?? 'Image search failed',
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
					environmentId: envIdField,
				})
				.optional(),
		)
		.query(async ({input}) => {
			try {
				return await getDockerEvents(
					{
						since: input?.since,
						until: input?.until,
						filters: input?.filters,
					},
					input?.environmentId,
				)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to get Docker events',
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Docker Engine Info (Phase 46)
	// -----------------------------------------------------------------------

	engineInfo: adminProcedure
		.input(z.object({environmentId: envIdField}).optional())
		.query(async ({input}) => {
			try {
				return await getEngineInfo(input?.environmentId)
			} catch (err: any) {
				if (err.message?.includes('[env-not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[env-not-found] ', '')})
				}
				if (err.message?.includes('[agent-not-implemented]')) {
					throw new TRPCError({code: 'NOT_IMPLEMENTED', message: err.message.replace('[agent-not-implemented] ', '')})
				}
				if (err.message?.includes('[env-misconfigured]')) {
					throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message.replace('[env-misconfigured] ', '')})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to get Docker engine info',
				})
			}
		}),

	// -----------------------------------------------------------------------
	// Environments (Phase 22 MH-01) — multi-host Docker management
	// -----------------------------------------------------------------------

	listEnvironments: adminProcedure.query(async () => {
		return listEnvironments()
	}),

	createEnvironment: adminProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
				type: z.enum(['socket', 'tcp-tls', 'agent']),
				socketPath: z.string().max(500).optional(),
				tcpHost: z.string().max(255).optional(),
				tcpPort: z.number().int().min(1).max(65535).optional(),
				tlsCaPem: z.string().max(20000).optional(),
				tlsCertPem: z.string().max(20000).optional(),
				tlsKeyPem: z.string().max(20000).optional(),
				agentId: z.string().uuid().optional(),
				// Phase 25 DOC-06: T-25-01 mitigation — bound array length AND per-tag length.
				tags: z.array(z.string().min(1).max(50)).max(20).optional(),
			}),
		)
		.mutation(async ({input, ctx}) => {
			try {
				return await createEnvironment(input, ctx.currentUser?.id ?? null)
			} catch (err: any) {
				if (err.message?.includes('[validation-error]')) {
					throw new TRPCError({code: 'BAD_REQUEST', message: err.message.replace('[validation-error] ', '')})
				}
				if (err.message?.includes('duplicate key')) {
					throw new TRPCError({code: 'CONFLICT', message: `Environment '${input.name}' already exists`})
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: err.message || 'Failed to create environment',
				})
			}
		}),

	updateEnvironment: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				socketPath: z.string().max(500).optional(),
				tcpHost: z.string().max(255).optional(),
				tcpPort: z.number().int().min(1).max(65535).optional(),
				tlsCaPem: z.string().max(20000).optional(),
				tlsCertPem: z.string().max(20000).optional(),
				tlsKeyPem: z.string().max(20000).optional(),
				// Phase 25 DOC-06: T-25-01 mitigation — same bounds as createEnvironment.
				tags: z.array(z.string().min(1).max(50)).max(20).optional(),
			}),
		)
		.mutation(async ({input, ctx}) => {
			try {
				const {id, ...partial} = input
				const result = await updateEnvironment(id, partial, ctx.currentUser?.id ?? null)
				// Invalidate cached Dockerode for this env so the next call rebuilds
				// with the new connection fields.
				invalidateClient(id)
				return result
			} catch (err: any) {
				if (err.message?.includes('[cannot-modify-local]')) {
					throw new TRPCError({code: 'FORBIDDEN', message: err.message.replace('[cannot-modify-local] ', '')})
				}
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to update environment'})
			}
		}),

	deleteEnvironment: adminProcedure
		.input(z.object({id: z.string().uuid()}))
		.mutation(async ({input}) => {
			try {
				await deleteEnvironment(input.id)
				invalidateClient(input.id)
				return {success: true, message: 'Environment deleted'}
			} catch (err: any) {
				if (err.message?.includes('[cannot-delete-local]')) {
					throw new TRPCError({code: 'FORBIDDEN', message: err.message.replace('[cannot-delete-local] ', '')})
				}
				if (err.message?.includes('[not-found]')) {
					throw new TRPCError({code: 'NOT_FOUND', message: err.message.replace('[not-found] ', '')})
				}
				throw new TRPCError({code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to delete environment'})
			}
		}),

	// -----------------------------------------------------------------------
	// Docker Agents (Phase 22 MH-04, MH-05) — outbound-WS proxies
	// -----------------------------------------------------------------------

	listAgents: adminProcedure
		.input(z.object({environmentId: z.string().uuid().optional()}).optional())
		.query(async ({input}) => {
			const rows = await listAgents(input?.environmentId)
			// Strip token_hash from the response — never expose, even to admins.
			// `online` is computed at query time from the in-process registry.
			return rows.map((r) => ({
				id: r.id,
				envId: r.envId,
				createdBy: r.createdBy,
				createdAt: r.createdAt,
				lastSeen: r.lastSeen,
				revokedAt: r.revokedAt,
				online: agentRegistry.isAgentOnline(r.id),
			}))
		}),

	generateAgentToken: adminProcedure
		.input(z.object({environmentId: z.string().uuid()}))
		.mutation(async ({input, ctx}) => {
			const env = await getEnvironment(input.environmentId)
			if (!env) {
				throw new TRPCError({code: 'NOT_FOUND', message: 'Environment not found'})
			}
			if (env.type !== 'agent') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: `Environment '${env.name}' is type '${env.type}', not 'agent' — generateAgentToken is only valid for agent envs`,
				})
			}
			const {agent, token} = await createAgent({
				envId: input.environmentId,
				createdBy: ctx.currentUser?.id ?? null,
			})
			// Token returned ONCE — client (UI) MUST surface it to the user before
			// closing the dialog; we never persist or return the cleartext again.
			return {
				agentId: agent.id,
				token,
				agentInstallSnippet: `curl -fsSL https://livinity.cloud/install-agent.sh | bash -s -- --token ${token} --server wss://livinity.cloud/agent/connect`,
			}
		}),

	revokeAgentToken: adminProcedure
		.input(z.object({agentId: z.string().uuid()}))
		.mutation(async ({input, ctx}) => {
			await revokeAgent(input.agentId)
			// Publish on Redis so the livinityd instance currently holding the
			// live WS for this agent disconnects within ~5s. (In single-instance
			// deployments the same process subscribes to its own publish — ioredis
			// supports this via the duplicate connection used by the subscriber.)
			const redis = ctx.livinityd?.ai?.redis
			if (redis) {
				try {
					await redis.publish(
						'livos:agent:revoked',
						JSON.stringify({agentId: input.agentId}),
					)
				} catch (err: any) {
					ctx.livinityd?.logger?.error?.(
						`Failed to publish revocation for agent ${input.agentId}`,
						err,
					)
					// Non-fatal: even without pub/sub, the next reconnect attempt
					// will fail (token is now revoked in PG), and the existing WS
					// will eventually time out. The 5s SLA assumes Redis is up.
				}
			}
			return {success: true}
		}),
})
