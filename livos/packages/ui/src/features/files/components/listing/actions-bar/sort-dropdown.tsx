import {TbArrowsSort, TbChevronDown, TbChevronUp} from 'react-icons/tb'

import {SORT_BY_OPTIONS} from '@/features/files/constants'
import {usePreferences} from '@/features/files/hooks/use-preferences'
import {Button} from '@/shadcn-components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/shadcn-components/ui/dropdown-menu'
import {t} from '@/utils/i18n'

export function SortDropdown() {
	const {preferences, setSortBy} = usePreferences()

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant='default'
					size='default'
					className='h-8 w-8 rounded-xl text-neutral-400 hover:bg-neutral-100/80 hover:text-neutral-600 transition-all duration-200'
				>
					<TbArrowsSort className='h-[15px] w-[15px]' strokeWidth={2.5} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-28 rounded-xl p-1'>
				<span className='block px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400'>Sort by</span>
				{SORT_BY_OPTIONS.map((option) => (
					<DropdownMenuItem
						key={option.sortBy}
						onClick={() => setSortBy(option.sortBy)}
						className='flex items-center justify-between rounded-lg text-[13px]'
					>
						{t(option.labelTKey)}
						{option.sortBy === preferences?.sortBy && (
							<>
								{preferences.sortOrder === 'ascending' ? (
									<TbChevronUp className='h-3.5 w-3.5 text-neutral-500' strokeWidth={2.5} />
								) : (
									<TbChevronDown className='h-3.5 w-3.5 text-neutral-500' strokeWidth={2.5} />
								)}
							</>
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
