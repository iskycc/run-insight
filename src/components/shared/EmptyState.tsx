'use client';

import { Button } from '@/components/shared/Button';
import type { ReactNode } from 'react';
import { Tray } from '@phosphor-icons/react';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

function DefaultIcon() {
  return <Tray size={44} weight="duotone" aria-hidden="true" />;
}

export function EmptyState({ title, description, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg text-text-secondary">
        {icon ?? <DefaultIcon />}
      </div>
      <h3 className="mb-1 text-base font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm leading-6 text-text-secondary">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-6">
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
