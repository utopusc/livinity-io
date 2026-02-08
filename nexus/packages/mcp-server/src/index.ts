import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import IORedis from 'ioredis';
import { registerTools } from './tools/index.js';

const app = express();
app.use(express.json());

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport;
        console.log(`[MCP] Session initialized: ${id}`);
      },
      onsessionclosed: (id) => {
        delete transports[id];
        console.log(`[MCP] Session closed: ${id}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    const server = new McpServer({ name: 'nexus', version: '1.0.0' });
    registerTools(server, redis);
    await server.connect(transport);
  } else {
    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Invalid session' }, id: null });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).send('Invalid session');
  }
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).send('Invalid session');
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', sessions: Object.keys(transports).length }));

const PORT = parseInt(process.env.MCP_PORT || '3100');
const HOST = process.env.MCP_HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[MCP] Nexus MCP Server running on http://${HOST}:${PORT}/mcp`);
});
