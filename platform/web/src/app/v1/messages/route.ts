/**
 * POST /v1/messages — Anthropic Messages API broker — Phase 147
 *
 * Reverse-proxies LLM requests from external tools (Bolt.diy, Cline, Cursor,
 * Continue.dev) to the api-key owner's own livinityd instance at
 * https://<username>.livinity.io/u/<userId>/v1/messages, which holds the
 * Anthropic subscription token (per-user /root/.credentials.json) and
 * actually talks to api.anthropic.com.
 *
 * Architecture path (post-Phase-146):
 *   tool → api.livinity.io/v1/messages (this route, Vercel)
 *        → fetch <username>.livinity.io/u/<userId>/v1/messages
 *        → CF Tunnel → user's livinityd port 8080
 *        → livinity-broker router.ts (livos/packages/livinityd/...)
 *        → Anthropic SDK with per-user subscription token
 *        → api.anthropic.com
 *
 * Phase 59 Bearer middleware on user's livinityd accepts the same api-key.
 * We forward it as `Authorization: Bearer …` so the downstream resolves
 * userId from header (preferred over URL path).
 *
 * Phase 147 known limitations (carryover):
 *   - No rate limiting (Server5 had caddy-ratelimit @ 60req/min/bearer +
 *     30req/min/ip; Vercel has WAF rules but those need separate setup).
 *   - No bandwidth tracking (Phase 148 carryover — record into Supabase
 *     bandwidth_usage table after each request).
 *   - No model alias resolution (broker had `livinity:claude-opus` style
 *     aliases mapping to upstream model names; for v1 we pass model verbatim).
 *   - Streaming preserved verbatim (Anthropic SSE → client SSE 1:1).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateBrokerRequest } from '@/lib/broker-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro = 60s, Hobby = 10s — streaming responses may truncate on Hobby

export async function POST(req: NextRequest) {
  // 1. Authenticate the caller
  const auth = await authenticateBrokerRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      {
        type: 'error',
        error: { type: 'authentication_error', message: auth.error },
      },
      { status: auth.status },
    );
  }

  // 2. Build downstream URL
  const downstreamUrl = `https://${auth.username}.livinity.io/u/${auth.userId}/v1/messages`;

  // 3. Forward request body verbatim
  let body: BodyInit | null = null;
  try {
    body = await req.text(); // preserve raw JSON
  } catch {
    body = null;
  }

  let upstream: Response;
  try {
    upstream = await fetch(downstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': req.headers.get('content-type') ?? 'application/json',
        // Forward Bearer so Phase 59 middleware on user's livinityd can auth.
        authorization: `Bearer ${auth.apiKey}`,
        // Some Anthropic clients send anthropic-version — pass-through.
        ...(req.headers.get('anthropic-version')
          ? { 'anthropic-version': req.headers.get('anthropic-version')! }
          : {}),
        ...(req.headers.get('anthropic-beta')
          ? { 'anthropic-beta': req.headers.get('anthropic-beta')! }
          : {}),
      },
      body,
    });
  } catch (err) {
    return NextResponse.json(
      {
        type: 'error',
        error: {
          type: 'overloaded_error',
          message: `broker → ${auth.username}.livinity.io unreachable: ${
            err instanceof Error ? err.message : String(err)
          }. The user's livinityd may be offline or the CF Tunnel is reconnecting.`,
        },
      },
      { status: 502 },
    );
  }

  // 4. Stream the response back as-is (SSE if upstream streams).
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function GET() {
  return NextResponse.json(
    {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Method not allowed — use POST with Anthropic Messages API body',
      },
    },
    { status: 405, headers: { allow: 'POST' } },
  );
}
