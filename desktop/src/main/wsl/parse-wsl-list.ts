/**
 * src/main/wsl/parse-wsl-list.ts
 *
 * Pure, zero-IO WSL list/version parsers (WSL-01). Locale-safe by construction:
 * D-01's load-bearing rule is parse on exit codes + `--quiet` output + version
 * SHAPE, NEVER on localized narrative text or case-folding — `wsl.exe` output is
 * UTF-16 and fully translated under a non-English Windows locale (the Turkish-
 * locale trap), so this module never trusts a narrative string and never
 * lower-cases a comparison.
 *
 * Zero imports from the electron module, the Node fs/net built-ins, or anything
 * with IO — plain string in, plain value out (mirrors validate-sub-label.ts).
 */

/**
 * Exact full-line match against a `wsl --list --quiet` output block. Never a
 * substring check, never case-folded — a foreign locale must not change
 * casing semantics, and a partial name (`my-livinity`) must never match.
 */
export function isDistroRegistered(quietListOutput: string, name = 'livinity'): boolean {
  return quietListOutput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .some((l) => l === name);
}

/**
 * Finds a dotted version number by its SHAPE (`\d+\.\d+\.\d+(\.\d+)?`), never by
 * the localizable key label ("WSL version" / "Sürüm" / etc.) that precedes it.
 */
export function parseWslVersion(stdout: string): string | null {
  const match = stdout.match(/(\d+\.\d+\.\d+\.\d+|\d+\.\d+\.\d+)/);
  return match?.[0] ?? null;
}
