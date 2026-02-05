/**
 * Nexus Memory Service v2
 * Simple SQLite-based memory with Gemini embeddings
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
`);

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

// Helper: Get Gemini API key from Redis or env
async function getGeminiKey(): Promise<string | null> {
  if (redis) {
    const key = await redis.get('livos:config:gemini_api_key');
    if (key) return key;
  }
  return process.env.GEMINI_API_KEY || null;
}

// Helper: Get embeddings from Gemini
async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    console.warn('[Memory] No Gemini API key available for embeddings');
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      console.error('[Memory] Embedding API error:', response.status);
      return null;
    }

    const data = await response.json() as { embedding?: { values?: number[] } };
    return data.embedding?.values || null;
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
  res.json({ status: 'ok', version: '2.0.0', db: DB_PATH });
});

// Auth middleware - all routes below this require X-API-Key header
app.use(requireApiKey);

// Add memory
app.post('/add', async (req, res) => {
  try {
    const { userId, content, metadata } = req.body;

    if (!userId || !content) {
      return res.status(400).json({ error: 'userId and content are required' });
    }

    const id = generateId();
    const now = Date.now();

    // Get embedding (async, don't block)
    const embedding = await getEmbedding(content);

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

    console.log(`[Memory] Added memory ${id} for user ${userId}`);
    res.json({ success: true, id });
  } catch (err: any) {
    console.error('[Memory] Add error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search memories
app.post('/search', async (req, res) => {
  try {
    const { userId, query, limit = 10 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

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
      const results = memories.slice(0, limit).map(m => ({
        id: m.id,
        content: m.content,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        score: 1,
        createdAt: m.created_at,
      }));
      return res.json({ results });
    }

    // Get query embedding for semantic search
    const queryEmbedding = await getEmbedding(query);

    if (!queryEmbedding) {
      // Fallback to text search
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

      const results = textResults.map(m => ({
        id: m.id,
        content: m.content,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
        score: 0.5,
        createdAt: m.created_at,
      }));
      return res.json({ results });
    }

    // Semantic search with embeddings
    const scored = memories
      .filter(m => m.embedding)
      .map(m => {
        const emb = JSON.parse(m.embedding!) as number[];
        const score = cosineSimilarity(queryEmbedding, emb);
        return {
          id: m.id,
          content: m.content,
          metadata: m.metadata ? JSON.parse(m.metadata) : null,
          score,
          createdAt: m.created_at,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.json({ results: scored });
  } catch (err: any) {
    console.error('[Memory] Search error:', err);
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

// Delete memory
app.delete('/memories/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
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
      db.prepare('DELETE FROM memories WHERE user_id = ?').run(userId);
      console.log(`[Memory] Reset memories for user ${userId}`);
    } else {
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
    const dbSize = fs.statSync(DB_PATH).size;

    res.json({
      totalMemories,
      totalUsers,
      dbSizeBytes: dbSize,
      dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
    });
  } catch (err: any) {
    console.error('[Memory] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`[Memory] SQLite memory service v2.0.0 running on port ${PORT}`);
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
