import { describe, it, expect } from 'vitest';
import { parseIni, mergeWsl2Keys, serializeIni, validateResourceLimits } from '../../src/main/wsl/wslconfig';

/**
 * String-fixture-only (no real fs). The phase's canary test (D-16): a
 * regression here has blast radius beyond this app — it can corrupt a
 * user's `.wslconfig` for ALL their WSL distros, not just Livinity's. Every
 * "untouched" assertion below is a byte-for-byte equality check, not a loose
 * `toContain`.
 */

const FIXTURE_WITH_COMMENT_AND_EXPERIMENTAL =
  '# Livinity config, do not edit lightly\n' +
  '[wsl2]\n' +
  'kernelCommandLine=vsyscall=emulate\n' +
  '\n' +
  '[experimental]\n' +
  'sparseVhd=true\n';

describe('parseIni + serializeIni round-trip', () => {
  it('returns the input BYTE-FOR-BYTE when no patch is applied (comment + [experimental] fixture)', () => {
    const lines = parseIni(FIXTURE_WITH_COMMENT_AND_EXPERIMENTAL);
    expect(serializeIni(lines)).toBe(FIXTURE_WITH_COMMENT_AND_EXPERIMENTAL);
  });

  it('round-trips a fixture with no trailing newline', () => {
    const content = '[wsl2]\nmemory=4GB';
    expect(serializeIni(parseIni(content))).toBe(content);
  });

  it('round-trips an empty string', () => {
    expect(serializeIni(parseIni(''))).toBe('');
  });
});

describe('mergeWsl2Keys — replace in place', () => {
  it('replaces ONLY the patched value, leaving kernelCommandLine + [experimental] + comments untouched', () => {
    const original =
      '# comment\n' +
      '[wsl2]\n' +
      'memory=4GB\n' +
      'kernelCommandLine=vsyscall=emulate\n' +
      '\n' +
      '[experimental]\n' +
      'sparseVhd=true\n';

    const merged = mergeWsl2Keys(parseIni(original), { memory: '8GB' });
    const out = serializeIni(merged);

    expect(out).toBe(
      '# comment\n' +
        '[wsl2]\n' +
        'memory=8GB\n' +
        'kernelCommandLine=vsyscall=emulate\n' +
        '\n' +
        '[experimental]\n' +
        'sparseVhd=true\n'
    );
    // explicit untouched-preservation assertions (assertion discipline)
    expect(out).toContain('kernelCommandLine=vsyscall=emulate');
    expect(out).toContain('[experimental]');
    expect(out).toContain('sparseVhd=true');
    expect(out).toContain('# comment');
  });
});

describe('mergeWsl2Keys — append missing key within an existing [wsl2] section', () => {
  it('appends processors=6 right after the section\'s last existing key (not at EOF, not before [experimental])', () => {
    const original =
      '# top comment\n' +
      '[wsl2]\n' +
      'memory=4GB\n' +
      'kernelCommandLine=foo\n' +
      '\n' +
      '[experimental]\n' +
      'autoMemoryReclaim=gradual\n';

    const merged = mergeWsl2Keys(parseIni(original), { processors: '6' });
    const out = serializeIni(merged);

    expect(out).toBe(
      '# top comment\n' +
        '[wsl2]\n' +
        'memory=4GB\n' +
        'kernelCommandLine=foo\n' +
        'processors=6\n' +
        '\n' +
        '[experimental]\n' +
        'autoMemoryReclaim=gradual\n'
    );
    // the new key must land BEFORE [experimental], not appended at EOF
    expect(out.indexOf('processors=6')).toBeLessThan(out.indexOf('[experimental]'));
  });
});

