'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Icon } from '@phosphor-icons/react';

export type SecondaryNavItem = {
  href: string;
  label: string;
  icon: Icon;
};

type SecondaryNavProps = {
  title: string;
  subtitle: string;
  items: readonly SecondaryNavItem[];
};

export function SecondaryNav({ title, subtitle, items }: SecondaryNavProps) {
  const pathname = usePathname();

  return (
    <header className="bento-panel mx-3 px-5 py-4 sm:mx-6 sm:px-6 xl:mx-auto xl:w-[calc(100%-2.5rem)] xl:max-w-[1280px]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
          <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
        </div>
        <nav
          aria-label={`${title}导航`}
          className="flex w-full items-stretch gap-1 overflow-x-auto pb-1 sm:w-auto sm:items-center sm:gap-2 sm:pb-0"
        >
          {items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const IconComponent = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-12 min-w-[88px] flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-[11px] px-2 text-xs font-medium transition-colors no-underline hover:no-underline sm:min-h-10 sm:min-w-0 sm:flex-none sm:flex-row sm:gap-2 sm:px-3 sm:text-sm
                  ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text-secondary hover:bg-bg hover:text-text-primary'
                  }`}
              >
                <IconComponent size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
