/**
 * Tests for username-validator.ts — Phase 140-02.
 *
 * Two test groups:
 *
 *   1. Unit tests (FORMAT + RESERVED) — run unconditionally. These never hit
 *      the DB because both checks short-circuit before any SELECT. They cover
 *      the regex edge cases enumerated in the plan and the static blacklist.
 *
 *   2. Integration tests (APP_COLLISION + TAKEN + happy path) — gated behind
 *      LIV_INTEGRATION=1. They hit the live `platform` Postgres DB on
 *      127.0.0.1:5432 (or DATABASE_URL if set) and assume:
 *        - `apps.slug` contains rows like 'n8n' / 'adguard' (the curated set
 *          Server5 seeds in `scripts/suna-insert.sql` style).
 *        - `users.username` contains at least one taken username we can
 *          probe with — `lucy` is the canonical live user (see MEMORY.md).
 *      Integration tests use READ-ONLY queries; they never INSERT or DELETE
 *      so there is no fixture setup/teardown.
 *
 * Manual invocation (Node 22+ built-in test runner via tsx):
 *
 *   # Unit only (no DB, always safe)
 *   cd platform/web
 *   npx tsx --test src/lib/username-validator.test.ts
 *
 *   # Unit + integration (requires DB reachable)
 *   cd platform/web
 *   LIV_INTEGRATION=1 \
 *   DATABASE_URL='postgresql://platform:LivPlatform2024@127.0.0.1:5432/platform' \
 *     npx tsx --test src/lib/username-validator.test.ts
 *
 * The whole integration block is gated behind LIV_INTEGRATION=1 so `npx tsc
 * --noEmit`, lint, and any future `npm test` invocation that doesn't set the
 * env var skip the DB hits entirely (no test runner is wired into
 * package.json scripts as of Phase 140-02 — adding one is out of scope).
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { validateUsername } from './username-validator.js';

const RUN_INTEGRATION = process.env.LIV_INTEGRATION === '1';

// Reusable narrowing helpers — these only check shape; they don't run the
// validator themselves so the unit tests can stay flat and readable.
async function expectOk(input: string): Promise<void> {
  const r = await validateUsername(input);
  assert.equal(r.ok, true, `expected ok for "${input}" but got ${JSON.stringify(r)}`);
  if (r.ok) {
    assert.equal(r.normalized, input.trim().toLowerCase());
  }
}

async function expectFail(
  input: string,
  expectedCode: 'FORMAT' | 'RESERVED' | 'APP_COLLISION' | 'TAKEN',
): Promise<void> {
  const r = await validateUsername(input);
  assert.equal(r.ok, false, `expected fail for "${input}" but got ok`);
  if (!r.ok) {
    assert.equal(r.code, expectedCode, `wrong code for "${input}"`);
    assert.ok(r.error.length > 0, 'error message non-empty');
  }
}

// ---------------------------------------------------------------------------
// Unit tests — pure, no DB
// ---------------------------------------------------------------------------

describe('username-validator — FORMAT', () => {
  it('rejects too short (< 3 chars)', async () => {
    await expectFail('a', 'FORMAT');
    await expectFail('ab', 'FORMAT');
  });

  it('rejects too long (> 32 chars)', async () => {
    await expectFail('a'.repeat(33), 'FORMAT');
    await expectFail('a'.repeat(50), 'FORMAT');
  });

  it('rejects leading hyphen', async () => {
    await expectFail('-lucy', 'FORMAT');
  });

  it('rejects trailing hyphen', async () => {
    await expectFail('lucy-', 'FORMAT');
  });

  it('rejects double-hyphen', async () => {
    await expectFail('lu--cy', 'FORMAT');
  });

  it('rejects spaces and special chars', async () => {
    await expectFail('lu cy', 'FORMAT');
    await expectFail('lucy@', 'FORMAT');
    await expectFail('lucy.x', 'FORMAT');
    await expectFail('lucy_x', 'FORMAT');
  });

  it('rejects empty / whitespace-only', async () => {
    await expectFail('', 'FORMAT');
    await expectFail('   ', 'FORMAT');
  });

  it('trims surrounding whitespace before checking (post-trim too short)', async () => {
    // 'bo' is 2 chars → still FORMAT (too short) after trim. Stays unit-safe
    // because FORMAT fails before any DB hit.
    const r = await validateUsername('  bo  ');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'FORMAT');
  });

  it('rejects non-string input defensively', async () => {
    // Cast to bypass TS — the route handlers parse JSON and could pass anything.
    await expectFail(undefined as unknown as string, 'FORMAT');
    await expectFail(null as unknown as string, 'FORMAT');
    await expectFail(42 as unknown as string, 'FORMAT');
  });
});

describe('username-validator — RESERVED', () => {
  it('rejects DNS/infra names', async () => {
    await expectFail('api', 'RESERVED');
    await expectFail('www', 'RESERVED');
    await expectFail('mail', 'RESERVED');
    await expectFail('ssh', 'RESERVED');
    await expectFail('tunnel', 'RESERVED');
  });

  it('rejects platform/brand names', async () => {
    await expectFail('livinity', 'RESERVED');
    await expectFail('livos', 'RESERVED');
    await expectFail('liv', 'RESERVED');
    await expectFail('store', 'RESERVED');
    await expectFail('dashboard', 'RESERVED');
  });

  it('rejects admin/system names', async () => {
    await expectFail('admin', 'RESERVED');
    await expectFail('root', 'RESERVED');
    await expectFail('support', 'RESERVED');
  });

  it('rejects environment names', async () => {
    await expectFail('dev', 'RESERVED');
    await expectFail('staging', 'RESERVED');
    await expectFail('test', 'RESERVED');
  });

  it('RESERVED check is case-insensitive (via normalization)', async () => {
    await expectFail('ADMIN', 'RESERVED');
    await expectFail('  Admin  ', 'RESERVED');
  });
});

// ---------------------------------------------------------------------------
// Integration tests — touch Postgres `platform.apps` + `platform.users`
// ---------------------------------------------------------------------------

describe('username-validator — APP_COLLISION (integration)', { skip: !RUN_INTEGRATION }, () => {
  it('rejects a username that equals an installed app slug', async () => {
    // 'n8n' is in the curated apps table on Server5 (memory: 26 apps as of
    // 2026-05-03). If a fresh local DB doesn't have it, set LIV_TEST_APP_SLUG.
    const slug = process.env.LIV_TEST_APP_SLUG ?? 'n8n';
    await expectFail(slug, 'APP_COLLISION');
  });
});

describe('username-validator — normalization (integration)', { skip: !RUN_INTEGRATION }, () => {
  it('lowercases mixed-case input before validating (DB-touching path)', async () => {
    // 'LUCY-X' passes FORMAT/RESERVED after lowercasing, so it reaches the DB.
    // We assert only that it does NOT fail with FORMAT — outcome (ok / TAKEN /
    // APP_COLLISION) depends on live data.
    const r = await validateUsername('LUCY-X');
    if (!r.ok) {
      assert.notEqual(r.code, 'FORMAT', 'uppercase should normalize, not fail FORMAT');
    }
  });
});

describe('username-validator — TAKEN (integration)', { skip: !RUN_INTEGRATION }, () => {
  it('rejects a username that already exists in users.username', async () => {
    // 'lucy' is the canonical live user per MEMORY.md. Override via env if
    // running against a fresh DB without that fixture.
    const taken = process.env.LIV_TEST_TAKEN_USERNAME ?? 'lucy';
    await expectFail(taken, 'TAKEN');
  });
});

describe('username-validator — happy path (integration)', { skip: !RUN_INTEGRATION }, () => {
  it('accepts a clean, unique, non-reserved username', async () => {
    // Random-ish sentinel that should never collide with apps or users.
    // Kept deterministic so a flake is debuggable; if the DB ever has this
    // exact row, override with LIV_TEST_HAPPY_USERNAME.
    const fresh =
      process.env.LIV_TEST_HAPPY_USERNAME ?? `phase140-ok-${Date.now()}`;
    // Length-clamp to 32 in case Date.now() pushes us over.
    const clamped = fresh.slice(0, 32).replace(/-+$/, '');
    await expectOk(clamped);
  });
});
