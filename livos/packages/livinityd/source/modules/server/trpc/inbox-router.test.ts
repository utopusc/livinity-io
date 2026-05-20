// Phase 177-03 — inbox-router source-text invariants.
//
// Source-text invariant suite — no runtime tRPC invocation.
// Tests lock the router shape: 4 procedures, all adminProcedure-gated,
// inboxReader wired, common.ts has 4 vault.inbox.* httpOnlyPaths,
// index.ts vault namespace includes inbox sub-router.
//
// All RED until inbox-router.ts + changes to common.ts + index.ts land.

import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

const ROUTER_SRC = readFileSync(resolve(__dirname, 'inbox-router.ts'), 'utf8')
const COMMON_SRC = readFileSync(resolve(__dirname, 'common.ts'), 'utf8')
const INDEX_SRC = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

describe('inbox-router — Phase 177-03 source-text invariants', () => {
	it('IR-01: inbox-router.ts exists and exports a default router', () => {
		expect(ROUTER_SRC).toMatch(/export default/)
	})

	it('IR-02: all 4 procedures use adminProcedure', () => {
		const matches = ROUTER_SRC.match(/adminProcedure/g) ?? []
		expect(matches.length).toBeGreaterThanOrEqual(4)
	})

	it('IR-03: 4 procedure names present (listByAgent, listGlobal, markRead, get)', () => {
		expect(ROUTER_SRC).toMatch(/listByAgent/)
		expect(ROUTER_SRC).toMatch(/listGlobal/)
		expect(ROUTER_SRC).toMatch(/markRead/)
		expect(ROUTER_SRC).toMatch(/\bget\b/)
	})

	it('IR-04: inboxReader is referenced in the router (wired via ctx.livinityd.inboxReader)', () => {
		expect(ROUTER_SRC).toMatch(/inboxReader/)
	})

	it('IR-05: common.ts contains all 4 vault.inbox.* httpOnlyPaths', () => {
		expect(COMMON_SRC).toMatch(/'vault\.inbox\.listByAgent'/)
		expect(COMMON_SRC).toMatch(/'vault\.inbox\.listGlobal'/)
		expect(COMMON_SRC).toMatch(/'vault\.inbox\.markRead'/)
		expect(COMMON_SRC).toMatch(/'vault\.inbox\.get'/)
	})

	it('IR-06: trpc/index.ts vault namespace includes inbox sub-router', () => {
		expect(INDEX_SRC).toMatch(/inboxRouter/)
		expect(INDEX_SRC).toMatch(/inbox:\s*inboxRouter/)
	})

	it('IR-07: agentId input validated with ID_RE or z.string().regex', () => {
		expect(ROUTER_SRC).toMatch(/regex|ID_RE/)
	})

	it('IR-08: no hardcoded filesystem paths in router (delegates to ctx.livinityd.inboxReader)', () => {
		// Router should delegate to inboxReader, not build vault paths itself
		expect(ROUTER_SRC).not.toMatch(/vaultRoot/)
		// Router must reference inboxReader (not bypass it with direct FS ops)
		expect(ROUTER_SRC).toMatch(/inboxReader/)
		// Router should not perform direct FS reads (fs.readdir, readFile, etc.)
		expect(ROUTER_SRC).not.toMatch(/readdir|readFile|writeFile/)
	})
})
