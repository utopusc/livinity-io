import { Brain, ModelTier } from './brain.js';
import { logger } from './logger.js';

export interface Intent {
  type: string;
  action: string;
  params: Record<string, any>;
  source: 'mcp' | 'whatsapp' | 'cron' | 'daemon' | 'webhook' | 'telegram' | 'discord' | 'slack' | 'matrix' | 'signal' | 'line' | 'gmail';
  raw: string;
  from?: string; // WhatsApp JID or channel chatId — carried through for responses
}

export interface TaskResult {
  success: boolean;
  message: string;
  data?: unknown;
}

type Handler = (intent: Intent) => Promise<TaskResult>;

export class Router {
  private handlers: Map<string, Handler> = new Map();
  private brain: Brain;

  constructor(brain: Brain) {
    this.brain = brain;
  }

  register(action: string, handler: Handler) {
    this.handlers.set(action, handler);
    logger.info(`Router: registered handler for "${action}"`);
  }

  async classify(rawInput: string, source: Intent['source']): Promise<Intent> {
    // Try rule-based classification first (no AI, no cost)
    const ruleResult = this.ruleBasedClassify(rawInput, source);
    if (ruleResult) return ruleResult;

    // Use cheap AI for classification
    const response = await this.brain.think({
      prompt: `Classify this user command into an action. Extract parameters.
Input: "${rawInput}"

ACTION GUIDE (pick the most specific match):
- shell: Run any shell/terminal command. params: {cmd:"<full command>"}. Use for: ls, cat, grep, uptime, apt, systemctl, curl, wget, any Linux command.
- docker-manage: Start/stop/restart/inspect/get logs of a Docker container. params: {operation:"start|stop|restart|inspect|logs", name:"<container>"}
- docker-exec: Run a command INSIDE a Docker container. params: {container:"<name>", cmd:"<command>"}
- docker: List containers. params: {cmd:"list"}
- pm2: PM2 process management. params: {operation:"list|restart|stop|start|reload|logs|status", name:"<process>"}
- sysinfo: System info (CPU, RAM, disk, network, uptime). params: {topic:"all|cpu|ram|disk|network|uptime"}
- files: File operations. params: {operation:"read|write|list|stat|delete|mkdir", path:"<path>", content?:"<text>"}
- status: Nexus daemon status/health
- logs: Nexus daemon logs
- test: Run tests. params: {command?:"<cmd>"}
- scrape: Scrape a URL. params: {url:"<url>"}
- research: Web research. params: {query:"<topic>"}
- leadgen: Lead generation. params: {query:"<topic>"}
- remember: Store info in memory. params: {content:"<text>"}
- cron: Schedule a task for later execution. params: {delay:<number>, unit:"minutes|hours", task:"<what to do when triggered>"}
- agent: Complex multi-step task requiring autonomous reasoning. params: {task:"<full task description>"}. Use for: tasks with conditions ("if X then Y"), multi-step operations ("check A, then do B"), investigation tasks ("find why X is slow"), or anything requiring multiple tool calls in sequence.
- ask: Simple question needing a single AI answer. params: {query:"<question>"}

IMPORTANT: Prefer specific actions (shell, sysinfo, files, docker-manage, pm2) for simple single-step commands. Use "agent" for complex multi-step tasks. Only use "ask" for simple questions.

Respond in JSON only:
{"type":"<intent_type>","action":"<action_name>","params":{}}`,
      tier: 'flash',
      maxTokens: 200,
    });

    try {
      const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
      return { ...parsed, source, raw: rawInput };
    } catch {
      return { type: 'classify', action: 'ask', params: { query: rawInput }, source, raw: rawInput };
    }
  }

