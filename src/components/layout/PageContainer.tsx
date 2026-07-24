import type { ReactNode } from 'react';

type PageContainerProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageContainer({ title, subtitle, actions, children }: PageContainerProps) {
  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p
              data-testid="page-subtitle"
              className="mt-1 max-w-2xl text-sm text-text-secondary"
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-sm">{actions}</div>}
      </div>

      <div>{children}</div>
    </div>
  );
}
