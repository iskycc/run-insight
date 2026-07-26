import { type SelectHTMLAttributes, forwardRef } from 'react';
import { CaretDown } from '@phosphor-icons/react';

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectOption[];
  label?: string;
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, label, placeholder, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-semibold text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`field-control h-11 w-full appearance-none px-3 pr-9 text-sm
              ${className}`}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <CaretDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
            size={14}
            weight="bold"
            aria-hidden="true"
          />
        </div>
      </div>
    );
  },
);

Select.displayName = 'Select';
