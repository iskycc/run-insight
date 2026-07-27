'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowsLeftRight,
  ChartBar,
  CheckSquare,
  ClockCounterClockwise,
  Folder,
  GearSix,
  House,
  List,
  SquaresFour,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { useAuth } from '@/components/shared/AuthProvider';

type NavRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

const NAV_ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof House;
  public?: boolean;
  roles?: readonly NavRole[];
}> = [
  { href: '/', label: '大盘', icon: House, public: true },
  { href: '/workspace', label: '工作台', icon: SquaresFour },
  { href: '/my-tasks', label: '我的待办', icon: CheckSquare },
  { href: '/projects', label: '项目', icon: Folder },
  { href: '/compare', label: '对比', icon: ArrowsLeftRight },
  { href: '/assets', label: '资产库', icon: Archive },
  { href: '/reports/assignee', label: '责任人报告', icon: ChartBar },
  { href: '/import', label: '导入', icon: UploadSimple, roles: ['ADMIN', 'EDITOR'] },
  { href: '/import-history', label: '导入历史', icon: ClockCounterClockwise },
  { href: '/admin/users', label: '系统管理', icon: GearSix, roles: ['ADMIN'] },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.public) return true;
    return !item.roles || (!!user.role && item.roles.includes(user.role));
  });

  const navLinks = (
    <div
      className={
        isMobile
          ? 'grid grid-cols-2 gap-1 border-t border-border pt-2'
          : 'flex min-w-0 items-center justify-center gap-0.5'
      }
    >
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex items-center whitespace-nowrap text-sm tracking-[-0.01em] transition-colors no-underline hover:no-underline ${
                isMobile ? 'min-h-10 rounded-[11px] px-3' : 'min-h-12 rounded-lg px-4'
              } ${
                isActive
                  ? isMobile
                    ? 'bg-surface-solid font-semibold text-accent shadow-sm ring-1 ring-border'
                    : 'font-semibold text-accent after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-accent'
                  : 'font-normal text-text-secondary hover:bg-surface-solid/70 hover:text-text-primary'
              }`}
            >
              {isMobile && <Icon size={17} className="mr-2" aria-hidden="true" />}
              {item.label}
            </Link>
          );
        })}
    </div>
  );

  return (
    <nav className="app-nav" aria-label="主导航">
      {isMobile ? (
        <>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-bg px-3 text-sm font-medium text-text-primary"
          >
            {mobileOpen ? <X size={18} aria-hidden="true" /> : <List size={18} aria-hidden="true" />}
            {mobileOpen ? '收起导航' : '打开导航'}
          </button>
          {mobileOpen && <div className="pt-2">{navLinks}</div>}
        </>
      ) : (
        navLinks
      )}
    </nav>
  );
}
