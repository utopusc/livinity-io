import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';
import { parseSkillManifest } from './skill-manifest.js';
import { logger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single skill entry in a registry catalog */
export interface RegistryCatalogEntry {
  /** Skill name (kebab-case) */
  name: string;
  /** Latest version */
  version: string;
  /** From SKILL.md description */
  description: string;
  /** Author name or handle */
  author?: string;
  /** Searchable tags */
  tags?: string[];
  /** Declared permissions */
  permissions: Array<{ name: string; reason: string; required: boolean }>;
  /** Tool names used */
  tools: string[];
  /** GitHub repo URL (e.g. "https://github.com/user/repo") */
  repoUrl: string;
  /** Path within repo (e.g. "skills/server-health") */
  path: string;
  /** Direct raw download URL prefix for the skill files */
  downloadUrl: string;
}

/** Parsed owner/repo from a GitHub URL */
interface RepoInfo {
  owner: string;
  repo: string;
}

/** Cached catalog file content */
interface CachedCatalog {
  fetchedAt: number;
  entries: RegistryCatalogEntry[];
}

// ── SkillRegistryClient ──────────────────────────────────────────────────────

/**
 * Git-based skill registry client.
 *
 * Fetches skill catalogs from GitHub repositories, parses SKILL.md manifests,
 * and provides search/download capabilities. Uses file-based caching with
 * configurable TTL to minimize GitHub API calls (60 req/hr unauthenticated).
 */
export class SkillRegistryClient {
  private registries: string[] = [];
  private cacheDir: string;
  private cacheTtlMs: number;

  constructor(opts: { cacheDir: string; cacheTtlMs?: number }) {
    this.cacheDir = opts.cacheDir;
    this.cacheTtlMs = opts.cacheTtlMs ?? 3600_000; // Default: 1 hour
  }

  /**
   * Add a GitHub repository URL as a skill registry source.
   * Expected format: "https://github.com/{owner}/{repo}"
   */
  addRegistry(url: string): void {
    // Normalize: remove trailing slashes and .git suffix
    const normalized = url.replace(/\/+$/, '').replace(/\.git$/, '');
    if (!this.registries.includes(normalized)) {
      this.registries.push(normalized);
      logger.info('SkillRegistryClient: registry added', { url: normalized });
    }
  }

  /**
   * Fetch the combined catalog from all registered repositories.
   *
   * For each registry, fetches the skills/ directory listing via GitHub API,
   * then fetches SKILL.md from each subdirectory to build catalog entries.
   * Results are cached in {cacheDir}/registry-{hash}.json.
   */
  async fetchCatalog(): Promise<RegistryCatalogEntry[]> {
    if (this.registries.length === 0) {
      logger.warn('SkillRegistryClient: no registries configured');
      return [];
    }

    const allEntries: RegistryCatalogEntry[] = [];

    for (const repoUrl of this.registries) {
      try {
        const entries = await this.fetchRegistryCatalog(repoUrl);
        allEntries.push(...entries);
      } catch (err: any) {
        logger.error('SkillRegistryClient: failed to fetch registry', {
          url: repoUrl,
          error: err.message,
        });
      }
    }

    return allEntries;
  }

  /**
   * Search the catalog by name, description, or tags.
   * Case-insensitive substring match. Fetches catalog first if cache is stale.
   */
  async searchCatalog(query: string): Promise<RegistryCatalogEntry[]> {
    const catalog = await this.fetchCatalog();
    const q = query.toLowerCase();

    return catalog.filter((entry) => {
      if (entry.name.toLowerCase().includes(q)) return true;
      if (entry.description.toLowerCase().includes(q)) return true;
      if (entry.tags?.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  /**
   * Download a skill's files to the target directory.
   *
   * Fetches SKILL.md and index.ts from the skill's path in the repository
   * via raw.githubusercontent.com. Writes to {targetDir}/{entry.name}/.
   *
   * Returns the path to the installed skill directory.
   */
  async downloadSkill(entry: RegistryCatalogEntry, targetDir: string): Promise<string> {
    const skillDir = join(targetDir, entry.name);
    await mkdir(skillDir, { recursive: true });

    const repoInfo = this.parseRepoUrl(entry.repoUrl);
    if (!repoInfo) {
      throw new Error(`Invalid repo URL: ${entry.repoUrl}`);
    }

    const defaultBranch = await this.getDefaultBranch(repoInfo);

    // Files to download from the skill directory
    const files = ['SKILL.md', 'index.ts'];

    for (const file of files) {
      const rawUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${defaultBranch}/${entry.path}/${file}`;

      try {
        const response = await fetch(rawUrl);
        if (!response.ok) {
          // index.ts might be index.js — try fallback
          if (file === 'index.ts') {
            const jsUrl = rawUrl.replace(/index\.ts$/, 'index.js');
            const jsResponse = await fetch(jsUrl);
            if (jsResponse.ok) {
              const content = await jsResponse.text();
              await writeFile(join(skillDir, 'index.js'), content, 'utf-8');
              logger.info('SkillRegistryClient: downloaded file', { file: 'index.js', skill: entry.name });
              continue;
            }
          }
          throw new Error(`HTTP ${response.status} for ${rawUrl}`);
        }
        const content = await response.text();
        await writeFile(join(skillDir, file), content, 'utf-8');
        logger.info('SkillRegistryClient: downloaded file', { file, skill: entry.name });
      } catch (err: any) {
        logger.error('SkillRegistryClient: failed to download file', {
          file,
          skill: entry.name,
          error: err.message,
        });
        throw err;
      }
    }

    logger.info('SkillRegistryClient: skill downloaded', { skill: entry.name, dir: skillDir });
    return skillDir;
  }

  /** Get list of all configured registry URLs */
  getRegistries(): string[] {
    return [...this.registries];
  }

  /** Remove a registry URL. Returns true if it was present. */
  removeRegistry(url: string): boolean {
    const normalized = url.replace(/\/+$/, '').replace(/\.git$/, '');
    const idx = this.registries.indexOf(normalized);
    if (idx !== -1) {
      this.registries.splice(idx, 1);
      logger.info('SkillRegistryClient: registry removed', { url: normalized });
      return true;
    }
    return false;
  }

  /** Remove all cached catalog files */
  clearCache(): void {
    this.clearCacheAsync().catch((err) => {
      logger.error('SkillRegistryClient: failed to clear cache', { error: err.message });
    });
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  /** Parse a GitHub URL into owner/repo */
  private parseRepoUrl(url: string): RepoInfo | null {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  }

  /** Get a short hash of a URL for cache file naming */
  private hashUrl(url: string): string {
    return createHash('md5').update(url).digest('hex').slice(0, 8);
  }

  /** Get the cache file path for a registry URL */
  private cacheFilePath(repoUrl: string): string {
    return join(this.cacheDir, `registry-${this.hashUrl(repoUrl)}.json`);
  }

  /** Check if a cached catalog is still fresh */
  private async readCache(repoUrl: string): Promise<RegistryCatalogEntry[] | null> {
    try {
      const filePath = this.cacheFilePath(repoUrl);
      const content = await readFile(filePath, 'utf-8');
      const cached: CachedCatalog = JSON.parse(content);

      if (Date.now() - cached.fetchedAt < this.cacheTtlMs) {
        logger.info('SkillRegistryClient: using cached catalog', {
          url: repoUrl,
          entries: cached.entries.length,
        });
        return cached.entries;
      }
    } catch {
      // Cache miss or corrupt file — fetch fresh
    }
    return null;
  }

  /** Write catalog entries to cache */
  private async writeCache(repoUrl: string, entries: RegistryCatalogEntry[]): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const cached: CachedCatalog = { fetchedAt: Date.now(), entries };
      await writeFile(this.cacheFilePath(repoUrl), JSON.stringify(cached, null, 2), 'utf-8');
    } catch (err: any) {
      logger.error('SkillRegistryClient: failed to write cache', { error: err.message });
    }
  }

  /** Clear all cache files asynchronously */
  private async clearCacheAsync(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      for (const file of files) {
        if (file.startsWith('registry-') && file.endsWith('.json')) {
          await unlink(join(this.cacheDir, file));
        }
      }
      logger.info('SkillRegistryClient: cache cleared');
    } catch {
      // Cache dir may not exist yet
    }
  }

  /** Get the default branch of a GitHub repo */
  private async getDefaultBranch(repo: RepoInfo): Promise<string> {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Nexus-SkillRegistry/1.0',
          },
        },
      );
      if (!response.ok) {
        logger.warn('SkillRegistryClient: failed to get repo metadata, defaulting to "main"', {
          status: response.status,
        });
        return 'main';
      }
      const data = await response.json() as { default_branch?: string };
      return data.default_branch || 'main';
    } catch {
      return 'main';
    }
  }

  /**
   * Fetch catalog entries for a single registry.
   *
   * 1. Check cache first
   * 2. Fetch skills/ directory listing from GitHub Contents API
   * 3. For each subdirectory, fetch SKILL.md via raw.githubusercontent.com
   * 4. Parse manifests and build catalog entries
   * 5. Write to cache
   */
  private async fetchRegistryCatalog(repoUrl: string): Promise<RegistryCatalogEntry[]> {
    // Check cache first
    const cached = await this.readCache(repoUrl);
    if (cached) return cached;

    const repoInfo = this.parseRepoUrl(repoUrl);
    if (!repoInfo) {
      throw new Error(`Invalid GitHub URL: ${repoUrl}`);
    }

    const defaultBranch = await this.getDefaultBranch(repoInfo);

    // Fetch skills directory listing from GitHub Contents API
    const contentsUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/skills`;
    const response = await fetch(contentsUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Nexus-SkillRegistry/1.0',
      },
    });

    if (!response.ok) {
      // Check rate limit
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const resetTime = response.headers.get('x-ratelimit-reset');
        logger.warn('SkillRegistryClient: GitHub rate limit exceeded', {
          resetAt: resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : 'unknown',
        });
        throw new Error('GitHub API rate limit exceeded');
      }
      throw new Error(`GitHub API returned ${response.status} for ${contentsUrl}`);
    }

    const contents = await response.json() as Array<{ name: string; type: string; path: string }>;
    const directories = contents.filter((entry) => entry.type === 'dir');

    logger.info('SkillRegistryClient: found skill directories', {
      repo: `${repoInfo.owner}/${repoInfo.repo}`,
      count: directories.length,
    });

    const entries: RegistryCatalogEntry[] = [];

    // Fetch SKILL.md from each subdirectory
    for (const dir of directories) {
      try {
        const rawManifestUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${defaultBranch}/${dir.path}/SKILL.md`;
        const manifestResponse = await fetch(rawManifestUrl);

        if (!manifestResponse.ok) {
          logger.debug('SkillRegistryClient: no SKILL.md in directory', { dir: dir.name });
          continue;
        }

        const manifestContent = await manifestResponse.text();
        const manifest = parseSkillManifest(manifestContent);
        if (!manifest) {
          logger.warn('SkillRegistryClient: invalid SKILL.md in directory', { dir: dir.name });
          continue;
        }

        entries.push({
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          author: manifest.author,
          tags: manifest.tags,
          permissions: manifest.permissions.map((p) => ({
            name: p.name,
            reason: p.reason,
            required: p.required,
          })),
          tools: manifest.tools,
          repoUrl,
          path: dir.path,
          downloadUrl: `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${defaultBranch}/${dir.path}`,
        });
      } catch (err: any) {
        logger.error('SkillRegistryClient: failed to parse skill directory', {
          dir: dir.name,
          error: err.message,
        });
      }
    }

    // Write to cache
    await this.writeCache(repoUrl, entries);

    logger.info('SkillRegistryClient: catalog fetched', {
      repo: `${repoInfo.owner}/${repoInfo.repo}`,
      entries: entries.length,
    });

    return entries;
  }
}
