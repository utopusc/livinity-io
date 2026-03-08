import {TbCopy, TbFileExport, TbProgress} from 'react-icons/tb'

import {CircularProgress} from '@/features/files/components/shared/circular-progress'
import {t} from '@/utils/i18n'
import {formatNumberI18n} from '@/utils/number'

export function MinimizedContent({
	progress,
	count,
	eta,
	type,
}: {
	progress: number
	count: number
	eta: string
	type: 'copy' | 'move' | 'mixed'
}) {
	return (
		<div className='flex h-full w-full items-center gap-2.5 px-2.5'>
			<CircularProgress progress={progress}>
				{type === 'copy' && <TbCopy className='h-3 w-3 text-neutral-500' strokeWidth={2.5} />}
				{type === 'move' && <TbFileExport className='h-3 w-3 text-neutral-500' strokeWidth={2.5} />}
				{type === 'mixed' && <TbProgress className='h-3 w-3 text-neutral-500' strokeWidth={2.5} />}
			</CircularProgress>
			<div className='min-w-0 flex-1'>
				<span className='block truncate text-center text-[12px] font-medium text-neutral-700'>
					{t('files-listing.item-count', {formattedCount: formatNumberI18n({n: count, showDecimals: false}), count})}
				</span>
			</div>
			<div className='flex flex-shrink-0 items-center gap-2'>
				<span className='text-[11px] font-medium text-neutral-400'>{eta}</span>
			</div>
		</div>
	)
}
