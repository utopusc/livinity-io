/**
 * GET /api/flathub/categories — generic app-store category labels.
 *
 * Phase 290+ — the store "Native" section is a GENERIC desktop app store
 * powered server-side by flathub.org (branding is intentionally HIDDEN: the
 * user never sees "Flathub"/"Flatpak"). This endpoint returns the static list
 * of human-friendly category labels the browse view offers. No network call is
 * needed — the labels are fixed and map to upstream collection slugs in
 * /api/flathub/browse.
 *
 * Public like /api/public-config: this is public catalog metadata, no API key.
 */
import { NextResponse } from 'next/server';

// Cache for a day — the label set is static.
export const revalidate = 86400;

// Generic, brand-free labels. The browse handler maps each → the CAPITALIZED
// freedesktop MainCategory slug used by flathub.org's collection API.
const CATEGORIES: string[] = [
  'Productivity',
  'Graphics & Photography',
  'Games',
  'Developer Tools',
  'Audio & Video',
  'Communication & News',
  'Utilities',
  'Education',
  'Science & Engineering',
  'System',
];

export async function GET() {
  return NextResponse.json(CATEGORIES);
}
