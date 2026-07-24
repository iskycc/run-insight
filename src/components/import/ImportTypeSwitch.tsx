'use client';

interface ImportTypeSwitchProps {
  value: 'pre-analysis' | 'post-analysis';
  onChange: (value: 'pre-analysis' | 'post-analysis') => void;
}

export default function ImportTypeSwitch({ value, onChange }: ImportTypeSwitchProps) {
  return (
    <div className="inline-grid w-full grid-cols-2 rounded-md bg-bg p-1 ring-1 ring-border sm:w-auto">
      <button
        onClick={() => onChange('pre-analysis')}
        className={`rounded-sm px-5 py-2.5 text-sm font-medium transition ${
          value === 'pre-analysis'
            ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        分析前
      </button>
      <button
        onClick={() => onChange('post-analysis')}
        className={`rounded-sm px-5 py-2.5 text-sm font-medium transition ${
          value === 'post-analysis'
            ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        分析后
      </button>
    </div>
  );
}
