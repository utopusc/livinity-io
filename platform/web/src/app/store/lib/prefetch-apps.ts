// Server-only catalog prefetch (Phase 289 WS-B).
//
// "Everything shows 'soon' on open" was never a real data state — every
// section is fully populated in Supabase. The catalog was fetched CLIENT-side
// only, in a useEffect that runs AFTER hydration (store-provider.tsx), so until
// it resolves `apps=[]` and the "Soon"/"Coming in Phase X" placeholders render
// off that still-empty array. We kill that flash by server-prefetching the
// catalog in the RSC layout and seeding the provider with `initialApps`.
//
// SECURITY (threat register T-289B-01/02): this returns ONLY the public,
// read-only catalog (the same name/tagline/icon/section any token-bearing
// client already gets from GET /api/apps). It deliberately SKIPS
// validateApiKey's bcrypt round — that check exists to gate per-request mutating
// / per-user paths, not a public directory listing. We still require a token to
// be PRESENT (returns [] otherwise) so an unauthenticated bare-/store render
// shows nothing until the client fetch (which DOES validate) runs.

import { cookies } from 'next/headers';
import { asc, sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle';
import { apps } from '@/db/schema';
import type { AppSummary } from '../types';

/**
 * Prefetch the full app catalog for the RSC store layout.
 *
 * @param urlToken the `?token=` searchParam, passed by callers that can read it
 *   (the FIRST-load fallback — on the very first iframe load the token rides
 *   only in the URL and the `liv_store_token` cookie is set on that same
 *   response, so the cookie may not be readable yet for this request).
 *   Falls back to the `liv_store_token` cookie persisted by middleware.ts.
 * @returns the public catalog as AppSummary[], or [] when no token is present
 *   or the DB query fails (degrades to the existing client useEffect fetch).
 */
export async function prefetchApps(
  urlToken?: string | null,
): Promise<AppSummary[]> {
  // Resolve the token: URL first-load fallback, then the persisted cookie.
  const token =
    urlToken ?? (await cookies()).get('liv_store_token')?.value ?? null;

  // No token → return nothing. The client provider keeps its "Connect your
  // LivOS instance" error path (only surfaced when the client ALSO has no
  // token), so the bare /store admin console is unchanged.
  if (!token) return [];

  try {
    // Read-only public catalog — query Drizzle directly, mirroring
    // api/apps/route.ts:27-52 (no self-HTTP hop, no bcrypt). Load ALL sections
    // (no ?section= filter) so every tab is seeded on first paint.
    const rows = await db
      .select({
        id: apps.slug,
        name: apps.name,
        tagline: apps.tagline,
        category: apps.category,
        section: apps.section,
        icon_url: apps.icon_url,
        featured: apps.featured,
        verified: apps.verified,
        version: apps.version,
        created_at: apps.created_at,
      })
      .from(apps)
      .orderBy(asc(sql`COALESCE(sort_order, 100)`), asc(apps.name));

    // AppSummary.created_at is a string (the /api/apps route emits it via
    // NextResponse.json which ISO-serializes the Date). Seeding the React tree
    // directly here, we must do the same serialization so the seeded shape
    // matches what the client useEffect later overwrites — and to satisfy the
    // AppSummary type (the Drizzle column is a Date).
    return rows.map((r) => ({
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    }));
  } catch {
    // A transient DB hiccup must degrade to the existing client fetch rather
    // than throw the server render (threat register T-289B-04).
    return [];
  }
}
