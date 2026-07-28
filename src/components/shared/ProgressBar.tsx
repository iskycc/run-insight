type ProgressBarProps = {
  value?: number;
  label: string;
  tone?: 'accent' | 'success' | 'danger';
  className?: string;
};

const toneClasses = {
  accent: 'bg-accent',
  success: 'bg-success',
  danger: 'bg-danger',
};

export function ProgressBar({
  value,
  label,
  tone = 'accent',
  className = '',
}: ProgressBarProps) {
  const indeterminate = value === undefined;
  const normalized = indeterminate ? undefined : Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized === undefined ? undefined : Math.round(normalized)}
      aria-valuetext={indeterminate ? '处理中' : undefined}
      className={`progress-track h-2 overflow-hidden rounded-full bg-slate-200/80 ${className}`}
    >
      <div
        className={`progress-fill h-full rounded-full ${toneClasses[tone]} ${
          indeterminate ? 'progress-indeterminate' : ''
        }`}
        style={indeterminate ? undefined : { width: `${normalized}%` }}
      />
    </div>
  );
}
