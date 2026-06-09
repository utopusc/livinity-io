/**
 * Phase 256-01 Task 1 — bubblewrap sandbox + cred-scrub for the `shell` tool.
 *
 * Locks (WS-A Contained Autonomy, LIVOS-002 / SC1, SC2, SC3):
 * - wrapWithBwrap() builds a bwrap argv that write-binds ONLY LIV_AGENT_WORKSPACE,
 *   never binds secrets / docker.sock / /opt/liv, and ends with `sh -c <command>`.
 * - buildScrubbedEnv() allow-list-copies HOME/PATH/LANG (etc.) and strips
 *   LIV_API_KEY/DATABASE_URL/REDIS_URL/JWT_SECRET, and sets the egress proxy env.
 *
 * Phase 262-05 (LIVOS-058) additions:
 * - The bwrap usability probe is a REAL runtime userns command, not `--version`.
 * - present-but-userns-unavailable → stable refusal (code 126), NEVER a silent
 *   unsandboxed fallback; genuinely-off-PATH dev fallback unchanged.
 *
 * Runner: tsx + node:assert/strict (sibling to agent-session.*.test.ts).
 * Run with: npx tsx src/sandbox.test.ts
 */
import assert from 'node:assert/strict';
import {
  wrapWithBwrap,
  buildScrubbedEnv,
  LIV_AGENT_WORKSPACE,
  BWRAP_RUNTIME_PROBE_ARGV,
  resolveShellExecutionMode,
  SANDBOX_REFUSAL,
} from './sandbox.js';
import { ShellExecutor } from './shell.js';

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

// ── Phase 262-05 (LIVOS-058) — runtime userns probe + fail-safe refusal ────

function test7_runtimeProbeArgv() {
  // The probe must be a REAL namespace command, not the PATH-only `--version`
  // check (which succeeds whenever the binary exists, even when unprivileged
  // user namespaces are denied at runtime).
  const probe = [...BWRAP_RUNTIME_PROBE_ARGV];
  assert.notDeepEqual(probe, ['--version'], 'probe must NOT be --version');
  assert.ok(!probe.includes('--version'), 'probe must not contain --version');
  assert.ok(probe.includes('--unshare-all'), 'probe must unshare namespaces');
  assert.ok(probe.join(' ').includes('--ro-bind / /'), 'probe must ro-bind /');
  assert.equal(probe[probe.length - 1], 'true', 'probe payload must be `true`');
  console.log('  PASS: runtime probe argv is a real userns command (not --version)');
}

function test8_executionModeResolution() {
  // runtime-usable → bwrap-sandboxed exec.
  assert.equal(resolveShellExecutionMode(true, true), 'bwrap');
  // genuinely off PATH (dev/non-Linux box) → the UNCHANGED env-scrubbed fallback.
  assert.equal(resolveShellExecutionMode(false, false), 'unsandboxed-dev');
  // present but userns unavailable → REFUSE (never silently unsandboxed).
  assert.equal(resolveShellExecutionMode(true, false), 'refuse');
  console.log('  PASS: mode resolution (bwrap / unsandboxed-dev / refuse)');
}

function test9_refusalShape() {
  assert.equal(SANDBOX_REFUSAL.code, 126, 'refusal exit code must be 126');
  assert.equal(SANDBOX_REFUSAL.stdout, '', 'refusal stdout must be empty');
  assert.ok(SANDBOX_REFUSAL.stderr.includes('LIVOS-058'), 'refusal must cite LIVOS-058');
  assert.ok(
    SANDBOX_REFUSAL.stderr.includes('user namespaces'),
    'refusal must explain the userns cause',
  );
  assert.ok(
    SANDBOX_REFUSAL.stderr.toLowerCase().includes('refusing'),
    'refusal must state it is refusing to run unsandboxed',
  );
  console.log('  PASS: stable refusal shape (code 126, explanatory stderr)');
}

async function test10_refusalNeverExecs() {
  // Stubbed probe-failure (bwrap on PATH, userns probe failed): the shell tool
  // must resolve the stable refusal WITHOUT executing the command — a silent
  // unsandboxed fallback here would disable the contained-autonomy control.
  const ex = new ShellExecutor(undefined, { onPath: true, usable: false });
  const res = await ex.execute('echo LIVOS058_MUST_NOT_RUN');
  assert.deepEqual(res, { ...SANDBOX_REFUSAL }, 'must resolve the stable refusal');
  assert.ok(
    !res.stdout.includes('LIVOS058_MUST_NOT_RUN'),
    'the command must NOT have been executed',
  );
  console.log('  PASS: present-but-unusable → refusal, command never executed');
}

console.log('sandbox.test.ts — Phase 256-01 Task 1 + Phase 262-05 (LIVOS-058)');
test0_workspaceConstant();
test1_argvShape();
test2_denyReadSecrets();
test3_noDockerSock();
test4_noLivSourceWrite();
test5_envScrub();
test6_proxyWired();
test7_runtimeProbeArgv();
test8_executionModeResolution();
test9_refusalShape();
await test10_refusalNeverExecs();
console.log('ALL PASS (11 checks)');
