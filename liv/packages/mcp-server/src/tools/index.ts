import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import IORedis from 'ioredis';
import * as z from 'zod';

// Helper: push to inbox with requestId and poll for answer
async function requestAndPoll(
  redis: IORedis,
  message: string,
  params: Record<string, any>,
  action: string,
  timeoutMs = 30_000,
): Promise<string> {
  const requestId = `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await redis.lpush(
    'nexus:inbox',
    JSON.stringify({ message, source: 'mcp', requestId, params, timestamp: Date.now() }),
  );

  const maxIterations = Math.ceil(timeoutMs / 500);
  for (let i = 0; i < maxIterations; i++) {
    const answer = await redis.get(`nexus:answer:${requestId}`);
    if (answer) {
      await redis.del(`nexus:answer:${requestId}`);
      return answer;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return `[timeout] Nexus is still processing. Request ID: ${requestId}`;
}

export function registerTools(server: McpServer, redis: IORedis) {
  // ── Existing tools ──────────────────────────────────────────────

  // nexus_task - Submit a task to the daemon
  server.registerTool('nexus_task', {
    title: 'Submit Task',
    description: 'Submit a task to the Nexus daemon for execution. Tasks can be: test, scrape, research, leadgen, or any free-form command.',
    inputSchema: {
      task: z.string().describe('Description of the task to execute'),
      priority: z.number().optional().describe('Priority 1-3 (1=highest)'),
    },
  }, async ({ task, priority }) => {
    await redis.lpush('nexus:inbox', JSON.stringify({ message: task, source: 'mcp', priority: priority || 2, timestamp: Date.now() }));
    return { content: [{ type: 'text' as const, text: `Task queued: "${task}" (priority: ${priority || 2})` }] };
  });

  // nexus_status - Get daemon status
  server.registerTool('nexus_status', {
    title: 'Get Status',
    description: 'Get the current status of Nexus daemon, running containers, and pending tasks.',
    inputSchema: {},
  }, async () => {
    const inboxLen = await redis.llen('nexus:inbox');
    const lastLog = await redis.get('nexus:last_log') || 'No recent activity';
    const stats = await redis.get('nexus:stats') || '{}';
    return { content: [{ type: 'text' as const, text: `Inbox: ${inboxLen} pending\nLast: ${lastLog}\nStats: ${stats}` }] };
  });

  // nexus_logs - Get recent logs
  server.registerTool('nexus_logs', {
    title: 'Get Logs',
    description: 'Get the most recent Nexus daemon logs.',
    inputSchema: {
      lines: z.number().optional().describe('Number of log lines to retrieve (default: 20)'),
    },
  }, async ({ lines }) => {
    const count = lines || 20;
    const logs = await redis.lrange('nexus:logs', 0, count - 1);
    return { content: [{ type: 'text' as const, text: logs.length ? logs.join('\n') : 'No logs yet.' }] };
  });

  // nexus_scrape - Scrape a URL
  server.registerTool('nexus_scrape', {
    title: 'Scrape URL',
    description: 'Scrape a URL using Firecrawl and return the content as markdown.',
    inputSchema: {
      url: z.string().url().describe('URL to scrape'),
      format: z.enum(['markdown', 'text', 'html']).optional().describe('Output format'),
    },
  }, async ({ url, format }) => {
    await redis.lpush('nexus:inbox', JSON.stringify({ message: `scrape: ${url}`, source: 'mcp', params: { url, format: format || 'markdown' }, timestamp: Date.now() }));
    return { content: [{ type: 'text' as const, text: `Scraping queued: ${url} (format: ${format || 'markdown'})` }] };
  });

  // nexus_remember - Store in memory
  server.registerTool('nexus_remember', {
    title: 'Remember',
    description: 'Store information in Nexus memory (Cognee knowledge graph). Use this to remember facts, notes, project context.',
    inputSchema: {
      content: z.string().describe('The information to remember'),
      tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
    },
  }, async ({ content, tags }) => {
    await redis.lpush('nexus:memory_queue', JSON.stringify({ content, tags: tags || [], timestamp: Date.now() }));
    return { content: [{ type: 'text' as const, text: `Remembered: "${content.substring(0, 100)}..."` }] };
  });

  // nexus_ask - Ask the daemon a question
  server.registerTool('nexus_ask', {
    title: 'Ask Nexus',
    description: 'Ask Nexus a question. It will search its memory and recent context to answer.',
    inputSchema: {
      question: z.string().describe('Your question'),
    },
  }, async ({ question }) => {
    const answer = await requestAndPoll(redis, question, { query: question }, 'ask');
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_test - Run tests
  server.registerTool('nexus_test', {
    title: 'Run Tests',
    description: 'Run Playwright tests or custom test commands on the server.',
    inputSchema: {
      command: z.string().optional().describe('Custom test command (default: runs Playwright tests)'),
      path: z.string().optional().describe('Path to test files'),
    },
  }, async ({ command, path }) => {
    const testCmd = command || `npx playwright test ${path || ''}`;
    await redis.lpush('nexus:inbox', JSON.stringify({ message: `test: ${testCmd}`, source: 'mcp', timestamp: Date.now() }));
    return { content: [{ type: 'text' as const, text: `Test queued: ${testCmd}` }] };
  });

  // nexus_cron - Schedule a recurring task
  server.registerTool('nexus_cron', {
    title: 'Schedule Task',
    description: 'Schedule a task to run at a specific interval or after a delay.',
    inputSchema: {
      task: z.string().describe('Task description'),
      delay_minutes: z.number().optional().describe('Run after X minutes'),
      repeat_hours: z.number().optional().describe('Repeat every X hours'),
    },
  }, async ({ task, delay_minutes, repeat_hours }) => {
    const schedule = { task, delay_minutes, repeat_hours, created: Date.now() };
    await redis.lpush('nexus:schedules', JSON.stringify(schedule));
    const when = delay_minutes ? `in ${delay_minutes} minutes` : repeat_hours ? `every ${repeat_hours} hours` : 'once';
    return { content: [{ type: 'text' as const, text: `Scheduled: "${task}" (${when})` }] };
  });

  // ── New tools ──────────────────────────────────────────────────

  // nexus_shell - Run shell commands on the server
  server.registerTool('nexus_shell', {
    title: 'Shell Command',
    description: 'Execute a shell command on Server 4. Commands that match a safety blocklist (rm -rf /, fork bomb, mkfs, etc.) are rejected. Output is truncated to 10K chars. Timeout: 30s.',
    inputSchema: {
      command: z.string().describe('Shell command to execute (e.g. "ls -la /opt/nexus", "uptime", "df -h")'),
      timeout_ms: z.number().optional().describe('Timeout in milliseconds (default: 30000, max: 60000)'),
    },
  }, async ({ command, timeout_ms }) => {
    const answer = await requestAndPoll(
      redis,
      `shell: ${command}`,
      { cmd: command, timeout: Math.min(timeout_ms || 30000, 60000) },
      'shell',
      35_000,
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_docker_manage - Docker container lifecycle management
  server.registerTool('nexus_docker_manage', {
    title: 'Docker Manage',
    description: 'Manage Docker containers: start, stop, restart, inspect, or get logs of a container by name.',
    inputSchema: {
      operation: z.enum(['start', 'stop', 'restart', 'inspect', 'logs']).describe('Operation to perform'),
      name: z.string().describe('Container name (e.g. "nexus-firecrawl", "nexus-playwright")'),
      tail: z.number().optional().describe('Number of log lines for "logs" operation (default: 100)'),
    },
  }, async ({ operation, name, tail }) => {
    const answer = await requestAndPoll(
      redis,
      `docker ${operation} ${name}`,
      { operation, name, tail },
      'docker-manage',
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_docker_exec - Execute command inside a container
  server.registerTool('nexus_docker_exec', {
    title: 'Docker Exec',
    description: 'Execute a command inside a running Docker container.',
    inputSchema: {
      container: z.string().describe('Container name'),
      command: z.string().describe('Command to execute inside the container'),
    },
  }, async ({ container, command }) => {
    const answer = await requestAndPoll(
      redis,
      `docker exec ${container} ${command}`,
      { container, cmd: command },
      'docker-exec',
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_pm2 - PM2 process management
  server.registerTool('nexus_pm2', {
    title: 'PM2 Manage',
    description: 'Manage PM2 processes: list, restart, stop, start, reload, logs, or status.',
    inputSchema: {
      operation: z.enum(['list', 'restart', 'stop', 'start', 'reload', 'logs', 'status']).describe('PM2 operation'),
      name: z.string().optional().describe('Process name (required for restart/stop/start/reload)'),
    },
  }, async ({ operation, name }) => {
    const answer = await requestAndPoll(
      redis,
      `pm2 ${operation}${name ? ' ' + name : ''}`,
      { operation, name },
      'pm2',
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_sysinfo - System monitoring
  server.registerTool('nexus_sysinfo', {
    title: 'System Info',
    description: 'Get system information: CPU usage, RAM, disk space, network connections, or uptime.',
    inputSchema: {
      topic: z.enum(['all', 'cpu', 'ram', 'disk', 'network', 'uptime']).optional().describe('What system info to retrieve (default: all)'),
    },
  }, async ({ topic }) => {
    const answer = await requestAndPoll(
      redis,
      `sysinfo ${topic || 'all'}`,
      { topic: topic || 'all' },
      'sysinfo',
      20_000,
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_agent - Autonomous agent mode for complex multi-step tasks
  server.registerTool('nexus_agent', {
    title: 'Agent Mode',
    description: 'Trigger Nexus autonomous agent mode for complex multi-step tasks. The agent uses a ReAct loop (Observe→Think→Act→Repeat) with access to all server tools (shell, docker, pm2, sysinfo, files). Use this for tasks requiring multiple steps, conditional logic, or investigation. Timeout: 5 minutes.',
    inputSchema: {
      task: z.string().describe('Detailed description of the task for the agent to solve autonomously'),
      max_turns: z.number().optional().describe('Maximum reasoning turns (default: 10, max: 20)'),
    },
  }, async ({ task, max_turns }) => {
    const turns = Math.min(max_turns || 10, 20);
    const answer = await requestAndPoll(
      redis,
      `agent: ${task}`,
      { task, max_turns: turns },
      'agent',
      300_000, // 5-minute timeout for agent tasks
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });

  // nexus_files - File operations
  server.registerTool('nexus_files', {
    title: 'File Operations',
    description: 'Perform file operations on Server 4: read, write, list directory, stat, delete, or mkdir.',
    inputSchema: {
      operation: z.enum(['read', 'write', 'list', 'stat', 'delete', 'mkdir']).describe('File operation to perform'),
      path: z.string().describe('Absolute file/directory path'),
      content: z.string().optional().describe('Content to write (only for "write" operation)'),
    },
  }, async ({ operation, path, content }) => {
    const answer = await requestAndPoll(
      redis,
      `file ${operation} ${path}`,
      { operation, path, content },
      'files',
    );
    return { content: [{ type: 'text' as const, text: answer }] };
  });
}
