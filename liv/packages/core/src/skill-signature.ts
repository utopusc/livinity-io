/**
 * Phase 257-01 Task 3 — MARKETPLACE skill origin/checksum gate (LIVOS-012).
 *
 * `verifySkillBundle()` is the pre-import trust gate for the MARKETPLACE
 * (downloaded) skill path ONLY. It is called by skill-loader.loadSkillLazy
 * BEFORE the in-process `await import(entryFile)` of a DOWNLOADED bundle.
 *
 * Trust model (only signal available today is the registry-of-origin):
 *   - origin 'builtin'                  -> ok (path-bundled first-party, trusted
 *                                          by origin; NEVER gated — regression
 *                                          guard for the BUILTIN loadSkill path).
 *   - origin 'marketplace', OFFICIAL    -> ok (the pinned official registry is
 *     registry                           trusted by origin; no checksum needed).
 *   - origin 'marketplace', checksum    -> ok iff SHA-256(entry) == checksum
 *     present                            (constant-time compare).
 *   - origin 'marketplace', otherwise   -> fail closed (an unverifiable
 *                                          downloaded bundle is NOT imported).
 *
 * Pure + async file-read only (no network, no exec) so it is unit-testable
 * offline. Mirrors the registry-URL normalization used by SkillRegistryClient
 * (strip trailing `/` + `.git`).
 */
import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The pinned OFFICIAL skill registry, derived from the SAME source the loader /
 * index uses (index.ts:455 — `SKILL_REGISTRY_URL || <default>`). Do NOT
 * re-hardcode a second copy elsewhere; import this constant.
 */
export const OFFICIAL_SKILL_REGISTRY = normalizeRegistryUrl(
  process.env.SKILL_REGISTRY_URL || 'https://github.com/utopusc/livinity-skills',
);

/** Normalize a registry URL the same way SkillRegistryClient.addRegistry does. */
export function normalizeRegistryUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

export interface VerifySkillBundleOpts {
  /** Absolute path to the resolved entry file (index.js) that would be import()-ed. */
  entryPath: string;
  /** Where the bundle came from. 'builtin' is path-bundled first-party (never gated). */
  origin: 'builtin' | 'marketplace';
  /** Registry-of-origin for a marketplace bundle (the GitHub repo URL it was downloaded from). */
  registryUrl?: string;
  /** SHA-256 hex of the entry file recorded at install time (forward-compat; absent today). */
  manifestChecksum?: string;
}

export interface VerifySkillBundleResult {
  ok: boolean;
  reason?: string;
}

/** Constant-time hex comparison; false when lengths differ or either side is empty. */
function constantTimeHexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf-8');
  const bb = Buffer.from(b, 'utf-8');
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Decide whether a skill bundle's entry file may be import()-ed.
 *
 * IMPORTANT: builtin bundles ALWAYS return ok — the BUILTIN loadSkill path is
 * trusted by origin and must keep loading first-party bundled skills.
 */
export async function verifySkillBundle(
  opts: VerifySkillBundleOpts,
): Promise<VerifySkillBundleResult> {
  // BUILTIN: path-bundled, first-party, trusted by origin. NEVER gated.
  if (opts.origin === 'builtin') {
    return { ok: true };
  }

  // MARKETPLACE (downloaded) — must be trusted by origin OR checksum-verified.
  const registry = opts.registryUrl ? normalizeRegistryUrl(opts.registryUrl) : '';

  // (a) trusted by origin: the pinned official registry.
  if (registry && registry === OFFICIAL_SKILL_REGISTRY) {
    return { ok: true };
  }

  // (b) checksum verification (forward-compat: when the installer records one).
  if (opts.manifestChecksum) {
    let bytes: Buffer;
    try {
      bytes = await readFile(opts.entryPath);
    } catch (err: any) {
      return { ok: false, reason: `cannot read entry file for checksum: ${err?.message ?? err}` };
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    const expected = opts.manifestChecksum.trim().toLowerCase();
    if (constantTimeHexEqual(actual, expected)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `checksum mismatch (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`,
    };
  }

  // (c) fail closed: a downloaded bundle from a non-official registry with no checksum.
  return {
    ok: false,
    reason: 'unverifiable marketplace skill bundle (non-official registry, no checksum)',
  };
}
