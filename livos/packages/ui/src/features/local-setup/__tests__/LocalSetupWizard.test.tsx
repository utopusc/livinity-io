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
const hybridSrc = readFileSync(path.join(here, 'HybridDnsSetup.tsx'), 'utf-8')

describe('LocalSetupWizard — tRPC wiring (Phase 104 plan 104-05, updated 142-01)', () => {
	it('subscribes to local.getStatus', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.getStatus\.useQuery/)
	})
	it('does NOT call the retired local.activate (Phase 142-01)', () => {
		expect(wizardSrc).not.toMatch(/trpcReact\.local\.activate\.useMutation/)
	})
	it('uses local.activateHybrid mutation for the portal path', () => {
		// Wire-level name kept until Phase 142-04 polish renames the tRPC route.
		expect(wizardSrc).toMatch(/trpcReact\.local\.activateHybrid\.useMutation/)
	})
	it('uses local.getHybridStatus for the portal verify step', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.getHybridStatus\.useQuery/)
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

describe('HybridDnsSetup — Cloudflare flow surface (AC-104-15 UX)', () => {
	it('links to Cloudflare API token dashboard', () => {
		expect(hybridSrc).toMatch(/dash\.cloudflare\.com\/profile\/api-tokens/)
	})
	it('mentions zero data-plane Server5 traffic (D-104-RELAY-ZERO-DATA-PLANE surface)', () => {
		expect(hybridSrc).toMatch(/Zero data-plane Server5 traffic|stays LAN-direct/i)
	})
})
