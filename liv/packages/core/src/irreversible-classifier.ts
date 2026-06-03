/**
 * Phase 256-06 (WS-A — Contained Autonomy, LIVOS-002 defense-in-depth LAYER 5).
 *
 * A DETERMINISTIC, OUTPUT-BLIND classifier for the single retained human gate.
 *
 * Design (SECURITY-REMEDIATION-DESIGN.md §"the only retained human gate",
 * lines 26/32/51 — the Claude-Code auto-mode model):
 *   "a stripped-context classifier — it sees the tool call but NOT tool output,
 *    so injected file/web content can't manipulate it — that blocks just:
 *    force-push/push-to-main, prod deploy/migration, mass-delete of pre-session
 *    files, IAM/secret grants, sending data off-box. Everything else stays
 *    fully autonomous."
 *
 * INJECTION-PROOF INVARIANT: `classifyToolCall(toolName, params)` reads ONLY the
 * agent-EMITTED tool call (command / operation / path). It NEVER receives tool
 * OUTPUT, file contents, or web-fetch results. A prompt injected into a file the
 * agent reads cannot reach this decision surface — the gate runs at
 * toolRegistry.execute() BEFORE tool.execute() produces any output, and only
 * `params.command` / `params.operation` / `params.path` are inspected. Every
 * other field on `params` (including any attacker-shaped `output`/`result`) is
 * ignored.
 *
 * DETERMINISTIC-FIRST INVARIANT: this is a pure, synchronous, side-effect-free
 * rule-set (regex + normalized-token matching). No fs, no exec, no network, no
 * model. It is fully unit-testable offline. Any optional LLM "second opinion"
 * lives OUTSIDE this module and may only ADD a block (fail-safe), never relax a
 * rule-set verdict.
 *
 * DEFAULT IS ALLOW: only an affirmative rule match returns irreversible:true.
 * Ordinary ops (ls/build/edit/read/commit/non-protected push) fast-allow so the
 * `permissionMode:'dontAsk'` autonomy is NOT regressed (SC7).
 */
import path from 'node:path';
import { LIV_AGENT_WORKSPACE } from './sandbox.js';

export type IrreversibleCategory =
  | 'force-push'
  | 'prod-deploy'
  | 'prod-migration'
  | 'mass-delete'
  | 'iam'
  | 'exfil';

export interface ClassifierVerdict {
  irreversible: boolean;
  category?: IrreversibleCategory;
  reason?: string;
}

/**
 * The egress allowlist — the SAME host set the 256-01 egress proxy permits.
 * Single source-of-truth so the exfil rule and the network layer agree: an
 * upload to one of these is normal agent traffic (e.g. the LLM API), an upload
 * anywhere else is off-box exfiltration.
 *
 * `*.githubusercontent.com` is expressed as the suffix `githubusercontent.com`
 * (matched with a dotted-suffix check below).
 */
export const EGRESS_ALLOWLIST_HOSTS: string[] = [
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'github.com',
  'githubusercontent.com', // covers *.githubusercontent.com (suffix match)
  'registry.npmjs.org',
  'registry.npmjs.com',
];

/** Protected branches that may never be pushed without approval. */
const PROTECTED_BRANCHES = ['main', 'master'];

/** Tool names whose `params.command` carries a raw shell string. */
const SHELL_LIKE_TOOLS = new Set(['shell', 'docker_exec', 'pm2']);

