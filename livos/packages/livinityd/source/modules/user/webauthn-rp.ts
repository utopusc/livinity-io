// Phase 323-01 (IDENT-03) — WebAuthn Relying-Party-ID resolution (D-02).
//
// A tiny EXPORTED pure fn (file-acls.ts evaluateAclLevel discipline) so the
// truth table is vitest-covered OFFLINE. The ceremony routes in 323-02 read the
// box's mainDomain (domain/routes.ts:56-63 → `config?.active ? config.domain :
// null`, type string | null) and pass it in; the RP-ID + expectedRPID +
// expectedOrigin all derive from the current request's OWN host.
//
// D-02 / LIVOS-023 — HOST-ONLY (LOCKED default; the #1 human-UAT ratify item):
//   mainDomain === null → null   WebAuthn UNAVAILABLE on a bare-LAN-IP box — an
//                                 RP-ID can never be an IP, and there is no
//                                 secure context (https) on a LAN IP. Fails
//                                 CLOSED: the login page hides the passkey button.
//   otherwise           → the box's OWN host verbatim (NOT a shared '.livinity.io'
//                                 parent). A box can only assert its own host, so
//                                 one tenant can never mint/harvest a passkey
//                                 scoped to a sibling under '.livinity.io'. This
//                                 mirrors LIVOS-023 (Phase 257-04 narrowed the
//                                 LIVINITY_SESSION cookie from '.livinity.io' to
//                                 host-only for the identical multi-tenant
//                                 sibling-leak — see user/routes.ts:249-258).
//
// #1 UAT RATIFY — Option A cross-family portability (flippable one-liner): if the
// operator ratifies letting a passkey roam across the *.livinity.io family, swap
// the return below for:
//   return mainDomain.endsWith('.livinity.io') ? 'livinity.io' : mainDomain
// (a one-line change + a one-time re-enroll). The DEFAULT stays host-only.

export function resolveRpId(mainDomain: string | null): string | null {
	// Fail CLOSED on a bare-LAN-IP box: WebAuthn is unavailable (no RP-ID for an
	// IP, no secure context).
	if (mainDomain === null) return null
	// Host-only (D-02 / LIVOS-023): assert only the box's own host, never a shared
	// '.livinity.io' parent.
	return mainDomain
}
