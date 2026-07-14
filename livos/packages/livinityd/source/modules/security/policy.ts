// Phase 328 IDENT-05 — org-wide 2FA enforcement policy, FileStore-backed.
//
// A single boolean flag toggled admin-only. Enforcement is a GRACE-PERIOD signal
// (user.requires2faSetup) — it NEVER hard-blocks login, so flipping the policy on
// can never lock anyone out (recovery codes remain the escape hatch for enrolled
// users; unenrolled users get a post-login enrol redirect, not a lockout).
//
// The org-2FA StoreSchema key (STORE_KEY below) is registered in index.ts by
// Plan 02 (the Security Advisor's `org-2fa-policy-disabled` probe READS it); this
// module WRITES it. Mirrors the monitoring/thresholds.ts FileStore precedent.

import type Livinityd from '../../index.js'

// Dedicated top-level dot-prop key (NEVER nested under an array/scalar — dot-prop
// path collisions silently drop the write, thresholds.ts:26-27). Boolean, default false.
const STORE_KEY = 'security.require2fa'

export async function getRequire2fa(livinityd: Livinityd): Promise<boolean> {
	return Boolean(await livinityd.store.get(STORE_KEY))
}

export async function setRequire2fa(livinityd: Livinityd, value: boolean): Promise<boolean> {
	await livinityd.store.getWriteLock(async ({set}) => {
		await set(STORE_KEY, value)
	})
	return value
}
