import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

function formatBytes(bytes: number): string {
	const gb = bytes / 1024 / 1024 / 1024
	if (gb >= 1) return `${gb.toFixed(2)} GB`
	const mb = bytes / 1024 / 1024
	if (mb >= 1) return `${mb.toFixed(1)} MB`
	return `${(bytes / 1024).toFixed(0)} KB`
}

export function useImages() {
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const imagesQuery = trpcReact.docker.listImages.useQuery(undefined, {
		retry: false,
		refetchInterval: 10000,
	})

	const removeMutation = trpcReact.docker.removeImage.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			imagesQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const pruneMutation = trpcReact.docker.pruneImages.useMutation({
		onSuccess: (data) => {
			const spaceText = formatBytes(data.spaceReclaimed)
			const countText = data.deletedCount === 1 ? '1 image' : `${data.deletedCount} images`
			setActionResult({type: 'success', message: `Pruned ${countText}, reclaimed ${spaceText}`})
			imagesQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const removeImage = (id: string, force?: boolean) => {
		setActionResult(null)
		removeMutation.mutate({id, force: force ?? false})
	}

	const pruneImages = () => {
		setActionResult(null)
		pruneMutation.mutate()
	}

	const images = imagesQuery.data ?? []
	const totalSize = images.reduce((sum, img) => sum + img.size, 0)
	const totalCount = images.length

	return {
		images,
		isLoading: imagesQuery.isLoading,
		isError: imagesQuery.isError,
		error: imagesQuery.error,
		isFetching: imagesQuery.isFetching,
		refetch: imagesQuery.refetch,
		removeImage,
		isRemoving: removeMutation.isPending,
		pruneImages,
		isPruning: pruneMutation.isPending,
		actionResult,
		totalSize,
		totalCount,
	}
}

export {formatBytes}
