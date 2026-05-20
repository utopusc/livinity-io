/**
 * Phase 182-04 — featured-mcps.ts
 *
 * Shared FEATURED_MCPS constant and FeaturedMcp type, extracted from
 * routes/ai-chat/mcp-panel.tsx so both the chat sidebar and the
 * settings/mcp-servers.tsx page can import from one place.
 */

export type FeaturedMcp = {
	name: string
	displayName: string
	description: string
	category: string
	icon: 'search' | 'github' | 'database' | 'browser' | 'filesystem' | 'brain' | 'api' | 'cloud' | 'world' | 'git' | 'note' | 'mongodb' | 'bolt'
	gradient: string
	npmPackage?: string
	remoteUrl?: string
	transport: 'stdio' | 'streamableHttp'
	customCommand?: string
	customArgs?: string[]
	credentials?: Array<{
		key: string
		label: string
		placeholder: string
		isSecret?: boolean
		type?: 'url' | 'token'
		helpText?: string
		helpUrl?: string
	}>
	headerTemplate?: Record<string, string>
}

export const FEATURED_MCPS: FeaturedMcp[] = [
	{
		name: 'brave-search',
		displayName: 'Brave Search',
		description: 'Web and local search using the Brave Search API',
		category: 'Search',
		icon: 'search',
		gradient: 'from-orange-500/30 to-red-500/30',
		npmPackage: '@modelcontextprotocol/server-brave-search',
		transport: 'stdio',
	},
	{
		name: 'github',
		displayName: 'GitHub',
		description: 'Repository management, file operations, issues, and pull requests',
		category: 'Dev Tools',
		icon: 'github',
		gradient: 'from-gray-500/30 to-slate-500/30',
		npmPackage: '@modelcontextprotocol/server-github',
		transport: 'stdio',
	},
	{
		name: 'filesystem',
		displayName: 'Filesystem',
		description: 'Secure file operations with configurable access controls',
		category: 'File System',
		icon: 'filesystem',
		gradient: 'from-blue-500/30 to-cyan-500/30',
		npmPackage: '@modelcontextprotocol/server-filesystem',
		transport: 'stdio',
	},
	{
		name: 'puppeteer',
		displayName: 'Puppeteer',
		description: 'Browser automation and web scraping with screenshots',
		category: 'Browser',
		icon: 'browser',
		gradient: 'from-green-500/30 to-emerald-500/30',
		npmPackage: '@modelcontextprotocol/server-puppeteer',
		transport: 'stdio',
	},
	{
		name: 'postgres',
		displayName: 'PostgreSQL',
		description: 'Read-only access to PostgreSQL databases with schema inspection',
		category: 'Database',
		icon: 'database',
		gradient: 'from-indigo-500/30 to-blue-500/30',
		npmPackage: '@modelcontextprotocol/server-postgres',
		transport: 'stdio',
	},
	{
		name: 'memory',
		displayName: 'Memory',
		description: 'Knowledge graph-based persistent memory system',
		category: 'AI',
		icon: 'brain',
		gradient: 'from-purple-500/30 to-pink-500/30',
		npmPackage: '@modelcontextprotocol/server-memory',
		transport: 'stdio',
	},
	{
		name: 'sequential-thinking',
		displayName: 'Sequential Thinking',
		description: 'Dynamic problem-solving through thought sequences',
		category: 'AI',
		icon: 'brain',
		gradient: 'from-violet-500/30 to-fuchsia-500/30',
		npmPackage: '@modelcontextprotocol/server-sequential-thinking',
		transport: 'stdio',
	},
	{
		name: 'fetch',
		displayName: 'Fetch',
		description: 'Web content fetching and conversion for efficient LLM usage',
		category: 'Web',
		icon: 'world',
		gradient: 'from-teal-500/30 to-cyan-500/30',
		npmPackage: '@modelcontextprotocol/server-fetch',
		transport: 'stdio',
	},
	{
		name: 'git',
		displayName: 'Git',
		description: 'Read, search, and manipulate Git repositories with commit management',
		category: 'Dev Tools',
		icon: 'git',
		gradient: 'from-orange-500/30 to-amber-500/30',
		npmPackage: '@modelcontextprotocol/server-git',
		transport: 'stdio',
	},
]
