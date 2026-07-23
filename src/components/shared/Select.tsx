import { type SelectHTMLAttributes, forwardRef } from 'react';

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
      <div className="flex flex-col gap-xs">
        {label && (
          <label className="text-sm text-text-secondary font-medium">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`w-full appearance-none px-sm py-sm pr-lg border border-border rounded-md
              bg-surface-solid text-text-primary text-sm
              focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
              disabled:opacity-50 disabled:cursor-not-allowed
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
          {/* Dropdown arrow */}
          <svg
            className="pointer-events-none absolute right-sm top-1/2 -translate-y-1/2 text-text-secondary"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </div>
      </div>
    );
  },
);

Select.displayName = 'Select';
