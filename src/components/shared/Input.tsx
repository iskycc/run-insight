import { type InputHTMLAttributes, forwardRef, useId } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      className = '',
      type = 'text',
      id,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) => {
    const isSearch = type === 'search';
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;
    const descriptionIds = [describedBy, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {isSearch && (
            <svg
              className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-text-secondary"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="6" cy="6" r="4" />
              <path d="M9.5 9.5L13 13" />
            </svg>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            aria-invalid={error ? true : undefined}
            aria-describedby={descriptionIds}
            className={`field-control h-10 w-full text-sm placeholder:text-text-secondary/50
              ${
                error
                  ? 'border-danger focus:ring-danger/30 focus:border-danger'
                  : ''
              }
              ${isSearch ? 'pl-lg pr-sm' : 'px-sm'}
              ${className}`}
            {...props}
          />
        </div>
        {error && (
          <p id={errorId} className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
