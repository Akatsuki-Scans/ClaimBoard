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
      'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-40 select-none rounded-lg text-xs';

    const variants = {
      primary:
        'bg-zinc-100 text-zinc-950 hover:bg-white active:bg-zinc-200 border border-zinc-200 shadow-sm font-medium',
      secondary:
        'bg-zinc-900 text-zinc-200 hover:bg-zinc-800/90 active:bg-zinc-800 border border-zinc-800 text-zinc-200',
      outline:
        'border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-800/50 hover:text-zinc-100 active:bg-zinc-800',
      ghost:
        'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40 active:bg-zinc-800/60',
      danger:
        'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 active:bg-rose-500/30 border border-rose-500/30 shadow-sm',
    };

    const sizes = {
      sm: 'h-8 px-2.5 text-xs gap-1.5',
      md: 'h-9 px-3.5 text-xs gap-2',
      lg: 'h-10 px-4 text-sm gap-2',
      icon: 'h-8 w-8 p-0',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-current shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
