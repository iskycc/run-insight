import { type TextareaHTMLAttributes, forwardRef, useId } from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  wrapperClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      className = '',
      wrapperClassName = '',
      id,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const errorId = error ? `${textareaId}-error` : undefined;
    const descriptionIds = [describedBy, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
        {label && (
          <label htmlFor={textareaId} className="text-xs font-semibold text-text-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={descriptionIds}
          className={`field-control min-h-24 w-full resize-y px-3 py-2.5 text-sm leading-6 placeholder:text-text-secondary/55 ${error ? 'border-danger' : ''} ${className}`}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
