'use client';

interface StatCardProps {
  title: string;
  value: number;
  trend?: { value: number; label: string };
}

export default function StatCard({ title, value, trend }: StatCardProps) {
  return (
    <div className="panel relative flex min-h-[118px] flex-col justify-between overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-accent/80" />
      <span className="text-sm font-medium text-text-secondary">{title}</span>
      <span className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
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
          <span className="text-text-secondary">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
