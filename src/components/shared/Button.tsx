import { type ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover focus:ring-accent/30',
  secondary:
    'bg-bg text-text-primary border border-border hover:bg-surface-solid focus:ring-accent/30',
  danger:
    'bg-danger text-white hover:bg-danger/90 focus:ring-danger/30',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-sm py-xs text-xs',
  md: 'px-md py-sm text-sm',
  lg: 'px-lg py-sm text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center font-medium rounded-md
          transition-colors focus:outline-none focus:ring-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
