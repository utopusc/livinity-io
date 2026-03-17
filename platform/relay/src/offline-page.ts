/**
 * Offline Page
 *
 * Serves a branded HTML page when a user's tunnel is disconnected.
 * Auto-refreshes every 10 seconds so the browser resumes automatically
 * once the tunnel reconnects.
 */

import type http from 'node:http';

/**
 * Serve the branded offline page with 503 status.
 */
export function serveOfflinePage(
  res: http.ServerResponse,
  username: string,
): void {
  // Escape username for safe HTML embedding
  const safe = username.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>${safe} - Offline</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#fff;color:#333}
.c{text-align:center;padding:2rem}
.logo{font-size:1.5rem;font-weight:700;letter-spacing:-.02em;color:#111;margin-bottom:1.5rem}
.msg{font-size:1.1rem;color:#555;margin-bottom:.5rem}
.sub{font-size:.85rem;color:#999}
</style>
</head>
<body>
<div class="c">
<div class="logo">Livinity</div>
<div class="msg">${safe}'s server is currently offline</div>
<div class="sub">The server may be restarting. This page will automatically refresh.</div>
</div>
</body>
</html>`;

  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Retry-After': '10',
    'Cache-Control': 'no-store',
  });
  res.end(html);
}
