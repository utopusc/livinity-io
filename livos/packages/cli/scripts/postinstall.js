#!/usr/bin/env node
// Phase 172-04 — postinstall script for @livos/cli.
//
// Installs bundled prompts/skills/liv-* into ~/.claude/skills/.
// Symlinks on Linux/Mac, copies on Windows (symlinks need admin/Dev Mode).
// Idempotent: skips if target already exists and matches.
//
// Gated to avoid running during the LivOS monorepo's pnpm install:
//   - Skip if process.env.LIV_CLI_SKIP_POSTINSTALL === '1' (CI/dev opt-out)
//   - Skip if INIT_CWD points inside the workspace (pnpm/npm always set INIT_CWD;
//     if it matches the repo root or the workspace root, we're bootstrapping the
//     workspace itself, not installing the CLI as a real dependency)
//   - Force-run if process.env.LIV_CLI_INSTALL_SKILLS === '1' (explicit opt-in)
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {promises as fs} from 'node:fs'
import {homedir, platform} from 'node:os'
import {fileURLToPath} from 'node:url'
import {dirname, join, resolve} from 'node:path'

const SKILLS = ['liv-add-item', 'liv-list-tree', 'liv-doctor']
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(SCRIPT_DIR, '..')
const SKILLS_SRC = join(PKG_ROOT, 'prompts', 'skills')

function isWorkspaceBootstrap() {
  // Heuristic: pnpm install at repo root sets INIT_CWD to the repo root.
  // The package dir's grand-grand-parent is the repo root (livos/packages/cli → livos → repo).
  // If INIT_CWD matches that, we're bootstrapping the workspace, not installing the CLI.
  const initCwd = process.env.INIT_CWD
  if (!initCwd) return false
  const repoRoot = resolve(PKG_ROOT, '..', '..', '..')
  const workspaceRoot = resolve(PKG_ROOT, '..', '..')
  const initResolved = resolve(initCwd)
  return initResolved === repoRoot || initResolved === workspaceRoot
}

function shouldRun() {
  if (process.env.LIV_CLI_SKIP_POSTINSTALL === '1') return false
  if (process.env.LIV_CLI_INSTALL_SKILLS === '1') return true
  if (isWorkspaceBootstrap()) return false
  return true
}

async function pathExists(p) {
  try {
    await fs.lstat(p)
    return true
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function isCorrectSymlink(target, expectedSrc) {
  try {
    const stat = await fs.lstat(target)
    if (!stat.isSymbolicLink()) return false
    const actual = await fs.readlink(target)
    // readlink may return a relative path; resolve against the symlink's parent dir
    const actualResolved = resolve(dirname(target), actual)
    return resolve(actualResolved) === resolve(expectedSrc)
  } catch {
    return false
  }
}

async function installSkill(name, opts = {}) {
  const home = opts.home ?? homedir()
  const plat = opts.platform ?? platform()
  const src = join(SKILLS_SRC, name)
  const destDir = join(home, '.claude', 'skills', name)

  // Ensure parent ~/.claude/skills/ exists
  await fs.mkdir(join(home, '.claude', 'skills'), {recursive: true})

  // Linux/Mac path: directory symlink (preserves the SKILL.md @-includes that
  // reference workflows by relative path within the bundled package)
  if (plat !== 'win32') {
    if (await pathExists(destDir)) {
      // Idempotent: skip if already pointing to the right place
      const ok = await isCorrectSymlink(destDir, src)
      if (ok) {
        return {name, action: 'skip', reason: 'already linked'}
      }
      // Wrong link or directory → remove and recreate
      await fs.rm(destDir, {recursive: true, force: true})
    }
    await fs.symlink(src, destDir, 'dir')
    return {name, action: 'symlink', src, dest: destDir}
  }

  // Windows: recursive copy fallback
  if (await pathExists(destDir)) {
    return {name, action: 'skip', reason: 'already copied (Windows; manual refresh required for updates)'}
  }
  await fs.cp(src, destDir, {recursive: true, force: false, errorOnExist: false})
  return {name, action: 'copy', src, dest: destDir}
}

export async function installSkills(opts = {}) {
  const results = []
  for (const name of SKILLS) {
    try {
      results.push(await installSkill(name, opts))
    } catch (err) {
      results.push({name, action: 'error', error: err.message})
    }
  }
  return results
}

async function main() {
  if (!shouldRun()) {
    console.log('[liv postinstall] skipped (workspace bootstrap or explicit opt-out)')
    return
  }
  console.log('[liv postinstall] installing skills into ~/.claude/skills/...')
  const results = await installSkills()
  for (const r of results) {
    if (r.action === 'error') {
      console.error(`  x ${r.name}: ${r.error}`)
    } else if (r.action === 'skip') {
      console.log(`  . ${r.name}: ${r.reason}`)
    } else {
      console.log(`  + ${r.name}: ${r.action} -> ${r.dest}`)
    }
  }
  const hasError = results.some((r) => r.action === 'error')
  process.exit(hasError ? 1 : 0)
}

// Only run main() when executed as a script (not when imported by tests).
// import.meta.url normalises to a file:// URL; argv[1] is the OS path. Compare
// resolved paths so both Linux and Windows paths line up.
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : ''
const thisFile = resolve(fileURLToPath(import.meta.url))
if (invokedFile === thisFile) {
  main().catch((err) => {
    console.error(`[liv postinstall] fatal: ${err.message}`)
    process.exit(1)
  })
}
