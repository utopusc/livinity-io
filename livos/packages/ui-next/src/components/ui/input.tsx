'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-white px-3 text-body text-text',
          'placeholder:text-text-tertiary',
          'transition-colors duration-fast',
          'focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50',
          error
            ? 'border-error focus:ring-error/25 focus:border-error'
            : 'border-border hover:border-border-emphasis',
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
export { Input, type InputProps };
