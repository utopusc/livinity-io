/**
 * Phase 256-01 Task 2 (WS-A — Contained Autonomy, LIVOS-002 / SC1).
 *
 * Realpath allowlist for the `files` tool (daemon.ts SITE A + SITE B). The tool
 * runs in-process in liv-core (NOT inside the bwrap namespace), so it needs its
 * OWN path guard. Allow ONLY the agent-workspace root (LIV_AGENT_WORKSPACE) +
 * /opt/livos/data/uploads; DENY .env / secrets / home-creds / /opt/liv /
 * traversal. Deny wins. Never throws.
 *
 * WORKSPACE-ROOT INVARIANT (revision fix B): same root as the bwrap write-root
 * (sandbox.ts) and the git snapshot (agent-git-snapshot.ts). NOT /opt/liv.
 *
 * Path comparison is done with POSIX semantics (path.posix) because all roots
 * are absolute POSIX paths and the agent runs on Linux; this also keeps the unit
 * test deterministic on non-Linux dev boxes.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LIV_AGENT_WORKSPACE } from './sandbox.js';

/** Allowed roots — the agent-workspace and the shared uploads dir. */
const ALLOW_ROOTS = [LIV_AGENT_WORKSPACE, '/opt/livos/data/uploads'];

/** Explicit deny roots — secrets, the agent's own code, home creds. Deny wins. */
const DENY_ROOTS = [
  '/opt/livos/.env',
  '/opt/livos/data/secrets',
  '/opt/liv',
  path.join(os.homedir(), '.ssh'),
  path.join(os.homedir(), '.claude'),
  path.join(os.homedir(), '.gemini'),
  path.join(os.homedir(), '.kimi'),
];

/** Normalize to a POSIX absolute path: forward slashes, drop any Win drive prefix. */
function toPosix(p: string): string {
  let s = p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  s = path.posix.normalize(s);
  return s;
}

/** True if `target` === `root` or is nested under `root` (trailing-sep guard). */
function isUnder(target: string, root: string): boolean {
  const t = toPosix(target);
  const r = toPosix(root);
  return t === r || t.startsWith(r + '/');
}

/**
 * Resolve a (possibly not-yet-created) path to its canonical realpath. For
 * existing paths, realpathSync resolves symlinks. For not-yet-created write /
 * mkdir targets (ENOENT), fall back to the realpath of the nearest existing
 * ancestor + the remaining segments — so symlinked parents can't smuggle a path
 * out of the allow-root. Output is normalized to a POSIX absolute path.
 */
function canonicalize(p: string): string {
  const resolved = toPosix(p.startsWith('/') ? p : path.posix.resolve('/', toPosix(p)));
  try {
    return toPosix(fs.realpathSync(resolved));
  } catch {
    // Walk up to the nearest existing ancestor, realpath it, re-append the tail.
    const tail: string[] = [];
    let cur = resolved;
    while (cur !== path.posix.dirname(cur)) {
      try {
        const real = toPosix(fs.realpathSync(cur));
        return tail.length ? path.posix.join(real, ...tail.reverse()) : real;
      } catch {
        tail.push(path.posix.basename(cur));
        cur = path.posix.dirname(cur);
      }
    }
    return resolved;
  }
}

/**
 * Returns true ONLY when `p` resolves to a location inside an allow-root and is
 * not inside any deny-root. Deny wins. Never throws.
 */
export function isFilePathAllowed(p: string): boolean {
  try {
    if (!p || typeof p !== 'string') return false;
    const resolved = canonicalize(p);

    // Deny wins — even if a future allow-root would otherwise cover it.
    for (const deny of DENY_ROOTS) {
      if (isUnder(resolved, deny)) return false;
    }
    // Allow only when under an explicit allow-root.
    for (const allow of ALLOW_ROOTS) {
      if (isUnder(resolved, allow)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
