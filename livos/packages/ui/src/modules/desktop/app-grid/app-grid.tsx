import {ReactNode, Ref, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {createBreakpoint, useMeasure} from 'react-use'
import {DndContext, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay, useDraggable} from '@dnd-kit/core'

import {tw} from '@/utils/tw'

const useBreakpoint = createBreakpoint({S: 0, M: 640})

// ── Grid dimension hook ──────────────────────────────────

export function useGridDimensions() {
	const breakpoint = useBreakpoint()
	const [gridRef, gridSize] = useMeasure<HTMLDivElement>()

	const responsive = (sizes: [number, number]) => (breakpoint === 'S' ? sizes[0] : sizes[1])

	const appW = responsive([66, 112])
	const appH = responsive([86, 106])
	const appXGap = responsive([12, 20])
	const appYGap = responsive([4, 12])
	const paddingX = responsive([12, 24])
	const paddingY = responsive([8, 16])

	const gridW = gridSize.width
	const gridH = gridSize.height

	const availW = gridW - paddingX * 2
	const availH = gridH - paddingY * 2
	const cols = availW > 0 ? Math.floor((availW + appXGap) / (appW + appXGap)) : 0
	const rows = availH > 0 ? Math.floor((availH + appYGap) / (appH + appYGap)) : 0

	useLayoutEffect(() => {
		const el = document.documentElement
		el.style.setProperty('--app-w', `${appW}px`)
		el.style.setProperty('--app-h', `${appH}px`)
		el.style.setProperty('--app-x-gap', `${appXGap}px`)
		el.style.setProperty('--app-y-gap', `${appYGap}px`)
		el.style.setProperty('--page-w', `${gridW}px`)
		el.style.setProperty('--apps-max-w', `${gridW}px`)
		el.style.setProperty('--apps-padding-x', `${paddingX}px`)
	}, [breakpoint, gridW])

	return {gridRef, cols, rows, paddingX, paddingY, appW, appH, appXGap, appYGap, gridW, gridH, hasMeasurement: gridW > 0 && gridH > 0}
}

// ── Position types ──────────────────────────────────────

export interface GridPos {
	col: number
	row: number
}

export type DesktopLayout = Record<string, GridPos>

// ── Draggable item ──────────────────────────────────────

function DraggableItem({id, col, row, colSpan = 1, rowSpan = 1, children}: {
	id: string; col: number; row: number; colSpan?: number; rowSpan?: number; children: ReactNode
}) {
	const {attributes, listeners, setNodeRef, isDragging} = useDraggable({id})

	return (
		<div
			ref={setNodeRef}
			style={{
				gridColumn: colSpan > 1 ? `${col + 1} / span ${colSpan}` : col + 1,
				gridRow: rowSpan > 1 ? `${row + 1} / span ${rowSpan}` : row + 1,
				zIndex: isDragging ? 50 : undefined,
				opacity: isDragging ? 0.4 : 1,
			}}
			{...attributes}
			{...listeners}
		>
			{children}
		</div>
	)
}

// ── Helpers ──────────────────────────────────────────────

/** Find the first free region (column-major order) that fits colSpan x rowSpan */
function firstFreeCell(occupied: Set<string>, cols: number, rows: number, colSpan = 1, rowSpan = 1): GridPos {
	for (let c = 0; c <= cols - colSpan; c++) {
		for (let r = 0; r <= rows - rowSpan; r++) {
			let fits = true
			for (let dc = 0; dc < colSpan && fits; dc++) {
				for (let dr = 0; dr < rowSpan && fits; dr++) {
					if (occupied.has(`${c + dc},${r + dr}`)) fits = false
				}
			}
			if (fits) return {col: c, row: r}
		}
	}
	// Overflow: put in next column
	return {col: cols, row: 0}
}

/** Build a set of "col,row" strings from a layout, accounting for multi-cell spans */
function occupiedSet(layout: DesktopLayout, spanMap?: Map<string, {colSpan: number; rowSpan: number}>): Set<string> {
	const set = new Set<string>()
	for (const [id, pos] of Object.entries(layout)) {
		const span = spanMap?.get(id) ?? {colSpan: 1, rowSpan: 1}
		for (let c = pos.col; c < pos.col + span.colSpan; c++) {
			for (let r = pos.row; r < pos.row + span.rowSpan; r++) {
				set.add(`${c},${r}`)
			}
		}
	}
	return set
}

/** Clamp positions when grid shrinks, resolve collisions (multi-cell aware) */
export function clampLayout(layout: DesktopLayout, cols: number, rows: number, spanMap?: Map<string, {colSpan: number; rowSpan: number}>): DesktopLayout {
	if (cols <= 0 || rows <= 0) return layout
	const result: DesktopLayout = {}
	const used = new Set<string>()

	for (const [id, pos] of Object.entries(layout)) {
		const span = spanMap?.get(id) ?? {colSpan: 1, rowSpan: 1}
		let c = Math.min(pos.col, Math.max(0, cols - span.colSpan))
		let r = Math.min(pos.row, Math.max(0, rows - span.rowSpan))

		// Check if all cells are free
		let conflict = false
		for (let dc = 0; dc < span.colSpan && !conflict; dc++) {
			for (let dr = 0; dr < span.rowSpan && !conflict; dr++) {
				if (used.has(`${c + dc},${r + dr}`)) conflict = true
			}
		}

		if (conflict) {
			const free = firstFreeCell(used, cols, rows, span.colSpan, span.rowSpan)
			c = free.col
			r = free.row
		}

		// Mark all cells as used
		for (let dc = 0; dc < span.colSpan; dc++) {
			for (let dr = 0; dr < span.rowSpan; dr++) {
				used.add(`${c + dc},${r + dr}`)
			}
		}
		result[id] = {col: c, row: r}
	}
	return result
}

/** Assign positions to items that don't have one yet (multi-cell aware) */
export function ensureAllPositioned(itemIds: string[], layout: DesktopLayout, cols: number, rows: number, spanMap?: Map<string, {colSpan: number; rowSpan: number}>): DesktopLayout {
	const result = {...layout}
	// Remove stale entries
	for (const id of Object.keys(result)) {
		if (!itemIds.includes(id)) delete result[id]
	}
	const used = occupiedSet(result, spanMap)

	for (const id of itemIds) {
		if (!result[id]) {
			const span = spanMap?.get(id) ?? {colSpan: 1, rowSpan: 1}
			const free = firstFreeCell(used, cols, rows, span.colSpan, span.rowSpan)
			result[id] = free
			// Mark all cells
			for (let dc = 0; dc < span.colSpan; dc++) {
				for (let dr = 0; dr < span.rowSpan; dr++) {
					used.add(`${free.col + dc},${free.row + dr}`)
				}
			}
		}
	}
	return result
}

// ── App Grid ──────────────────────────────────────────────

export type AppGridItem = {
	id: string
	node: ReactNode
	colSpan?: number  // defaults to 1
	rowSpan?: number  // defaults to 1
}

export function AppGrid({
	items = [],
	layout,
	onLayoutChange,
}: {
	items?: AppGridItem[]
	layout: DesktopLayout
	onLayoutChange: (layout: DesktopLayout) => void
}) {
	const {gridRef, cols, rows, paddingX, paddingY, appW, appH, appXGap, appYGap} = useGridDimensions()
	const gridElRef = useRef<HTMLDivElement>(null)
	const prevDims = useRef({cols: 0, rows: 0})
	const [activeId, setActiveId] = useState<string | null>(null)

	const sensors = useSensors(
		useSensor(PointerSensor, {activationConstraint: {distance: 8}}),
	)

	// Build span lookup from items
	const spanMap = useMemo(() => {
		const m = new Map<string, {colSpan: number; rowSpan: number}>()
		for (const item of items) {
			m.set(item.id, {colSpan: item.colSpan ?? 1, rowSpan: item.rowSpan ?? 1})
		}
		return m
	}, [items])

	// Ensure all items have positions + clamp on resize
	const resolvedLayout = useMemo(() => {
		if (cols <= 0 || rows <= 0) return layout
		const itemIds = items.map((i) => i.id)
		const positioned = ensureAllPositioned(itemIds, layout, cols, rows, spanMap)
		return clampLayout(positioned, cols, rows, spanMap)
	}, [items, layout, cols, rows, spanMap])

	// Persist layout changes when items added or grid resized
	useEffect(() => {
		if (cols <= 0 || rows <= 0) return
		if (JSON.stringify(resolvedLayout) !== JSON.stringify(layout)) {
			onLayoutChange(resolvedLayout)
		}
	}, [resolvedLayout]) // intentionally minimal deps to avoid loops

	// Track resize for clamping
	useEffect(() => {
		if (cols <= 0 || rows <= 0) return
		if (cols !== prevDims.current.cols || rows !== prevDims.current.rows) {
			prevDims.current = {cols, rows}
		}
	}, [cols, rows])

	const cellFromPoint = useCallback((clientX: number, clientY: number): GridPos | null => {
		const el = gridElRef.current
		if (!el || cols <= 0 || rows <= 0) return null
		const rect = el.getBoundingClientRect()
		const x = clientX - rect.left - paddingX
		const y = clientY - rect.top - paddingY
		const col = Math.floor(x / (appW + appXGap))
		const row = Math.floor(y / (appH + appYGap))
		if (col < 0 || col >= cols || row < 0 || row >= rows) return null
		return {col, row}
	}, [cols, rows, paddingX, paddingY, appW, appH, appXGap, appYGap])

	const handleDragStart = useCallback((event: DragStartEvent) => {
		setActiveId(event.active.id as string)
	}, [])

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		setActiveId(null)
		const {active, activatorEvent} = event
		const id = active.id as string
		const delta = event.delta

		// Calculate where the item was dropped
		const origEvent = activatorEvent as PointerEvent
		if (!origEvent) return
		const dropX = origEvent.clientX + delta.x
		const dropY = origEvent.clientY + delta.y
		const target = cellFromPoint(dropX, dropY)
		if (!target) return

		const currentPos = resolvedLayout[id]
		if (currentPos && currentPos.col === target.col && currentPos.row === target.row) return

		const draggedSpan = spanMap.get(id) ?? {colSpan: 1, rowSpan: 1}
		const isMultiCell = draggedSpan.colSpan > 1 || draggedSpan.rowSpan > 1

		// Clamp target so the multi-cell item stays within grid bounds
		const clampedCol = Math.min(target.col, Math.max(0, cols - draggedSpan.colSpan))
		const clampedRow = Math.min(target.row, Math.max(0, rows - draggedSpan.rowSpan))

		if (isMultiCell) {
			// For multi-cell items: check ALL target cells — reject if any occupied by another item
			for (let dc = 0; dc < draggedSpan.colSpan; dc++) {
				for (let dr = 0; dr < draggedSpan.rowSpan; dr++) {
					const cellKey = `${clampedCol + dc},${clampedRow + dr}`
					// Check if this cell is occupied by another item
					for (const [otherId, otherPos] of Object.entries(resolvedLayout)) {
						if (otherId === id) continue
						const otherSpan = spanMap.get(otherId) ?? {colSpan: 1, rowSpan: 1}
						for (let oc = 0; oc < otherSpan.colSpan; oc++) {
							for (let or_ = 0; or_ < otherSpan.rowSpan; or_++) {
								if (`${otherPos.col + oc},${otherPos.row + or_}` === cellKey) return // reject drop
							}
						}
					}
				}
			}
			const newLayout = {...resolvedLayout}
			newLayout[id] = {col: clampedCol, row: clampedRow}
			onLayoutChange(newLayout)
		} else {
			// Single-cell items: keep existing swap behavior
			const occupantId = Object.entries(resolvedLayout).find(
				([otherId, pos]) => {
					if (otherId === id) return false
					const otherSpan = spanMap.get(otherId) ?? {colSpan: 1, rowSpan: 1}
					// Check if target cell falls within another item's span
					return target.col >= pos.col && target.col < pos.col + otherSpan.colSpan
						&& target.row >= pos.row && target.row < pos.row + otherSpan.rowSpan
				}
			)?.[0]

			const newLayout = {...resolvedLayout}
			if (occupantId && currentPos) {
				const otherSpan = spanMap.get(occupantId) ?? {colSpan: 1, rowSpan: 1}
				if (otherSpan.colSpan > 1 || otherSpan.rowSpan > 1) {
					// Can't swap with a multi-cell item — reject
					return
				}
				// Swap positions (both single-cell)
				newLayout[occupantId] = {col: currentPos.col, row: currentPos.row}
			}
			newLayout[id] = target
			onLayoutChange(newLayout)
		}
	}, [resolvedLayout, onLayoutChange, cellFromPoint, spanMap, cols, rows])

	const handleDragCancel = useCallback(() => setActiveId(null), [])

	const activeItem = activeId ? items.find((i) => i.id === activeId) : null

	// Sort items by layout position (column-major) for consistent rendering order
	const sortedItems = useMemo(() => {
		return [...items].sort((a, b) => {
			const pa = resolvedLayout[a.id]
			const pb = resolvedLayout[b.id]
			if (!pa || !pb) return 0
			if (pa.col !== pb.col) return pa.col - pb.col
			return pa.row - pb.row
		})
	}, [items, resolvedLayout])

	return (
		<div ref={gridRef as Ref<HTMLDivElement>} className={gridWrapperClass}>
			<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
				<div
					ref={gridElRef}
					className={gridClass}
					style={{
						gridTemplateColumns: cols > 0 ? `repeat(${cols}, var(--app-w))` : 'none',
						gridTemplateRows: rows > 0 ? `repeat(${rows}, var(--app-h))` : 'none',
						paddingLeft: paddingX,
						paddingRight: paddingX,
						paddingTop: paddingY,
						paddingBottom: paddingY,
					}}
				>
					{sortedItems.map((item) => {
						const pos = resolvedLayout[item.id]
						if (!pos) return null
						const span = spanMap.get(item.id)
						return (
							<DraggableItem key={item.id} id={item.id} col={pos.col} row={pos.row} colSpan={span?.colSpan} rowSpan={span?.rowSpan}>
								{item.node}
							</DraggableItem>
						)
					})}
				</div>
				<DragOverlay dropAnimation={null}>
					{activeItem ? (
						<div style={{
							width: (activeItem.colSpan ?? 1) > 1
								? `calc(var(--app-w) * ${activeItem.colSpan} + var(--app-x-gap) * ${(activeItem.colSpan ?? 1) - 1})`
								: 'var(--app-w)',
							height: (activeItem.rowSpan ?? 1) > 1
								? `calc(var(--app-h) * ${activeItem.rowSpan} + var(--app-y-gap) * ${(activeItem.rowSpan ?? 1) - 1})`
								: 'var(--app-h)',
							pointerEvents: 'none',
							opacity: 0.9,
						}}>
							{activeItem.node}
						</div>
					) : null}
				</DragOverlay>
			</DndContext>
		</div>
	)
}

const gridWrapperClass = tw`
	h-full
	w-full
	overflow-y-auto
	overflow-x-hidden
	livinity-hide-scrollbar
`

const gridClass = tw`
	grid
	content-start
	gap-x-[var(--app-x-gap)]
	gap-y-[var(--app-y-gap)]
`

// Keep PageInner export for anything that still imports it
export function PageInner({children, innerRef}: {children?: ReactNode; innerRef?: React.Ref<HTMLDivElement>}) {
	return (
		<div className='flex h-full w-full items-stretch justify-center pt-2'>
			<div ref={innerRef} className='flex w-full flex-col content-start items-center gap-y-[var(--app-y-gap)]'>
				{children}
			</div>
		</div>
	)
}
