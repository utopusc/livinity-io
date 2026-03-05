'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-light active:bg-brand-dark shadow-sm',
  secondary:
    'bg-neutral-100 text-text hover:bg-neutral-200 active:bg-neutral-300 border border-border',
  ghost:
    'text-text-secondary hover:text-text hover:bg-neutral-100 active:bg-neutral-200',
  destructive:
    'bg-error text-white hover:brightness-110 active:brightness-90 shadow-sm',
  outline:
    'border border-border-emphasis text-text bg-white hover:bg-neutral-50 active:bg-neutral-100',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption gap-1.5 rounded-md',
  md: 'h-9 px-4 text-body gap-2 rounded-lg',
  lg: 'h-11 px-6 text-body-lg gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium transition-all duration-fast',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          'disabled:opacity-50 disabled:pointer-events-none',
          'cursor-pointer select-none',
          variants[variant],
          sizes[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
export { Button, type ButtonProps };
