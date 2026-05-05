import { mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { Redis } from 'ioredis';
import { SkillRegistryClient } from './skill-registry-client.js';
import type { RegistryCatalogEntry } from './skill-registry-client.js';
import { parseSkillManifest, validateManifest } from './skill-manifest.js';
import type { SkillPermission, SkillManifest } from './skill-manifest.js';
import type { SkillLoader } from './skill-loader.js';
import { logger } from './logger.js';
import { readFile } from 'fs/promises';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  skillName: string;
  error?: string;
  permissions?: Array<{ name: string; reason: string; required: boolean }>;
}

interface InstalledSkillMeta {
  manifest: SkillManifest;
  installedAt: number;
  source: 'marketplace';
}

// ── SkillInstaller ───────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of marketplace skills: preview, install, uninstall, list.
 *
 * Skills are downloaded from Git-based registries via SkillRegistryClient,
 * stored in installDir as {skill-name}/SKILL.md + index.ts, and loaded
 * into the running SkillLoader on demand (no restart required).
 *
 * Install metadata is persisted in Redis under `nexus:skills:installed:{name}`.
 */
export class SkillInstaller {
  private skillLoader: SkillLoader;
  private registryClient: SkillRegistryClient;
  private installDir: string;
  private redis: Redis;

  constructor(opts: {
    skillLoader: SkillLoader;
    registryClient: SkillRegistryClient;
    installDir: string;
    redis: Redis;
  }) {
    this.skillLoader = opts.skillLoader;
    this.registryClient = opts.registryClient;
    this.installDir = opts.installDir;
    this.redis = opts.redis;
  }

  /**
   * Preview a skill install: fetch catalog entry and return permissions for user review.
   * Does NOT install. Returns null if skill not found in any registry.
   */
  async previewInstall(
    skillName: string,
  ): Promise<{ entry: RegistryCatalogEntry; permissions: SkillPermission[] } | null> {
    try {
      const catalog = await this.registryClient.fetchCatalog();
      const entry = catalog.find((e) => e.name === skillName);
      if (!entry) return null;

      return {
        entry,
        permissions: entry.permissions.map((p) => ({
          name: p.name,
          reason: p.reason,
          required: p.required,
        })),
      };
    } catch (err: any) {
      logger.error('SkillInstaller: previewInstall failed', { skillName, error: err.message });
      return null;
    }
  }

  /**
   * Install a skill from the marketplace.
   *
   * 1. Find the skill in the catalog
   * 2. Check that all required permissions are accepted
   * 3. Download skill files to installDir
   * 4. Validate the downloaded manifest
   * 5. Load the skill into the running SkillLoader
   * 6. Store install metadata in Redis
   */
  async install(skillName: string, acceptedPermissions: string[]): Promise<InstallResult> {
    try {
      // Check if already installed
      if (await this.isInstalled(skillName)) {
        return { success: false, skillName, error: 'Skill is already installed' };
      }

      // Find in catalog
      const catalog = await this.registryClient.fetchCatalog();
      const entry = catalog.find((e) => e.name === skillName);
      if (!entry) {
        return { success: false, skillName, error: `Skill "${skillName}" not found in any registry` };
      }

      // Verify required permissions are accepted
      const requiredPerms = entry.permissions.filter((p) => p.required);
      const missingPerms = requiredPerms.filter((p) => !acceptedPermissions.includes(p.name));
      if (missingPerms.length > 0) {
        return {
          success: false,
          skillName,
          error: `Missing required permissions: ${missingPerms.map((p) => p.name).join(', ')}`,
          permissions: entry.permissions,
        };
      }

      // Ensure installDir exists
      await mkdir(this.installDir, { recursive: true });

      // Download skill files
      const skillDir = await this.registryClient.downloadSkill(entry, this.installDir);

      // Read and validate the downloaded manifest
      const manifestContent = await readFile(join(skillDir, 'SKILL.md'), 'utf-8');
      const manifest = parseSkillManifest(manifestContent);
      if (!manifest) {
        await rm(skillDir, { recursive: true, force: true });
        return { success: false, skillName, error: 'Downloaded SKILL.md has invalid manifest' };
      }

      const validation = validateManifest(manifest);
      if (!validation.valid) {
        await rm(skillDir, { recursive: true, force: true });
        return {
          success: false,
          skillName,
          error: `Manifest validation failed: ${validation.errors.join('; ')}`,
        };
      }

      // Load the skill into the running SkillLoader (lazy load)
      const loaded = await this.skillLoader.loadSkillLazy(skillName, skillDir);
      if (!loaded) {
        await rm(skillDir, { recursive: true, force: true });
        return { success: false, skillName, error: 'Failed to load skill after download' };
      }

      // Store install metadata in Redis
      const meta: InstalledSkillMeta = {
        manifest,
        installedAt: Date.now(),
        source: 'marketplace',
      };
      await this.redis.set(
        `nexus:skills:installed:${skillName}`,
        JSON.stringify(meta),
      );

      logger.info('SkillInstaller: skill installed', { skillName, version: manifest.version });
      return {
        success: true,
        skillName,
        permissions: entry.permissions,
      };
    } catch (err: any) {
      logger.error('SkillInstaller: install failed', { skillName, error: err.message });
      return { success: false, skillName, error: err.message };
    }
  }

  /**
   * Uninstall a marketplace skill.
   *
   * 1. Unload from SkillLoader (removes tools from ToolRegistry)
   * 2. Remove Redis metadata
   * 3. Delete skill files from disk
   */
  async uninstall(skillName: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!(await this.isInstalled(skillName))) {
        return { success: false, error: `Skill "${skillName}" is not installed` };
      }

      // Unload from SkillLoader
      this.skillLoader.unloadSkill(skillName);

      // Remove Redis metadata
      await this.redis.del(`nexus:skills:installed:${skillName}`);

      // Delete skill directory
      const skillDir = join(this.installDir, skillName);
      await rm(skillDir, { recursive: true, force: true });

      logger.info('SkillInstaller: skill uninstalled', { skillName });
      return { success: true };
    } catch (err: any) {
      logger.error('SkillInstaller: uninstall failed', { skillName, error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * List all installed marketplace skills from Redis metadata.
   */
  async listInstalled(): Promise<
    Array<{
      name: string;
      version: string;
      description: string;
      installedAt: number;
      permissions: SkillPermission[];
    }>
  > {
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const [nextCursor, foundKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          'nexus:skills:installed:*',
          'COUNT',
          100,
        );
        cursor = nextCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');

      const results: Array<{
        name: string;
        version: string;
        description: string;
        installedAt: number;
        permissions: SkillPermission[];
      }> = [];

      for (const key of keys) {
        try {
          const raw = await this.redis.get(key);
          if (!raw) continue;
          const meta: InstalledSkillMeta = JSON.parse(raw);
          results.push({
            name: meta.manifest.name,
            version: meta.manifest.version,
            description: meta.manifest.description,
            installedAt: meta.installedAt,
            permissions: meta.manifest.permissions,
          });
        } catch {
          // Skip corrupted entries
        }
      }

      return results.sort((a, b) => b.installedAt - a.installedAt);
    } catch (err: any) {
      logger.error('SkillInstaller: listInstalled failed', { error: err.message });
      return [];
    }
  }

  /**
   * Check if a skill is installed (has Redis metadata).
   */
  async isInstalled(skillName: string): Promise<boolean> {
    const exists = await this.redis.exists(`nexus:skills:installed:${skillName}`);
    return exists === 1;
  }
}
