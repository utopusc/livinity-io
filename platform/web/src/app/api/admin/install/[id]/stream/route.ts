import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

type RouteContext = { params: Promise<{ id: string }> };

// SSE poll interval (ms). Keep modest — Mini PC poller updates every 5s anyway.
const POLL_INTERVAL_MS = 2000;
// Hard timeout (ms) — disconnect after this so dangling streams don't pile up
// on Vercel function instances. Client should reconnect with Last-Event-ID.
const STREAM_TIMEOUT_MS = 5 * 60 * 1000;

type InstallCmdRow = {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  result_json: unknown;
};

export async function GET(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastStatus = '';

  const stream = new ReadableStream({
    async start(controller) {
      function send(eventName: string, data: unknown) {
        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      async function tick() {
        try {
          const result = await pool.query<InstallCmdRow>(
            `SELECT id, status, started_at, completed_at, result_json
               FROM install_commands WHERE id = $1 LIMIT 1`,
            [id],
          );
          if (result.rows.length === 0) {
            send('error', { error: 'not_found' });
            controller.close();
            return;
          }
          const row = result.rows[0];
          if (row.status !== lastStatus) {
            lastStatus = row.status;
            send('status', row);
            if (row.status === 'ready' || row.status === 'failed' || row.status === 'cancelled') {
              send('done', { status: row.status });
              controller.close();
            }
          }
        } catch (err) {
          send('error', { error: err instanceof Error ? err.message : String(err) });
          controller.close();
        }
      }

      // Initial state + start polling.
      await tick();
      intervalId = setInterval(tick, POLL_INTERVAL_MS);
      timeoutId = setTimeout(() => {
        send('timeout', { message: 'Stream timeout — reconnect to continue.' });
        controller.close();
      }, STREAM_TIMEOUT_MS);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
