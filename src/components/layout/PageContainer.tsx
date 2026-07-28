import type { ReactNode } from 'react';

type PageContainerProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageContainer({ title, subtitle, actions, children }: PageContainerProps) {
  return (
    <div className="page-shell animate-page-enter">
      <div className="page-heading animate-heading-enter">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.035em] text-text-primary sm:text-[32px]">
            {title}
          </h1>
          {subtitle && (
            <p
              data-testid="page-subtitle"
              className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary"
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      <div className="animate-content-enter">{children}</div>
    </div>
  );
}
