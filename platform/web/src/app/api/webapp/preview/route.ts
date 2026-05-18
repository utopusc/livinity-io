// Vercel-side OpenGraph + favicon scraper. Lets the Custom URL form on
// /store?section=webapp show a live preview before the user clicks
// "Add to Dock" — without needing livinityd to be reachable.
//
// SECURITY:
// - Limit to http/https URLs only.
// - Block SSRF: refuse URLs that resolve to private/loopback ranges
//   by enforcing a public-only host pattern check (best-effort —
//   serverless environments don't expose DNS resolver to us).
// - 8s timeout. 1 MB max response body.
// - Strip script/style nodes from any returned HTML excerpt.

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_000_000; // 1 MB
const UA =
  'LivinityWebappPreview/1.0 (+https://livinity.io/developers)';

// Lightweight blocklist for obviously-private hostnames so a paste-bombing
// user can't probe the Vercel function's egress to internal services.
// Fancy SSRF protection would resolve the host, fetch with DNS pinning,
// and check IPs — out of scope for v37; we ship this as best-effort.
function isObviouslyPrivate(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0') return true;
  if (lower.startsWith('127.')) return true;
  if (lower.startsWith('10.')) return true;
  if (lower.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true;
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  if (lower === '169.254.169.254') return true; // AWS metadata
  return false;
}

// Tiny HTML parser — pulls <title>, <meta property="og:..."> /
// <meta name="twitter:..."> / <link rel="...icon ...">. Regex parsing is
// fragile but adequate for the small subset of tags we need; full DOM
// would pull jsdom which Vercel-edge struggles with.
function parseMeta(html: string, baseUrl: URL): {
  title?: string;
  description?: string;
  iconUrl?: string;
  siteName?: string;
} {
  // Strip script/style content to avoid confusing the regexes.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  function metaContent(prop: string): string | undefined {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*>`,
      'i',
    );
    const m = cleaned.match(re);
    if (!m) return undefined;
    const contentMatch = m[0].match(/content\s*=\s*["']([^"']+)["']/i);
    return contentMatch?.[1];
  }

  const titleTag = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();

  // Icon — prefer apple-touch (high res), then any "icon" rel
  function iconHref(): string | undefined {
    const appleRe = /<link[^>]+rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i;
    const iconRe = /<link[^>]+rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/i;
    for (const re of [appleRe, iconRe]) {
      const m = cleaned.match(re);
      if (m) {
        const href = m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
        if (href) return href;
      }
    }
    return undefined;
  }

  const rawIcon = metaContent('og:image') || iconHref();
  let iconUrl: string | undefined;
  if (rawIcon) {
    try {
      iconUrl = new URL(rawIcon, baseUrl).toString();
    } catch {
      iconUrl = undefined;
    }
  }
  // Fallback: default /favicon.ico
  if (!iconUrl) {
    iconUrl = new URL('/favicon.ico', baseUrl).toString();
  }

  return {
    title: metaContent('og:title') || metaContent('twitter:title') || titleTag,
    description: metaContent('og:description') || metaContent('twitter:description') || metaContent('description'),
    iconUrl,
    siteName: metaContent('og:site_name'),
  };
}

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) return unauthorizedResponse(auth.error);

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'missing url' }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json(
      { error: 'only http/https allowed' },
      { status: 400 },
    );
  }
  if (isObviouslyPrivate(target.hostname)) {
    return NextResponse.json(
      { error: 'private hostnames not allowed' },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(target.toString(), {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { error: `upstream ${res.status}`, url: target.toString() },
        { status: 502 },
      );
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('html')) {
      return NextResponse.json({
        url: target.toString(),
        title: target.hostname,
        iconUrl: new URL('/favicon.ico', target).toString(),
        description: null,
        siteName: null,
        note: 'non-html response',
      });
    }

    // Read first MAX_BYTES to keep cost bounded.
    const reader = res.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'no response body' }, { status: 502 });
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(value);
      if (total >= MAX_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);

    const meta = parseMeta(html, target);
    return NextResponse.json({
      url: target.toString(),
      title: meta.title ?? target.hostname,
      description: meta.description ?? null,
      iconUrl: meta.iconUrl ?? null,
      siteName: meta.siteName ?? null,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted')) {
      return NextResponse.json({ error: 'upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
