// Phase 257-02 (WS-C, LIVOS-038) — MCP streamableHttp SSRF guard.
//
// The previous guard tested only the LITERAL hostname against a regex list, so
// a DNS-rebinding hostname, an IPv4-mapped IPv6 literal ([::ffff:127.0.0.1]),
// and decimal/hex-encoded IP hostnames (2130706433 == 127.0.0.1) all bypassed
// it. assertResolvedHostSafe() canonicalizes the host, resolves names to IPs via
// an injectable lookup, and rejects if ANY resolved address is private/loopback/
// link-local/ULA (incl. IPv4-mapped IPv6).
//
// Run: npx tsx packages/core/src/mcp-ssrf-guard.test.ts

import assert from 'node:assert/strict';

import { assertResolvedHostSafe } from './mcp-ssrf-guard.js';

let passed = 0;
let failed = 0;

async function expectBlocked(name: string, urlStr: string, lookup?: (h: string) => Promise<string[]>) {
  try {
    await assertResolvedHostSafe(urlStr, lookup ? { lookup } : undefined);
    failed++;
    console.error(`FAIL: ${name} — expected SSRF block but it was allowed`);
  } catch (err) {
    passed++;
    console.log(`ok: ${name} — blocked (${(err as Error).message})`);
  }
}

async function expectAllowed(name: string, urlStr: string, lookup?: (h: string) => Promise<string[]>) {
  try {
    await assertResolvedHostSafe(urlStr, lookup ? { lookup } : undefined);
    passed++;
    console.log(`ok: ${name} — allowed`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${name} — expected allowed but blocked (${(err as Error).message})`);
  }
}

async function main() {
  // Test 1: literal private IP still blocked.
  await expectBlocked('literal 127.0.0.1', 'http://127.0.0.1:6379/');

  // Test 2: IPv4-mapped IPv6 literal.
  await expectBlocked('IPv4-mapped IPv6 [::ffff:127.0.0.1]', 'http://[::ffff:127.0.0.1]:6379/');

  // Test 3: DNS-rebind — public-looking name resolves to a private IP.
  await expectBlocked(
    'DNS-rebind to 127.0.0.1',
    'http://rebind.evil.example/',
    async () => ['127.0.0.1'],
  );
  await expectBlocked(
    'DNS-rebind to RFC1918',
    'http://rebind2.evil.example/',
    async () => ['203.0.113.9', '10.69.31.68'], // any private in the set → blocked
  );

  // Test 4: public name resolving only to public IPs → allowed.
  await expectAllowed(
    'public name → public IP',
    'https://api.example.com/',
    async () => ['203.0.113.10'],
  );

  // Test 5: decimal / hex integer IP hostnames.
  await expectBlocked('decimal IP 2130706433', 'http://2130706433/');
  await expectBlocked('hex IP 0x7f000001', 'http://0x7f000001/');

  // Bonus: literal IPv6 loopback + link-local + ULA.
  await expectBlocked('IPv6 ::1', 'http://[::1]:6379/');
  await expectBlocked('IPv4 link-local 169.254.169.254', 'http://169.254.169.254/');
  await expectBlocked('IPv6 ULA fd00::1', 'http://[fd00::1]/');

  // Bonus: non-http(s) scheme rejected.
  await expectBlocked('non-http scheme', 'gopher://example.com/');

  // Bonus: public literal IPv4 allowed.
  await expectAllowed('public literal 203.0.113.5', 'https://203.0.113.5/');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
