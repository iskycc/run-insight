'use client';

import { Button } from '@/components/shared/Button';
import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

function DefaultIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8" y="8" width="32" height="32" rx="4" />
      <path d="M16 20h16M16 28h10" />
    </svg>
  );
}

export function EmptyState({ title, description, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-2xl text-center">
      <div className="mb-md opacity-40">
        {icon ?? <DefaultIcon />}
      </div>
      <h3 className="text-base font-medium text-text-primary mb-xs">{title}</h3>
      {description && (
        <p className="text-sm text-text-secondary max-w-xs">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-lg">
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
