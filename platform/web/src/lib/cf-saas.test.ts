/**
 * Integration tests for cf-saas.ts — Phase 140-01.
 *
 * SKIPPED BY DEFAULT. Hits the live Cloudflare API and the real
 * livinity.io zone. Only run manually with a fixture token.
 *
 * Manual invocation (Node 22+, built-in test runner):
 *
 *   cd platform/web
 *   CF_INTEGRATION=1 \
 *   CF_API_TOKEN=cfut_xxx \
 *   CF_ACCOUNT_ID=3721fb69544062643182ef77fcc9d448 \
 *   CF_ZONE_ID_LIVINITY_IO=f9f28e68d77572ad1a380a099a923a14 \
 *     npx tsx --test src/lib/cf-saas.test.ts
 *
 * The whole suite is gated behind CF_INTEGRATION=1 so `npx tsc --noEmit`,
 * lint, and any future `npm test` invocation that doesn't set the env var
 * will skip these tests entirely (no test runner is wired into package.json
 * scripts as of Phase 140-01 — adding one is out of scope).
 *
 * Cleanup: every spec deprovisions on success or in afterEach so the
 * sentinel username `phase140test` never leaks resources between runs.
 *
 * Sacred SHA invariant: f3538e1d811992b782a9bb057d1b7f0a0189f95f
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

import {
  cfClient,
  deprovisionAppSubdomain,
  deprovisionUser,
  provisionAppSubdomain,
  provisionUserHostnames,
  CfApiError,
  __resetClientForTests,
} from './cf-saas.js';

const RUN_INTEGRATION = process.env.CF_INTEGRATION === '1';
const SENTINEL_USERNAME = 'phase140test';
const SENTINEL_APP_SLUG = 'testapp';
const SENTINEL_APP_PORT = 9999;

// Track what we created so afterEach can clean up on failure.
interface ProvisionedState {
  tunnel_id?: string;
  apex_dns_record_id?: string;
  app_dns_record_id?: string;
}

const state: ProvisionedState = {};

async function bestEffortCleanup(): Promise<void> {
  if (state.tunnel_id && state.app_dns_record_id) {
    try {
      await deprovisionAppSubdomain({
        tunnel_id: state.tunnel_id,
        username: SENTINEL_USERNAME,
        app_slug: SENTINEL_APP_SLUG,
        dns_record_id: state.app_dns_record_id,
      });
    } catch (err) {
      console.warn('cleanup: deprovisionAppSubdomain failed', err);
    }
  }

  if (state.tunnel_id && state.apex_dns_record_id) {
    try {
      await deprovisionUser({
        tunnel_id: state.tunnel_id,
        username: SENTINEL_USERNAME,
        apex_dns_record_id: state.apex_dns_record_id,
        app_dns_record_ids: [],
      });
    } catch (err) {
      console.warn('cleanup: deprovisionUser failed', err);
    }
  }

  state.tunnel_id = undefined;
  state.apex_dns_record_id = undefined;
  state.app_dns_record_id = undefined;
}

// Outer describe — entire suite gated behind env flag.
describe('cf-saas integration', { skip: !RUN_INTEGRATION }, () => {
  before(() => {
    __resetClientForTests();
  });

  after(async () => {
    await bestEffortCleanup();
  });

  it('provisionUserHostnames creates tunnel + apex DNS record', async () => {
    const result = await provisionUserHostnames(SENTINEL_USERNAME);
    state.tunnel_id = result.tunnel_id;
    state.apex_dns_record_id = result.apex_dns_record_id;

    assert.ok(result.tunnel_id, 'tunnel_id present');
    assert.ok(result.tunnel_token, 'tunnel_token present');
    assert.ok(result.apex_dns_record_id, 'apex_dns_record_id present');

    // Verify on the live side
    const dnsRecords = await cfClient.listDnsRecordsByName(
      `${SENTINEL_USERNAME}.livinity.io`,
    );
    assert.equal(dnsRecords.length, 1, 'exactly one DNS record for apex');
    assert.equal(dnsRecords[0].type, 'CNAME');

    const ingress = await cfClient.getTunnelIngress(result.tunnel_id);
    // 1 apex entry + 1 catch-all
    assert.equal(ingress.length, 2, 'ingress has apex + catch-all');
    assert.equal(ingress[0].hostname, `${SENTINEL_USERNAME}.livinity.io`);
    assert.equal(ingress[1].service, 'http_status:404');
  });

  it('provisionAppSubdomain appends ingress + creates app DNS record', async () => {
    assert.ok(state.tunnel_id, 'requires prior provisionUserHostnames');

    const result = await provisionAppSubdomain({
      tunnel_id: state.tunnel_id!,
      username: SENTINEL_USERNAME,
      app_slug: SENTINEL_APP_SLUG,
      port: SENTINEL_APP_PORT,
    });
    state.app_dns_record_id = result.dns_record_id;

    assert.equal(
      result.subdomain,
      `${SENTINEL_APP_SLUG}-${SENTINEL_USERNAME}`,
    );
    assert.equal(
      result.url,
      `https://${SENTINEL_APP_SLUG}-${SENTINEL_USERNAME}.livinity.io`,
    );

    const ingress = await cfClient.getTunnelIngress(state.tunnel_id!);
    // apex + app + catch-all
    assert.equal(ingress.length, 3, 'ingress has apex + app + catch-all');
    assert.ok(
      ingress.some(
        (i) =>
          i.hostname ===
          `${SENTINEL_APP_SLUG}-${SENTINEL_USERNAME}.livinity.io`,
      ),
      'app hostname in ingress',
    );

    const dnsRecords = await cfClient.listDnsRecordsByName(
      `${SENTINEL_APP_SLUG}-${SENTINEL_USERNAME}.livinity.io`,
    );
    assert.equal(dnsRecords.length, 1, 'app DNS record present');
  });

  it('deprovisionAppSubdomain removes ingress entry + DNS record', async () => {
    assert.ok(state.tunnel_id, 'requires prior steps');
    assert.ok(state.app_dns_record_id, 'requires prior provisionAppSubdomain');

    await deprovisionAppSubdomain({
      tunnel_id: state.tunnel_id!,
      username: SENTINEL_USERNAME,
      app_slug: SENTINEL_APP_SLUG,
      dns_record_id: state.app_dns_record_id!,
    });
    state.app_dns_record_id = undefined;

    const ingress = await cfClient.getTunnelIngress(state.tunnel_id!);
    // Back to apex + catch-all
    assert.equal(ingress.length, 2, 'ingress back to apex + catch-all');

    const dnsRecords = await cfClient.listDnsRecordsByName(
      `${SENTINEL_APP_SLUG}-${SENTINEL_USERNAME}.livinity.io`,
    );
    assert.equal(dnsRecords.length, 0, 'app DNS record gone');
  });

  it('deprovisionUser removes tunnel + apex DNS', async () => {
    assert.ok(state.tunnel_id, 'requires prior steps');
    assert.ok(state.apex_dns_record_id, 'requires prior provisionUserHostnames');

    await deprovisionUser({
      tunnel_id: state.tunnel_id!,
      username: SENTINEL_USERNAME,
      apex_dns_record_id: state.apex_dns_record_id!,
      app_dns_record_ids: [],
    });

    const tunnel_id = state.tunnel_id!;
    state.tunnel_id = undefined;
    state.apex_dns_record_id = undefined;

    const dnsRecords = await cfClient.listDnsRecordsByName(
      `${SENTINEL_USERNAME}.livinity.io`,
    );
    assert.equal(dnsRecords.length, 0, 'apex DNS gone');

    const tunnels = await cfClient.listTunnels();
    assert.ok(
      !tunnels.some((t) => t.id === tunnel_id),
      'tunnel not in active list',
    );
  });
});

// Unit-style smoke tests — these run even without CF_INTEGRATION since they
// only exercise type shapes / error class.
describe('cf-saas error class', () => {
  it('CfApiError carries structured fields', () => {
    const err = new CfApiError({
      message: 'test',
      code: 429,
      cfErrorCode: 10000,
      cfMessage: 'rate limited',
      endpoint: 'POST /test',
    });
    assert.equal(err.name, 'CfApiError');
    assert.equal(err.code, 429);
    assert.equal(err.cfErrorCode, 10000);
    assert.equal(err.cfMessage, 'rate limited');
    assert.equal(err.endpoint, 'POST /test');
    assert.ok(err instanceof Error);
  });
});

// ---------------------------------------------------------------------------
// L-066 (Phase 263-04): hyphen-free username guard in provisionAppSubdomain.
//
// These run UNCONDITIONALLY (no CF_INTEGRATION) because the username guard is a
// pure pre-flight check that throws BEFORE any Cloudflare call. A hyphen in the
// username makes the `{app_slug}-{username}` subdomain ambiguous → cross-tenant
// CNAME-squat. The guard rejects it before it can reach the CF provisioning API.
//
// NOTE: app slugs may legitimately keep a hyphen (`radarr-jean`); only the
// username half is tightened. The hyphen-free username + hyphen app_slug case
// must PASS the username guard (and then fail later on missing CF env / network,
// NOT on username validation). We assert no CF env is set so the later failure
// is the env-missing plain Error, proving the username guard was cleared.
// ---------------------------------------------------------------------------
describe('cf-saas provisionAppSubdomain — hyphen-free username guard (L-066)', () => {
  // Ensure the CF env is absent so a passed username guard surfaces as the
  // env-missing plain Error (NOT a CfApiError username rejection).
  const CF_ENV_KEYS = ['CF_API_TOKEN', 'CF_ACCOUNT_ID', 'CF_ZONE_ID_LIVINITY_IO'];
  const savedEnv: Record<string, string | undefined> = {};
  before(() => {
    for (const k of CF_ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    __resetClientForTests();
  });
  after(() => {
    for (const k of CF_ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    __resetClientForTests();
  });

  it('rejects a hyphen-bearing username with a CfApiError BEFORE any CF call', async () => {
    let caught: unknown;
    try {
      await provisionAppSubdomain({
        tunnel_id: 'tnl-test',
        username: 'jean-luc',
        app_slug: 'radarr',
        port: 9999,
      });
      assert.fail('expected provisionAppSubdomain to throw for hyphen username');
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof CfApiError, 'hyphen username must throw a CfApiError');
    assert.equal((caught as CfApiError).code, 400);
    assert.match(
      (caught as CfApiError).message,
      /username/i,
      'error message names the username',
    );
    assert.match(
      (caught as CfApiError).message,
      /hyphen/i,
      'error message explains the hyphen rejection',
    );
  });

  it('a hyphen-free username + hyphen app_slug PASSES the username guard (slug unaffected)', async () => {
    // username 'luc' is hyphen-free → clears the username guard; app_slug
    // 'radarr-jean' keeps its hyphen → clears the app_slug guard. Execution
    // then reaches readEnv() and throws the env-missing plain Error. We assert
    // the thrown error is NOT the username-validation CfApiError.
    let caught: unknown;
    try {
      await provisionAppSubdomain({
        tunnel_id: 'tnl-test',
        username: 'luc',
        app_slug: 'radarr-jean',
        port: 9999,
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'expected a downstream (env/network) throw, not a clean resolve in unit env');
    const isUsernameRejection =
      caught instanceof CfApiError &&
      /username/i.test(caught.message) &&
      /hyphen/i.test(caught.message);
    assert.equal(
      isUsernameRejection,
      false,
      'hyphen-free username + hyphen app_slug must NOT be rejected by the username guard',
    );
  });

  it('rejects an empty username with a CfApiError (length floor preserved)', async () => {
    let caught: unknown;
    try {
      await provisionAppSubdomain({
        tunnel_id: 'tnl-test',
        username: 'a',
        app_slug: 'radarr',
        port: 9999,
      });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof CfApiError, 'too-short username must throw a CfApiError');
  });
});
