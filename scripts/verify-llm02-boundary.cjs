#!/usr/bin/env node
/**
 * Phase 316-05 (LLM-02) — STATIC broker-boundary gate.
 *
 * The load-bearing half of the phase EXIT criterion: prove — statically, on
 * every plan-check / CI pass — that the LLM-01 + LLM-02 changeset NEVER touches
 * the Claude subscription broker path. It is the enforcement companion to the
 * byte-lock safety net `scripts/verify-sacred-sha.cjs`: that hook proves the
 * sacred runner's bytes are unchanged; THIS gate proves the diff never even
 * needed to touch it (RESEARCH 316 "Test 1 — Static boundary check").
 *
 * Unlike verify-sacred-sha.cjs (which SHA-compares ONE locked file), this
 * script scans the phase changeset's PATHS + file bodies:
 *
 *   git diff --name-only <base>...HEAD              (committed phase changeset)
 *   git diff --name-only <base>                     (staged + unstaged, mid-phase)
 *   git ls-files --others --exclude-standard        (untracked-but-present, WR-05)
 *
 * FAILS (exit 1, pointed message naming the offending file) when the diff:
 *   1. touches any path under `liv/packages/core/` (the whole liv-core pkg —
 *      the sacred sdk-agent-runner.ts + providers/claude.ts live here), or
 *   2. touches basename `claude-auth-router.ts` (the liv-core:3200 proxy), or
 *   3. touches basename `inject-ai-provider.ts` (third-party-app broker inj), or
 *   4. references the literal `/root/.claude/.credentials.json` (the Claude
 *      OAuth credential store) in any changed file body, or
 *   5. a changed livinityd provider / ollama-router source file imports from
 *      the Mastra agent runtime tree or the liv-core package (Pitfall 1
 *      cross-system guard — "provider" means three different things here).
 *
 * PASSES (exit 0) otherwise — "broker boundary held".
 *
 * Usage:
 *   node scripts/verify-llm02-boundary.cjs --base <ref>   (RECOMMENDED — always
 *        pass an explicit base; the phase base is 97d3be2f)
 *   node scripts/verify-llm02-boundary.cjs                (base = env
 *        LLM02_BASE_REF, else merge-base with origin/master; WR-06: if NEITHER
 *        resolves, EXIT 2 — fail closed, never a same-ref empty-diff false PASS)
 *   node scripts/verify-llm02-boundary.cjs --selftest   (negative self-test —
 *        runs the classifier against a synthetic violating changeset; MUST
 *        exit 1; proves the gate actually detects a breach)
 *
 * Exit codes:
 *   0 — PASS, broker boundary held.
 *   1 — FAIL, a forbidden path / body / import was found (breach).
 *   2 — Setup error (git unavailable, etc).
 *
 * Reference: .planning/phases/316-gpu-mgmt-local-llm/316-01-SUMMARY.md (DECISION)
 *            + 316-RESEARCH.md (Test 1) + 316-PATTERNS.md ("No Analog Found").
 */
'use strict'

const {execFileSync} = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// ── LOCKED forbidden set (imitates verify-sacred-sha.cjs's locked constant) ──

/**
 * Forbidden PATHS. A changed file whose repo-relative path matches any of
 * these is a broker-boundary breach.
 */
const FORBIDDEN_PATHS = [
	{
		label: 'liv/packages/core (liv-core pkg — sacred sdk-agent-runner.ts + providers/claude.ts)',
		re: /^liv\/packages\/core\//,
	},
	{
		label: 'claude-auth-router.ts (livinityd → liv-core:3200 Claude OAuth proxy)',
		re: /(^|\/)claude-auth-router\.ts$/,
	},
	{
		label: 'inject-ai-provider.ts (third-party-app broker injection — distinct from LLM-02)',
		re: /(^|\/)inject-ai-provider\.ts$/,
	},
]

/** Forbidden BODY string — the Claude OAuth credential store path. */
const FORBIDDEN_BODY = '/root/.claude/.credentials.json'

/**
 * Forbidden IMPORT substrings (Pitfall 1). The Mastra agent runtime and the
 * liv-core package are structurally separate systems; the provider / ollama
 * router source must never import from either.
 */
const FORBIDDEN_IMPORTS = ['agent-runtime', 'liv/packages/core']

