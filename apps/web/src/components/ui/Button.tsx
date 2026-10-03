import React from 'react';
import { cn } from '@claimboard/ui';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 select-none rounded-md text-sm';

    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm active:bg-indigo-700',
      secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700/80 active:bg-zinc-800 border border-zinc-700/60',
      outline: 'border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-800/60 hover:text-white',
      ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
      danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm active:bg-rose-700',
    };

    const sizes = {
      sm: 'h-8 px-2.5 text-xs',
      md: 'h-9 px-3.5 text-sm',
      lg: 'h-10 px-4 text-base',
      icon: 'h-8 w-8 p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin text-current" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
