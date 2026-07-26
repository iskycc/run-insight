'use client';

interface ImportTypeSwitchProps {
  value: 'pre-analysis' | 'post-analysis';
  onChange: (value: 'pre-analysis' | 'post-analysis') => void;
}

export default function ImportTypeSwitch({ value, onChange }: ImportTypeSwitchProps) {
  return (
    <div
      className="grid w-full grid-cols-2 rounded-2xl bg-[#eef2f8] p-1.5 ring-1 ring-black/5"
      role="radiogroup"
      aria-label="导入类型"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'pre-analysis'}
        onClick={() => onChange('pre-analysis')}
        className={`min-h-12 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
          value === 'pre-analysis'
            ? 'bg-white text-[var(--color-accent)] shadow-[0_5px_16px_rgba(15,23,42,0.10)]'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        分析前
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'post-analysis'}
        onClick={() => onChange('post-analysis')}
        className={`min-h-12 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
          value === 'post-analysis'
            ? 'bg-white text-[var(--color-accent)] shadow-[0_5px_16px_rgba(15,23,42,0.10)]'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
        }`}
      >
        分析后
      </button>
    </div>
  );
}
