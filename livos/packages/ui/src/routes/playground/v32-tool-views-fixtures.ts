// Fixture ToolCallSnapshots for /playground/v32-tool-views.
// Each view type has two fixtures: one 'complete', one 'running'.

import {type ToolCallSnapshot} from '@/routes/ai-chat/v32/types'

const NOW = Date.now()
const PAST = NOW - 1_400

function make(
  overrides: Partial<ToolCallSnapshot> & Pick<ToolCallSnapshot, 'toolId' | 'name'>,
): ToolCallSnapshot {
  return {
    input: {},
    status: 'complete',
    startedAt: PAST,
    endedAt: NOW,
    ...overrides,
  }
}

// ── Browser ──────────────────────────────────────────────────────────────────

export const BROWSER_COMPLETE: ToolCallSnapshot = make({
  toolId: 'browser-1',
  name: 'browser_screenshot',
  input: {url: 'https://example.com'},
  // A tiny 1x1 transparent PNG as base64
  output: JSON.stringify({
    url: 'https://example.com',
    screenshot_base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  }),
})

export const BROWSER_RUNNING: ToolCallSnapshot = make({
  toolId: 'browser-2',
  name: 'browser_navigate',
  input: {url: 'https://livinity.io'},
  status: 'running',
  startedAt: NOW - 800,
  endedAt: undefined,
  output: undefined,
})

// ── Command ───────────────────────────────────────────────────────────────────

export const COMMAND_COMPLETE: ToolCallSnapshot = make({
  toolId: 'cmd-1',
  name: 'execute_command',
  input: {command: 'ls -la /opt/livos'},
  output: JSON.stringify({
    command: 'ls -la /opt/livos',
    output: 'total 48\ndrwxr-xr-x  8 bruce bruce 4096 May  5 12:00 .\ndrwxr-xr-x 18 root  root  4096 May  4 09:00 ..\ndrwxr-xr-x  3 bruce bruce 4096 May  5 12:00 packages\n-rw-r--r--  1 bruce bruce  892 May  5 11:55 update.sh\n',
    exit_code: 0,
  }),
})

export const COMMAND_RUNNING: ToolCallSnapshot = make({
  toolId: 'cmd-2',
  name: 'bash',
  input: {command: 'npm run build --workspace=packages/core'},
  status: 'running',
  startedAt: NOW - 2_000,
  endedAt: undefined,
  output: undefined,
})

// ── FileOp ────────────────────────────────────────────────────────────────────

export const FILEOP_READ_COMPLETE: ToolCallSnapshot = make({
  toolId: 'fop-1',
  name: 'read_file',
  input: {path: '/opt/livos/.env'},
  output: JSON.stringify({
    path: '/opt/livos/.env',
    content:
      'REDIS_URL=redis://:LivRedis2024%21@localhost:6379\nDATABASE_URL=postgresql://livos:secret@localhost:5432/livos\nLIV_API_KEY=sk-ant-api...',
  }),
})

export const FILEOP_RUNNING: ToolCallSnapshot = make({
  toolId: 'fop-2',
  name: 'write_file',
  input: {path: '/tmp/output.txt', content: 'hello world'},
  status: 'running',
  startedAt: NOW - 300,
  endedAt: undefined,
  output: undefined,
})

// ── StrReplace ────────────────────────────────────────────────────────────────

export const STR_REPLACE_COMPLETE: ToolCallSnapshot = make({
  toolId: 'str-1',
  name: 'str_replace',
  input: {
    path: '/opt/livos/packages/livinityd/source/server/index.ts',
    old_str: "const PORT = 8080;\napp.listen(PORT);",
    new_str:
      "const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;\napp.listen(PORT, () => console.log(`Listening on ${PORT}`));",
  },
  output: JSON.stringify({success: true}),
})

export const STR_REPLACE_RUNNING: ToolCallSnapshot = make({
  toolId: 'str-2',
  name: 'str_replace',
  input: {
    path: '/opt/livos/config.ts',
    old_str: 'version: "1.0"',
    new_str: 'version: "2.0"',
  },
  status: 'running',
  startedAt: NOW - 200,
  endedAt: undefined,
  output: undefined,
})

// ── WebSearch ─────────────────────────────────────────────────────────────────

export const WEB_SEARCH_COMPLETE: ToolCallSnapshot = make({
  toolId: 'search-1',
  name: 'web_search',
  input: {query: 'LivOS home server AI'},
  output: JSON.stringify({
    results: [
      {
        title: 'LivOS — AI-Powered Home Server OS',
        url: 'https://livinity.io',
        snippet: 'Self-hosted AI-powered home server operating system.',
      },
      {
        title: 'GitHub — livinity-io',
        url: 'https://github.com/utopusc/livinity-io',
        snippet: 'Monorepo for the LivOS project — React + Express + tRPC.',
      },
      {
        title: 'Suna AI Agent — Open Source',
        url: 'https://suna.so',
        snippet: 'Open source general-purpose AI agent with browser and computer use.',
      },
    ],
  }),
})

export const WEB_SEARCH_RUNNING: ToolCallSnapshot = make({
  toolId: 'search-2',
  name: 'web_search',
  input: {query: 'Model Context Protocol MCP servers'},
  status: 'running',
  startedAt: NOW - 600,
  endedAt: undefined,
  output: undefined,
})

