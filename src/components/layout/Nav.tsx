'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';

const NAV_ITEMS = [
  { href: '/', label: '大盘', public: true },
  { href: '/workspace', label: '工作台', public: false },
  { href: '/import', label: '导入', public: false },
  { href: '/assets', label: '资产库', public: false },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => item.public || !!user);

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
