'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Archive,
  ArrowsLeftRight,
  CheckSquare,
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

type NavItem = {
  href: string;
  label: string;
  icon: typeof House;
  public?: boolean;
  roles?: readonly NavRole[];
  activePrefixes?: readonly string[];
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/', label: '大盘', icon: House, public: true },
  { href: '/workspace', label: '工作台', icon: SquaresFour },
  { href: '/my-tasks', label: '我的待办', icon: CheckSquare },
  { href: '/projects', label: '项目', icon: Folder },
  { href: '/compare', label: '对比', icon: ArrowsLeftRight },
  { href: '/assets', label: '资产库', icon: Archive },
  { href: '/import', label: '导入', icon: UploadSimple, roles: ['ADMIN', 'EDITOR'] },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 1180px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (!user) return null;

  const platformItem: NavItem = {
    href: user.role === 'ADMIN' ? '/admin/users' : '/reports/assignee',
    label: '平台管理',
    icon: GearSix,
    activePrefixes: ['/admin', '/reports/assignee', '/import-history'],
  };
  const visibleItems = [...NAV_ITEMS, platformItem].filter((item) => {
    if (item.public) return true;
    return !item.roles || (!!user.role && item.roles.includes(user.role));
  });

  const isItemActive = (item: NavItem) =>
    item.href === '/'
      ? pathname === '/'
      : pathname === item.href
        || pathname.startsWith(`${item.href}/`)
        || item.activePrefixes?.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        ) === true;

  const renderNavLink = (item: NavItem, mobile: boolean) => {
    const isActive = isItemActive(item);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        aria-current={isActive ? 'page' : undefined}
        className={
          `relative flex items-center whitespace-nowrap text-sm tracking-[-0.01em] transition-colors no-underline hover:no-underline ${
            mobile ? 'min-h-10 rounded-[11px] px-3' : 'min-h-12 rounded-lg px-3'
          } ${
            isActive
              ? mobile
                ? 'bg-surface-solid font-semibold text-accent shadow-sm ring-1 ring-border'
                : 'font-semibold text-accent after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-accent'
              : 'font-normal text-text-secondary hover:bg-surface-solid/70 hover:text-text-primary'
          }`
        }
      >
        {mobile && <Icon size={17} className="mr-2" aria-hidden="true" />}
        {item.label}
      </Link>
    );
  };

  const desktopNav = (
    <div className="flex min-w-0 items-center justify-center gap-0.5">
      {visibleItems.map((item) => renderNavLink(item, false))}
    </div>
  );

  const mobileNav = (
    <div className="grid grid-cols-2 gap-1 border-t border-border pt-2">
      {visibleItems.map((item) => renderNavLink(item, true))}
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
          {mobileOpen && <div className="dropdown-surface pt-2">{mobileNav}</div>}
        </>
      ) : (
        desktopNav
      )}
    </nav>
  );
}
