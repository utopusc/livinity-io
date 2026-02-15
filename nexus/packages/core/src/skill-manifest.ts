import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

/** A declared permission in a skill manifest */
export interface SkillPermission {
  /** Permission name (e.g. "shell", "docker", "files", "network") */
  name: string;
  /** Why this permission is needed */
  reason: string;
  /** false = optional permission the user can decline */
  required: boolean;
}

/** Parsed representation of a SKILL.md manifest file */
export interface SkillManifest {
  /** Kebab-case identifier (e.g. "server-health") */
  name: string;
  /** Semver version string (e.g. "1.0.0") */
  version: string;
  /** Human-readable description */
  description: string;
  /** Author name or handle */
  author?: string;
  /** License identifier (e.g. "MIT", "AGPL-3.0") */
  license?: string;
  /** URL to docs or repository */
  homepage?: string;

  // Capabilities
  /** Tool names this skill uses (e.g. ["shell", "docker_list"]) */
  tools: string[];
  /** Regex patterns that activate this skill */
  triggers: string[];
  /** Declared permissions */
  permissions: SkillPermission[];

  // Execution config
  /** Skill execution mode */
  type: 'simple' | 'autonomous';
  /** Model tier for the skill's agent loop */
  model_tier: 'flash' | 'sonnet' | 'opus';
  /** Max agent turns per phase */
  max_turns?: number;
  /** Max tokens per phase */
  max_tokens?: number;
  /** Timeout in ms per phase */
  timeout_ms?: number;
  /** Phase names for autonomous skills */
  phases?: string[];

  // Marketplace metadata
  /** Searchable tags (e.g. ["monitoring", "docker", "server"]) */
  tags?: string[];
  /** Minimum Nexus version required */
  min_nexus_version?: string;
}

// ── YAML Parsing Helpers ─────────────────────────────────────────────────────

/**
 * Simple YAML frontmatter parser for SKILL.md files.
 *
 * Handles:
 * - Scalar key: value pairs
 * - Simple lists (- item)
 * - Nested objects within lists (permissions with sub-keys)
 *
 * No external dependency required — keeps the same lightweight approach
 * used in the existing skill-loader.ts parseFrontmatter.
 */
