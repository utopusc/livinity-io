// livos/packages/ui/src/features/local-setup/types.ts
// Phase 104 plan 104-05 — Discriminated-union state machine for the Local
// Access wizard. Mirrors the WizardStep pattern in routes/settings/domain-setup.tsx.
// Phase 142-02 — `hybrid` renamed → `portal` (user-facing).
// Phase 142-01 — `local-lan` retired (LOCAL_LAN_STEPS + WizardState.localLan +
//   the local-lan-* step IDs removed; the on-disk dnsmasq + Caddy internal-CA
//   path had no production install base and was a maintenance drag).
// Phase 142-03 — `cloud` is Coming Soon (entry kept on the type union for the
//   UI's disabled-card render, but its steps are limited to cloud-redirect).

export type SelectedMode = 'cloud' | 'portal'

export type WizardStep =
	| 'mode-pick'
	// portal branch (was: hybrid)
	| 'portal-config' // collect Cloudflare token + hostIp
	| 'portal-dns-records' // walk Cloudflare TXT challenge
	| 'portal-verify' // poll local.getPortalStatus
	// cloud branch — Coming Soon. Wizard renders an informational pane.
	| 'cloud-redirect'
	// shared
	| 'verify' // final ping
	| 'done'

export const PORTAL_STEPS: WizardStep[] = [
	'mode-pick',
	'portal-config',
	'portal-dns-records',
	'portal-verify',
	'verify',
	'done',
]

export const CLOUD_STEPS: WizardStep[] = ['mode-pick', 'cloud-redirect']

export interface WizardState {
	step: WizardStep
	mode: SelectedMode | null
	portal: {
		cloudflareApiToken: string
		hostIp: string
		subdomain: string
		zoneId: string
	}
}

export const initialWizardState: WizardState = {
	step: 'mode-pick',
	mode: null,
	portal: {cloudflareApiToken: '', hostIp: '', subdomain: '', zoneId: ''},
}