// ── WebCrawl ──────────────────────────────────────────────────────────────────

export const WEB_CRAWL_COMPLETE: ToolCallSnapshot = make({
  toolId: 'crawl-1',
  name: 'web_crawl',
  input: {url: 'https://docs.anthropic.com/claude/docs'},
  output: JSON.stringify({
    url: 'https://docs.anthropic.com/claude/docs',
    text: 'Claude Documentation\n\nWelcome to the Claude API documentation. Claude is a family of AI assistants made by Anthropic.\n\nGetting Started\n\nTo use the Claude API, you need an Anthropic API key...',
    pages: [
      'https://docs.anthropic.com/claude/docs/getting-started',
      'https://docs.anthropic.com/claude/docs/models',
      'https://docs.anthropic.com/claude/docs/vision',
    ],
  }),
})

export const WEB_CRAWL_RUNNING: ToolCallSnapshot = make({
  toolId: 'crawl-2',
  name: 'crawl_webpage',
  input: {url: 'https://modelcontextprotocol.io'},
  status: 'running',
  startedAt: NOW - 1_000,
  endedAt: undefined,
  output: undefined,
})

// ── WebScrape ─────────────────────────────────────────────────────────────────

export const WEB_SCRAPE_COMPLETE: ToolCallSnapshot = make({
  toolId: 'scrape-1',
  name: 'web_scrape',
  input: {url: 'https://news.ycombinator.com'},
  output: JSON.stringify({
    url: 'https://news.ycombinator.com',
    content: {
      results: [
        {
          title: 'Model Context Protocol goes GA',
          url: 'https://example.com/mcp-ga',
          snippet: 'Anthropic releases MCP 1.0 specification today.',
        },
        {
          title: 'Building self-hosted AI with LivOS',
          url: 'https://livinity.io/blog/livos-ai',
          snippet: 'How to run your own AI agent stack on a Mini PC.',
        },
      ],
    },
  }),
})

export const WEB_SCRAPE_RUNNING: ToolCallSnapshot = make({
  toolId: 'scrape-2',
  name: 'web_scrape',
  input: {url: 'https://suna.so'},
  status: 'running',
  startedAt: NOW - 700,
  endedAt: undefined,
  output: undefined,
})

// ── MCP ───────────────────────────────────────────────────────────────────────

export const MCP_COMPLETE: ToolCallSnapshot = make({
  toolId: 'mcp-1',
  name: 'mcp_bytebot_screenshot',
  input: {region: null},
  output: JSON.stringify({
    content: {
      screenshot: 'ok',
      timestamp: new Date().toISOString(),
      resolution: '1920x1080',
    },
  }),
})

export const MCP_RUNNING: ToolCallSnapshot = make({
  toolId: 'mcp-2',
  name: 'mcp_exa_search',
  input: {query: 'React 19 new features', numResults: 5},
  status: 'running',
  startedAt: NOW - 900,
  endedAt: undefined,
  output: undefined,
})

// ── Generic ───────────────────────────────────────────────────────────────────

export const GENERIC_COMPLETE: ToolCallSnapshot = make({
  toolId: 'generic-1',
  name: 'unknown_custom_tool',
  input: {param1: 'value1', param2: 42, nested: {a: true}},
  output: JSON.stringify({status: 'ok', result: [1, 2, 3]}),
})

export const GENERIC_RUNNING: ToolCallSnapshot = make({
  toolId: 'generic-2',
  name: 'custom_async_op',
  input: {timeout: 30000},
  status: 'running',
  startedAt: NOW - 500,
  endedAt: undefined,
  output: undefined,
})

// ── Error example (shared across view types via GenericToolView) ──────────────

export const GENERIC_ERROR: ToolCallSnapshot = make({
  toolId: 'error-1',
  name: 'execute_command',
  input: {command: 'sudo rm -rf /'},
  status: 'error',
  output: 'Permission denied: operation not allowed',
})

// ── All fixtures in display order ─────────────────────────────────────────────

export type FixtureGroup = {
  label: string
  fixtures: ToolCallSnapshot[]
}

export const ALL_FIXTURE_GROUPS: FixtureGroup[] = [
  {label: 'BrowserToolView', fixtures: [BROWSER_COMPLETE, BROWSER_RUNNING]},
  {label: 'CommandToolView', fixtures: [COMMAND_COMPLETE, COMMAND_RUNNING]},
  {label: 'FileOpToolView', fixtures: [FILEOP_READ_COMPLETE, FILEOP_RUNNING]},
  {label: 'StrReplaceToolView', fixtures: [STR_REPLACE_COMPLETE, STR_REPLACE_RUNNING]},
  {label: 'WebSearchToolView', fixtures: [WEB_SEARCH_COMPLETE, WEB_SEARCH_RUNNING]},
  {label: 'WebCrawlToolView', fixtures: [WEB_CRAWL_COMPLETE, WEB_CRAWL_RUNNING]},
  {label: 'WebScrapeToolView', fixtures: [WEB_SCRAPE_COMPLETE, WEB_SCRAPE_RUNNING]},
  {label: 'McpToolView', fixtures: [MCP_COMPLETE, MCP_RUNNING]},
  {label: 'GenericToolView', fixtures: [GENERIC_COMPLETE, GENERIC_RUNNING, GENERIC_ERROR]},
]
