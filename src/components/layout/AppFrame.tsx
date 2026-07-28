'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Nav } from '@/components/layout/Nav';

const STANDALONE_ROUTES = new Set(['/login', '/setup']);

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
      <main className={isStandalone ? 'min-h-screen' : 'min-h-[calc(100vh-86px)]'}>
        {children}
      </main>
    </>
  );
}