  private ruleBasedClassify(input: string, source: Intent['source']): Intent | null {
    const lower = input.toLowerCase().trim();

    // Simple greetings and short messages - go directly to agent (skip AI classification)
    const greetings = /^(merhaba|selam|hey|hi|hello|hola|hey there|good morning|good evening|günaydın|iyi akşamlar|nasılsın|naber|nabersin|whats up|sup)$/i;
    if (greetings.test(lower) || lower.length < 80) {
      // Short messages or greetings - use agent directly (skip slow AI classification)
      return { type: 'conversation', action: 'ask', params: { query: input }, source, raw: input };
    }

    // Status check
    if (/^(status|health|state)/.test(lower)) {
      return { type: 'status_check', action: 'status', params: {}, source, raw: input };
    }
    // Test
    if (/^(test|run tests?)/.test(lower)) {
      return { type: 'direct_execute', action: 'test', params: {}, source, raw: input };
    }
    // Logs
    if (/^(log|logs|recent logs)/.test(lower)) {
      return { type: 'status_check', action: 'logs', params: {}, source, raw: input };
    }
    // Docker list
    if (/^docker (ps|list|containers)/.test(lower)) {
      return { type: 'docker_command', action: 'docker', params: { cmd: 'list' }, source, raw: input };
    }
    // Scrape
    if (/^scrape:?\s+(.+)/.test(lower)) {
      const url = input.replace(/^scrape:?\s+/i, '').trim();
      return { type: 'direct_execute', action: 'scrape', params: { url }, source, raw: input };
    }
    // Remember
    if (/^remember:?\s+(.+)/.test(lower)) {
      const content = input.replace(/^remember:?\s+/i, '').trim();
      return { type: 'direct_execute', action: 'remember', params: { content }, source, raw: input };
    }
    // Leadgen
    if (/^(leadgen|lead):?\s+(.+)/.test(lower)) {
      const query = input.replace(/^(leadgen|lead):?\s+/i, '').trim();
      return { type: 'research', action: 'leadgen', params: { query }, source, raw: input };
    }

    // Cron / scheduling: "2 minutes later do X", "5 min later check", "1 hour later remind"
    // Skip if message is a question (contains ?, question words, or past-tense references)
    const isQuestion = /[?]/.test(lower)
      || /\b(what|why|how|when|where|who|which|did|does|was|were|has|have|had)\b/.test(lower);

    if (!isQuestion) {
      const cronMatch = lower.match(/^(\d+)\s*(hours?|hr|minutes?|min|mins?)\s*(later|from now|in)\s*(.*)/);
      if (cronMatch) {
        const amount = parseInt(cronMatch[1]);
        const unit = /^(hour|hr)/.test(cronMatch[2]) ? 'hours' : 'minutes';
        const task = cronMatch[4]?.trim() || '';
        return { type: 'cron_set', action: 'cron', params: { delay: amount, unit, task }, source, raw: input };
      }
      // Alt pattern: "in 5 minutes do X"
      const cronMatch2 = lower.match(/^in\s+(\d+)\s*(hours?|hr|minutes?|min|mins?)\s*(.*)/);
      if (cronMatch2) {
        const amount = parseInt(cronMatch2[1]);
        const unit = /^(hour|hr)/.test(cronMatch2[2]) ? 'hours' : 'minutes';
        const task = cronMatch2[3]?.trim() || '';
        return { type: 'cron_set', action: 'cron', params: { delay: amount, unit, task }, source, raw: input };
      }
    }

    // Shell / exec commands
    if (/^(shell|exec|run):?\s+(.+)/i.test(lower)) {
      const cmd = input.replace(/^(shell|exec|run):?\s+/i, '').trim();
      return { type: 'shell_command', action: 'shell', params: { cmd }, source, raw: input };
    }

    // Docker management: start/stop/restart/inspect/logs <name>
    if (/^docker\s+(start|stop|restart|inspect|logs)\s+(.+)/.test(lower)) {
      const match = lower.match(/^docker\s+(start|stop|restart|inspect|logs)\s+(.+)/);
      return { type: 'docker_command', action: 'docker-manage', params: { operation: match![1], name: match![2].trim() }, source, raw: input };
    }

    // Docker exec: docker exec <container> <cmd>
    if (/^docker\s+exec\s+(\S+)\s+(.+)/.test(lower)) {
      const match = input.match(/^docker\s+exec\s+(\S+)\s+(.+)/i);
      return { type: 'docker_command', action: 'docker-exec', params: { container: match![1], cmd: match![2].trim() }, source, raw: input };
    }

    // PM2 commands
    if (/^pm2\s+(list|ls|restart|stop|start|reload|logs|status)(?:\s+(.+))?/.test(lower)) {
      const match = lower.match(/^pm2\s+(list|ls|restart|stop|start|reload|logs|status)(?:\s+(.+))?/);
      return { type: 'service_management', action: 'pm2', params: { operation: match![1], name: match?.[2]?.trim() }, source, raw: input };
    }

    // System info
    if (/^(sysinfo|system|ram|cpu|disk|network|uptime|memory)/.test(lower)) {
      const topic = lower.match(/^(sysinfo|system|ram|cpu|disk|network|uptime|memory)/)?.[1] || 'all';
      return { type: 'system_monitor', action: 'sysinfo', params: { topic: topic === 'memory' ? 'ram' : topic }, source, raw: input };
    }

    // File operations
    if (/^file\s+(read|write|list|delete|mkdir|stat)\s+(.+)/.test(lower)) {
      const match = input.match(/^file\s+(\w+)\s+(.+)/i);
      return { type: 'file_operation', action: 'files', params: { operation: match![2].toLowerCase(), path: match![3]?.trim() }, source, raw: input };
    }

    // Agent mode (explicit)
    if (/^agent:?\s+(.+)/i.test(lower)) {
      const task = input.replace(/^agent:?\s+/i, '').trim();
      return { type: 'agent_task', action: 'agent', params: { task }, source, raw: input };
    }

    // Systemctl / service management
    if (/^(systemctl|service)\s+(start|stop|restart|status|enable|disable)\s+(.+)/.test(lower)) {
      const match = input.match(/^(systemctl|service)\s+(\w+)\s+(.+)/i);
      return { type: 'shell_command', action: 'shell', params: { cmd: `systemctl ${match![2]} ${match![3].trim()}` }, source, raw: input };
    }

    return null; // Couldn't classify with rules, fall through to AI
  }

  async route(intent: Intent): Promise<TaskResult> {
    const handler = this.handlers.get(intent.action);
    if (handler) {
      logger.info(`Routing: ${intent.action}`, { source: intent.source, params: intent.params });
      return handler(intent);
    }

    // No handler found — fall through to agent loop if registered
    const agentHandler = this.handlers.get('agent');
    if (agentHandler) {
      logger.info(`Routing: agent (fallthrough from "${intent.action}")`, { source: intent.source });
      return agentHandler({
        ...intent,
        action: 'agent',
        params: { ...intent.params, task: intent.raw },
      });
    }

    // Final fallback: single-shot brain response
    const tier = this.brain.selectTier(intent.type);
    if (tier === 'none') {
      return { success: false, message: `No handler for action: ${intent.action}` };
    }

    const response = await this.brain.think({
      prompt: `Task: ${intent.raw}\nContext: ${JSON.stringify(intent.params)}`,
      tier,
    });

    return { success: true, message: response };
  }
}
