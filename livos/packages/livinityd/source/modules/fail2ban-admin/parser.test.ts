import assert from 'node:assert/strict'

import {
	parseAuthLogForLastUser,
	parseJailList,
	parseJailStatus,
	parseWhoOutput,
} from './parser.js'

/**
 * Phase 46 Plan 02 — parser.test.ts
 *
 * Verbatim-fixture tests for the four pure parsers in parser.ts. Fixtures
 * are pasted from .planning/phases/46-fail2ban-admin-panel/46-01-DIAGNOSTIC.md
 * (LIVE captures from Mini PC bruce@10.69.31.68 + a few SYNTHETIC fixtures
 * tagged inline for edge-case coverage that the live capture didn't exhibit).
 *
 * Per pitfall W-20: NO Vitest, NO mock-by-module-replacement. Bare `tsx` + node:assert/strict.
 * Per pitfall B-05: fixtures are byte-verbatim (not synthesized strings).
 */

async function runTests() {
	// ---------------------------------------------------------------
	// parseJailList — 4 tests
	// ---------------------------------------------------------------

	// Test 1: multi-jail (SYNTHETIC fixture A2 — comma-separated list)
	{
		const stdout = `Status
|- Number of jail:	2
\`- Jail list:	sshd, recidive
`
		const out = parseJailList(stdout)
		assert.deepEqual(out, ['sshd', 'recidive'])
		console.log('  PASS Test 1: parseJailList multi-jail')
	}

	// Test 2: single jail (LIVE fixture A1 from Mini PC bruce@10.69.31.68)
	{
		const stdout = `Status
|- Number of jail:	1
\`- Jail list:	sshd
`
		const out = parseJailList(stdout)
		assert.deepEqual(out, ['sshd'])
		console.log('  PASS Test 2: parseJailList single jail (LIVE Mini PC)')
	}

	// Test 3: empty list (SYNTHETIC fixture A3)
	{
		const stdout = `Status
|- Number of jail:	0
\`- Jail list:
`
		const out = parseJailList(stdout)
		assert.deepEqual(out, [])
		console.log('  PASS Test 3: parseJailList empty')
	}

	// Test 4: malformed (no `Jail list:` line at all) → throws
	{
		assert.throws(() => parseJailList('totally unrelated text\n'), /parse: jail list line not found/)
		console.log('  PASS Test 4: parseJailList malformed throws')
	}

	// ---------------------------------------------------------------
	// parseJailStatus — 3 tests
	// ---------------------------------------------------------------

	// Test 5: happy path with verbatim Plan 01 LIVE fixture B1 (zero-banned, journal-based filter)
	{
		const stdout = `Status for the jail: sshd
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
|  \`- Journal matches:	_SYSTEMD_UNIT=sshd.service + _COMM=sshd
\`- Actions
   |- Currently banned:	0
   |- Total banned:	0
   \`- Banned IP list:
`
		const out = parseJailStatus(stdout)
		assert.equal(out.currentlyFailed, 0)
		assert.equal(out.totalFailed, 0)
		assert.equal(out.currentlyBanned, 0)
		assert.equal(out.totalBanned, 0)
		assert.deepEqual(out.bannedIps, [])
		console.log('  PASS Test 5: parseJailStatus happy path (LIVE Mini PC, Journal matches: variant)')
	}

	// Test 6: zero-banned with non-zero failures + multi-IP banned list (SYNTHETIC fixture B3, File list: variant)
	{
		const stdout = `Status for the jail: sshd
|- Filter
|  |- Currently failed:	7
|  |- Total failed:	89
|  \`- File list:	/var/log/auth.log
\`- Actions
   |- Currently banned:	3
   |- Total banned:	22
   \`- Banned IP list:	1.2.3.4 5.6.7.8 9.10.11.12
`
		const out = parseJailStatus(stdout)
		assert.equal(out.currentlyFailed, 7)
		assert.equal(out.totalFailed, 89)
		assert.equal(out.currentlyBanned, 3)
		assert.equal(out.totalBanned, 22)
		assert.deepEqual(out.bannedIps, ['1.2.3.4', '5.6.7.8', '9.10.11.12'])
		console.log('  PASS Test 6: parseJailStatus multi-banned IPs (SYNTHETIC B3, File list: variant)')
	}

	// Test 7: malformed (missing `Currently banned:` required line) → throws
	{
		const stdout = `Status for the jail: sshd
|- Filter
|  |- Currently failed:	0
|  |- Total failed:	0
\`- Actions
   |- Total banned:	0
   \`- Banned IP list:
`
		assert.throws(() => parseJailStatus(stdout), /parse:/)
		console.log('  PASS Test 7: parseJailStatus malformed throws')
	}

	// ---------------------------------------------------------------
	// parseAuthLogForLastUser — 4 tests
	// ---------------------------------------------------------------

	// Test 8: classic "invalid user" line
	{
		const log = `May  1 13:00:00 host sshd[1]: pam_unix(sshd:auth): authentication failure;
May  1 13:00:01 host sshd[1]: Failed password for invalid user alice from 1.2.3.4 port 22 ssh2
May  1 13:00:02 host sshd[1]: Connection closed by 1.2.3.4 port 22
`
		const out = parseAuthLogForLastUser(log, '1.2.3.4')
		assert.equal(out, 'alice')
		console.log('  PASS Test 8: parseAuthLogForLastUser invalid user')
	}

	// Test 9: valid user (root) — no "invalid user" prefix
	{
		const log = `May  1 12:55:00 host sshd[1]: Failed password for root from 9.9.9.9 port 22 ssh2
May  1 13:00:00 host sshd[1]: Connection closed by 9.9.9.9 port 22
`
		const out = parseAuthLogForLastUser(log, '9.9.9.9')
		assert.equal(out, 'root')
		console.log('  PASS Test 9: parseAuthLogForLastUser valid user')
	}

	// Test 10: no matching IP in log → returns null
	{
		const log = `May  1 12:00:00 host sshd[1]: Failed password for alice from 1.1.1.1 port 22 ssh2
`
		const out = parseAuthLogForLastUser(log, '5.5.5.5')
		assert.equal(out, null)
		console.log('  PASS Test 10: parseAuthLogForLastUser no match returns null')
	}

	// Test 11: empty log content → returns null
	{
		const out = parseAuthLogForLastUser('', '1.2.3.4')
		assert.equal(out, null)
		console.log('  PASS Test 11: parseAuthLogForLastUser empty log returns null')
	}

	// ---------------------------------------------------------------
	// parseWhoOutput — 3 tests
	// ---------------------------------------------------------------

	// Test 12: LIVE fixture C1 (mixed local + no-IP remote) — bruce seat0, bruce :0, root pts/1
	// Critical: '(login screen)' and '(:0)' tokens MUST NOT be extracted as sourceIp.
	{
		const stdout = `bruce    seat0        2026-04-29 10:54   ?          1984 (login screen)
bruce    :0           2026-04-29 10:54   ?          1984 (:0)
root     pts/1        2026-05-01 11:37 01:34     1010411
`
		const out = parseWhoOutput(stdout)
		assert.equal(out.length, 3)
		// Row 0: bruce on seat0 — '(login screen)' is descriptive label, NOT an IP
		assert.equal(out[0].user, 'bruce')
		assert.equal(out[0].sourceIp, null, 'Test 12 row 0: (login screen) must not be extracted as sourceIp')
		// Row 1: bruce on :0 — '(:0)' is X11 display, NOT an IP
		assert.equal(out[1].user, 'bruce')
		assert.equal(out[1].sourceIp, null, 'Test 12 row 1: (:0) must not be extracted as sourceIp')
		// Row 2: root pts/1 — no parens at all
		assert.equal(out[2].user, 'root')
		assert.equal(out[2].sourceIp, null)
		console.log('  PASS Test 12: parseWhoOutput LIVE C1 mixed local sessions (no IPs leak)')
	}

	// Test 13: empty input → returns []
	{
		const out = parseWhoOutput('')
		assert.deepEqual(out, [])
		console.log('  PASS Test 13: parseWhoOutput empty input')
	}

	// Test 14: SYNTHETIC fixture C2 — three remote SSH sessions including IPv4-mapped IPv6
	{
		const stdout = `bruce    pts/0        2026-05-01 12:34   .          9876 (203.0.113.5)
bruce    pts/1        2026-05-01 13:01  old         9877 (10.69.31.1)
alice    pts/2        2026-05-01 13:05   .          9878 (::ffff:192.168.1.42)
`
		const out = parseWhoOutput(stdout)
		assert.equal(out.length, 3)
		assert.equal(out[0].user, 'bruce')
		assert.equal(out[0].sourceIp, '203.0.113.5')
		assert.equal(out[1].user, 'bruce')
		assert.equal(out[1].sourceIp, '10.69.31.1')
		assert.equal(out[2].user, 'alice')
		assert.equal(out[2].sourceIp, '192.168.1.42', 'Test 14 row 2: ::ffff: prefix must be stripped')
		console.log('  PASS Test 14: parseWhoOutput SYNTHETIC C2 remote SSH (IPv4-mapped IPv6 stripped)')
	}

	console.log('\nAll parser.test.ts tests passed (14/14)')
}

runTests().catch((err) => {
	console.error('FAILED:', err)
	process.exit(1)
})