function parseYamlBlock(yaml: string): Record<string, any> | null {
  try {
    const lines = yaml.split('\n');
    const result: Record<string, any> = {};

    let currentKey = '';
    let currentList: any[] | null = null;
    let currentObject: Record<string, any> | null = null;
    let inNestedObject = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Detect indentation level
      const indent = line.length - line.trimStart().length;

      // Nested object property (indented under a list item, e.g. "    reason: ...")
      if (inNestedObject && indent >= 4 && currentObject && !trimmed.startsWith('-')) {
        const kvMatch = trimmed.match(/^(\w[\w_]*):\s*(.*)$/);
        if (kvMatch) {
          let value: any = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');
          // Parse boolean values
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          currentObject[kvMatch[1]] = value;
          continue;
        }
      }

      // List item (top-level or nested)
      if (trimmed.startsWith('- ')) {
        inNestedObject = false;
        if (currentList) {
          // Check if this list item starts a nested object (e.g. "- name: shell")
          const nestedKvMatch = trimmed.slice(2).trim().match(/^(\w[\w_]*):\s*(.*)$/);
          if (nestedKvMatch) {
            // Flush previous nested object
            if (currentObject && Object.keys(currentObject).length > 0) {
              currentList.push(currentObject);
            }
            // Start a new nested object
            let value: any = nestedKvMatch[2].trim().replace(/^['"]|['"]$/g, '');
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            currentObject = { [nestedKvMatch[1]]: value };
            inNestedObject = true;
          } else {
            // Flush previous nested object if any
            if (currentObject && Object.keys(currentObject).length > 0) {
              currentList.push(currentObject);
              currentObject = null;
            }
            // Simple list item
            currentList.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''));
          }
        }
        continue;
      }

      // Key-value pair at root level
      const kvMatch = trimmed.match(/^(\w[\w_]*):\s*(.*)$/);
      if (kvMatch) {
        // Flush previous nested object into previous list
        if (inNestedObject && currentObject && currentList && Object.keys(currentObject).length > 0) {
          currentList.push(currentObject);
          currentObject = null;
          inNestedObject = false;
        }

        // Save previous list to result
        if (currentList !== null && currentKey) {
          result[currentKey] = currentList;
          currentList = null;
        }

        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();

        if (value === '' || value === '[]') {
          // Start of a list (empty value means next lines are list items)
          currentList = [];
          currentObject = null;
          inNestedObject = false;
        } else {
          // Scalar value
          currentList = null;
          currentObject = null;
          inNestedObject = false;
          let parsed: any = value.replace(/^['"]|['"]$/g, '');
          if (parsed === 'true') parsed = true;
          else if (parsed === 'false') parsed = false;
          result[currentKey] = parsed;
        }
      }
    }

    // Flush last nested object
    if (inNestedObject && currentObject && currentList && Object.keys(currentObject).length > 0) {
      currentList.push(currentObject);
    }
    // Flush last list
    if (currentList !== null && currentKey) {
      result[currentKey] = currentList;
    }

    return result;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a SKILL.md file into a SkillManifest.
 *
 * Format: YAML frontmatter between `---` delimiters at the top of the file,
 * followed by optional markdown documentation.
 *
 * Returns null if required fields (name, version, description, tools) are missing.
 */
export function parseSkillManifest(content: string): SkillManifest | null {
  // Match YAML frontmatter between --- delimiters
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const parsed = parseYamlBlock(fmMatch[1]);
  if (!parsed) return null;

  // Required fields
  if (!parsed.name || !parsed.version || !parsed.description) return null;

  const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
  if (tools.length === 0) return null;

  // Parse permissions — can be array of objects or array of strings
  let permissions: SkillPermission[] = [];
  if (Array.isArray(parsed.permissions)) {
    permissions = parsed.permissions.map((p: any) => {
      if (typeof p === 'string') {
        return { name: p, reason: '', required: true };
      }
      return {
        name: String(p.name || ''),
        reason: String(p.reason || ''),
        required: p.required !== false && p.required !== 'false',
      };
    });
  }

  return {
    name: String(parsed.name),
    version: String(parsed.version),
    description: String(parsed.description),
    author: parsed.author ? String(parsed.author) : undefined,
    license: parsed.license ? String(parsed.license) : undefined,
    homepage: parsed.homepage ? String(parsed.homepage) : undefined,

    tools,
    triggers: Array.isArray(parsed.triggers) ? parsed.triggers : [],
    permissions,

    type: parsed.type === 'autonomous' ? 'autonomous' : 'simple',
    model_tier: (['flash', 'sonnet', 'opus'].includes(parsed.model_tier) ? parsed.model_tier : 'flash') as 'flash' | 'sonnet' | 'opus',
    max_turns: parsed.max_turns ? parseInt(String(parsed.max_turns), 10) : undefined,
    max_tokens: parsed.max_tokens ? parseInt(String(parsed.max_tokens), 10) : undefined,
    timeout_ms: parsed.timeout_ms ? parseInt(String(parsed.timeout_ms), 10) : undefined,
    phases: Array.isArray(parsed.phases) ? parsed.phases : undefined,

    tags: Array.isArray(parsed.tags) ? parsed.tags : undefined,
    min_nexus_version: parsed.min_nexus_version ? String(parsed.min_nexus_version) : undefined,
  };
}

/**
 * Validate a parsed SkillManifest.
 *
 * Checks:
 * - name must be kebab-case (lowercase letters, digits, hyphens)
 * - version must match semver pattern
 * - tools array must not be empty
 * - permissions must have name + reason fields
 */
export function validateManifest(manifest: SkillManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Name: kebab-case
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(manifest.name)) {
    errors.push(`Invalid name "${manifest.name}" — must be kebab-case (e.g. "server-health")`);
  }

  // Version: semver
  if (!/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(manifest.version)) {
    errors.push(`Invalid version "${manifest.version}" — must be semver (e.g. "1.0.0")`);
  }

  // Tools: non-empty
  if (manifest.tools.length === 0) {
    errors.push('tools array must not be empty');
  }

  // Permissions: each must have name + reason
  for (let i = 0; i < manifest.permissions.length; i++) {
    const p = manifest.permissions[i];
    if (!p.name) {
      errors.push(`permissions[${i}] missing "name"`);
    }
    if (!p.reason) {
      errors.push(`permissions[${i}] missing "reason"`);
    }
  }

  // Description: non-empty
  if (!manifest.description.trim()) {
    errors.push('description must not be empty');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Scan a skill directory for SKILL.md + index.ts/index.js.
 *
 * A valid directory-based skill contains:
 * - SKILL.md (manifest file with YAML frontmatter)
 * - index.ts or index.js (entry point)
 *
 * Returns the parsed manifest and resolved entry point path,
 * or null if either file is missing or the manifest is invalid.
 */
export async function scanSkillDirectory(
  dirPath: string,
): Promise<{ manifest: SkillManifest; entryPoint: string } | null> {
  try {
    // Check that dirPath is actually a directory
    const dirStat = await stat(dirPath);
    if (!dirStat.isDirectory()) return null;

    // List directory contents
    const entries = await readdir(dirPath);

    // Look for SKILL.md
    if (!entries.includes('SKILL.md')) return null;

    // Look for entry point (prefer .ts over .js)
    let entryFile: string | null = null;
    if (entries.includes('index.ts')) {
      entryFile = 'index.ts';
    } else if (entries.includes('index.js')) {
      entryFile = 'index.js';
    }
    if (!entryFile) return null;

    // Read and parse manifest
    const manifestContent = await readFile(join(dirPath, 'SKILL.md'), 'utf-8');
    const manifest = parseSkillManifest(manifestContent);
    if (!manifest) return null;

    // Validate the manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) return null;

    return {
      manifest,
      entryPoint: join(dirPath, entryFile),
    };
  } catch {
    return null;
  }
}
