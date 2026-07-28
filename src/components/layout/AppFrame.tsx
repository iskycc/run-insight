'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Nav } from '@/components/layout/Nav';
import { ContextHelp } from '@/components/shared/ContextHelp';

const STANDALONE_ROUTES = new Set(['/login', '/setup']);

export function getRouteMotion(pathname: string) {
  if (STANDALONE_ROUTES.has(pathname)) return 'route-motion-auth';
  if (pathname === '/import' || pathname === '/compare') return 'route-motion-flow';
  if (
    /^\/case\/[^/]+$/.test(pathname)
    || /^\/import-history\/[^/]+$/.test(pathname)
    || /^\/reports\/snapshots\/[^/]+$/.test(pathname)
    || /^\/projects\/[^/]+/.test(pathname)
  ) {
    return 'route-motion-detail';
  }
  if (
    pathname.startsWith('/admin/')
    || pathname.startsWith('/organizations/')
    || pathname === '/projects'
    || pathname === '/import-history'
  ) {
    return 'route-motion-manage';
  }
  if (pathname.startsWith('/reports/') || pathname === '/my-tasks') {
    return 'route-motion-report';
  }
  return 'route-motion-overview';
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStandalone = STANDALONE_ROUTES.has(pathname);

  return (
    <>
      {!isStandalone && (
        <div className="app-chrome">
          <div className="app-chrome-inner">
            <Header />
            <Nav />
          </div>
        </div>
      )}
      <main
        key={pathname}
        className={`${isStandalone ? 'min-h-screen' : 'min-h-[calc(100vh-86px)]'} ${getRouteMotion(pathname)}`}
      >
        {children}
      </main>
      <ContextHelp />
    </>
  );
}
