import {Slot} from '@radix-ui/react-slot'
import {cva, type VariantProps} from 'class-variance-authority'
import * as React from 'react'

import './button-styles.css'

import {cn} from '@/shadcn-lib/utils'

const buttonVariants = cva(
	// `bg-clip-padding` to make button bg (especially in progress button) not be clipped by invisible border
	'inline-flex items-center justify-center font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 -tracking-2 leading-inter-trimmed gap-2 focus:outline-none focus:ring-3 shrink-0 disabled:shadow-none duration-200 livinity-button bg-clip-padding',
	{
		variants: {
			variant: {
				default:
					'bg-white/8 active:bg-white/6 hover:bg-white/12 focus:bg-white/12 border border-white/10 ring-white/20 data-[state=open]:bg-white/12 shadow-button-highlight-soft-hpx hover:border-white/20 focus:border-white/20 data-[state=open]:border-white/20',
				primary:
					'bg-brand hover:bg-brand-lighter focus:bg-brand-lighter active:bg-brand ring-brand/40 data-[state=open]:bg-brand-lighter shadow-button-highlight-hpx hover:scale-[1.02] active:scale-[0.98]',
				secondary:
					'bg-white/90 hover:bg-white focus:bg-white active:bg-white/95 ring-white/40 data-[state=open]:bg-white text-black hover:scale-[1.02] active:scale-[0.98]',
				destructive:
					'bg-destructive2 hover:bg-destructive2-lighter focus:bg-destructive2-lighter active:bg-destructive2 ring-destructive/40 data-[state=open]:bg-destructive2-lighter shadow-button-highlight-hpx hover:scale-[1.02] active:scale-[0.98]',
			},
			size: {
				sm: 'rounded-10 h-[28px] px-3 text-12 gap-1.5',
				md: 'rounded-12 h-[34px] min-w-[80px] px-4 text-13',
				'md-squared': 'rounded-12 h-[38px] px-3 text-13 gap-2',
				default: 'rounded-12 h-[34px] px-3.5 text-13',
				'input-short': 'rounded-12 h-10 px-5 text-13 font-semibold min-w-[80px]',
				dialog:
					'rounded-14 h-[44px] md:h-[36px] min-w-[90px] px-5 font-semibold w-full md:w-auto text-14',
				lg: 'rounded-14 h-[44px] px-6 text-15 font-semibold',
				xl: 'rounded-16 h-[52px] px-7 text-15 font-semibold',
				'icon-only': 'rounded-12 h-[34px] w-[34px]',
			},
			text: {
				default: 'text-white',
				destructive: 'text-destructive/90 hover:text-destructive2-lightest focus:text-destructive2-lightest',
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
