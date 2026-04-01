import {ViewerWrapper} from '@/features/files/components/file-viewer/viewer-wrapper'
import {FileSystemItem} from '@/features/files/types'

interface ImageViewerProps {
	item: FileSystemItem
}

export default function ImageViewer({item}: ImageViewerProps) {
	const previewUrl = `/api/files/view?path=${encodeURIComponent(item.path)}`

	return (
		<ViewerWrapper>
			<img
				src={previewUrl}
				alt={item.name}
				className='max-h-[80svh] max-w-[calc(100vw-24px)] rounded-lg object-contain md:max-h-[80%] md:max-w-[90%]'
			/>
		</ViewerWrapper>
	)
}
