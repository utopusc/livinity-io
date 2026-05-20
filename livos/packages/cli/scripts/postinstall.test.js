// Phase 172-04 — postinstall smoke test.
// Run manually: `node scripts/postinstall.test.js`
// Covers: directory creation, idempotency, cross-platform branch selection.

import {strict as assert} from 'node:assert'
import {promises as fs} from 'node:fs'
import {tmpdir, platform} from 'node:os'
import {join} from 'node:path'
import {installSkills} from './postinstall.js'

async function makeTmpHome() {
  const dir = await fs.mkdtemp(join(tmpdir(), 'liv-postinstall-test-'))
  return dir
}

async function exists(p) {
  try {
    await fs.lstat(p)
    return true
  } catch {
    return false
  }
}

async function main() {
  const home = await makeTmpHome()

  // Test 1: first install creates the skill dirs/links on native platform
  const first = await installSkills({home, platform: platform()})
  assert.equal(first.length, 3, 'should install 3 skills')
  for (const r of first) {
    assert.notEqual(r.action, 'error', `${r.name} had error: ${r.error}`)
    assert.ok(['symlink', 'copy'].includes(r.action), `${r.name} action should be symlink or copy, got ${r.action}`)
    const skillFile = join(home, '.claude', 'skills', r.name, 'SKILL.md')
    assert.ok(await exists(skillFile), `${skillFile} should exist after install`)
  }
  console.log('[postinstall.test] Test 1 PASS — first install creates 3 skills')

  // Test 2: second install is idempotent (action=skip)
  const second = await installSkills({home, platform: platform()})
  assert.equal(second.length, 3, 'second install also reports 3 skills')
  for (const r of second) {
    assert.equal(r.action, 'skip', `${r.name} second install should be skip, got ${r.action}`)
  }
  console.log('[postinstall.test] Test 2 PASS — second install is idempotent (skip)')

  // Test 3: Windows branch (forced) returns 'copy' action on first install
  const winHome = await makeTmpHome()
  const winResult = await installSkills({home: winHome, platform: 'win32'})
  assert.equal(winResult.length, 3, 'win32 install reports 3 skills')
  for (const r of winResult) {
    assert.equal(r.action, 'copy', `${r.name} on win32 should copy, got ${r.action}`)
    const skillFile = join(winHome, '.claude', 'skills', r.name, 'SKILL.md')
    assert.ok(await exists(skillFile), `${skillFile} should exist after win32 copy`)
  }
  console.log('[postinstall.test] Test 3 PASS — win32 branch uses copy')

  // Test 4: win32 second install is also idempotent (skip)
  const winSecond = await installSkills({home: winHome, platform: 'win32'})
  for (const r of winSecond) {
    assert.equal(r.action, 'skip', `${r.name} win32 second install should be skip, got ${r.action}`)
  }
  console.log('[postinstall.test] Test 4 PASS — win32 second install is idempotent')

  // Cleanup
  await fs.rm(home, {recursive: true, force: true})
  await fs.rm(winHome, {recursive: true, force: true})

  console.log('[postinstall.test] all assertions passed')
}

main().catch((err) => {
  console.error(`[postinstall.test] FAIL: ${err.message}`)
  console.error(err.stack)
  process.exit(1)
})
