import {Slot} from '@radix-ui/react-slot'
import {cva, type VariantProps} from 'class-variance-authority'
import * as React from 'react'

import './button-styles.css'

import {cn} from '@/shadcn-lib/utils'

const buttonVariants = cva(
	// `bg-clip-padding` to make button bg (especially in progress button) not be clipped by invisible border
	'inline-flex items-center justify-center font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 -tracking-2 gap-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/20 shrink-0 disabled:shadow-none duration-200 livinity-button bg-clip-padding',
	{
		variants: {
			variant: {
				default:
					'bg-surface-1 hover:bg-surface-2 active:bg-surface-base border border-border-default ring-brand/20 data-[state=open]:bg-surface-2 hover:border-border-emphasis focus-visible:border-border-emphasis data-[state=open]:border-border-emphasis shadow-button-highlight-soft',
				primary:
					'bg-brand hover:bg-brand-lighter focus-visible:bg-brand-lighter active:bg-brand ring-brand/40 data-[state=open]:bg-brand-lighter shadow-button-highlight-hpx hover:scale-[1.02] active:scale-[0.98] text-white',
				secondary:
					'bg-slate-900 hover:bg-slate-800 focus-visible:bg-slate-800 active:bg-slate-900 ring-slate-900/40 data-[state=open]:bg-slate-800 text-white hover:scale-[1.02] active:scale-[0.98]',
				destructive:
					'bg-destructive2 hover:bg-destructive2-lighter focus-visible:bg-destructive2-lighter active:bg-destructive2 ring-destructive/40 data-[state=open]:bg-destructive2-lighter shadow-button-highlight-hpx hover:scale-[1.02] active:scale-[0.98] text-white',
				ghost: 'hover:bg-surface-1 active:bg-surface-base border border-transparent hover:border-border-subtle ring-brand/20',
				// Liv Design System v1 (Phase 66 / DESIGN-07) — cyan-accent primary surface for Liv-branded callouts.
				// References Plan 66-01 token --liv-accent-cyan and inlines the .liv-glow-cyan utility on hover.
				'liv-primary':
					'bg-[color:var(--liv-accent-cyan)] text-[#050b14] ring-[color:var(--liv-accent-cyan)]/40 active:bg-[#3bbac9] data-[state=open]:bg-[#3bbac9] hover:scale-[1.02] active:scale-[0.98] hover:shadow-[0_0_24px_rgba(77,208,225,0.2),inset_0_1px_0_rgba(77,208,225,0.1)] transition-all duration-[var(--liv-dur-fast)]',
			},
			size: {
				sm: 'rounded-radius-sm h-[44px] md:h-[30px] px-3 text-caption gap-1.5',
				md: 'rounded-radius-md h-[44px] md:h-[36px] min-w-[80px] px-4 text-body-sm',
				'md-squared': 'rounded-radius-md h-[38px] px-3 text-body-sm gap-2',
				default: 'rounded-radius-md h-[44px] md:h-[36px] px-3.5 text-body-sm',
				'input-short': 'rounded-radius-md h-10 px-5 text-body-sm font-semibold min-w-[80px]',
				dialog:
					'rounded-radius-md h-[44px] md:h-[36px] min-w-[90px] px-5 font-semibold w-full md:w-auto text-body',
				lg: 'rounded-radius-md h-[44px] px-6 text-body-lg font-semibold',
				xl: 'rounded-radius-lg h-[52px] px-7 text-body-lg font-semibold',
				'icon-only': 'rounded-radius-md h-[44px] w-[44px] md:h-[34px] md:w-[34px]',
			},
			text: {
				default: 'text-text-primary',
				destructive: 'text-destructive/90 hover:text-destructive2-lightest focus-visible:text-destructive2-lightest',
			},
		},
		compoundVariants: [
			{
				variant: 'primary',
				size: 'lg',
				class: 'shadow-button-highlight',
			},
		],
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({className, variant, size, text, asChild = false, children, ...props}, ref) => {
		const Comp = asChild ? Slot : 'button'

		// No children for icon-only buttons
		const children2 = size === 'icon-only' ? null : children

		// Prevents ordinary buttons in forms from submitting it
		const extraPropsIfButton = Comp === 'button' ? {...props, type: props.type ?? 'button'} : props

		return (
			<Comp className={cn(buttonVariants({variant, size, text, className}))} ref={ref} {...extraPropsIfButton}>
				{children2}
			</Comp>
		)
	},
)
Button.displayName = 'Button'

export {Button, buttonVariants}
