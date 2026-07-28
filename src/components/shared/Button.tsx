import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { CircleNotch } from '@phosphor-icons/react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[0_4px_14px_rgba(17,96,242,0.16)] hover:bg-accent-hover focus:ring-accent/30',
  secondary:
    'bg-bg text-text-primary border border-border hover:bg-surface-solid hover:border-accent/25 focus:ring-accent/30',
  danger:
    'bg-danger text-white shadow-sm hover:bg-danger/90 focus:ring-danger/30',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    className = '',
    disabled,
    loading = false,
    loadingLabel,
    children,
    ...props
  }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-medium
          transition-[background-color,border-color,box-shadow,transform] focus:outline-none focus:ring-2
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed
          disabled:active:scale-100
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {loading && <CircleNotch className="motion-spin" size={16} aria-hidden="true" />}
        {loading && loadingLabel ? loadingLabel : children}
      </button>
    );
  },
);

Button.displayName = 'Button';
