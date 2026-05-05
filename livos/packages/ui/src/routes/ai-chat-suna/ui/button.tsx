// Local Button for ai-chat-suna module
// Re-exports LivOS Button but adds the shadcn 'icon' size alias -> 'icon-only'
// so Suna-ported code using size="icon" compiles without changes.

import * as React from 'react'
import {Slot} from '@radix-ui/react-slot'
import {cva, type VariantProps} from 'class-variance-authority'
import {cn} from '@/shadcn-lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 gap-2 focus-visible:outline-none shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-surface-1 hover:bg-surface-2 active:bg-surface-base border border-border-default',
        primary:
          'bg-brand hover:bg-brand-lighter text-white',
        destructive:
          'bg-destructive hover:bg-destructive/90 text-white',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 text-sm rounded-md',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9 rounded-md',
        'icon-only': 'h-9 w-9 rounded-md',
      },
    },
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
  ({className, variant, size, asChild = false, ...props}, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({variant, size, className}))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export {Button, buttonVariants}
