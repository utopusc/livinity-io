/**
 * Phase 152-B — AI section installer (MCP / agent / GSD).
 *
 * Implements `InstallHandler<'ai'>` per SPEC §4. Dispatches on the
 * manifest's `kind` discriminator:
 *
 *   kind: 'mcp'   → installs an MCP server into the user's
 *                   mcpConfigManager (existing P77 wiring)
 *   kind: 'agent' → clones an agent template into the local
 *                   agent_templates Postgres table (existing P32 wiring)
 *   kind: 'gsd'   → marks GSD skills as installed via Redis flag; the
 *                   actual skill loader is out of scope for v37 and
 *                   ships in v38
 *
 * The MCP envSchema collection happens at the UI layer (catalog detail
 * page) — this installer expects env values pre-populated on the
 * manifest at install-time. If they're missing the install fails with
 * dependency_missing so the UI can prompt and retry.
 */

import {
	type AppCatalogRow,
	type InstallContext,
	type InstallHandler,
	type InstallOutcome,
	type ProgressEmitter,
	ok,
	fail,
	progressFactory,
} from './install-contracts.js'
import type {
	McpConfigManagerLike,
	McpServerConfigInput,
} from '../computer-use/luse-mcp-config.js'

// ─── Manifest shapes (SPEC §2.4) ─────────────────────────────────────────

type McpManifest = {
	kind: 'mcp'
	mcp: {
		name: string
		transport: 'stdio' | 'streamableHttp'
		command?: string
		args?: string[]
		url?: string
		env?: Record<string, string>
		envSchema?: Array<{
			name: string
			label: string
			type: 'string' | 'password'
			required?: boolean
		}>
	}
}

type AgentManifest = {
	kind: 'agent'
	agent: {
		templateId: string
		systemPrompt: string
		model?: string
		tools?: string[]
		icon?: string
	}
}

type GsdManifest = {
	kind: 'gsd'
	gsd: {
		skillSet: 'core' | 'full'
		version: string
	}
}

type AiManifest = McpManifest | AgentManifest | GsdManifest

function parseManifest(raw: unknown): AiManifest | null {
	if (!raw || typeof raw !== 'object') return null
	const m = raw as {kind?: string}
	if (m.kind === 'mcp' && 'mcp' in m) return m as McpManifest
	if (m.kind === 'agent' && 'agent' in m) return m as AgentManifest
	if (m.kind === 'gsd' && 'gsd' in m) return m as GsdManifest
	return null
}

// ─── Handler ─────────────────────────────────────────────────────────────

export class AiInstaller implements InstallHandler<'ai'> {
	readonly section = 'ai' as const

	constructor(private readonly mcp: McpConfigManagerLike) {}

	async install(
		app: AppCatalogRow,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const progress = progressFactory(emit, app.id, 'ai')
		const manifest = parseManifest(app.manifest)
		if (!manifest) {
			return fail(
				app.id,
				'ai',
				'manifest_invalid',
				`ai manifest missing kind discriminator (expected mcp|agent|gsd)`,
			)
		}

		switch (manifest.kind) {
			case 'mcp':
				return this.installMcp(app, manifest, ctx, progress)
			case 'agent':
				return this.installAgent(app, manifest, ctx, progress)
			case 'gsd':
				return this.installGsd(app, manifest, ctx, progress)
		}
	}

	async uninstall(
		appId: string,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const progress = progressFactory(emit, appId, 'ai')
		progress(10, 'Locating install record')
		const record = await ctx.redis.get(`liv:apps:ai:${appId}`)
		if (!record) {
			progress(100, 'Already uninstalled', true)
			return ok(appId, 'ai', {})
		}
		const parsed = JSON.parse(record) as {
			kind: 'mcp' | 'agent' | 'gsd'
			detail: Record<string, string>
		}

		if (parsed.kind === 'mcp' && this.mcp.removeServer && parsed.detail.serverName) {
			progress(40, `Removing MCP server "${parsed.detail.serverName}"`)
			await this.mcp.removeServer(parsed.detail.serverName)
		}
		if (parsed.kind === 'agent') {
			progress(40, `Removing agent template "${parsed.detail.templateId}"`)
			await ctx.pg.query(`DELETE FROM agent_templates WHERE template_id = $1`, [
				parsed.detail.templateId,
			])
		}
		if (parsed.kind === 'gsd') {
			progress(40, 'Clearing GSD installed flag')
			await ctx.redis.del(`liv:gsd:installed`)
		}

		progress(80, 'Removing tracking record')
		await ctx.redis.del(`liv:apps:ai:${appId}`)

		progress(100, 'Done', true)
		return ok(appId, 'ai', {})
	}

