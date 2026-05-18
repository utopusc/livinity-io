// livos/packages/ui/src/features/local-setup/__tests__/LocalSetupWizard.test.tsx
// Phase 104 plan 104-05 — source-text grep invariants.
// Pattern: master-chrome-login.test.tsx (no @testing-library/react; D-NO-NEW-DEPS).
import {readFileSync} from 'node:fs'
import path from 'node:path'

import {describe, expect, it} from 'vitest'

const here = path.resolve(__dirname, '..')
const wizardSrc = readFileSync(path.join(here, 'LocalSetupWizard.tsx'), 'utf-8')
const modePickSrc = readFileSync(path.join(here, 'ModePickStep.tsx'), 'utf-8')
const qrSrc = readFileSync(path.join(here, 'QrCodeStep.tsx'), 'utf-8')
const platformSrc = readFileSync(path.join(here, 'PlatformInstructions.tsx'), 'utf-8')
const hybridSrc = readFileSync(path.join(here, 'HybridDnsSetup.tsx'), 'utf-8')

describe('LocalSetupWizard — tRPC wiring (Phase 104 plan 104-05)', () => {
	it('subscribes to local.getStatus', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.getStatus\.useQuery/)
	})
	it('uses local.activate mutation for local-lan path', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.activate\.useMutation/)
	})
	it('uses local.activateHybrid mutation for hybrid path', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.activateHybrid\.useMutation/)
	})
	it('uses local.getHybridStatus for hybrid verify', () => {
		expect(wizardSrc).toMatch(/trpcReact\.local\.getHybridStatus\.useQuery/)
	})
})

describe('ModePickStep — surface invariants', () => {
	it('shows all three modes (Phase 142-02 renamed hybrid → portal)', () => {
		expect(modePickSrc).toContain("id: 'portal'")
		expect(modePickSrc).toContain("id: 'local-lan'")
		expect(modePickSrc).toContain("id: 'cloud'")
	})
	it('marks portal as recommended/default (D-104-DEFAULT-MODE surface, Phase 142-02 rename)', () => {
		expect(modePickSrc).toMatch(/recommended:\s*true/)
		expect(modePickSrc).toMatch(/Portal \(recommended\)/)
	})
	it('warns local-lan does NOT work on Apple devices', () => {
		expect(modePickSrc).toMatch(/Does NOT work on Apple devices/)
	})
})

describe('QrCodeStep — CA cert URL surface (AC-104-10 trust UX)', () => {
	it('renders the CA cert URL pointing at /api/local/ca.crt', () => {
		expect(qrSrc).toMatch(/\/api\/local\/ca\.crt/)
	})
	it('encodes the URL via qrserver.com (D-NO-NEW-DEPS fallback)', () => {
		expect(qrSrc).toMatch(/api\.qrserver\.com.*create-qr-code/)
	})
	it('provides a download link with filename livos-local-ca.crt', () => {
		expect(qrSrc).toMatch(/download='livos-local-ca\.crt'/)
	})
})

describe('PlatformInstructions — per-OS coverage (AC-104-10)', () => {
	it('has tabs for linux, macos, ios, windows, android', () => {
		for (const p of ['linux', 'macos', 'ios', 'windows', 'android']) {
			expect(platformSrc).toContain(`id: '${p}'`)
		}
	})
	it('flags macOS + iOS as broken-on-.local', () => {
		expect(platformSrc).toMatch(/macOS does NOT support \.local TLDs/)
		expect(platformSrc).toMatch(/iOS does NOT support \.local TLDs/)
	})
	it('Linux instructions use update-ca-certificates', () => {
		expect(platformSrc).toContain('update-ca-certificates')
	})
	it('Windows instructions use certutil', () => {
		expect(platformSrc).toContain('certutil -addstore')
	})
	it('Android instructions point users at Firefox', () => {
		expect(platformSrc).toMatch(/Firefox.*own CA store|Firefox on Android/)
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
