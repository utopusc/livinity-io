/**
 * Phase 256-01 Task 1 — bubblewrap sandbox + cred-scrub for the `shell` tool.
 *
 * Locks (WS-A Contained Autonomy, LIVOS-002 / SC1, SC2, SC3):
 * - wrapWithBwrap() builds a bwrap argv that write-binds ONLY LIV_AGENT_WORKSPACE,
 *   never binds secrets / docker.sock / /opt/liv, and ends with `sh -c <command>`.
 * - buildScrubbedEnv() allow-list-copies HOME/PATH/LANG (etc.) and strips
 *   LIV_API_KEY/DATABASE_URL/REDIS_URL/JWT_SECRET, and sets the egress proxy env.
 *
 * Runner: tsx + node:assert/strict (sibling to agent-session.*.test.ts).
 * Run with: npx tsx src/sandbox.test.ts
 */
import assert from 'node:assert/strict';
import {
  wrapWithBwrap,
  buildScrubbedEnv,
  LIV_AGENT_WORKSPACE,
} from './sandbox.js';

const WS = '/opt/livos/data/agent-workspace';

/** Find the SOURCE operand of every --bind / --ro-bind flag in a bwrap argv. */
function bindSources(argv: string[]): string[] {
  const sources: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bind' || argv[i] === '--ro-bind') {
      sources.push(argv[i + 1]);
    }
  }
  return sources;
}
/** Find the SOURCE operand of WRITABLE --bind flags only (not --ro-bind). */
function writableBindSources(argv: string[]): string[] {
  const sources: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--bind') sources.push(argv[i + 1]);
  }
  return sources;
}

function test1_argvShape() {
  const { argv } = wrapWithBwrap('echo hi', { workspace: WS });
  assert.equal(argv[0], 'bwrap', 'argv must start with bwrap');
  const joined = argv.join(' ');
  assert.ok(joined.includes('--ro-bind /usr /usr'), 'must ro-bind /usr');
  assert.ok(joined.includes(`--bind ${WS} ${WS}`), 'must writable-bind the workspace');
  assert.ok(joined.includes(`--chdir ${WS}`), 'must chdir into the workspace');
  assert.ok(joined.includes('--tmpfs /tmp'), 'must tmpfs /tmp');
  assert.ok(joined.includes('--die-with-parent'), 'must die-with-parent');
  // ends with sh -c <command>
  assert.equal(argv[argv.length - 3], 'sh', 'tail must be sh');
  assert.equal(argv[argv.length - 2], '-c', 'tail must be -c');
  assert.equal(argv[argv.length - 1], 'echo hi', 'tail must be the command');
  console.log('  PASS: argv shape (bwrap … --bind WS --chdir WS … sh -c echo hi)');
}

function test2_denyReadSecrets() {
  const { argv } = wrapWithBwrap('echo hi', { workspace: WS });
  const sources = bindSources(argv);
  const denied = [
    '/opt/livos/.env',
    '/opt/livos/data/secrets',
  ];
  for (const d of denied) {
    assert.ok(
      !sources.some((s) => s === d || s.startsWith(d + '/')),
      `secret path ${d} must NOT be a bind source`,
    );
  }
  // No home-cred dirs as bind sources.
  for (const cred of ['/.ssh', '/.claude', '/.gemini']) {
    assert.ok(
      !sources.some((s) => s.endsWith(cred) || s.includes(cred + '/')),
      `home-cred ${cred} must NOT be a bind source`,
    );
  }
  console.log('  PASS: secrets + home-creds are never bind sources');
}

function test3_noDockerSock() {
  const { argv } = wrapWithBwrap('echo hi', { workspace: WS });
  assert.ok(
    !argv.join(' ').includes('/var/run/docker.sock'),
    'docker.sock must never appear in the argv',
  );
  console.log('  PASS: /var/run/docker.sock absent from argv');
}

function test4_noLivSourceWrite() {
  const { argv } = wrapWithBwrap('echo hi', { workspace: WS });
  const writable = writableBindSources(argv);
  assert.ok(
    !writable.some((s) => s === '/opt/liv' || s.startsWith('/opt/liv/')),
    '/opt/liv must never be a WRITABLE bind source (no self-modify)',
  );
  console.log('  PASS: /opt/liv is never a writable bind (no self-modify)');
}

function test5_envScrub() {
  const src = {
    LIV_API_KEY: 'secret-key',
    DATABASE_URL: 'postgres://x',
    REDIS_URL: 'redis://x',
    JWT_SECRET: 'jwt-secret',
    PATH: '/usr/bin',
    HOME: '/home/bruce',
    LANG: 'en_US.UTF-8',
  } as NodeJS.ProcessEnv;
  const env = buildScrubbedEnv(src);
  for (const stripped of ['LIV_API_KEY', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET']) {
    assert.ok(!(stripped in env), `${stripped} must be stripped`);
  }
  assert.equal(env.PATH, '/usr/bin', 'PATH must be preserved');
  assert.equal(env.HOME, '/home/bruce', 'HOME must be preserved');
  assert.equal(env.LANG, 'en_US.UTF-8', 'LANG must be preserved');
  assert.ok(env.HTTPS_PROXY, 'HTTPS_PROXY must be set');
  assert.ok(env.HTTP_PROXY, 'HTTP_PROXY must be set');
  console.log('  PASS: env scrub strips creds, keeps PATH/HOME/LANG, sets proxy');
}

function test6_proxyWired() {
  const env = buildScrubbedEnv({ PATH: '/usr/bin' } as NodeJS.ProcessEnv);
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:13128', 'default proxy URL');
  // overridable
  const env2 = buildScrubbedEnv({ PATH: '/usr/bin', LIV_EGRESS_PROXY: 'http://127.0.0.1:9999' } as NodeJS.ProcessEnv);
  assert.equal(env2.HTTPS_PROXY, 'http://127.0.0.1:9999', 'LIV_EGRESS_PROXY overrides');
  console.log('  PASS: proxy env wired (default 13128, LIV_EGRESS_PROXY override)');
}

function test0_workspaceConstant() {
  assert.equal(
    LIV_AGENT_WORKSPACE,
    process.env.LIV_AGENT_WORKSPACE || '/opt/livos/data/agent-workspace',
    'LIV_AGENT_WORKSPACE default',
  );
  console.log('  PASS: LIV_AGENT_WORKSPACE default = /opt/livos/data/agent-workspace');
}

console.log('sandbox.test.ts — Phase 256-01 Task 1');
test0_workspaceConstant();
test1_argvShape();
test2_denyReadSecrets();
test3_noDockerSock();
test4_noLivSourceWrite();
test5_envScrub();
test6_proxyWired();
console.log('ALL PASS (7 checks)');
