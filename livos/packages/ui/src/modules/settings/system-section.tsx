/**
 * Phase 246-05 Task 3 — Settings → System section.
 *
 * Hosts the v44 "Active terminals" admin panel. The panel self-gates via
 * `useTerminalPanelEnabled()` so when the v43 feature flag
 * (`livos:v43:terminal_panel`) is OFF the section is effectively empty —
 * mirrors the dock entry gate (Phase 243-03 `dock.tsx`) so flipping the
 * flag cleanly removes the v44 admin surface alongside its UI counterpart.
 *
 * Lives inside Settings → System surface. Future v44/v45 system-level admin
 * affordances (per-user session scoping, retention policy controls, etc.)
 * land here too — keep additive, match the v36 monochrome aesthetic used by
 * the rest of the Settings shell.
 *
 * Mounted from `routes/settings/_components/settings-content.tsx` inside the
 * existing `SectionContent` switch (the "system" group already exists; this
 * section is a new sub-component that can be embedded under any of the
 * system-group routes — for v44 we attach it under Troubleshoot's Diagnostics
 * panel as a new card, keeping the URL-launcher rule (LivOS = window logic)
 * intact: no new <Route>, no <Navigate>.
 *
 * D-V44-SACRED: this module does NOT touch sdk-agent-runner.ts.
 */

import {ActiveTerminalsPanel} from '@/features/v44-admin-terminals/ActiveTerminalsPanel'

export function SystemSection() {
	return (
		<div className='flex flex-col gap-6'>
			<ActiveTerminalsPanel />
		</div>
	)
}
