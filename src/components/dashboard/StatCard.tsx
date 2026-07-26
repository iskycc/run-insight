'use client';

interface StatCardProps {
  title: string;
  value: number | string;
  trend?: { value: number; label: string };
  tone?: 'default' | 'danger' | 'warning';
}

const toneClasses = {
  default: 'text-text-primary',
  danger: 'text-danger',
  warning: 'text-warning',
};

export default function StatCard({
  title,
  value,
  trend,
  tone = 'default',
}: StatCardProps) {
  return (
    <div className="flex min-w-0 flex-col px-3 first:pl-0 last:pr-0 sm:px-5">
      <span className="truncate text-xs font-medium text-text-secondary sm:text-sm">{title}</span>
      <span className={`mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl ${toneClasses[tone]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {trend && (
        <div
          data-testid="stat-trend"
          className={`mt-2 flex items-center gap-1 text-xs font-medium ${
            trend.value >= 0
              ? 'text-[var(--color-success)]'
              : 'text-[var(--color-danger)]'
          }`}
        >
          <span>{trend.value > 0 ? '+' : ''}{trend.value}</span>
          <span className="text-text-secondary">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
