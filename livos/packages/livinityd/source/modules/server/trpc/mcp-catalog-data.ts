/**
 * Phase 219 T2 — curated MCP catalog displayed by the `/settings → MCP →
 * Add → Browse` picker.
 *
 * Each entry mirrors a slot in `scripts/install/seeds/mcp-servers.json` —
 * keep them in sync when adding / removing items. The seed file is the
 * install-time source of truth (HSETs into Redis on fresh boxes); this
 * catalog is the runtime UI source of truth (rendered in the Browse
 * picker so operators can one-click pre-fill the Add form).
 *
 * `system: true` entries are filtered out of the picker (they're auto-seeded
 * + cannot be deleted; offering them in the Add form would be misleading).
 *
 * Categories: search / dev / files / productivity / database / system /
 * web / ai — kept short so the picker can group with category sidebars.
 */

import {getDesktopHome} from '../../system/desktop-user.js'

// Phase 278: the filesystem MCP root must be the running operator's home, not a
// hardcoded /home/bruce. getDesktopHome() resolves the desktop user's actual
// home (livinityd runs AS that user), so this is correct on any box.
const DESKTOP_HOME = getDesktopHome()

export type McpCatalogCategory =
	| 'search'
	| 'dev'
	| 'files'
	| 'productivity'
	| 'database'
	| 'system'
	| 'web'
	| 'ai'

export interface McpCatalogEntry {
	name: string
	transport: 'stdio' | 'http'
	command?: string
	args?: string[]
	url?: string
	env?: Record<string, string>
	description: string
	category: McpCatalogCategory
	/**
	 * System entries are auto-seeded + cannot be deleted. The Add → Browse
	 * picker filters these out to avoid offering operators duplicates of
	 * something they already have installed (liv-*, luse).
	 */
	system?: boolean
}

export const MCP_CATALOG: ReadonlyArray<McpCatalogEntry> = [
	{
		name: 'brave-search',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-brave-search'],
		env: {BRAVE_API_KEY: ''},
		description: 'Web + local search via Brave Search API. Requires BRAVE_API_KEY.',
		category: 'search',
	},
	{
		name: 'everything',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-everything'],
		description:
			'MCP reference server — every prompt / resource / tool primitive in one place. Useful for testing MCP clients.',
		category: 'dev',
	},
	{
		name: 'fetch',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-fetch'],
		description: 'Fetch arbitrary URLs and return parsed Markdown. Read-only.',
		category: 'web',
	},
	{
		name: 'filesystem',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-filesystem', DESKTOP_HOME],
		description: 'Read / write files under an allowed root (defaults to the desktop user home). Destructive ops gated.',
		category: 'files',
	},
	{
		name: 'git',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-git'],
		description: 'Local Git repo operations — status / log / diff / branch / show. Read-only.',
		category: 'dev',
	},
	{
		name: 'github',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-github'],
		env: {GITHUB_PERSONAL_ACCESS_TOKEN: ''},
		description: 'GitHub API — issues, PRs, code search. Needs GITHUB_PERSONAL_ACCESS_TOKEN.',
		category: 'dev',
	},
	{
		name: 'gitlab',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-gitlab'],
		env: {GITLAB_PERSONAL_ACCESS_TOKEN: '', GITLAB_API_URL: 'https://gitlab.com/api/v4'},
		description: 'GitLab API — projects, issues, MRs. Needs GITLAB_PERSONAL_ACCESS_TOKEN.',
		category: 'dev',
	},
	{
		name: 'google-drive',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-gdrive'],
		description: 'Google Drive — search + read files. Requires OAuth client config (see server README).',
		category: 'productivity',
	},
	{
		name: 'google-maps',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-google-maps'],
		env: {GOOGLE_MAPS_API_KEY: ''},
		description: 'Google Maps — geocoding, places, directions. Needs GOOGLE_MAPS_API_KEY.',
		category: 'productivity',
	},
	{
		name: 'kubernetes',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', 'mcp-server-kubernetes'],
		description: 'Read pods / services / deployments from the host kubeconfig. Read-only by default.',
		category: 'system',
	},
	{
		name: 'postgres',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/postgres'],
		description: 'Read-only Postgres queries. Edit the connection URL before enabling.',
		category: 'database',
	},
	{
		name: 'puppeteer',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-puppeteer'],
		description: 'Headless Chromium browsing — navigate, click, fill, screenshot. Heavy: bundles Chromium.',
		category: 'web',
	},
	{
		name: 'sequential-thinking',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
		description: 'Dynamic problem-solving through thought sequences.',
		category: 'productivity',
	},
	{
		name: 'slack',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-slack'],
		env: {SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: ''},
		description: 'Slack — list channels, post messages, search. Needs SLACK_BOT_TOKEN + SLACK_TEAM_ID.',
		category: 'productivity',
	},
	{
		name: 'sqlite',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', '/tmp/scratch.db'],
		description: 'Read-only SQLite queries against a path you choose.',
		category: 'database',
	},
	{
		name: 'tavily-search',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', 'tavily-mcp'],
		env: {TAVILY_API_KEY: ''},
		description: 'Tavily web search — designed for LLM grounding. Needs TAVILY_API_KEY.',
		category: 'search',
	},
	{
		name: 'time',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-time'],
		description: 'Current time + timezone conversions. Read-only.',
		category: 'productivity',
	},
]
