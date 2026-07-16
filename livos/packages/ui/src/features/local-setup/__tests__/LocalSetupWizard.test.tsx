// livos/packages/ui/src/features/local-setup/__tests__/LocalSetupWizard.test.tsx
// Phase 104 plan 104-05 — source-text grep invariants.
// Pattern: master-chrome-login.test.tsx (no @testing-library/react; D-NO-NEW-DEPS).
// Phase 142-01 — local-lan invariants removed (QrCodeStep + PlatformInstructions
//   files deleted; local.activate mutation no longer used). Mode-pick coverage
//   shrunk to (portal, cloud) with Coming-Soon assertion on cloud.
// Phase 142-02 — `hybrid` renamed → `portal` (state-machine literals + recommended copy).
// Phase 142-03 — cloud card disabled + Coming-Soon badge asserted.
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const here = path.resolve(__dirname, '..')
const wizardSrc = readFileSync(path.join(here, 'LocalSetupWizard.tsx'), 'utf-8')
const modePickSrc = readFileSync(path.join(here, 'ModePickStep.tsx'), 'utf-8')
const portalDnsSrc = readFileSync(path.join(here, 'PortalDnsSetup.tsx'), 'utf-8')

describe('LocalSetupWizard — tRPC wiring (Phase 104 plan 104-05, updated 142-01 + 143-01)', () => {
	it('subscribes to local.getStatus', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.getStatus\.useQuery/)
	})
	it('does NOT call the retired local.activate (Phase 142-01)', () => {
		expect(wizardSrc).not.toMatch(/trpcReact\.local\.activate\.useMutation/)
	})
	it('uses the wire-renamed local.activatePortal mutation (Phase 143-01)', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.activatePortal\.useMutation/)
		// And no longer calls the legacy name from inside the wizard.
		expect(wizardSrc).not.toMatch(/trpcReact\.local\.activateHybrid\.useMutation/)
	})
	it('uses the wire-renamed local.getPortalStatus for the portal verify step', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.getPortalStatus\.useQuery/)
		expect(wizardSrc).not.toMatch(/trpcReact\.local\.getHybridStatus\.useQuery/)
	})
})

describe('ModePickStep — surface invariants (Phase 142-01/02/03)', () => {
	it('shows portal + cloud (local-lan retired)', () => {
		expect(modePickSrc).toContain("id: 'portal'")
		expect(modePickSrc).toContain("id: 'cloud'")
		expect(modePickSrc).not.toContain("id: 'local-lan'")
	})
	it('marks portal as recommended/default', () => {
		expect(modePickSrc).toMatch(/recommended:\s*true/)
		expect(modePickSrc).toMatch(/Portal \(recommended\)/)
	})
	it('marks cloud as Coming Soon and visibly disabled', () => {
		expect(modePickSrc).toMatch(/comingSoon:\s*true/)
		expect(modePickSrc).toMatch(/Coming Soon/)
		expect(modePickSrc).toMatch(/disabled=\{isDisabled\}/)
	})
})

describe('PortalDnsSetup — Cloudflare flow surface (AC-104-15 UX, Phase 143-02 rename)', () => {
	it('links to Cloudflare API token dashboard', () => {
		expect(portalDnsSrc).toMatch(/dash\.cloudflare\.com\/profile\/api-tokens/)
	})
	it('mentions zero data-plane Server5 traffic (D-104-RELAY-ZERO-DATA-PLANE surface)', () => {
		expect(portalDnsSrc).toMatch(/Zero data-plane Server5 traffic|stays LAN-direct/i)
	})
	it('calls the wire-renamed local.provisionPortal mutation (Phase 143-01)', () => {
		expect(portalDnsSrc).toMatch(/trpcReact\.local\.provisionPortal\.useMutation/)
	})
})

describe('PortalDnsSetup — 4-field BYO provision payload (Phase 331-01, FIX-01)', () => {
	// provisionPortalSchema (local-dns/routes.ts) requires hostIp +
	// cloudflareApiToken + zoneId + portalDomain, all min(1). The audit found the
	// UI sent only the first two, so EVERY real provision call failed zod.
	it('mutate payload carries all four provisionPortalSchema fields', () => {
		expect(portalDnsSrc).toMatch(
			/mutateAsync\(\{hostIp, cloudflareApiToken: cfToken, zoneId, portalDomain\}\)/,
		)
	})
	it('component receives zoneId + portalDomain props and gates the submit on them', () => {
		expect(portalDnsSrc).toMatch(/zoneId: string/)
		expect(portalDnsSrc).toMatch(/portalDomain: string/)
		expect(portalDnsSrc).toMatch(/disabled=\{busy \|\| !cfToken \|\| !zoneId \|\| !portalDomain\}/)
	})
	it('wizard collects zoneId + portalDomain in PortalConfigStep and passes them down', () => {
		expect(wizardSrc).toMatch(/t\('portal\.byo\.zoneId\.label'\)/)
		expect(wizardSrc).toMatch(/t\('portal\.byo\.domain\.label'\)/)
		expect(wizardSrc).toMatch(/zoneId=\{state\.portal\.zoneId\}/)
		expect(wizardSrc).toMatch(/portalDomain=\{state\.portal\.portalDomain\}/)
	})
})
