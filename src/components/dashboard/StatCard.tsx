'use client';

interface StatCardProps {
  title: string;
  value: number;
  trend?: { value: number; label: string };
}

export default function StatCard({ title, value, trend }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-sm)] backdrop-blur-md">
      <span className="text-sm text-[var(--color-text-secondary)]">{title}</span>
      <span className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
        {value.toLocaleString()}
      </span>
      {trend && (
        <div
          data-testid="stat-trend"
          className={`flex items-center gap-1 text-xs font-medium ${
            trend.value >= 0
              ? 'text-[var(--color-success)]'
              : 'text-[var(--color-danger)]'
          }`}
        >
          <span>{trend.value > 0 ? '+' : ''}{trend.value}</span>
          <span className="text-[var(--color-text-secondary)]">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
