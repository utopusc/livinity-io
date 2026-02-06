import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'

import {cn} from '@/shadcn-lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({className, ...props}, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn(
			'bg-surface-base text-text-secondary inline-flex h-10 items-center justify-center rounded-radius-sm p-1',
			className,
		)}
		{...props}
	/>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({className, ...props}, ref) => (
	<TabsPrimitive.Trigger
		ref={ref}
		className={cn(
			'data-[state=active]:bg-surface-2 data-[state=active]:text-text-primary inline-flex items-center justify-center whitespace-nowrap rounded-radius-sm px-3 py-1.5 text-body-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-elevation-sm',
			className,
		)}
		{...props}
	/>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({className, ...props}, ref) => (
	<TabsPrimitive.Content
		ref={ref}
		className={cn(
			'mt-2 focus-visible:outline-none',
			className,
		)}
		{...props}
	/>
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export {Tabs, TabsList, TabsTrigger, TabsContent}
