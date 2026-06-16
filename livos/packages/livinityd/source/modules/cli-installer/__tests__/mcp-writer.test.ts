// Liv-MCP CLI-picker — per-CLI MCP writer tests.
//
// Verifies the research-backed per-CLI MCP config shapes (claude / opencode /
// goose / codex), the merge-preservation contract, the D-239-07 whitelist guard,
// the unsupported-CLI path, and the unparseable-config data-loss guard.

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import yaml from 'js-yaml'

import {writeLivMcpsToCli, type LivMcpDef} from '../mcp-writer.js'

const SILENT = {info: () => {}, warn: () => {}, error: () => {}}

const SERVERS: LivMcpDef[] = [
	{
		name: 'luse',
		transport: 'stdio',
		command: '/usr/bin/npx',
		args: ['tsx', '/opt/livos/x/luse/index.ts'],
		env: {LIV_API_KEY: 'sekret', DISPLAY: ':1'},
	},
	{
		name: 'liv-system',
		transport: 'stdio',
		command: '/usr/bin/npx',
		args: ['tsx', '/opt/livos/x/liv-system/index.ts'],
		env: {LIV_API_KEY: 'sekret'},
	},
]

let home: string

beforeEach(async () => {
	home = await fs.mkdtemp(path.join(os.tmpdir(), 'liv-mcp-writer-'))
})
afterEach(async () => {
	await fs.rm(home, {recursive: true, force: true}).catch(() => {})
})

async function readJson(rel: string): Promise<any> {
	return JSON.parse(await fs.readFile(path.join(home, rel), 'utf8'))
}

describe('writeLivMcpsToCli — security + supported set', () => {
	it('throws on a non-whitelisted CLI (RCE boundary FIRST)', async () => {
		await expect(
			writeLivMcpsToCli({cli: 'not-a-cli' as any, servers: SERVERS}, {logger: SILENT, homeDir: home}),
		).rejects.toThrow(/whitelist/i)
	})

	it('returns supported:false for an MCP-incapable CLI (aion-cli) without writing', async () => {
		const r = await writeLivMcpsToCli(
			{cli: 'aion-cli', servers: SERVERS},
			{logger: SILENT, homeDir: home},
		)
		expect(r.supported).toBe(false)
		expect(r.written).toEqual([])
		// nothing written under home
		const entries = await fs.readdir(home)
		expect(entries.length).toBe(0)
	})
})

describe('writeLivMcpsToCli — JSON family (claude-code)', () => {
	it('writes top-level mcpServers with {type:stdio, command, args, env}', async () => {
		const r = await writeLivMcpsToCli(
			{cli: 'claude-code', servers: SERVERS},
			{logger: SILENT, homeDir: home},
		)
		expect(r.supported).toBe(true)
		expect(r.path).toBe(path.join(home, '.claude.json'))
		expect(r.written.sort()).toEqual(['liv-system', 'luse'])
		const cfg = await readJson('.claude.json')
		expect(cfg.mcpServers.luse).toEqual({
			type: 'stdio',
			command: '/usr/bin/npx',
			args: ['tsx', '/opt/livos/x/luse/index.ts'],
			env: {LIV_API_KEY: 'sekret', DISPLAY: ':1'},
		})
	})

	it('preserves existing sibling keys + existing mcpServers entries (merge, not clobber)', async () => {
		await fs.writeFile(
			path.join(home, '.claude.json'),
			JSON.stringify({theme: 'dark', mcpServers: {existing: {command: 'foo'}}}, null, 2),
		)
		await writeLivMcpsToCli({cli: 'claude-code', servers: SERVERS}, {logger: SILENT, homeDir: home})
		const cfg = await readJson('.claude.json')
		expect(cfg.theme).toBe('dark')
		expect(cfg.mcpServers.existing).toEqual({command: 'foo'})
		expect(cfg.mcpServers.luse).toBeDefined()
	})

	it('THROWS rather than overwrite a non-empty unparseable config (data-loss guard)', async () => {
		await fs.writeFile(path.join(home, '.claude.json'), '{ this is : not json,,, ')
		await expect(
			writeLivMcpsToCli({cli: 'claude-code', servers: SERVERS}, {logger: SILENT, homeDir: home}),
		).rejects.toThrow(/not valid JSON|refusing to overwrite/i)
	})
})

describe('writeLivMcpsToCli — opencode distinctive shape', () => {
	it('uses container mcp, command-array, environment, type:local, enabled', async () => {
		await writeLivMcpsToCli({cli: 'opencode', servers: SERVERS}, {logger: SILENT, homeDir: home})
		const cfg = await readJson('.config/opencode/opencode.json')
		expect(cfg.mcp.luse).toEqual({
			type: 'local',
			command: ['/usr/bin/npx', 'tsx', '/opt/livos/x/luse/index.ts'],
			enabled: true,
			environment: {LIV_API_KEY: 'sekret', DISPLAY: ':1'},
		})
	})
})

describe('writeLivMcpsToCli — YAML family (goose)', () => {
	it('writes extensions.<name> with cmd/envs/name/type, parseable YAML', async () => {
		await writeLivMcpsToCli({cli: 'goose', servers: SERVERS}, {logger: SILENT, homeDir: home})
		const doc = yaml.load(
			await fs.readFile(path.join(home, '.config/goose/config.yaml'), 'utf8'),
		) as any
		const ext = doc.extensions.luse
		expect(ext.cmd).toBe('/usr/bin/npx')
		expect(ext.envs).toEqual({LIV_API_KEY: 'sekret', DISPLAY: ':1'})
		expect(ext.type).toBe('stdio')
		expect(ext.name).toBe('luse')
		expect(ext.enabled).toBe(true)
	})
})

describe('writeLivMcpsToCli — openclaw nested container', () => {
	it('writes mcp.servers.<name>', async () => {
		await writeLivMcpsToCli({cli: 'openclaw', servers: SERVERS}, {logger: SILENT, homeDir: home})
		const cfg = await readJson('.openclaw/openclaw.json')
		expect(cfg.mcp.servers.luse.command).toBe('/usr/bin/npx')
		expect(cfg.mcp.servers.luse.enabled).toBe(true)
	})
})

// TOML — only runs when smol-toml is installed (the box's pnpm install provides
// it; locally it may be absent). Verifies codex's keyed-table merge round-trips.
describe('writeLivMcpsToCli — TOML family (codex)', () => {
	it('writes mcp_servers.<name> parseable by smol-toml, or throws clearly if dep missing', async () => {
		let smolToml: any
		try {
			smolToml = await import('smol-toml')
		} catch {
			// dep not installed locally — assert the writer surfaces a clear error.
			await expect(
				writeLivMcpsToCli({cli: 'codex', servers: SERVERS}, {logger: SILENT, homeDir: home}),
			).rejects.toThrow()
			return
		}
		await writeLivMcpsToCli({cli: 'codex', servers: SERVERS}, {logger: SILENT, homeDir: home})
		const parsed: any = smolToml.parse(
			await fs.readFile(path.join(home, '.codex/config.toml'), 'utf8'),
		)
		expect(parsed.mcp_servers.luse.command).toBe('/usr/bin/npx')
		expect(parsed.mcp_servers.luse.args).toEqual(['tsx', '/opt/livos/x/luse/index.ts'])
		expect(parsed.mcp_servers.luse.env).toEqual({LIV_API_KEY: 'sekret', DISPLAY: ':1'})
	})
})
