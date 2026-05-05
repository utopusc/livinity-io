/**
 * Liv Memory Service v2
 * Simple SQLite-based memory with vector embeddings
 * Inspired by OpenClaw's memory system
 */

import express from 'express';
import Database from 'better-sqlite3';
import { Redis } from 'ioredis';
import path from 'path';
import fs from 'fs';
import { requireApiKey } from './auth.js';

const PORT = parseInt(process.env.MEMORY_PORT || '3300', 10);
const DATA_DIR = process.env.MEMORY_DATA_DIR || '/opt/nexus/data/memory';
const DB_PATH = path.join(DATA_DIR, 'memory.db');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Deduplication threshold: memories above this cosine similarity are merged
const DEDUP_THRESHOLD = 0.92;

// Time-decay: memories lose half their recency boost every 30 days
const AGE_DECAY_HALF_LIFE_DAYS = 30;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize SQLite database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
  CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    summary TEXT,
    message_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

  CREATE TABLE IF NOT EXISTS memory_sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_memory_sessions_session ON memory_sessions(session_id);
  CREATE INDEX IF NOT EXISTS idx_memory_sessions_memory ON memory_sessions(memory_id);

  CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'web',
    chat_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ct_user ON conversation_turns(user_id);
  CREATE INDEX IF NOT EXISTS idx_ct_channel ON conversation_turns(channel);
  CREATE INDEX IF NOT EXISTS idx_ct_created ON conversation_turns(created_at);
`);

// FTS5 virtual table and sync triggers (created separately as they use different syntax)
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS conversation_turns_fts USING fts5(
    content,
    content='conversation_turns',
    content_rowid='id'
  );
`);

