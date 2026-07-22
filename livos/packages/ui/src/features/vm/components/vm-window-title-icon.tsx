// Phase 356 (VMWIN-01) — render-time per-OS glyph for a LIVINITY_vm screen
// window's chrome. Derived from the SAME already-cached vm.list query (dock.tsx
// / use-vm-list.ts share the query key via react-query — no extra network cost).
// NEVER persisted: WindowsContainer computes this ReactNode at render time and
// passes it as `titleIcon` (a ReactNode cannot round-trip through the pinned-
// window Postgres icon:string field). A deleted/stale VM → renders nothing.
import {trpcReact} from '@/trpc/trpc'

import {OsIcon} from './os-icon'

export function VmWindowTitleIcon({vmId}: {vmId?: string}) {
	const {data: vms} = trpcReact.vm.list.useQuery(undefined, {enabled: !!vmId, retry: false})
	const vm = vmId ? vms?.find((v) => v.id === vmId) : undefined
	// Missing-vm graceful (356 failure-honesty): deleted while the window is
	// open, or a stale/tampered route id — render nothing, never crash.
	if (!vm) return null
	return <OsIcon kind={vm.kind} className='h-4 w-4 text-neutral-500 dark:text-neutral-400' />
}
