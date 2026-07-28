'use client';

import {
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Check, Minus } from '@phosphor-icons/react';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  wrapperClassName?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      indeterminate = false,
      className = '',
      wrapperClassName = '',
      disabled,
      ...props
    },
    forwardedRef,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    const control = (
      <span className="relative mt-0.5 inline-flex h-[18px] w-[18px] shrink-0">
        <input
          ref={inputRef}
          type="checkbox"
          disabled={disabled}
          className={`peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
        <span
          aria-hidden="true"
          className="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border border-border bg-white text-white shadow-[inset_0_1px_0_rgba(255,255,255,.8)] transition-[background-color,border-color,box-shadow,transform] duration-200 peer-checked:border-accent peer-checked:bg-accent peer-checked:[&_svg]:scale-100 peer-checked:[&_svg]:opacity-100 peer-focus-visible:ring-4 peer-focus-visible:ring-accent/15 peer-active:scale-90 peer-disabled:opacity-45"
        >
          {indeterminate ? (
            <Minus size={12} weight="bold" />
          ) : (
            <Check
              size={12}
              weight="bold"
              className="scale-75 opacity-0 transition-[opacity,transform] duration-150 peer-checked:scale-100 peer-checked:opacity-100"
            />
          )}
        </span>
      </span>
    );

    if (!label && !description) return control;

    return (
      <label
        className={`flex items-start gap-3 text-sm text-text-secondary ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${wrapperClassName}`}
      >
        {control}
        <span className="min-w-0">
          {label && <span className="block font-medium text-text-primary">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-xs leading-5 text-text-secondary">
              {description}
            </span>
          )}
        </span>
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