// Triggers to keep FTS5 in sync with conversation_turns
try {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ct_ai AFTER INSERT ON conversation_turns BEGIN
      INSERT INTO conversation_turns_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ct_ad AFTER DELETE ON conversation_turns BEGIN
      INSERT INTO conversation_turns_fts(conversation_turns_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;
  `);
} catch {
  // Triggers may already exist — safe to ignore
}

// Redis connection
let redis: Redis | null = null;
try {
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
  redis.on('error', (err: Error) => console.error('[Memory] Redis error:', err.message));
} catch (err) {
  console.warn('[Memory] Redis not available, running without Redis');
}

// Helper: Generate simple ID
function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Helper: Get Kimi API key from Redis or env
async function getKimiKey(): Promise<string | null> {
  if (redis) {
    const key = await redis.get('livos:config:kimi_api_key');
    if (key) return key;
  }
  return process.env.KIMI_API_KEY || null;
}

// Helper: Get embeddings via Kimi API (OpenAI-compatible)
async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = await getKimiKey();
  if (!apiKey) {
    console.warn('[Memory] No Kimi API key available for embeddings');
    return null;
  }

  try {
    const response = await fetch(
      'https://api.kimi.com/coding/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'kimi-embedding',
          input: text,
        }),
      }
    );

    if (!response.ok) {
      console.error('[Memory] Embedding API error:', response.status);
      return null;
    }

    const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.error('[Memory] Embedding error:', err);
    return null;
  }
}

// Helper: Cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Express app
const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check (public - no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.2.0', db: DB_PATH });
});

// Auth middleware - all routes below this require X-API-Key header
app.use(requireApiKey);

// Add memory (with deduplication and optional session binding)
app.post('/add', async (req, res) => {
  try {
    const { userId, content, metadata, sessionId } = req.body;

    if (!userId || !content) {
      return res.status(400).json({ error: 'userId and content are required' });
    }

    const now = Date.now();

    // Get embedding for content
    const embedding = await getEmbedding(content);

    // Deduplication: check if a similar memory already exists
    if (embedding) {
      const recentMemories = db.prepare(`
        SELECT id, content, embedding, updated_at
        FROM memories
        WHERE user_id = ? AND embedding IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 50
      `).all(userId) as Array<{
        id: string;
        content: string;
        embedding: string;
        updated_at: number;
      }>;

      for (const existing of recentMemories) {
        const existingEmb = JSON.parse(existing.embedding) as number[];
        const similarity = cosineSimilarity(embedding, existingEmb);

        if (similarity >= DEDUP_THRESHOLD) {
          // Merge: update the existing memory with newer phrasing
          db.prepare(`
            UPDATE memories SET content = ?, embedding = ?, updated_at = ? WHERE id = ?
          `).run(content, JSON.stringify(embedding), now, existing.id);

          console.log(`[Memory] Dedup: merged with existing memory ${existing.id} (similarity: ${similarity.toFixed(3)})`);

          // Still bind session if provided
          if (sessionId) {
            const msId = `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            db.prepare(`
              INSERT INTO memory_sessions (id, session_id, memory_id, created_at) VALUES (?, ?, ?, ?)
            `).run(msId, sessionId, existing.id, now);
          }

          return res.json({ success: true, id: existing.id, deduplicated: true });
        }
      }
    }

    // No dedup match — insert new memory
    const id = generateId();

    const stmt = db.prepare(`
      INSERT INTO memories (id, user_id, content, embedding, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      userId,
      content,
      embedding ? JSON.stringify(embedding) : null,
      metadata ? JSON.stringify(metadata) : null,
      now,
      now
    );

    // Bind to session if provided
    if (sessionId) {
      const msId = `ms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      db.prepare(`
        INSERT INTO memory_sessions (id, session_id, memory_id, created_at) VALUES (?, ?, ?, ?)
      `).run(msId, sessionId, id, now);
    }

    console.log(`[Memory] Added memory ${id} for user ${userId}`);
    res.json({ success: true, id });
  } catch (err: any) {
    console.error('[Memory] Add error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Archive a conversation turn to persistent SQLite store
app.post('/archive', (req, res) => {
  try {
    const { userId, channel, chatId, role, content, metadata } = req.body;

    if (!userId || !content) {
      return res.status(400).json({ error: 'userId and content are required' });
    }

    if (role && role !== 'user' && role !== 'assistant') {
      return res.status(400).json({ error: 'role must be "user" or "assistant"' });
    }

    const result = db.prepare(`
      INSERT INTO conversation_turns (user_id, channel, chat_id, role, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      channel || 'web',
      chatId || '',
      role || 'user',
      content,
      metadata ? JSON.stringify(metadata) : null,
      Date.now()
    );

    console.log(`[Memory] Archived ${role || 'user'} turn for ${userId} on ${channel || 'web'}`);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    console.error('[Memory] Archive error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search conversation history via FTS5 full-text search
app.post('/conversation-search', (req, res) => {
  try {
    const { query, userId, channel, limit = 20, since } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Sanitize FTS5 query: wrap each word in double quotes for safety
    const sanitizedQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map((w: string) => '"' + w.replace(/"/g, '') + '"')
      .join(' ');

    if (!sanitizedQuery) {
      return res.json({ results: [] });
    }

    // Build dynamic query with optional filters
    let sql = `
      SELECT ct.id, ct.user_id, ct.channel, ct.chat_id, ct.role, ct.content, ct.metadata, ct.created_at
      FROM conversation_turns ct
      JOIN conversation_turns_fts fts ON ct.id = fts.rowid
      WHERE conversation_turns_fts MATCH ?
    `;
    const params: any[] = [sanitizedQuery];

    if (userId) {
      sql += ' AND ct.user_id = ?';
      params.push(userId);
    }
    if (channel) {
      sql += ' AND ct.channel = ?';
      params.push(channel);
    }
    if (since) {
      sql += ' AND ct.created_at > ?';
      params.push(since);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Array<{
      id: number;
      user_id: string;
      channel: string;
      chat_id: string;
      role: string;
      content: string;
      metadata: string | null;
      created_at: number;
    }>;

    const results = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      chatId: row.chat_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
    }));

    res.json({ results });
  } catch (err: any) {
    console.error('[Memory] Conversation search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Search memories with relevance + time-decay scoring (shared by /search and /context)
async function searchMemories(
  userId: string,
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; content: string; score: number; createdAt: number; metadata: any }>> {
  // Get all memories for user
  const memories = db.prepare(`
    SELECT id, content, embedding, metadata, created_at
    FROM memories
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(userId) as Array<{
    id: string;
    content: string;
    embedding: string | null;
    metadata: string | null;
    created_at: number;
  }>;

  if (!query) {
    // No query, return recent memories
    return memories.slice(0, limit).map(m => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
      score: 1,
      createdAt: m.created_at,
    }));
  }

  // Get query embedding for semantic search
  const queryEmbedding = await getEmbedding(query);
  const nowMs = Date.now();

  if (!queryEmbedding) {
    // Fallback to text search with time-decay scoring
    const searchTerm = `%${query.toLowerCase()}%`;
    const textResults = db.prepare(`
      SELECT id, content, metadata, created_at
      FROM memories
      WHERE user_id = ? AND LOWER(content) LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, limit) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      created_at: number;
    }>;

    return textResults.map(m => {
      const decayFactor = Math.pow(0.5, (nowMs - m.created_at) / (AGE_DECAY_HALF_LIFE_DAYS * 86400000));
      return {
        id: m.id,
        content: m.content,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        score: 0.5 * decayFactor,
        createdAt: m.created_at,
      };
    });
  }

  // Semantic search with embeddings + time-decay scoring
  return memories
    .filter(m => m.embedding)
    .map(m => {
      const emb = JSON.parse(m.embedding!) as number[];
      const relevanceScore = cosineSimilarity(queryEmbedding, emb);
      const decayFactor = Math.pow(0.5, (nowMs - m.created_at) / (AGE_DECAY_HALF_LIFE_DAYS * 86400000));
      const finalScore = relevanceScore * 0.7 + decayFactor * 0.3; // 70% relevance, 30% recency
      return {
        id: m.id,
        content: m.content,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        score: finalScore,
        createdAt: m.created_at,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Search memories (with time-decay scoring)
app.post('/search', async (req, res) => {
  try {
    const { userId, query, limit = 10 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const results = await searchMemories(userId, query, limit);
    res.json({ results });
  } catch (err: any) {
    console.error('[Memory] Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Assemble memory context within a token budget
app.post('/context', async (req, res) => {
  try {
    const { userId, query, tokenBudget = 2000, limit = 20 } = req.body;

    if (!userId || !query) {
      return res.status(400).json({ error: 'userId and query are required' });
    }

    const scoredMemories = await searchMemories(userId, query, limit);

    // Greedily assemble memories by score (highest first) until token budget exhausted
    let usedTokens = 0;
    const selected: Array<{ content: string; score: number; createdAt: number }> = [];
    for (const mem of scoredMemories) {
      const tokens = Math.ceil(mem.content.length / 4); // ~4 chars per token heuristic
      if (usedTokens + tokens > tokenBudget) break;
      selected.push(mem);
      usedTokens += tokens;
    }

    // Format as structured context block
    const context = selected.length > 0
      ? `## Known Facts (from memory)\n${selected.map(m => `- ${m.content}`).join('\n')}\n`
      : '';

    res.json({
      context,
      memoriesUsed: selected.length,
      tokensUsed: usedTokens,
      tokenBudget,
    });
  } catch (err: any) {
    console.error('[Memory] Context error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get memories for user
app.get('/memories/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string || '50', 10);

    const memories = db.prepare(`
      SELECT id, content, metadata, created_at
      FROM memories
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      created_at: number;
    }>;

    const results = memories.map(m => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
      createdAt: m.created_at,
    }));

    res.json({ memories: results });
  } catch (err: any) {
    console.error('[Memory] Get memories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get memories linked to a specific session
app.get('/sessions/:sessionId/memories', (req, res) => {
  try {
    const { sessionId } = req.params;

    const memories = db.prepare(`
      SELECT m.id, m.content, m.metadata, m.created_at
      FROM memories m
      INNER JOIN memory_sessions ms ON ms.memory_id = m.id
      WHERE ms.session_id = ?
      ORDER BY ms.created_at DESC
    `).all(sessionId) as Array<{
      id: string;
      content: string;
      metadata: string | null;
      created_at: number;
    }>;

    const results = memories.map(m => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
      createdAt: m.created_at,
    }));

    res.json({ memories: results });
  } catch (err: any) {
    console.error('[Memory] Get session memories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List conversation turns for a user (with pagination and optional channel filter)
app.get('/conversation-turns/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const offset = parseInt(req.query.offset as string || '0', 10);
    const channel = req.query.channel as string | undefined;

    // Build query with optional channel filter
    let sql = `SELECT id, user_id, channel, chat_id, role, content, metadata, created_at FROM conversation_turns WHERE user_id = ?`;
    let countSql = `SELECT COUNT(*) as total FROM conversation_turns WHERE user_id = ?`;
    const params: any[] = [userId];
    const countParams: any[] = [userId];

    if (channel) {
      sql += ' AND channel = ?';
      countSql += ' AND channel = ?';
      params.push(channel);
      countParams.push(channel);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as Array<{
      id: number;
      user_id: string;
      channel: string;
      chat_id: string;
      role: string;
      content: string;
      metadata: string | null;
      created_at: number;
    }>;

    const totalResult = db.prepare(countSql).get(...countParams) as { total: number };

    const turns = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      channel: row.channel,
      chatId: row.chat_id,
      role: row.role,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: row.created_at,
    }));

    res.json({ turns, total: totalResult.total });
  } catch (err: any) {
    console.error('[Memory] Get conversation turns error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a single conversation turn by id
app.delete('/conversation-turns/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    // The ct_ad trigger automatically removes from FTS5 on DELETE
    db.prepare('DELETE FROM conversation_turns WHERE id = ?').run(id);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Memory] Delete conversation turn error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete memory
app.delete('/memories/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    // Also clean up session links
    db.prepare('DELETE FROM memory_sessions WHERE memory_id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Memory] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reset user memories
app.post('/reset', (req, res) => {
  try {
    const { userId } = req.body;

    if (userId) {
      // Get memory IDs for session cleanup
      const memoryIds = db.prepare('SELECT id FROM memories WHERE user_id = ?').all(userId) as Array<{ id: string }>;
      for (const { id } of memoryIds) {
        db.prepare('DELETE FROM memory_sessions WHERE memory_id = ?').run(id);
      }
      db.prepare('DELETE FROM memories WHERE user_id = ?').run(userId);
      console.log(`[Memory] Reset memories for user ${userId}`);
    } else {
      db.prepare('DELETE FROM memory_sessions').run();
      db.prepare('DELETE FROM memories').run();
      console.log('[Memory] Reset all memories');
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Memory] Reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stats
app.get('/stats', (req, res) => {
  try {
    const totalMemories = (db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number }).count;
    const totalUsers = (db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM memories').get() as { count: number }).count;
    const totalSessions = (db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM memory_sessions').get() as { count: number }).count;
    const dbSize = fs.statSync(DB_PATH).size;

    res.json({
      totalMemories,
      totalUsers,
      totalSessions,
      dbSizeBytes: dbSize,
      dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
    });
  } catch (err: any) {
    console.error('[Memory] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
const HOST = process.env.MEMORY_HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[Memory] SQLite memory service v2.2.0 running on http://${HOST}:${PORT}`);
  console.log(`[Memory] Database: ${DB_PATH}`);
  console.log(`[Memory] Ready.`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Memory] Shutting down...');
  db.close();
  redis?.quit();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Memory] Shutting down...');
  db.close();
  redis?.quit();
  process.exit(0);
});
