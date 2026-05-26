import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

const REPO = 'utopusc/livinity-apps';
const REF = 'main';
const APPS_PATH = 'apps';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type GitHubContent = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
};

type ManifestShape = {
  slug?: string;
  name?: string;
  category?: string;
  version?: string;
  tagline?: string;
  description?: string;
  docker_compose?: string;
  section?: string;
};

type SyncOutcome = 'created' | 'updated' | 'skipped' | 'error';

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'livinity-io-sync-catalog',
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function listAppsDir(): Promise<GitHubContent[]> {
  const url = `https://api.github.com/repos/${REPO}/contents/${APPS_PATH}?ref=${REF}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub list ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as GitHubContent[] | { message: string };
  if (!Array.isArray(body)) {
    throw new Error(`GitHub list unexpected response: ${JSON.stringify(body)}`);
  }
  return body;
}

async function fetchManifest(entry: GitHubContent): Promise<ManifestShape | null> {
  // Each app entry is typically a directory containing manifest.json.
  if (entry.type === 'dir') {
    const url = `https://api.github.com/repos/${REPO}/contents/${entry.path}/manifest.json?ref=${REF}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) return null;
    const meta = (await res.json()) as GitHubContent & { content?: string; encoding?: string };
    if (meta.encoding === 'base64' && meta.content) {
      try {
        const decoded = Buffer.from(meta.content, 'base64').toString('utf8');
        return JSON.parse(decoded) as ManifestShape;
      } catch {
        return null;
      }
    }
    if (meta.download_url) {
      const raw = await fetch(meta.download_url, { headers: ghHeaders() });
      if (!raw.ok) return null;
      try {
        return (await raw.json()) as ManifestShape;
      } catch {
        return null;
      }
    }
    return null;
  }
  // File-level manifests (.json) at the root of apps/.
  if (entry.type === 'file' && entry.name.endsWith('.json') && entry.download_url) {
    const raw = await fetch(entry.download_url, { headers: ghHeaders() });
    if (!raw.ok) return null;
    try {
      return (await raw.json()) as ManifestShape;
    } catch {
      return null;
    }
  }
  return null;
}

function deriveSlug(entry: GitHubContent, manifest: ManifestShape): string | null {
  if (manifest.slug && /^[a-z0-9-]+$/.test(manifest.slug)) return manifest.slug;
  // Fallback: directory name (apps/<slug>/manifest.json) or filename stem.
  const stem = entry.type === 'dir' ? entry.name : entry.name.replace(/\.json$/, '');
  if (/^[a-z0-9-]+$/.test(stem)) return stem;
  return null;
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;
  const offsetRaw = Number(searchParams.get('offset') ?? 0);
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  let entries: GitHubContent[];
  try {
    entries = await listAppsDir();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GitHub list failed' },
      { status: 502 },
    );
  }

  const slice = entries.slice(offset, offset + limit);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { entry: string; error: string }[] = [];

  for (const entry of slice) {
    try {
      const manifest = await fetchManifest(entry);
      if (!manifest) {
        skipped++;
        continue;
      }
      const slug = deriveSlug(entry, manifest);
      if (!slug || !manifest.name) {
        skipped++;
        continue;
      }
      // Probe existing state.
      const existing = await pool.query<{ id: string }>('SELECT id FROM apps WHERE slug = $1 LIMIT 1', [slug]);
      const isNew = existing.rows.length === 0;

      await pool.query(
        `INSERT INTO apps
           (slug, name, tagline, description, category, version, docker_compose, manifest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           tagline = COALESCE(EXCLUDED.tagline, apps.tagline),
           description = COALESCE(EXCLUDED.description, apps.description),
           category = COALESCE(EXCLUDED.category, apps.category),
           version = COALESCE(EXCLUDED.version, apps.version),
           docker_compose = COALESCE(EXCLUDED.docker_compose, apps.docker_compose),
           manifest = EXCLUDED.manifest,
           updated_at = NOW()`,
        [
          slug,
          manifest.name,
          manifest.tagline ?? null,
          manifest.description ?? null,
          manifest.category ?? null,
          manifest.version ?? null,
          manifest.docker_compose ?? null,
          JSON.stringify(manifest),
        ],
      );

      if (isNew) created++;
      else updated++;
    } catch (err) {
      errors.push({
        entry: entry.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    repo: REPO,
    ref: REF,
    total_in_repo: entries.length,
    processed: slice.length,
    offset,
    limit,
    next_offset: offset + slice.length < entries.length ? offset + slice.length : null,
    created,
    updated,
    skipped,
    errors,
  });
}
