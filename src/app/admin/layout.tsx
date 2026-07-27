'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ListMagnifyingGlass, TreeStructure, Users } from '@phosphor-icons/react';

const NAV_ITEMS = [
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/audit-logs', label: '审计日志', icon: ListMagnifyingGlass },
  { href: '/admin/root-causes', label: '根因分类', icon: TreeStructure },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-0 pt-5">
      <header className="bento-panel mx-3 px-5 py-4 sm:mx-6 sm:px-6 xl:mx-auto xl:w-[calc(100%-2.5rem)] xl:max-w-[1280px]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">平台管理</h1>
            <p className="mt-0.5 text-xs text-text-secondary">仅管理员可访问</p>
          </div>
          <nav className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:items-center sm:gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-[11px] px-1.5 text-xs font-medium transition-colors no-underline hover:no-underline sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm
                    ${
                      isActive
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:bg-bg hover:text-text-primary'
                    }`}
                >
                  <Icon size={17} aria-hidden="true" />
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
