/**
 * POST /v1/chat/completions — OpenAI Chat Completions broker — Phase 147
 *
 * Same architecture as /v1/messages but downstream URL targets the broker's
 * OpenAI-compat route. Used by tools that speak OpenAI SDK (Cline, OpenAI
 * Cookbook examples, etc.).
 *
 * The downstream livinity-broker handles translation between OpenAI ↔
 * Anthropic verbatim per Phase 58 Wave 3 — Vercel just forwards.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateBrokerRequest } from '@/lib/broker-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await authenticateBrokerRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: { message: auth.error, type: 'invalid_request_error' } },
      { status: auth.status },
    );
  }

  const downstreamUrl = `https://${auth.username}.livinity.io/u/${auth.userId}/v1/chat/completions`;

  let body: string | null = null;
  try {
    body = await req.text();
  } catch {
    body = null;
  }

  let upstream: Response;
  try {
    upstream = await fetch(downstreamUrl, {
      method: 'POST',
      headers: {
        'content-type': req.headers.get('content-type') ?? 'application/json',
        authorization: `Bearer ${auth.apiKey}`,
      },
      body,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: `broker → ${auth.username}.livinity.io unreachable: ${
            err instanceof Error ? err.message : String(err)
          }`,
          type: 'server_error',
        },
      },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}
