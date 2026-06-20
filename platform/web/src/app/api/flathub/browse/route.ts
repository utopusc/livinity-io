/**
 * GET /api/flathub/browse?category=<label|empty>&page=<n>
 *
 * Phase 290+ — server-side proxy to flathub.org so the browser NEVER hits
 * flathub directly (and never sees the brand). With no category we return the
 * "popular" collection; with a category label we map it → the CAPITALIZED
 * freedesktop MainCategory slug and fetch that collection.
 *
 *   no/empty category → GET https://flathub.org/api/v2/collection/popular
 *   category          → GET https://flathub.org/api/v2/collection/category/<Slug>
 *
 * Upstream returns { hits:[{ app_id, name, summary, icon }], page, totalPages }.
 * We map hit → { appId, name, summary, iconUrl } and compute hasMore = page<totalPages.
 * On any upstream failure we return { apps:[], hasMore:false } (never throw).
 *
 * Public like /api/public-config — public catalog metadata, no API key.
 */
import { NextRequest, NextResponse } from 'next/server';

// Popular collection is hot + slow-changing → let Next cache the GET fetch.
export const revalidate = 3600;

const PER_PAGE = 30;
const UPSTREAM_TIMEOUT_MS = 5000;

// Brand-free label → CAPITALIZED freedesktop MainCategory slug (flathub.org
// collection path). Labels MUST match /api/flathub/categories exactly.
const CATEGORY_SLUGS: Record<string, string> = {
  Productivity: 'Office',
  'Graphics & Photography': 'Graphics',
  Games: 'Game',
  'Developer Tools': 'Development',
  'Audio & Video': 'AudioVideo',
  'Communication & News': 'Network',
  Utilities: 'Utility',
  Education: 'Education',
  'Science & Engineering': 'Science',
  System: 'System',
};

const APP_ID_RE = /^[A-Za-z0-9._-]+$/;

interface FlathubHit {
  app_id?: unknown;
  name?: unknown;
  summary?: unknown;
  icon?: unknown;
}

interface FlathubCollection {
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

/** Map + filter a Flathub collection/search payload → our generic shape. */
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
  const category = (params.get('category') ?? '').trim();

  const pageRaw = Number.parseInt(params.get('page') ?? '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  // Resolve the upstream collection path. Unknown labels fall back to popular.
  let collectionPath: string;
  if (!category) {
    collectionPath = 'popular';
  } else {
    const slug = CATEGORY_SLUGS[category];
    collectionPath = slug ? `category/${slug}` : 'popular';
  }

  const url =
    `https://flathub.org/api/v2/collection/${collectionPath}` +
    `?page=${page}&per_page=${PER_PAGE}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
        next: { revalidate },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return NextResponse.json(EMPTY);

    const data = (await res.json()) as FlathubCollection;
    const apps = mapHits(data?.hits);
    const upPage = typeof data?.page === 'number' ? data.page : page;
    const totalPages = typeof data?.totalPages === 'number' ? data.totalPages : upPage;
    const hasMore = upPage < totalPages;

    return NextResponse.json({ apps, hasMore });
  } catch (err) {
    console.error('[flathub/browse] upstream failure:', err);
    return NextResponse.json(EMPTY);
  }
}
