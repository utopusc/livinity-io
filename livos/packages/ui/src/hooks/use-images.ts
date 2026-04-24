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

	const pullMutation = trpcReact.docker.pullImage.useMutation({
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

	const tagMutation = trpcReact.docker.tagImage.useMutation({
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

	// Phase 19 — Vulnerability scan (CGV-02/03/04)
	const scanMutation = trpcReact.docker.scanImage.useMutation({
		onSuccess: (data) => {
			const total = data.counts.CRITICAL + data.counts.HIGH + data.counts.MEDIUM + data.counts.LOW
			setActionResult({
				type: 'success',
				message: data.cached
					? `Cached scan for ${data.imageRef}: ${total} CVEs`
					: `Scanned ${data.imageRef}: ${total} CVEs found`,
			})
			setTimeout(() => setActionResult(null), 4000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 6000)
		},
	})

	const removeImage = (id: string, force?: boolean) => {
		setActionResult(null)
		removeMutation.mutate({id, force: force ?? false})
	}

	const pullImage = (image: string) => {
		setActionResult(null)
		pullMutation.mutate({image})
	}

	const tagImage = (id: string, repo: string, tag: string) => {
		setActionResult(null)
		tagMutation.mutate({id, repo, tag})
	}

	const pruneImages = () => {
		setActionResult(null)
		pruneMutation.mutate()
	}

	const scanImage = (imageRef: string, force?: boolean) => {
		setActionResult(null)
		scanMutation.mutate({imageRef, force: force ?? false})
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
		pullImage,
		isPulling: pullMutation.isPending,
		tagImage,
		isTagging: tagMutation.isPending,
		pruneImages,
		isPruning: pruneMutation.isPending,
		scanImage,
		isScanning: scanMutation.isPending,
		scanResult: scanMutation.data ?? null,
		scanError: scanMutation.error,
		actionResult,
		totalSize,
		totalCount,
	}
}

export {formatBytes}
