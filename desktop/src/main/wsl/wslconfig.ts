/**
 * src/main/wsl/wslconfig.ts
 *
 * Pure, zero-IO `.wslconfig` read-merge-serialize (WSL-05 / D-16). THE LOAD-
 * BEARING RULE: `.wslconfig` is a GLOBAL file shared by every WSL distro the
 * user runs, not just Livinity's — a read-merge-write that preserves every
 * byte the app does not own (comments, unknown keys, unrelated sections) is
 * the entire mitigation. A naive overwrite or a generic INI library's
 * "parse into an object, stringify back" round-trip would silently reformat
 * or drop content and could corrupt the user's config for ALL their WSL
 * distros. So this is hand-rolled per the phase RESEARCH's tagged-union
 * tokenizer pattern rather than pulling in a formatting-lossy dependency —
 * no filesystem import either; the actual file read/write lives in the
 * 04-09 IPC handler, this module only ever touches strings.
 *
 * Mirrors src/main/cloudflare/merge-ingress.ts's read-modify-write shape
 * (add-only, preserve-everything-else, dedup/replace in place).
 */

/** RESEARCH Pattern 3 tagged union — one entry per physical line. */
export type IniLine =
  | { kind: 'raw'; text: string } // comment/blank/unrecognized — preserved verbatim
  | { kind: 'section'; name: string; text: string }
  | { kind: 'kv'; section: string; key: string; value: string; text: string };

type Wsl2Key = 'memory' | 'processors' | 'swap';

/** Splits content into lines, each ELEMENT keeping its own original line
 * terminator (\n, \r\n, or \r) attached — the last element has no terminator
 * if the content doesn't end in one. Concatenating every element back
 * together always reconstructs the original content exactly. */
function splitLinesKeepingTerminators(content: string): string[] {
  const result: string[] = [];
  const terminatorPattern = /\r\n|\r|\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = terminatorPattern.exec(content))) {
    result.push(content.slice(cursor, match.index) + match[0]);
    cursor = terminatorPattern.lastIndex;
  }
  if (cursor < content.length) result.push(content.slice(cursor));
  return result;
}

function bodyOf(line: string): string {
  return line.replace(/(\r\n|\r|\n)$/, '');
}

function terminatorOf(line: string): string {
  const match = line.match(/(\r\n|\r|\n)$/);
  return match ? match[0] : '\n';
}

/**
 * Tokenizes raw `.wslconfig` content into an ordered line list, tracking the
 * current `[section]`. A `key=value` line only becomes `kv` while a section
 * is active — a stray `key=value`-shaped line before any section header is
 * "unrecognized" and preserved as `raw`, per the tokenizer contract.
 */
export function parseIni(content: string): IniLine[] {
  const rawLines = splitLinesKeepingTerminators(content);
  const lines: IniLine[] = [];
  let currentSection = '';

  for (const rawLine of rawLines) {
    const body = bodyOf(rawLine);
    const trimmed = body.trim();

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      lines.push({ kind: 'section', name: currentSection, text: rawLine });
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      lines.push({ kind: 'raw', text: rawLine });
      continue;
    }

    const kvMatch = body.match(/^([^=]+)=(.*)$/);
    if (kvMatch && currentSection) {
      lines.push({
        kind: 'kv',
        section: currentSection,
        key: kvMatch[1].trim(),
        value: kvMatch[2],
        text: rawLine,
      });
      continue;
    }

    // Unrecognized (malformed, or key=value with no active section) — never
    // touched, preserved verbatim.
    lines.push({ kind: 'raw', text: rawLine });
  }

  return lines;
}

/** True if the last existing line's text doesn't already end in a line
 * terminator — used only when appending a brand-new [wsl2] section at EOF so
 * it never gets glued onto the previous line's content. */
function needsLeadingNewline(lines: IniLine[]): boolean {
  if (lines.length === 0) return false;
  const lastText = lines[lines.length - 1].text;
  return lastText.length > 0 && !/[\r\n]$/.test(lastText);
}