/**
 * Which changed source files get the import scan: the livinityd provider
 * modules + the server/trpc ollama* routers — exactly the LLM-01/LLM-02
 * surface. (Anchoring to these paths mirrors RESEARCH Pitfall 1's remedy.)
 */
const SCOPED_SOURCE_RE =
	/^livos\/packages\/livinityd\/source\/modules\/(provider\/|server\/trpc\/ollama)/

/** This gate names the forbidden path/import strings as constants; exclude it
 * from the body/import content scans so it never trips on its own definitions. */
const SELF_PATH = 'scripts/verify-llm02-boundary.cjs'

const repoRoot = path.resolve(__dirname, '..')

// ── Arg parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
	const args = {base: null, selftest: false}
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--base') {
			args.base = argv[i + 1]
			i++
		} else if (argv[i] === '--selftest') {
			args.selftest = true
		}
	}
	return args
}

function git(argsArray) {
	return execFileSync('git', argsArray, {cwd: repoRoot, encoding: 'utf8'})
}

/**
 * Resolve the base ref: --base > env LLM02_BASE_REF > merge-base(origin/master,HEAD).
 *
 * WR-06 — FAIL CLOSED. A security boundary gate must never degrade to "scan
 * nothing and report success". If no explicit --base / env ref is given AND the
 * origin/master merge-base cannot be resolved (no origin remote, shallow clone,
 * offline CI), we EXIT 2 (setup error) rather than silently falling back to
 * `HEAD` (which diffs HEAD...HEAD == empty and reports a bogus PASS). CI must
 * treat exit 2 as a failure. Documented invocations always pass `--base <ref>`.
 */
function resolveBase(explicit) {
	if (explicit) return explicit
	if (process.env.LLM02_BASE_REF) return process.env.LLM02_BASE_REF
	try {
		const base = git(['merge-base', 'origin/master', 'HEAD']).trim()
		if (!base) throw new Error('empty merge-base')
		return base
	} catch {
		process.stderr.write(
			'[verify-llm02-boundary] FAIL(setup): could not resolve a base ref — no --base flag, ' +
				'no LLM02_BASE_REF env, and no origin/master merge-base (no origin remote / shallow ' +
				'clone / offline). Pass an explicit --base <ref> (e.g. --base 97d3be2f). Refusing to ' +
				'scan an empty changeset and report a false PASS.\n',
		)
		process.exit(2)
	}
}

/**
 * Union of committed (base...HEAD) + working-tree (base) + UNTRACKED changed
 * paths.
 *
 * WR-05 — neither `git diff --name-only base...HEAD` (committed) nor
 * `git diff --name-only base` (staged + unstaged) surfaces a file that exists on
 * disk but was never `git add`ed. A brand-new untracked
 * `modules/provider/rogue.ts` importing agent-runtime would be INVISIBLE to a
 * mid-phase scan, contradicting the "staged + unstaged" claim. Add
 * `git ls-files --others --exclude-standard` so present-but-untracked files are
 * scanned too, making the gate a trustworthy pre-commit check.
 */
function changedFiles(base) {
	const set = new Set()
	for (const spec of [`${base}...HEAD`, base]) {
		try {
			const out = git(['diff', '--name-only', spec])
			out.split('\n')
				.map((s) => s.trim())
				.filter(Boolean)
				.forEach((f) => set.add(f))
		} catch {
			// A range against HEAD (base===HEAD) or an unknown ref throws; the
			// other spec still contributes. An empty union → clean pass.
		}
	}
	// Untracked-but-present files (respecting .gitignore) — WR-05.
	try {
		const untracked = git(['ls-files', '--others', '--exclude-standard'])
		untracked
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)
			.forEach((f) => set.add(f))
	} catch {
		// Non-fatal: if ls-files fails, the diff legs still contribute.
	}
	return [...set]
}

// ── Classifier (pure — reused by the self-test) ───────────────────────────

/**
 * Scan a changeset for broker-boundary breaches. `readBody(file)` returns the
 * current file content (or null if absent/deleted). Returns an array of
 * pointed violation messages (empty === boundary held).
 */