describe('mergeWsl2Keys — insert after a terminator-less last [wsl2] line (CR-01 regression)', () => {
  it('does NOT glue the new key onto a trailing-newline-less last kv line (swap=0 stays intact)', () => {
    const merged = mergeWsl2Keys(parseIni('[wsl2]\nswap=0'), { memory: '8GB' });
    const out = serializeIni(merged);
    expect(out).toBe('[wsl2]\nswap=0\nmemory=8GB\n');
    // the user's own line must survive byte-intact as its own line
    expect(out).toContain('swap=0\n');
    expect(out).not.toContain('swap=0memory');
  });

  it('does NOT glue the new key onto a terminator-less header-only [wsl2] file', () => {
    const merged = mergeWsl2Keys(parseIni('[wsl2]'), { memory: '8GB' });
    const out = serializeIni(merged);
    expect(out).toBe('[wsl2]\nmemory=8GB\n');
    expect(out).not.toContain('[wsl2]memory');
  });

  it('preserves a CRLF file: the normalized anchor gains a terminator and the untouched lines keep \\r\\n', () => {
    const merged = mergeWsl2Keys(parseIni('[wsl2]\r\nswap=0'), { memory: '8GB' });
    const out = serializeIni(merged);
    expect(out).toContain('[wsl2]\r\n');
    expect(out).not.toContain('swap=0memory');
    expect(out).toContain('memory=8GB\n');
  });
});

describe('mergeWsl2Keys — no [wsl2] section at all', () => {
  it('appends a new [wsl2] section + keys at EOF and leaves [experimental] intact', () => {
    const original = '# a comment\n[experimental]\nautoMemoryReclaim=gradual\n';

    const merged = mergeWsl2Keys(parseIni(original), { memory: '8GB', processors: '6' });
    const out = serializeIni(merged);

    expect(out).toBe(
      '# a comment\n[experimental]\nautoMemoryReclaim=gradual\n[wsl2]\nmemory=8GB\nprocessors=6\n'
    );
    expect(out).toContain('[experimental]\nautoMemoryReclaim=gradual');
  });
});

describe('mergeWsl2Keys — empty input', () => {
  it('patching { memory: "8GB" } on an empty string produces a fresh minimal file', () => {
    const merged = mergeWsl2Keys(parseIni(''), { memory: '8GB' });
    expect(serializeIni(merged)).toBe('[wsl2]\nmemory=8GB\n');
  });
});

describe('mergeWsl2Keys — empty patch', () => {
  it('leaves the input completely identical (no spurious [wsl2] section created)', () => {
    const original = '# comment\n[experimental]\nsparseVhd=true\n';
    const merged = mergeWsl2Keys(parseIni(original), {});
    expect(serializeIni(merged)).toBe(original);
    expect(merged).toEqual(parseIni(original));
  });

  it('leaves an already-empty string identical', () => {
    const merged = mergeWsl2Keys(parseIni(''), {});
    expect(serializeIni(merged)).toBe('');
  });
});

describe('validateResourceLimits', () => {
  it('formats valid limits into a WSL-shaped patch (memory=<n>GB, processors=<n>)', () => {
    const result = validateResourceLimits({ memoryGb: 8, processors: 6, diskGb: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.memory).toBe('8GB');
      expect(result.patch.processors).toBe('6');
    }
  });

  it('rejects memoryGb <= 0 (must be a positive integer GB)', () => {
    expect(validateResourceLimits({ memoryGb: 0, processors: 6, diskGb: 20 })).toEqual({ ok: false });
  });

  it('rejects processors < 1 (must be an integer >= 1)', () => {
    expect(validateResourceLimits({ memoryGb: 8, processors: 0, diskGb: 20 })).toEqual({ ok: false });
  });

  it('rejects a non-integer memoryGb — a malformed value could break .wslconfig for ALL distros', () => {
    expect(validateResourceLimits({ memoryGb: 8.5, processors: 6, diskGb: 20 })).toEqual({ ok: false });
  });

  it('rejects a non-integer processors count', () => {
    expect(validateResourceLimits({ memoryGb: 8, processors: 2.5, diskGb: 20 })).toEqual({ ok: false });
  });

  it('rejects a diskGb below the D-10 15GB floor', () => {
    expect(validateResourceLimits({ memoryGb: 8, processors: 6, diskGb: 10 })).toEqual({ ok: false });
  });

  it('accepts limits with memoryGb/processors omitted (diskGb-only callers)', () => {
    const result = validateResourceLimits({ diskGb: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch).toEqual({});
    }
  });
});
