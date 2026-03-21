import {useState, useEffect, useRef, useCallback} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {WidgetContainer} from './widget-container'

export function QuickNotesWidget({widgetId}: {widgetId: string}) {
	const prefKey = `widget-notes-${widgetId}`

	const [text, setText] = useState<string>(() => {
		try { return localStorage.getItem(prefKey) ?? '' } catch { return '' }
	})

	const serverSynced = useRef(false)
	const prefsQ = trpcReact.preferences.get.useQuery({keys: [prefKey]}, {retry: false})
	const setPref = trpcReact.preferences.set.useMutation()

	useEffect(() => {
		if (prefsQ.data && !serverSynced.current) {
			serverSynced.current = true
			const remote = prefsQ.data[prefKey]
			if (typeof remote === 'string' && remote.length > 0) {
				setText(remote)
				try { localStorage.setItem(prefKey, remote) } catch {}
			}
		}
	}, [prefsQ.data, prefKey])

	const debounceRef = useRef<ReturnType<typeof setTimeout>>()

	const handleChange = useCallback((value: string) => {
		setText(value)
		try { localStorage.setItem(prefKey, value) } catch {}
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(() => setPref.mutate({key: prefKey, value}), 1000)
	}, [prefKey, setPref])

	useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

	const lines = text.split('\n').length
	const chars = text.length

	return (
		<WidgetContainer>
			<div className='flex items-center justify-between px-4 pt-3 pb-1'>
				<span className='text-[11px] font-bold uppercase tracking-wider text-gray-400'>Notes</span>
				<span className='text-[9px] tabular-nums text-gray-300'>{chars > 0 ? `${lines}L / ${chars}C` : ''}</span>
			</div>
			<textarea
				className='w-full flex-1 resize-none bg-transparent px-4 pb-3 pt-1 text-[13px] leading-[1.7] text-gray-700 placeholder:text-gray-300/80 focus:outline-none'
				placeholder='Write something...'
				value={text}
				onChange={(e) => handleChange(e.target.value)}
				onPointerDown={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
			/>
		</WidgetContainer>
	)
}
