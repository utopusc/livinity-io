// Phase 352-01 (VMAPP-01) — admin-gated, cadence-aware VM list hook.
// Composes:
//   • useCurrentUser().isAdmin (single-user legacy mode is treated as admin)
//   • enabled: isAdmin — a non-admin browser never fires vm.list against the
//     adminProcedure (T-352-01 mitigation; UX-only gate, server enforces).
//   • conditional refetchInterval — polls at 2s ONLY while some VM is in a
//     transitional state (creating/installing-os), else stops (the apps.tsx
//     AppsProvider cadence idiom).
import {useCurrentUser} from '@/hooks/use-current-user'
import {trpcReact} from '@/trpc/trpc'

export function useVmList() {
	const {isAdmin, isLoading: userLoading} = useCurrentUser()
	const vmQ = trpcReact.vm.list.useQuery(undefined, {
		enabled: isAdmin,
		refetchInterval: (query) => {
			const data = query.state.data
			const transitional =
				Array.isArray(data) && data.some((v) => v.state === 'creating' || v.state === 'installing-os')
			return transitional ? 2000 : false
		},
	})
	return {
		isAdmin,
		isLoading: userLoading || (isAdmin && vmQ.isLoading),
		vms: vmQ.data ?? [],
		error: vmQ.error,
	}
}
