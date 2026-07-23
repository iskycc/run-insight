'use client';

interface ImportTypeSwitchProps {
  value: 'pre-analysis' | 'post-analysis';
  onChange: (value: 'pre-analysis' | 'post-analysis') => void;
}

export default function ImportTypeSwitch({ value, onChange }: ImportTypeSwitchProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange('pre-analysis')}
        className={`rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors ${
          value === 'pre-analysis'
            ? 'bg-[var(--color-accent)] text-white'
            : 'border border-[var(--color-border)] bg-[var(--color-surface-solid)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]'
        }`}
      >
        分析前
      </button>
      <button
        onClick={() => onChange('post-analysis')}
        className={`rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition-colors ${
          value === 'post-analysis'
            ? 'bg-[var(--color-accent)] text-white'
            : 'border border-[var(--color-border)] bg-[var(--color-surface-solid)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg)]'
        }`}
      >
        分析后
      </button>
    </div>
  );
}
