import { NextResponse } from 'next/server';

/**
 * Serves the real LivOS installer script.
 * The script is fetched from GitHub raw to always serve the latest version.
 * Fallback: embedded minimal bootstrap that clones and runs the real installer.
 */
export async function GET() {
  // Try to fetch the real installer from GitHub
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/utopusc/livinity-io/master/livos/install.sh',
      { next: { revalidate: 300 } }, // Cache for 5 minutes
    );
    if (res.ok) {
      const script = await res.text();
      return new NextResponse(script, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'inline',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
  } catch {
    // Fallback below
  }

  // Fallback: bootstrap script that clones repo and runs installer
  const fallback = `#!/bin/bash
set -euo pipefail
echo "Downloading LivOS installer..."
TMPDIR=$(mktemp -d)
git clone --depth 1 https://github.com/utopusc/livinity-io.git "$TMPDIR/livinity-io"
exec bash "$TMPDIR/livinity-io/livos/install.sh" "$@"
`;

  return new NextResponse(fallback, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
