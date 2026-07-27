'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowsLeftRight,
  ChartBar,
  CheckSquare,
  ClockCounterClockwise,
  DotsThree,
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

const MORE_NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: '/reports/assignee', label: '责任人报告', icon: ChartBar },
  { href: '/import-history', label: '导入历史', icon: ClockCounterClockwise },
  { href: '/admin/users', label: '平台管理', icon: GearSix, roles: ['ADMIN'] },
] as const;

export function Nav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 1180px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  if (!user) return null;

  const visibleItems = [...NAV_ITEMS, ...MORE_NAV_ITEMS].filter((item) => {
    if (item.public) return true;
    return !item.roles || (!!user.role && item.roles.includes(user.role));
  });

  const primaryItems = visibleItems.filter((item) => NAV_ITEMS.includes(item));
  const moreItems = visibleItems.filter((item) => MORE_NAV_ITEMS.includes(item));
  const isItemActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const isMoreActive = moreItems.some((item) => isItemActive(item.href));

  const renderNavLink = (
    item: (typeof visibleItems)[number],
    mobile: boolean,
    menuItem = false,
  ) => {
    const isActive = isItemActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        role={menuItem ? 'menuitem' : undefined}
        onClick={() => {
          setMobileOpen(false);
          setMoreOpen(false);
        }}
        aria-current={isActive ? 'page' : undefined}
        className={
          menuItem
            ? `flex min-h-10 w-full items-center gap-2 rounded-[9px] px-3 text-sm transition-colors no-underline hover:no-underline ${
                isActive
                  ? 'bg-accent/10 font-semibold text-accent'
                  : 'text-text-secondary hover:bg-bg hover:text-text-primary'
              }`
            : `relative flex items-center whitespace-nowrap text-sm tracking-[-0.01em] transition-colors no-underline hover:no-underline ${
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
        {(mobile || menuItem) && <Icon size={17} className={mobile ? 'mr-2' : ''} aria-hidden="true" />}
        {item.label}
      </Link>
    );
  };

  const desktopNav = (
    <div className="flex min-w-0 items-center justify-center gap-0.5">
      {primaryItems.map((item) => renderNavLink(item, false))}
      {moreItems.length > 0 && (
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className={`relative flex min-h-12 items-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm tracking-[-0.01em] transition-colors ${
              isMoreActive
                ? 'font-semibold text-accent after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-accent'
                : 'font-normal text-text-secondary hover:bg-surface-solid/70 hover:text-text-primary'
            }`}
          >
            更多
            <DotsThree size={18} weight="bold" aria-hidden="true" />
          </button>
          {moreOpen && (
            <div
              role="menu"
              aria-label="更多导航"
              className="absolute right-0 top-full z-50 mt-2 w-44 rounded-[14px] border border-border bg-surface-solid p-1.5 shadow-lg"
            >
              {moreItems.map((item) => renderNavLink(item, false, true))}
            </div>
          )}
        </div>
      )}
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
          {mobileOpen && <div className="pt-2">{mobileNav}</div>}
        </>
      ) : (
        desktopNav
      )}
    </nav>
  );
}
