/**
 * Phase 257-01 Task 3 — MARKETPLACE skill origin/checksum gate (LIVOS-012 / SC-B).
 *
 * Locks (WS-B Supply-chain integrity):
 * - verifySkillBundle() is the pre-import gate for the MARKETPLACE (downloaded)
 *   skill path ONLY. The BUILTIN (path-bundled, first-party) path is trusted by
 *   origin and is NEVER gated — a builtin bundle always verifies ok (regression
 *   guard: first-party bundled skills must keep loading).
 * - A marketplace bundle from the pinned OFFICIAL registry is trusted by origin.
 * - A marketplace bundle from a non-official registry must carry a matching
 *   SHA-256 checksum of its entry file, else it fails closed (NOT imported).
 *
 * Runner: tsx + node:assert/strict (sibling to sandbox.test.ts).
 * Run with: npx tsx src/skill-signature.test.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifySkillBundle, OFFICIAL_SKILL_REGISTRY } from './skill-signature.js';

async function withTempEntry(
  body: string,
): Promise<{ entryPath: string; checksum: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'skillsig-'));
  const entryPath = join(dir, 'index.js');
  await writeFile(entryPath, body, 'utf-8');
  const checksum = createHash('sha256').update(Buffer.from(body, 'utf-8')).digest('hex');
  return { entryPath, checksum, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function test1_builtinNeverGated() {
  const { entryPath, cleanup } = await withTempEntry('export const handler = () => {};');
  try {
    const res = await verifySkillBundle({ entryPath, origin: 'builtin' });
    assert.equal(res.ok, true, 'builtin origin must always verify ok (regression guard)');
    console.log('  PASS: builtin origin verifies ok without checksum/registry (bundled skills keep loading)');
  } finally {
    await cleanup();
  }
}

async function test2_officialRegistryTrusted() {
  const { entryPath, cleanup } = await withTempEntry('export const handler = () => {};');
  try {
    const res = await verifySkillBundle({
      entryPath,
      origin: 'marketplace',
      registryUrl: OFFICIAL_SKILL_REGISTRY,
    });
    assert.equal(res.ok, true, 'official marketplace registry is trusted by origin');
    // normalization: trailing slash + .git must still match the official registry
    const res2 = await verifySkillBundle({
      entryPath,
      origin: 'marketplace',
      registryUrl: OFFICIAL_SKILL_REGISTRY + '.git/',
    });
    assert.equal(res2.ok, true, 'official registry match is normalized (.git/ suffix)');
    console.log('  PASS: official marketplace registry verifies ok without a checksum (normalized)');
  } finally {
    await cleanup();
  }
}

async function test3_marketplaceChecksumMatch() {
  const { entryPath, checksum, cleanup } = await withTempEntry('export const handler = () => { return 1; };');
  try {
    const res = await verifySkillBundle({
      entryPath,
      origin: 'marketplace',
      registryUrl: 'https://github.com/some/community-skills',
      manifestChecksum: checksum,
    });
    assert.equal(res.ok, true, 'matching checksum on a community bundle verifies ok');
    console.log('  PASS: marketplace bundle with a matching SHA-256 checksum verifies ok');
  } finally {
    await cleanup();
  }
}

async function test4_marketplaceChecksumMismatch() {
  const { entryPath, cleanup } = await withTempEntry('export const handler = () => { /* tampered */ };');
  try {
    const res = await verifySkillBundle({
      entryPath,
      origin: 'marketplace',
      registryUrl: 'https://github.com/some/community-skills',
      manifestChecksum: 'deadbeef'.repeat(8), // 64-char wrong hex
    });
    assert.equal(res.ok, false, 'tampered entry whose SHA-256 != checksum must fail closed');
    assert.ok(res.reason && /checksum/i.test(res.reason), 'reason should mention checksum');
    console.log('  PASS: marketplace bundle with a mismatched checksum fails closed');
  } finally {
    await cleanup();
  }
}

async function test5_marketplaceUnverifiable() {
  const { entryPath, cleanup } = await withTempEntry('export const handler = () => {};');
  try {
    const res = await verifySkillBundle({
      entryPath,
      origin: 'marketplace',
      registryUrl: 'https://github.com/some/community-skills',
      // no manifestChecksum
    });
    assert.equal(res.ok, false, 'non-official registry + no checksum must fail closed');
    assert.ok(res.reason && /unverifiable/i.test(res.reason), 'reason should mention unverifiable');
    // also: undefined registry (registry-of-origin unknown) fails closed
    const res2 = await verifySkillBundle({ entryPath, origin: 'marketplace' });
    assert.equal(res2.ok, false, 'undefined registry on a downloaded bundle fails closed');
    console.log('  PASS: unverifiable marketplace bundle (non-official, no checksum) fails closed');
  } finally {
    await cleanup();
  }
}

async function main() {
  console.log('skill-signature.test.ts — Phase 257-01 Task 3 (LIVOS-012)');
  await test1_builtinNeverGated();
  await test2_officialRegistryTrusted();
  await test3_marketplaceChecksumMatch();
  await test4_marketplaceChecksumMismatch();
  await test5_marketplaceUnverifiable();
  console.log('ALL PASS (5 checks)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
