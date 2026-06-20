/**
 * GET /api/flathub/search?q=<q>&page=<n>
 *
 * Phase 290+ — server-side proxy to flathub.org's search so the browser NEVER
 * hits flathub directly (brand stays hidden — presented as a generic store).
 *
 *   POST https://flathub.org/api/v2/search { query, hits_per_page, page }
 *   → { hits:[{ app_id, name, summary, icon }], page, totalPages }
 *
 * Empty query → { apps:[], hasMore:false }. We map hit → { appId, name, summary,
 * iconUrl } and compute hasMore = page<totalPages. On any failure we return the
 * empty shape (never throw).
 *
 * Public like /api/public-config — public catalog metadata, no API key.
 */
import { NextRequest, NextResponse } from 'next/server';

const PER_PAGE = 30;
const UPSTREAM_TIMEOUT_MS = 5000;
const APP_ID_RE = /^[A-Za-z0-9._-]+$/;

interface FlathubHit {
  app_id?: unknown;
  name?: unknown;
  summary?: unknown;
  icon?: unknown;
}

interface FlathubSearch {
  hits?: unknown;
  page?: unknown;
  totalPages?: unknown;
}

interface StoreApp {
  appId: string;
  name: string;
  summary: string;
  iconUrl: string | null;
}

function mapHits(hits: unknown): StoreApp[] {
  if (!Array.isArray(hits)) return [];
  const out: StoreApp[] = [];
  for (const raw of hits as FlathubHit[]) {
    const appId = typeof raw?.app_id === 'string' ? raw.app_id : '';
    if (!appId || !APP_ID_RE.test(appId)) continue;
    out.push({
      appId,
      name: typeof raw?.name === 'string' ? raw.name : appId,
      summary: typeof raw?.summary === 'string' ? raw.summary : '',
      iconUrl: typeof raw?.icon === 'string' && raw.icon ? raw.icon : null,
    });
  }
  return out;
}

const EMPTY = { apps: [] as StoreApp[], hasMore: false };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const query = (params.get('q') ?? '').trim();
  if (!query) return NextResponse.json(EMPTY);

  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('https://flathub.org/api/v2/search', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          hits_per_page: PER_PAGE,
          page,
        }),
        // Search results are query-specific + cheap to re-fetch → don't cache.
        cache: 'no-store',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return NextResponse.json(EMPTY);

    const data = (await res.json()) as FlathubSearch;
    const apps = mapHits(data?.hits);
    const upPage = typeof data?.page === 'number' ? data.page : page;
    const totalPages = typeof data?.totalPages === 'number' ? data.totalPages : upPage;
    const hasMore = upPage < totalPages;

    return NextResponse.json({ apps, hasMore });
  } catch (err) {
    console.error('[flathub/search] upstream failure:', err);
    return NextResponse.json(EMPTY);
  }
}