function findViolations(files, readBody) {
	const violations = []

	// (1-3) Forbidden PATHS.
	for (const file of files) {
		for (const rule of FORBIDDEN_PATHS) {
			if (rule.re.test(file)) {
				violations.push(`FORBIDDEN PATH: ${file}  →  touches ${rule.label}`)
			}
		}
	}

	// (4) Forbidden BODY + (5) forbidden IMPORTS — content scans, skip SELF.
	for (const file of files) {
		if (file === SELF_PATH) continue
		const body = readBody(file)
		if (body == null) continue

		if (body.includes(FORBIDDEN_BODY)) {
			violations.push(
				`FORBIDDEN BODY: ${file}  →  references the Claude OAuth credential store (${FORBIDDEN_BODY})`,
			)
		}

		if (SCOPED_SOURCE_RE.test(file)) {
			const lines = body.split('\n')
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]
				if (!/\b(import|require|from)\b/.test(line)) continue
				for (const bad of FORBIDDEN_IMPORTS) {
					if (line.includes(bad)) {
						violations.push(
							`FORBIDDEN IMPORT: ${file}:${i + 1}  →  provider/ollama source imports '${bad}' (cross-system boundary breach)`,
						)
					}
				}
			}
		}
	}

	return violations
}

// ── Self-test (negative case — MUST detect a synthetic breach) ────────────

function runSelfTest() {
	const synthetic = [
		'liv/packages/core/src/sdk-agent-runner.ts',
		'livos/packages/livinityd/source/modules/server/trpc/claude-auth-router.ts',
		'livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts',
		'livos/packages/livinityd/source/modules/provider/active-model.ts',
	]
	const bodies = {
		'livos/packages/livinityd/source/modules/provider/active-model.ts':
			"import {foo} from '../agent-runtime/provider-router.js'\nconst p = '/root/.claude/.credentials.json'\n",
	}
	const violations = findViolations(synthetic, (f) => bodies[f] ?? null)
	if (violations.length === 0) {
		process.stderr.write(
			'[verify-llm02-boundary] SELFTEST FAIL: synthetic breach was NOT detected — the gate is broken.\n',
		)
		process.exit(2)
	}
	process.stdout.write(
		`[verify-llm02-boundary] SELFTEST OK: detected ${violations.length} synthetic violation(s) (gate would exit 1):\n`,
	)
	for (const v of violations) process.stdout.write(`  - ${v}\n`)
	process.exit(1)
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
	const args = parseArgs(process.argv.slice(2))

	if (args.selftest) {
		runSelfTest()
		return
	}

	// Sanity: git must be runnable.
	try {
		git(['rev-parse', '--is-inside-work-tree'])
	} catch (err) {
		process.stderr.write(
			`[verify-llm02-boundary] FAIL(setup): git unavailable or not a repo: ${
				err instanceof Error ? err.message : String(err)
			}\n`,
		)
		process.exit(2)
	}

	const base = resolveBase(args.base)
	const files = changedFiles(base)

	const readBody = (file) => {
		const abs = path.join(repoRoot, file)
		try {
			return fs.readFileSync(abs, 'utf8')
		} catch {
			return null // deleted / renamed-away — nothing to scan
		}
	}

	const violations = findViolations(files, readBody)

	if (violations.length > 0) {
		process.stderr.write(
			'[verify-llm02-boundary] FAIL: the LLM-01/LLM-02 changeset breached the Claude broker boundary.\n\n',
		)
		for (const v of violations) process.stderr.write(`  ✗ ${v}\n`)
		process.stderr.write(
			`\n  base        : ${base}\n` +
				`  changed     : ${files.length} file(s)\n\n` +
				'The Claude subscription broker path (liv/packages/core → sdk-agent-runner.ts,\n' +
				'claude-auth-router.ts → liv-core:3200, /root/.claude/.credentials.json) is\n' +
				'SACRED for this phase. LLM-01/LLM-02 must be additive-only against\n' +
				'modules/provider/key-store.ts + provider-config-router.ts. Revert the\n' +
				'offending change or escalate before continuing.\n\n' +
				'Reference: .planning/phases/316-gpu-mgmt-local-llm/316-01-SUMMARY.md (DECISION)\n',
		)
		process.exit(1)
	}

	process.stdout.write(
		`[verify-llm02-boundary] PASS: broker boundary held (base=${base}, ${files.length} changed file(s); ` +
			'zero liv/packages/core / claude-auth-router / inject-ai-provider / credentials-path / cross-system-import touches).\n',
	)
	process.exit(0)
}

main()
