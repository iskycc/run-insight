import type { ReactNode } from 'react';

type ProgressCategory =
  | 'pending'
  | 'analyzing'
  | 'located'
  | 'fixed'
  | 'not-issue'
  | 'blocked';

type BadgeProps = {
  children: ReactNode;
  progress?: ProgressCategory;
};

const progressStyles: Record<ProgressCategory, string> = {
  pending: 'bg-progress-pending/15 text-progress-pending',
  analyzing: 'bg-progress-analyzing/15 text-progress-analyzing',
  located: 'bg-progress-located/15 text-progress-located',
  fixed: 'bg-progress-fixed/15 text-progress-fixed',
  'not-issue': 'bg-progress-not-issue/15 text-progress-not-issue',
  blocked: 'bg-progress-blocked/15 text-progress-blocked',
};

export function Badge({ children, progress }: BadgeProps) {
  const colorClass = progress
    ? progressStyles[progress]
    : 'bg-bg text-text-secondary ring-1 ring-border';

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${colorClass}`}
    >
      {children}
    </span>
  );
}
