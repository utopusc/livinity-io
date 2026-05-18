/**
 * Phase 153 — plugin manifest zod schema (SPEC §3.2).
 *
 * The authoritative parse for every `plugin-manifest.json` we load.
 * Re-parsed at install time AND at every boot (defense-in-depth — a
 * tampered manifest on disk should fail loudly rather than load).
 */

import {z} from 'zod'

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/
const SLUG_RE = /^[a-z0-9-]{3,64}$/
const ROUTE_RE = /^\/[a-zA-Z0-9_\-/]*$/
const SLASH_CMD_RE = /^\/[a-z0-9-]+$/

export const PluginManifestSchema = z.object({
	manifestVersion: z.literal('1.0.0'),
	id: z.string().regex(SLUG_RE),
	version: z.string().regex(SEMVER_RE),
	name: z.string().min(1).max(128),
	tagline: z.string().min(1).max(160),
	description: z.string().max(4096).optional(),
	author: z.string().min(1).max(128),
	icon: z.string().url().optional(),
	website: z.string().url().optional(),

	signing: z.object({
		tier: z.enum(['operator', 'verified', 'community']),
		publicKeyId: z.string().min(1),
		signedAt: z.string().datetime(),
	}),

	hooks: z.object({
		routes: z
			.array(
				z.object({
					path: z.string().regex(ROUTE_RE),
					method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', '*']),
					handler: z.string().min(1),
				}),
			)
			.optional(),
		widgets: z
			.array(
				z.object({
					mount: z.enum(['dock', 'settings', 'ai-chat', 'window-titlebar']),
					component: z.string().min(1),
					props: z.record(z.unknown()).optional(),
				}),
			)
			.optional(),
		commands: z
			.array(
				z.object({
					slash: z.string().regex(SLASH_CMD_RE),
					handler: z.string().min(1),
					description: z.string().max(256),
				}),
			)
			.optional(),
		mcps: z
			.array(
				z.object({
					name: z.string().min(1),
					transport: z.enum(['stdio', 'streamableHttp']),
					command: z.string().optional(),
					args: z.array(z.string()).optional(),
					url: z.string().url().optional(),
				}),
			)
			.optional(),
	}),

	capabilities: z.object({
		redis: z
			.array(
				z.object({
					keyPattern: z.string().min(1),
					access: z.enum(['read', 'write', 'readwrite']),
				}),
			)
			.optional(),
		postgres: z
			.array(
				z.object({
					table: z.string().min(1),
					access: z.enum(['read', 'write', 'readwrite']),
				}),
			)
			.optional(),
		filesystem: z
			.array(
				z.object({
					path: z.string().regex(/^\/[a-zA-Z0-9_\-./]+$/),
					access: z.enum(['read', 'write', 'readwrite']),
				}),
			)
			.optional(),
		network: z
			.object({
				outbound: z.array(z.string()).optional(),
				inbound: z.boolean().default(false),
			})
			.optional(),
	}),

	minLivosVersion: z.string().regex(SEMVER_RE),

	uiBundle: z
		.object({
			entry: z.string().default('ui/bundle.umd.js'),
			format: z.enum(['umd', 'esm']).default('umd'),
			shadowDom: z.boolean().default(true),
		})
		.optional(),

	migrations: z
		.array(
			z.object({
				file: z.string().regex(/^migrations\/\d{4}_[a-z0-9_]+\.sql$/),
				appliedAtKey: z.string().min(1),
			}),
		)
		.optional(),
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>
