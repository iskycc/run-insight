import { CircleNotch } from '@phosphor-icons/react/dist/ssr';

type LoadingStateProps = {
  label?: string;
  compact?: boolean;
  rows?: number;
  className?: string;
};

export function LoadingState({
  label = '正在加载',
  compact = false,
  rows = 3,
  className = '',
}: LoadingStateProps) {
  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-2 text-sm text-text-secondary ${className}`}
      >
        <CircleNotch className="motion-spin shrink-0 text-accent" size={16} aria-hidden="true" />
        {label}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`loading-surface w-full rounded-[16px] border border-border/70 bg-white/55 p-4 ${className}`}
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-text-secondary">
        <CircleNotch className="motion-spin text-accent" size={18} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div aria-hidden="true" className="space-y-2.5">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="skeleton-line h-3 rounded-full"
            style={{ width: `${Math.max(44, 100 - index * 17)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
