#!/usr/bin/env node
/**
 * Phase 97-03 — Sacred-SHA verification harness (Node port).
 *
 * Equivalent to `scripts/verify-sacred-sha.sh` but invokable from Windows
 * dev boxes that may not have a working POSIX bash. Computes the git blob
 * SHA of `liv/packages/core/src/sdk-agent-runner.ts` and compares it
 * against the locked constant.
 *
 * Usage:
 *   node scripts/verify-sacred-sha.cjs
 *
 * Exit codes:
 *   0 — PASS, sacred file unchanged.
 *   1 — FAIL, sacred file SHA differs from locked constant.
 *   2 — Setup error (missing file, etc).
 *
 * Reference: .planning/phases/97-auto-mode/97-CONTEXT.md (Sacred constraints).
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const LOCKED_SHA = 'f3538e1d811992b782a9bb057d1b7f0a0189f95f'
const SACRED_REL = 'liv/packages/core/src/sdk-agent-runner.ts'

const repoRoot = path.resolve(__dirname, '..')
const sacredAbs = path.join(repoRoot, SACRED_REL)

if (!fs.existsSync(sacredAbs)) {
	process.stderr.write(
		`[verify-sacred-sha] FAIL: sacred file missing: ${SACRED_REL}\n` +
			`[verify-sacred-sha]       phase context: .planning/phases/97-auto-mode/97-CONTEXT.md\n`,
	)
	process.exit(2)
}

// git's `hash-object` blob hash:
//   sha1("blob " + bytelength + "\0" + filebytes)
const data = fs.readFileSync(sacredAbs)
const header = Buffer.from(`blob ${data.length}\0`, 'utf8')
const sha = crypto.createHash('sha1').update(header).update(data).digest('hex')

if (sha === LOCKED_SHA) {
	process.stdout.write(`[verify-sacred-sha] PASS: ${SACRED_REL} = ${LOCKED_SHA}\n`)
	process.exit(0)
}

process.stderr.write(
	`[verify-sacred-sha] FAIL: sacred file SHA mismatch.\n\n` +
		`  file        : ${SACRED_REL}\n` +
		`  locked SHA  : ${LOCKED_SHA}\n` +
		`  current SHA : ${sha}\n\n` +
		`The LivOS SDK agent runner is locked. All extensions go through\n` +
		`wrappers (liv-agent-runner.ts and mcp-client-manager.ts), NOT through\n` +
		`the runner itself. If this check fails, the runner has been mutated —\n` +
		`either revert the changes or escalate before continuing.\n\n` +
		`Phase context: .planning/phases/97-auto-mode/97-CONTEXT.md\n`,
)
process.exit(1)
