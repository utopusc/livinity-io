import {trpcReact} from '@/trpc/trpc'

export function useIsLivinityHome() {
	// NOTE: tRPC endpoint name kept as-is (backend API)
	const isLivinityHomeQ = trpcReact.migration.isLivinityHome.useQuery()
	const isLivinityHome = !!isLivinityHomeQ.data
	return {
		isLivinityHome,
		isLoading: isLivinityHomeQ.isLoading,
	}
}
