// Phase 95-03 — shadcn `resizable` copy-paste, adapted for the LivOS
// `cn` import path (shadcn ships with `@/lib/utils`; this repo uses
// `@/shadcn-lib/utils`).
//
// Source: https://ui.shadcn.com/docs/components/resizable — react-resizable-panels
// wrapper. Three exports: ResizablePanelGroup, ResizablePanel, ResizableHandle.
// `withHandle` renders a small grip indicator centered on the divider.

import {GripVertical} from 'lucide-react'
import * as ResizablePrimitive from 'react-resizable-panels'

import {cn} from '@/shadcn-lib/utils'

const ResizablePanelGroup = ({
	className,
	...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
	<ResizablePrimitive.PanelGroup
		className={cn(
			'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
			className,
		)}
		{...props}
	/>
)

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
	withHandle,
	className,
	...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
	withHandle?: boolean
}) => (
	<ResizablePrimitive.PanelResizeHandle
		className={cn(
			'relative flex w-px items-center justify-center bg-border-default after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/50 focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 [&[data-panel-group-direction=vertical]>div]:rotate-90',
			className,
		)}
		{...props}
	>
		{withHandle && (
			<div className='z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border-default bg-surface-1'>
				<GripVertical className='h-2.5 w-2.5 text-text-tertiary' />
			</div>
		)}
	</ResizablePrimitive.PanelResizeHandle>
)

export {ResizablePanelGroup, ResizablePanel, ResizableHandle}
