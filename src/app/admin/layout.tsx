'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { href: '/admin/users', label: '用户管理' },
  { href: '/admin/audit-logs', label: '审计日志' },
  { href: '/admin/root-causes', label: '根因分类' },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <header className="panel px-lg py-md">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">系统管理</h1>
            <p className="mt-0.5 text-xs text-text-secondary">仅管理员可访问</p>
          </div>
          <nav className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors no-underline hover:no-underline
                    ${
                      isActive
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:bg-surface-solid hover:text-text-primary'
                    }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div>{children}</div>
    </div>
  );
}
