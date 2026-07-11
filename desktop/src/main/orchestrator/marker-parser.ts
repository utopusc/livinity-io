/**
 * src/main/orchestrator/marker-parser.ts
 *
 * Pure, zero-IO streaming line/ANSI parser (INSTALL-02 / D-04). Turns raw
 * install.sh stderr text into a per-line signal: `=== title ===` step
 * boundaries and `[FAIL] reason` failure lines. `[INFO]`/`[OK]`/`[WARN]`
 * lines and any other stray output (e.g. apt output that leaked to stderr)
 * are not markers at all and return null -- raw command output is never
 * rendered (Phase-4 D-05 carryover).
 *
 * Colors: `_logging.sh`'s ANSI color codes are gated on `[[ -t 2 ]]` (a real
 * TTY) -- a `spawn()`-piped stderr is NOT a TTY on either side of the WSL
 * boundary, so `_C_RED`/etc. are almost certainly already EMPTY strings in
 * this exact invocation shape (piped stdio). `stripAnsi` strips anyway for
 * defense-in-depth (05-RESEARCH.md Assumption A3) -- cheap and correct
 * either way.
 *
 * `makeLineBuffer` exists because Buffer/string chunks from a `data` event
 * do not align to line boundaries -- a chunk can split a line anywhere,
 * including inside `=== title ===`. It carries the last (possibly partial)
 * split element across calls and only emits fully-terminated lines.
 *
 * Zero runtime imports -- no IO, no Node built-ins, no electron surface.
 */

export function makeLineBuffer(onLine: (line: string) => void): (chunk: Buffer) => void {
  let carry = '';
  return (chunk: Buffer) => {
    carry += chunk.toString('utf8');
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() ?? ''; // last element is a partial line (or '' if chunk ended on \n)
    for (const line of lines) onLine(line);
  };
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

export type MarkerSignal = { kind: 'step'; title: string } | { kind: 'fail'; reason: string } | null;

export function parseMarkerLine(line: string): MarkerSignal {
  const stepMatch = line.match(/^===\s*(.+?)\s*===$/);
  if (stepMatch) return { kind: 'step', title: stepMatch[1] };
  const failMatch = line.match(/^\[FAIL\]\s*(.+)$/);
  if (failMatch) return { kind: 'fail', reason: failMatch[1] };
  return null; // [INFO]/[OK]/[WARN] and everything else -- not rendered, per D-04
}
