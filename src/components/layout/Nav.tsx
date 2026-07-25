'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';

type NavRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  public?: boolean;
  roles?: readonly NavRole[];
}> = [
  { href: '/', label: '大盘', public: true },
  { href: '/workspace', label: '工作台' },
  { href: '/my-tasks', label: '我的待办' },
  { href: '/projects', label: '项目' },
  { href: '/compare', label: '对比' },
  { href: '/assets', label: '资产库' },
  { href: '/reports/assignee', label: '责任人报告' },
  { href: '/import', label: '导入', roles: ['ADMIN', 'EDITOR'] },
  { href: '/import-history', label: '导入历史' },
  { href: '/admin/users', label: '系统管理', roles: ['ADMIN'] },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.public) return true;
    if (!user) return false;
    return !item.roles || (!!user.role && item.roles.includes(user.role));
  });

  return (
    <nav className="border-b border-border bg-surface/70 backdrop-blur-xl">
      <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-5">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
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
      </div>
    </nav>
  );
}