	// ── kind handlers ────────────────────────────────────────────────────

	private async installMcp(
		app: AppCatalogRow,
		manifest: McpManifest,
		ctx: InstallContext,
		progress: (pct: number, message: string, done?: boolean) => void,
	): Promise<InstallOutcome> {
		const {mcp} = manifest

		// Required envs that have no provided value → ask the UI to prompt.
		const required = mcp.envSchema?.filter((e) => e.required) ?? []
		const missing = required.filter((e) => !(mcp.env && mcp.env[e.name]))
		if (missing.length > 0) {
			return fail(
				app.id,
				'ai',
				'dependency_missing',
				`required env values missing: ${missing.map((e) => e.name).join(', ')}`,
			)
		}

		progress(30, `Registering MCP server "${mcp.name}"`)
		const config: McpServerConfigInput = {
			name: mcp.name,
			transport: mcp.transport,
			command: mcp.command,
			args: mcp.args,
			env: mcp.env,
			enabled: true,
			installedAt: Date.now(),
		}
		try {
			await this.mcp.installServer(config)
		} catch (err) {
			return fail(
				app.id,
				'ai',
				'unknown',
				`mcpConfigManager.installServer failed: ${err instanceof Error ? err.message : String(err)}`,
				err,
			)
		}

		progress(80, 'Tracking install')
		await ctx.redis.set(
			`liv:apps:ai:${app.id}`,
			JSON.stringify({kind: 'mcp', detail: {serverName: mcp.name}}),
		)

		progress(100, 'Done', true)
		return ok(app.id, 'ai', {mcpServerName: mcp.name})
	}

	private async installAgent(
		app: AppCatalogRow,
		manifest: AgentManifest,
		ctx: InstallContext,
		progress: (pct: number, message: string, done?: boolean) => void,
	): Promise<InstallOutcome> {
		const {agent} = manifest
		progress(30, `Cloning agent template "${agent.templateId}"`)
		// agent_templates table from P32. Upsert by template_id so re-install
		// is idempotent (template body wins).
		try {
			await ctx.pg.query(
				`INSERT INTO agent_templates (template_id, name, system_prompt, model, tools, icon, installed_from)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 ON CONFLICT (template_id) DO UPDATE SET
				   system_prompt = EXCLUDED.system_prompt,
				   model = EXCLUDED.model,
				   tools = EXCLUDED.tools,
				   icon = EXCLUDED.icon,
				   updated_at = NOW()`,
				[
					agent.templateId,
					app.name,
					agent.systemPrompt,
					agent.model ?? 'claude-opus-4-7',
					JSON.stringify(agent.tools ?? []),
					agent.icon ?? null,
					app.id,
				],
			)
		} catch (err) {
			return fail(
				app.id,
				'ai',
				'unknown',
				`agent_templates upsert failed: ${err instanceof Error ? err.message : String(err)}`,
				err,
			)
		}

		progress(80, 'Tracking install')
		await ctx.redis.set(
			`liv:apps:ai:${app.id}`,
			JSON.stringify({kind: 'agent', detail: {templateId: agent.templateId}}),
		)

		progress(100, 'Done', true)
		return ok(app.id, 'ai', {agentTemplateId: agent.templateId})
	}

	private async installGsd(
		app: AppCatalogRow,
		manifest: GsdManifest,
		ctx: InstallContext,
		progress: (pct: number, message: string, done?: boolean) => void,
	): Promise<InstallOutcome> {
		const {gsd} = manifest
		progress(50, `Enabling GSD ${gsd.skillSet} v${gsd.version}`)
		// v37: a flag-only install. The actual GSD skill loader (linking
		// the planning skills into the local Claude Agent SDK config) is
		// v38 scope. Flag lets the AI Chat UI show GSD as "installed"
		// today.
		await ctx.redis.set(
			`liv:gsd:installed`,
			JSON.stringify({
				skillSet: gsd.skillSet,
				version: gsd.version,
				installedAt: Date.now(),
			}),
		)
		await ctx.redis.set(
			`liv:apps:ai:${app.id}`,
			JSON.stringify({kind: 'gsd', detail: {skillSet: gsd.skillSet}}),
		)

		progress(100, 'Done', true)
		return ok(app.id, 'ai', {gsdSkillSet: gsd.skillSet})
	}
}
