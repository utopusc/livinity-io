/**
 * src/main/platform/http-client.ts
 *
 * Thin main-process-only fetch wrapper for the livinity.io platform API.
 * Manually attaches the Cookie: liv_session=... / X-Api-Key headers — CORS on
 * the platform is Access-Control-Allow-Origin: * (verified live), which blocks
 * credentialed/cookie fetches from a renderer origin by spec. Only a raw
 * main-process fetch can attach a manual Cookie header, so every authed
 * platform call MUST originate here, never from the renderer.
 *
 * Zero imports from ipc/ or tray/ — pure, unit-testable main-process HTTP
 * primitive. NEVER log the Cookie header or a liv_k_ value — use
 * logSafe(event, { status }) only (see ./auth-client.ts).
 */

/** Hardcoded HTTPS base — never anything else, never derived from user input. */
export const PLATFORM_URL = 'https://livinity.io';

/**
 * Extracts the `liv_session` cookie value from a raw Set-Cookie header list
 * (as returned by `Response.headers.getSetCookie()`).
 */
export function extractSessionCookie(setCookieHeaders: string[]): string | null {
  for (const raw of setCookieHeaders) {
    const match = /^liv_session=([^;]+)/.exec(raw);
    if (match) return match[1];
  }
  return null;
}

/** GET a cookie-authenticated platform endpoint. */
export async function authedGet(path: string, sessionValue: string): Promise<Response> {
  return fetch(`${PLATFORM_URL}${path}`, {
    headers: { Cookie: `liv_session=${sessionValue}` },
  });
}

/** POST a cookie-authenticated platform endpoint with a JSON body. */
export async function authedPost(
  path: string,
  sessionValue: string,
  body: unknown = {}
): Promise<Response> {
  return fetch(`${PLATFORM_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `liv_session=${sessionValue}`,
    },
    body: JSON.stringify(body),
  });
}

/** GET an X-Api-Key-authenticated platform endpoint (the D-14 key-validation probe). */
export async function apiKeyGet(path: string, apiKey: string): Promise<Response> {
  return fetch(`${PLATFORM_URL}${path}`, {
    headers: { 'X-Api-Key': apiKey },
  });
}

/**
 * Runs a fetch call and collapses it into a discriminated union that keeps a
 * thrown/rejected fetch (network-level failure — DNS, offline, timeout)
 * strictly separate from a resolved HTTP response (any status, including
 * 4xx/5xx). A blanket catch that folds both into one error class is wrong
 * here (02-RESEARCH.md Pitfall 3 / D-06 / D-12): only a genuine network
 * failure may produce `networkError:true`; an HTTP 401 is a VALUE, not an
 * exception.
 */
export async function safeFetch(
  fn: () => Promise<Response>
): Promise<{ ok: true; res: Response } | { ok: false; networkError: true }> {
  try {
    const res = await fn();
    return { ok: true, res };
  } catch {
    return { ok: false, networkError: true };
  }
}
