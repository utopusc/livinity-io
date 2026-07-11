import { describe, it, expect } from 'vitest';
import { parseMarkerLine, makeLineBuffer, stripAnsi } from '../../src/main/orchestrator/marker-parser';

/**
 * Flat table (mirrors tests/wsl/map-install-exit.test.ts style) -- one
 * input->output row per case, zero mocks, plus the dedicated cross-chunk
 * reassembly test (new territory -- no existing line-buffer analog in the
 * repo). Covers INSTALL-02's parsing half (05-RESEARCH.md Pattern 1).
 */
describe('parseMarkerLine', () => {
  it('parses a === title === step marker', () => {
    expect(parseMarkerLine('=== Foo bar ===')).toEqual({ kind: 'step', title: 'Foo bar' });
  });

  it('parses a [FAIL] line into a fail signal with the reason text', () => {
    expect(parseMarkerLine('[FAIL] curl: (22) ... error: 410')).toEqual({
      kind: 'fail',
      reason: 'curl: (22) ... error: 410',
    });
  });

  it('returns null for a [INFO] line (not rendered, per D-04)', () => {
    expect(parseMarkerLine('[INFO] apt output')).toBeNull();
  });

  it('returns null for any other non-marker line', () => {
    expect(parseMarkerLine('Reading package lists... Done')).toBeNull();
  });

  it('parses an ANSI-colored step marker after stripAnsi is applied', () => {
    const raw = '\x1b[31m=== X ===\x1b[0m';
    expect(parseMarkerLine(stripAnsi(raw))).toEqual({ kind: 'step', title: 'X' });
  });
});

describe('stripAnsi', () => {
  it('removes ANSI color escape codes, leaving the plain text', () => {
    expect(stripAnsi('\x1b[31m=== X ===\x1b[0m')).toBe('=== X ===');
  });

  it('is a no-op on text with no ANSI codes', () => {
    expect(stripAnsi('=== plain ===')).toBe('=== plain ===');
  });
});

describe('makeLineBuffer', () => {
  it('emits a complete line immediately when a chunk ends on a newline', () => {
    const lines: string[] = [];
    const feed = makeLineBuffer((line) => lines.push(line));
    feed(Buffer.from('=== Foo bar ===\n'));
    expect(lines).toEqual(['=== Foo bar ===']);
  });

  it('reassembles a === title === marker split across two data chunks', () => {
    const lines: string[] = [];
    const feed = makeLineBuffer((line) => lines.push(line));
    feed(Buffer.from('=== Foo'));
    // No newline yet -- must NOT emit a partial line.
    expect(lines).toEqual([]);
    feed(Buffer.from(' bar ===\n'));
    // Exactly one completed, reassembled line.
    expect(lines).toEqual(['=== Foo bar ===']);
  });

  it('does not emit a chunk that ends mid-line until the newline arrives', () => {
    const lines: string[] = [];
    const feed = makeLineBuffer((line) => lines.push(line));
    feed(Buffer.from('[INFO] still working'));
    expect(lines).toEqual([]);
  });

  it('emits multiple completed lines from a single multi-line chunk', () => {
    const lines: string[] = [];
    const feed = makeLineBuffer((line) => lines.push(line));
    feed(Buffer.from('=== A ===\n[OK] done\n=== B ===\n'));
    expect(lines).toEqual(['=== A ===', '[OK] done', '=== B ===']);
  });

  it('handles \\r\\n line endings', () => {
    const lines: string[] = [];
    const feed = makeLineBuffer((line) => lines.push(line));
    feed(Buffer.from('=== CRLF ===\r\n'));
    expect(lines).toEqual(['=== CRLF ===']);
  });
});
