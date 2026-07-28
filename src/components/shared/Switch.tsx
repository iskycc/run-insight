'use client';

import type { ReactNode } from 'react';

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className = '',
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`group flex w-full items-start justify-between gap-4 rounded-[14px] border border-border bg-bg/45 p-3 text-left transition-[background-color,border-color,box-shadow] hover:border-accent/20 hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-5 text-text-secondary">{description}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-200 ${
          checked
            ? 'border-accent bg-accent shadow-[0_4px_12px_rgba(17,96,242,.18)]'
            : 'border-border bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[21px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