/**
 * The 3-rule merge (RESEARCH Pattern 3): (1) an existing [wsl2] kv line for a
 * patched key has ONLY its value replaced in place, preserving its original
 * line terminator; (2) [wsl2] exists but the key is absent — a new kv line is
 * inserted right after the section's LAST existing kv line (or right after
 * the header if it has none yet) — never at EOF, never before another
 * existing [wsl2] key; (3) no [wsl2] section at all — a new section + its kv
 * lines are appended at EOF. Every line outside these targeted edits
 * (comments, other sections, unrelated [wsl2] keys) is left byte-identical.
 * An empty patch returns the input unchanged (no spurious section created).
 */
export function mergeWsl2Keys(lines: IniLine[], patch: Partial<Record<Wsl2Key, string>>): IniLine[] {
  const patchKeys = Object.keys(patch) as Wsl2Key[];
  if (patchKeys.length === 0) return lines;

  const result: IniLine[] = lines.map((line) => ({ ...line }));
  const remaining = new Set(patchKeys);

  let wsl2SectionIndex = -1;
  let lastWsl2LineIndex = -1;

  for (let i = 0; i < result.length; i++) {
    const line = result[i];

    if (line.kind === 'section' && line.name === 'wsl2') {
      wsl2SectionIndex = i;
      lastWsl2LineIndex = i;
      continue;
    }

    if (line.kind === 'kv' && line.section === 'wsl2') {
      lastWsl2LineIndex = i;
      const key = line.key as Wsl2Key;
      if (remaining.has(key)) {
        const value = patch[key]!;
        result[i] = { kind: 'kv', section: 'wsl2', key, value, text: `${key}=${value}${terminatorOf(line.text)}` };
        remaining.delete(key);
      }
    }
  }

  if (remaining.size === 0) return result;

  const newKvLines: IniLine[] = patchKeys
    .filter((key) => remaining.has(key))
    .map((key) => ({ kind: 'kv' as const, section: 'wsl2', key, value: patch[key]!, text: `${key}=${patch[key]}\n` }));

  if (wsl2SectionIndex !== -1) {
    result.splice(lastWsl2LineIndex + 1, 0, ...newKvLines);
    return result;
  }

  const appended: IniLine[] = [];
  if (needsLeadingNewline(result)) appended.push({ kind: 'raw', text: '\n' });
  appended.push({ kind: 'section', name: 'wsl2', text: '[wsl2]\n' }, ...newKvLines);
  return [...result, ...appended];
}

/** Joins every line's `.text` back together — for untouched lines this is
 * the original bytes; for a merged kv line it's the freshly rendered
 * `key=value` + its terminator. */
export function serializeIni(lines: IniLine[]): string {
  return lines.map((line) => line.text).join('');
}

export type ResourceLimitsInput = {
  memoryGb?: number;
  processors?: number;
  diskGb: number;
};

export type ValidateResourceLimitsResult =
  | { ok: true; patch: Partial<Record<Wsl2Key, string>> }
  | { ok: false };

/** D-10's hard floor — a per-distro VHD budget below this can't fit a working
 * install; also the floor decide-resource-defaults.ts's own recommendation
 * never drops under. */
const DISK_FLOOR_GB = 15;

/**
 * V5 input validation gate — the resource-allocation screen's numbers must be
 * validated against WSL's documented value shapes BEFORE they can ever reach
 * a merge/serialize/write. `memoryGb` (if present) must be a positive
 * integer, formatted `<n>GB`; `processors` (if present) must be an integer
 * >= 1, formatted as a plain integer string. `diskGb` is per-distro VHD size
 * (applied by the 04-09 handler via `wsl --manage`, never a `.wslconfig`
 * key) — it is validated for sanity here but never included in the patch.
 * Any malformed value rejects the WHOLE call (`{ ok: false }`) rather than
 * silently dropping just that key, so a caller can never partially write.
 */
export function validateResourceLimits(limits: ResourceLimitsInput): ValidateResourceLimitsResult {
  const patch: Partial<Record<Wsl2Key, string>> = {};

  if (limits.memoryGb !== undefined) {
    if (!Number.isInteger(limits.memoryGb) || limits.memoryGb <= 0) return { ok: false };
    patch.memory = `${limits.memoryGb}GB`;
  }

  if (limits.processors !== undefined) {
    if (!Number.isInteger(limits.processors) || limits.processors < 1) return { ok: false };
    patch.processors = `${limits.processors}`;
  }

  if (!Number.isInteger(limits.diskGb) || limits.diskGb < DISK_FLOOR_GB) return { ok: false };

  return { ok: true, patch };
}
