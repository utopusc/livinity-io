// Phase 328 SEC-02 — Security Advisor admin tRPC surface.
//
// getAdvisorReport (query)  — fast read: live weak-config findings + CACHED
//   Trivy per-image summaries. NEVER runs a fresh Trivy scan in the read path
//   (getCachedScan only), so opening the Advisor tab is cheap.
// runAdvisorScanNow (mutation) — on-demand heavy pass: real Trivy (force:false,
//   so it still reuses the 7-day cache) + weak-config. Auto-audited by the Plan
//   01 adminProcedure audit middleware (it is a mutation on adminProcedure).
//
// Both are adminProcedure (requireRole('admin') server-side) — the whole advisor
// surface is admin-only (T-328-07); any UI gate is convenience only.

import {adminProcedure, router} from '../server/trpc/trpc.js'
import {getCachedScan} from '../docker/vuln-scan.js'
import {runWeakConfigChecks, WEAK_PASSWORD_NOTE_KEY} from './weak-config-checks.js'
import {listLocalAppImages, runSecurityAdvisorScan} from './scheduler-job.js'

export default router({
	getAdvisorReport: adminProcedure.query(async ({ctx}) => {
		const weakConfig = await runWeakConfigChecks(ctx.livinityd!)
		const images: unknown[] = []
		for (const ref of await listLocalAppImages()) {
			try {
				const c = await getCachedScan(ref)
				images.push(
					c
						? {imageRef: ref, counts: c.counts, scannedAt: c.scannedAt, scanned: true}
						: {imageRef: ref, scanned: false},
				)
			} catch (e) {
				images.push({imageRef: ref, error: String(e)})
			}
		}
		return {weakConfig, images, weakPasswordNote: WEAK_PASSWORD_NOTE_KEY, generatedAt: Date.now()}
	}),
	runAdvisorScanNow: adminProcedure.mutation(async ({ctx}) => runSecurityAdvisorScan(ctx.livinityd!, ctx.logger!)),
})
