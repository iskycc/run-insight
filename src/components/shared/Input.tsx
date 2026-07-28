import { type InputHTMLAttributes, forwardRef, useId } from 'react';
import { CalendarBlank, Clock, MagnifyingGlass } from '@phosphor-icons/react';

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
    const isDateLike = type === 'date' || type === 'datetime-local';
    const isTime = type === 'time';
    const renderedType = isDateLike || isTime ? 'text' : type;
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
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              size={17}
              aria-hidden="true"
            />
          )}
          {isDateLike && (
            <CalendarBlank
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
              size={17}
              aria-hidden="true"
            />
          )}
          {isTime && (
            <Clock
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
              size={17}
              aria-hidden="true"
            />
          )}
          <input
            ref={ref}
            id={inputId}
            inputMode={isDateLike || isTime ? 'numeric' : props.inputMode}
            placeholder={
              props.placeholder ??
              (type === 'date'
                ? 'YYYY-MM-DD'
                : type === 'datetime-local'
                  ? 'YYYY-MM-DDTHH:mm'
                  : type === 'time'
                    ? 'HH:mm'
                    : undefined)
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={descriptionIds}
            className={`field-control h-11 w-full text-sm placeholder:text-text-secondary/55
              ${
                error
                  ? 'border-danger focus:ring-danger/30 focus:border-danger'
                  : ''
              }
              ${isSearch ? 'pl-10 pr-3' : isDateLike || isTime ? 'pl-3 pr-10' : 'px-3'}
              ${className}`}
            {...props}
            type={renderedType}
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
