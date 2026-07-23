import type { ReactNode } from 'react';

type PageContainerProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageContainer({ title, subtitle, actions, children }: PageContainerProps) {
  return (
    <div className="mx-auto max-w-7xl px-md py-lg">
      {/* Title area */}
      <div className="mb-lg flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p
              data-testid="page-subtitle"
              className="mt-xs text-sm text-text-secondary"
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-sm">{actions}</div>}
      </div>

      {/* Content area */}
      <div>{children}</div>
    </div>
  );
}