/** Collapse whitespace; keep original casing for host/path extraction. */
function normalize(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Resolve whether a delete TARGET path is confined to the reversible per-session
 * workspace (256-01 snapshot covers it → NOT irreversible). Any target that
 * resolves outside LIV_AGENT_WORKSPACE is irreversible.
 *
 * POSIX-normalized so it is correct on the Linux target and deterministic on the
 * Windows dev box (mirrors files-sandbox.ts).
 */
function isInsideWorkspace(target: string): boolean {
  const toPosix = (p: string) =>
    path.posix.normalize(p.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/'));
  const ws = toPosix(
    path.posix.isAbsolute(toPosix(LIV_AGENT_WORKSPACE))
      ? LIV_AGENT_WORKSPACE
      : path.posix.resolve('/', LIV_AGENT_WORKSPACE),
  );
  let resolved = toPosix(target);
  if (!path.posix.isAbsolute(resolved)) {
    // Relative deletes run from the workspace cwd (shell.ts chdir) → inside.
    resolved = path.posix.resolve(ws, resolved);
  }
  return resolved === ws || resolved.startsWith(ws + '/');
}

/** Extract the first whitespace-separated delete target(s) from an rm-like cmd. */
function extractDeleteTargets(cmd: string): string[] {
  // Strip the leading verb + flags; collect the non-flag operands.
  const tokens = cmd.split(' ');
  const targets: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-')) continue; // skip flags like -rf, -fdx
    if (t === 'rm' || t === 'find' || t === 'clean') continue;
    targets.push(t.replace(/^["']|["']$/g, ''));
  }
  return targets;
}

/** Extract the destination host from a curl/wget command. */
function extractHosts(cmd: string): string[] {
  const hosts: string[] = [];
  const urlRe = /https?:\/\/([^/\s"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(cmd)) !== null) {
    // strip any userinfo@ and :port
    const host = m[1].replace(/^[^@]*@/, '').split(':')[0].toLowerCase();
    hosts.push(host);
  }
  return hosts;
}

/** True if `host` is on the egress allowlist (incl. dotted-suffix wildcards). */
function isAllowlistedHost(host: string): boolean {
  return EGRESS_ALLOWLIST_HOSTS.some(
    (allowed) => host === allowed || host.endsWith('.' + allowed),
  );
}

function block(category: IrreversibleCategory, reason: string): ClassifierVerdict {
  return { irreversible: true, category, reason };
}

const ALLOW: ClassifierVerdict = { irreversible: false };

/**
 * The output-blind gate. Signature is EXACTLY `(toolName, params)` — `params` is
 * the agent's emitted call params, NOT a result. Do not add an output argument.
 */
export function classifyToolCall(
  toolName: string,
  params: Record<string, unknown>,
): ClassifierVerdict {
  // ---- files tool: only delete is potentially irreversible -----------------
  if (toolName === 'files') {
    const op = String(params.operation ?? '').toLowerCase();
    const p = typeof params.path === 'string' ? params.path : '';
    if ((op === 'delete' || op === 'rm' || op === 'remove') && p) {
      if (!isInsideWorkspace(p)) {
        return block('mass-delete', `files delete outside workspace: ${p}`);
      }
    }
    return ALLOW; // reads/writes/lists inside-or-out are not irreversible here
  }

  // ---- shell-like tools: inspect the raw command ONLY ----------------------
  if (!SHELL_LIKE_TOOLS.has(toolName)) {
    return ALLOW;
  }
  const rawCmd =
    (typeof params.command === 'string' && params.command) ||
    (typeof params.cmd === 'string' && params.cmd) ||
    '';
  if (!rawCmd) return ALLOW;

  const cmd = normalize(rawCmd);
  const lower = cmd.toLowerCase();

  // 1. force-push / push-to-main -------------------------------------------
  if (/\bgit\s+push\b/.test(lower)) {
    if (/(^|\s)(--force\b|-f\b|--force-with-lease\b)/.test(lower)) {
      return block('force-push', 'git push --force / -f / --force-with-lease');
    }
    for (const br of PROTECTED_BRANCHES) {
      // matches `git push origin main`, `... HEAD:main`, trailing protected ref
      const re = new RegExp(`(^|[\\s:])${br}(\\s|$)`);
      if (re.test(lower)) {
        return block('force-push', `git push to protected branch ${br}`);
      }
    }
    // ordinary push to a non-protected branch → allow
  }

  // 2. prod deploy / migration ---------------------------------------------
  if (
    /\bprisma\s+migrate\s+(deploy|reset)\b/.test(lower) ||
    /\bmigrate\s+deploy\b/.test(lower) ||
    /\bdrop\s+database\b/.test(lower) ||
    /\bdrop\s+table\b/.test(lower) ||
    /\btruncate\b/.test(lower)
  ) {
    return block('prod-migration', 'destructive DB migration / drop / truncate');
  }
  if (
    /\bterraform\s+apply\b/.test(lower) ||
    /\bkubectl\s+(apply|delete)\b/.test(lower) ||
    /\bupdate\.sh\b/.test(lower) ||
    /\bcompose\b[^|]*\bup\b.*\bprod/.test(lower)
  ) {
    return block('prod-deploy', 'prod deploy verb (terraform/kubectl/update.sh)');
  }

  // 3. mass-delete of pre-session files ------------------------------------
  const isRmRecursive = /\brm\s+(-[a-z]*r[a-z]*f?|-[a-z]*f[a-z]*r?)\b/.test(lower) || /\brm\s+-rf\b/.test(lower);
  const isFindDelete = /\bfind\b.*-delete\b/.test(lower);
  const isGitClean = /\bgit\s+clean\s+-[a-z]*[fdx]/.test(lower);
  if (isRmRecursive || isFindDelete || isGitClean) {
    const targets = extractDeleteTargets(cmd);
    // Broad globs / bare filesystem roots are always irreversible (these can
    // never be workspace-confined).
    const broad = targets.some(
      (t) => t === '/' || t === '~' || t === '*' || t === '~/' || /^\/(opt|etc|var|usr|home|root)\/?\*?$/.test(t),
    );
    if (broad) return block('mass-delete', `recursive delete of broad target: ${targets.join(' ')}`);
    // If ANY target resolves outside the reversible workspace → irreversible.
    // (Workspace-confined deletes are reversible via the 256-01 snapshot.)
    const anyOutside =
      targets.length === 0
        ? !isGitClean // bare `rm -rf` with no operand is suspicious; git clean defaults to cwd (ws) → allow
        : targets.some((t) => !isInsideWorkspace(t));
    if (anyOutside) {
      return block('mass-delete', `recursive delete outside workspace: ${targets.join(' ') || '(no target)'}`);
    }
    // all targets inside the reversible workspace → allow
  }

  // 4. IAM / secret grants --------------------------------------------------
  if (
    /\bsetfacl\b/.test(lower) ||
    /\bchmod\s+(\+s|[0-7]*777)/.test(lower) ||
    /\busermod\b.*-a?g/.test(lower) ||
    /\bgh\s+secret\s+set\b/.test(lower) ||
    /\baws\s+iam\b/.test(lower) ||
    /\bgcloud\s+projects\s+add-iam-policy-binding\b/.test(lower) ||
    /authorized_keys\b/.test(lower) ||
    /\bgit\s+config\b.*credential/.test(lower)
  ) {
    return block('iam', 'IAM / ACL / secret grant');
  }

  // 5. send data off-box ----------------------------------------------------
  const isUploadVerb =
    /-x\s+(post|put)\b/.test(lower) ||
    /--request\s+(post|put)\b/.test(lower) ||
    /(^|\s)(--data\b|--data-\w+\b|-d\b|-t\b|--upload-file\b|-f\b|--form\b|--post-data\b|--post-file\b)/.test(lower);
  const isNetSendVerb = /\b(curl|wget|http)\b/.test(lower);
  if (isNetSendVerb && isUploadVerb) {
    const hosts = extractHosts(cmd);
    // No allowlisted host present among the destinations → exfil.
    const allAllowlisted = hosts.length > 0 && hosts.every(isAllowlistedHost);
    if (!allAllowlisted) {
      return block('exfil', `off-box upload to non-allowlisted host: ${hosts.join(', ') || '(unknown)'}`);
    }
  }
  // scp / rsync … user@host: / nc / ncat to a remote
  if (
    /\bscp\b[^|]*@[^:\s]+:/.test(cmd) ||
    /\brsync\b[^|]*@[^:\s]+:/.test(cmd) ||
    /\b(nc|ncat|netcat)\s+[^|]*\d+\.\d+\.\d+\.\d+/.test(lower)
  ) {
    return block('exfil', 'off-box copy/connection to a remote host');
  }

  // No rule matched → DEFAULT ALLOW (full autonomy for ordinary ops).
  return ALLOW;
}
