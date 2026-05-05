/**
 * App Management Module
 * Handles app registry and lifecycle management for Nexus.
 */

import { Router } from 'express';
import type Redis from 'ioredis';

export interface AppConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

const REDIS_APPS_KEY = 'nexus:apps';

export class AppManager {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async list(): Promise<AppConfig[]> {
    const data = await this.redis.get(REDIS_APPS_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data) as AppConfig[];
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<AppConfig | undefined> {
    const apps = await this.list();
    return apps.find((app) => app.id === id);
  }

  async create(app: Omit<AppConfig, 'createdAt' | 'updatedAt'>): Promise<AppConfig> {
    const apps = await this.list();
    const now = Date.now();
    const newApp: AppConfig = {
      ...app,
      createdAt: now,
      updatedAt: now,
    };
    apps.push(newApp);
    await this.redis.set(REDIS_APPS_KEY, JSON.stringify(apps));
    return newApp;
  }

  async update(id: string, updates: Partial<Omit<AppConfig, 'id' | 'createdAt'>>): Promise<AppConfig | undefined> {
    const apps = await this.list();
    const index = apps.findIndex((app) => app.id === id);
    if (index === -1) return undefined;

    apps[index] = {
      ...apps[index],
      ...updates,
      updatedAt: Date.now(),
    };
    await this.redis.set(REDIS_APPS_KEY, JSON.stringify(apps));
    return apps[index];
  }

  async delete(id: string): Promise<boolean> {
    const apps = await this.list();
    const filtered = apps.filter((app) => app.id !== id);
    if (filtered.length === apps.length) return false;
    await this.redis.set(REDIS_APPS_KEY, JSON.stringify(filtered));
    return true;
  }

  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    const result = await this.update(id, { enabled });
    return result !== undefined;
  }
}

export function createAppRoutes(appManager: AppManager): Router {
  const router = Router();

  // List all apps
  router.get('/', async (_req, res) => {
    try {
      const apps = await appManager.list();
      res.json({ apps });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get a single app
  router.get('/:id', async (req, res) => {
    try {
      const app = await appManager.get(req.params.id);
      if (!app) {
        res.status(404).json({ error: 'App not found' });
        return;
      }
      res.json({ app });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a new app
  router.post('/', async (req, res) => {
    try {
      const { id, name, description, enabled = true, config } = req.body;
      if (!id || !name) {
        res.status(400).json({ error: 'id and name are required' });
        return;
      }
      const existing = await appManager.get(id);
      if (existing) {
        res.status(409).json({ error: 'App already exists' });
        return;
      }
      const app = await appManager.create({ id, name, description, enabled, config });
      res.status(201).json({ app });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update an app
  router.put('/:id', async (req, res) => {
    try {
      const { name, description, enabled, config } = req.body;
      const app = await appManager.update(req.params.id, { name, description, enabled, config });
      if (!app) {
        res.status(404).json({ error: 'App not found' });
        return;
      }
      res.json({ app });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete an app
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = await appManager.delete(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'App not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Enable/disable an app
  router.post('/:id/toggle', async (req, res) => {
    try {
      const app = await appManager.get(req.params.id);
      if (!app) {
        res.status(404).json({ error: 'App not found' });
        return;
      }
      const updated = await appManager.setEnabled(req.params.id, !app.enabled);
      res.json({ ok: updated, enabled: !app.enabled });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
