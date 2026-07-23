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
    <nav className="border-b border-border bg-surface-solid/60 backdrop-blur-md">
      <div className="mx-auto flex h-11 max-w-7xl items-center gap-sm px-md">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-sm py-xs text-sm rounded-md transition-colors no-underline
                ${
                  isActive
                    ? 'text-accent font-medium bg-accent/5'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg'
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
